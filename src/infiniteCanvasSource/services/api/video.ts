// @ts-nocheck
import axios from "axios";

import { dataUrlToFile } from "@/lib/image-utils";
import { imageToDataUrl } from "@/services/image-storage";
import type { AiConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import type { ReferenceImage } from "@/types/image";
import { buildApiUrl as buildDevApiUrl, readClientDevProxyConfig } from "../../../lib/devProxy";
import { fetchImageUrlAsDataUrl, sanitizeApiErrorMessage } from "../../../lib/imageApiShared";

type VideoResponse = { id: string; status?: string; error?: { message?: string } };
type ApiVideoResponse = VideoResponse | { code?: number; data?: VideoResponse | null; msg?: string };
type NewApiVideoTask = { id: string; status?: string; url?: string; videoUrl?: string; error?: { message?: string } };
type NewApiVideoResponse = NewApiVideoTask | { code?: number; data?: unknown; msg?: string; error?: { message?: string } };

function aiApiUrl(config: AiConfig, path: string) {
    const baseUrl = config.videoBaseUrl.trim() || config.textVideoBaseUrl.trim() || config.baseUrl;
    if (config.channelMode === "remote") return `/api/v1${path}`;

    const proxyConfig = readClientDevProxyConfig();
    return buildDevApiUrl(baseUrl, path, proxyConfig, false);
}

function aiHeaders(config: AiConfig) {
    const token = useUserStore.getState().token;
    const apiKey = config.videoApiKey.trim() || config.textVideoApiKey.trim() || config.apiKey;
    return config.channelMode === "remote" ? (token ? { Authorization: `Bearer ${token}` } : undefined) : { Authorization: `Bearer ${apiKey}` };
}

function refreshRemoteUser(config: AiConfig) {
    if (config.channelMode === "remote") void useUserStore.getState().hydrateUser();
}

function requestTimeout(config: AiConfig) {
    return Math.max(1, Number(config.videoTimeout || config.textVideoTimeout || config.timeout) || 120) * 1000;
}

export async function requestVideoGeneration(config: AiConfig, prompt: string, references: ReferenceImage[] = []) {
    const model = config.videoModel || config.model;
    // Grok Video 3 在部分兼容站里挂在聊天接口下，直接走视频任务接口会返回 405。
    if (isGrokChatVideoModel(model)) {
        try {
            return await requestChatCompletionsVideoGeneration(config, prompt, references, model);
        } catch (error) {
            if (!shouldFallbackToTaskVideoApi(error)) throw new Error(readAxiosError(error, "视频生成失败"));
        }
    }

    try {
        return await requestNewApiVideoGeneration(config, prompt, references, model);
    } catch (error) {
        if (!shouldFallbackToLegacyVideoApi(error)) throw new Error(readAxiosError(error, "视频生成失败"));
    }

    // NewAPI 兼容接口不可用时，回退到旧版 /videos 流程。
    const body = new FormData();
    body.append("model", model);
    body.append("prompt", prompt);
    body.append("seconds", normalizeVideoSeconds(config.videoSeconds));
    if (normalizeVideoSize(config.size)) body.append("size", normalizeVideoSize(config.size)!);
    body.append("resolution_name", normalizeVideoResolution(config.vquality));
    body.append("preset", "normal");
    const files = await Promise.all(references.slice(0, 7).map(async (image) => dataUrlToFile({ ...image, dataUrl: await imageToDataUrl(image) })));
    files.forEach((file) => body.append("input_reference[]", file));
    try {
        const created = unwrapVideoResponse((await axios.post<ApiVideoResponse>(aiApiUrl(config, "/videos"), body, { headers: aiHeaders(config), timeout: requestTimeout(config) })).data);
        if (!created.id) throw new Error("视频接口没有返回任务 ID");
        for (;;) {
            const video = unwrapVideoResponse((await axios.get<ApiVideoResponse>(aiApiUrl(config, `/videos/${created.id}`), { headers: aiHeaders(config), params: config.channelMode === "remote" ? { model } : undefined, timeout: requestTimeout(config) })).data);
            if (video.status === "completed") break;
            if (video.status === "failed" || video.status === "cancelled") throw new Error(video.error?.message || "视频生成失败");
            await new Promise((resolve) => setTimeout(resolve, 2500));
        }
        const content = await axios.get<Blob>(aiApiUrl(config, `/videos/${created.id}/content`), { headers: aiHeaders(config), params: config.channelMode === "remote" ? { model } : undefined, responseType: "blob", timeout: requestTimeout(config) });
        await assertVideoBlob(content.data);
        refreshRemoteUser(config);
        return content.data;
    } catch (error) {
        if (!isGrokChatVideoModel(model) && shouldFallbackToTaskVideoApi(error)) {
            try {
                return await requestChatCompletionsVideoGeneration(config, prompt, references, model);
            } catch (chatError) {
                throw new Error(readAxiosError(chatError, "视频生成失败"));
            }
        }
        throw new Error(readAxiosError(error, "视频生成失败"));
    }
}

async function requestChatCompletionsVideoGeneration(config: AiConfig, prompt: string, references: ReferenceImage[], model: string) {
    const content = await buildChatVideoContent(config, prompt, references);
    const response = await axios.post(
        aiApiUrl(config, "/chat/completions"),
        {
            model,
            messages: [{ role: "user", content }],
            stream: false,
        },
        { headers: { ...aiHeaders(config), "Content-Type": "application/json" }, timeout: requestTimeout(config) },
    );
    const videoUrl = findVideoUrl(response.data);
    if (!videoUrl) throw new Error("视频接口没有返回视频地址");
    const dataUrl = await fetchImageUrlAsDataUrl(videoUrl, "video/mp4");
    const videoResponse = await fetch(dataUrl);
    refreshRemoteUser(config);
    return videoResponse.blob();
}

async function requestNewApiVideoGeneration(config: AiConfig, prompt: string, references: ReferenceImage[], model: string) {
    const payload: Record<string, unknown> = {
        model,
        prompt,
        seconds: Number(normalizeVideoSeconds(config.videoSeconds)),
        size: normalizeVideoSize(config.size) || undefined,
        resolution: normalizeVideoResolution(config.vquality),
    };
    const images = (await Promise.all(references.slice(0, 7).map((image) => imageToDataUrl(image)))).filter(Boolean);
    if (images.length) payload.image = images.length === 1 ? images[0] : images;

    const created = unwrapNewApiVideoResponse((await axios.post<NewApiVideoResponse>(aiApiUrl(config, "/video/generations"), payload, { headers: { ...aiHeaders(config), "Content-Type": "application/json" }, timeout: requestTimeout(config) })).data);
    if (!created.id) throw new Error("视频接口没有返回任务 ID");

    let task = created;
    for (;;) {
        if (isVideoTaskCompleted(task)) break;
        if (isVideoTaskFailed(task)) throw new Error(task.error?.message || "视频生成失败");
        await new Promise((resolve) => setTimeout(resolve, 2500));
        task = unwrapNewApiVideoResponse((await axios.get<NewApiVideoResponse>(aiApiUrl(config, `/video/generations/${created.id}`), { headers: aiHeaders(config), timeout: requestTimeout(config) })).data);
    }

    const videoUrl = task.url || task.videoUrl;
    if (!videoUrl) throw new Error("视频接口没有返回视频地址");
    const dataUrl = await fetchImageUrlAsDataUrl(videoUrl, "video/mp4");
    const response = await fetch(dataUrl);
    refreshRemoteUser(config);
    return response.blob();
}

async function buildChatVideoContent(config: AiConfig, prompt: string, references: ReferenceImage[]) {
    const settingsText = `视频参数：${normalizeVideoSeconds(config.videoSeconds)}秒，${normalizeVideoResolution(config.vquality)}，${videoAspectLabel(config.size)}。`;
    const text = `${settingsText}\n\n${prompt}`;
    const images = (await Promise.all(references.slice(0, 7).map((image) => imageToDataUrl(image)))).filter(Boolean);
    if (!images.length) return text;
    return [{ type: "text", text }, ...images.map((url) => ({ type: "image_url", image_url: { url } }))];
}

function videoAspectLabel(value: string) {
    if (value === "auto" || !value) return "自动比例";
    if (/^\d+x\d+$/.test(value)) {
        const [w, h] = value.split("x").map(Number);
        if (w && h) return w >= h ? "横屏" : "竖屏";
    }
    if (["9:16", "2:3", "3:4"].includes(value)) return "竖屏";
    return "横屏";
}

function normalizeVideoSeconds(value: string) {
    const seconds = Math.floor(Number(value) || 6);
    return String(Math.max(1, Math.min(20, seconds)));
}

function normalizeVideoSize(value: string) {
    if (value === "auto") return null;
    const size = value || "1280x720";
    if (/^\d+x\d+$/.test(size)) return size;
    return ["9:16", "2:3", "3:4"].includes(size) ? "720x1280" : "1280x720";
}

function normalizeVideoResolution(value: string) {
    if (value === "low") return "480p";
    if (value === "auto" || value === "high" || value === "medium") return "720p";
    const resolution = value.replace(/p$/i, "") || "720";
    return `${resolution}p`;
}

function unwrapVideoResponse(payload: ApiVideoResponse) {
    if (!payload) throw new Error("接口没有返回视频任务");
    if ("code" in payload && typeof payload.code === "number") {
        if (payload.code !== 0) throw new Error(payload.msg || "请求失败");
        if (!payload.data) throw new Error("接口没有返回视频任务");
        return payload.data;
    }
    return payload;
}

function unwrapNewApiVideoResponse(payload: NewApiVideoResponse): NewApiVideoTask {
    if (!payload) throw new Error("接口没有返回视频任务");
    if ("code" in payload && typeof payload.code === "number" && payload.code !== 0) throw new Error(payload.msg || payload.error?.message || "请求失败");
    const data = "data" in payload ? payload.data : payload;
    const task = findVideoTask(data);
    if (!task) throw new Error("接口没有返回视频任务");
    return task;
}

function findVideoTask(input: unknown): NewApiVideoTask | null {
    if (!input) return null;
    if (Array.isArray(input)) {
        for (const item of input) {
            const task = findVideoTask(item);
            if (task) return task;
        }
        return null;
    }
    if (typeof input !== "object") return null;
    const record = input as Record<string, unknown>;
    const id = stringValue(record.id) || stringValue(record.task_id) || stringValue(record.taskId);
    const nested = findNestedVideoFields(record);
    const url = stringValue(record.url) || stringValue(record.video_url) || stringValue(record.videoUrl) || nested.url;
    const status = stringValue(record.status) || stringValue(record.state);
    if (id || url || status) {
        const errorMessage = stringValue((record.error as Record<string, unknown> | undefined)?.message) || stringValue(record.error_message) || stringValue(record.fail_reason);
        return { id: id || nested.id, url, videoUrl: stringValue(record.videoUrl), status: status || nested.status, error: errorMessage ? { message: errorMessage } : undefined };
    }
    for (const value of Object.values(record)) {
        const task = findVideoTask(value);
        if (task) return task;
    }
    return null;
}

function findNestedVideoFields(input: unknown, depth = 0): { id: string; status: string; url: string } {
    if (depth > 5 || !input) return { id: "", status: "", url: "" };
    if (Array.isArray(input)) {
        for (const item of input) {
            const found = findNestedVideoFields(item, depth + 1);
            if (found.url || found.id || found.status) return found;
        }
        return { id: "", status: "", url: "" };
    }
    if (typeof input !== "object") return { id: "", status: "", url: "" };
    const record = input as Record<string, unknown>;
    const direct = {
        id: stringValue(record.id) || stringValue(record.task_id) || stringValue(record.taskId),
        status: stringValue(record.status) || stringValue(record.state),
        url: stringValue(record.url) || stringValue(record.video_url) || stringValue(record.videoUrl),
    };
    if (direct.url) return direct;
    for (const value of Object.values(record)) {
        const found = findNestedVideoFields(value, depth + 1);
        if (found.url || found.id || found.status) {
            return {
                id: direct.id || found.id,
                status: direct.status || found.status,
                url: direct.url || found.url,
            };
        }
    }
    return direct;
}

function stringValue(value: unknown) {
    return typeof value === "string" && value.trim() ? value.trim() : "";
}

function findVideoUrl(input: unknown): string {
    if (!input) return "";
    if (typeof input === "string") {
        const parsed = parseJsonString(input);
        if (parsed) return findVideoUrl(parsed);
        return findVideoUrlInText(input);
    }
    if (Array.isArray(input)) {
        for (const item of input) {
            const url = findVideoUrl(item);
            if (url) return url;
        }
        return "";
    }
    if (typeof input !== "object") return "";
    const record = input as Record<string, unknown>;
    const direct = stringValue(record.url) || stringValue(record.video_url) || stringValue(record.videoUrl) || stringValue(record.output_url);
    if (direct) return direct;
    for (const value of Object.values(record)) {
        const url = findVideoUrl(value);
        if (url) return url;
    }
    return "";
}

function parseJsonString(value: string) {
    const trimmed = value.trim();
    if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) return null;
    try {
        return JSON.parse(trimmed) as unknown;
    } catch {
        return null;
    }
}

function findVideoUrlInText(value: string) {
    const match = value.match(/https?:\/\/[^\s)"'<>]+?\.(?:mp4|webm|mov)(?:\?[^\s)"'<>]+)?/i);
    return match?.[0] || "";
}

function isVideoTaskCompleted(task: NewApiVideoTask) {
    const status = (task.status || "").toLowerCase();
    return Boolean(task.url || task.videoUrl) || ["completed", "succeeded", "success", "done"].includes(status);
}

function isVideoTaskFailed(task: NewApiVideoTask) {
    return ["failed", "cancelled", "canceled", "error"].includes((task.status || "").toLowerCase());
}

function shouldFallbackToLegacyVideoApi(error: unknown) {
    return axios.isAxiosError(error) && [404, 405].includes(error.response?.status || 0);
}

function shouldFallbackToTaskVideoApi(error: unknown) {
    return axios.isAxiosError(error) && [400, 404, 405].includes(error.response?.status || 0);
}

function isGrokChatVideoModel(model: string) {
    return /^grok-video-3(?:-|$)/i.test(model.trim());
}

function readAxiosError(error: unknown, fallback: string) {
    if (axios.isAxiosError<{ error?: { message?: string }; msg?: string; code?: number }>(error)) {
        const responseData = error.response?.data;
        return sanitizeApiErrorMessage(responseData?.msg || responseData?.error?.message || (error.response?.status ? `${fallback}：${error.response.status}` : fallback));
    }
    return sanitizeApiErrorMessage(error instanceof Error ? error.message : fallback);
}

async function assertVideoBlob(blob: Blob) {
    if (!blob.type.includes("json")) return;
    let payload: { code?: number; msg?: string };
    try {
        payload = JSON.parse(await blob.text()) as { code?: number; msg?: string };
    } catch {
        return;
    }
    if (typeof payload.code === "number" && payload.code !== 0) throw new Error(payload.msg || "视频下载失败");
}
