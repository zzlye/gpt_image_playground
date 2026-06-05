// @ts-nocheck
import axios from "axios";

import { dataUrlToFile } from "@/lib/image-utils";
import { imageToDataUrl } from "@/services/image-storage";
import type { AiConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import type { ReferenceImage } from "@/types/image";
import { buildApiUrl as buildDevApiUrl, readClientDevProxyConfig, shouldUseApiProxy } from "../../../lib/devProxy";
import { fetchImageUrlAsDataUrl, sanitizeApiErrorMessage } from "../../../lib/imageApiShared";

type VideoResponse = { id: string; status?: string; error?: { message?: string } };
type ApiVideoResponse = VideoResponse | { code?: number; data?: VideoResponse | null; msg?: string };
type NewApiVideoTask = { id: string; status?: string; url?: string; videoUrl?: string; error?: { message?: string } };
type NewApiVideoResponse = NewApiVideoTask | { code?: number; data?: unknown; msg?: string; error?: { message?: string } };
type VideoApiSource = { label: string; baseUrl: string; apiKey: string; apiProxy: boolean; timeout: number; versioned: boolean };

class VideoAttemptError extends Error {
    readonly label: string;

    constructor(message: string, label: string) {
        super(message);
        this.name = "VideoAttemptError";
        this.label = label;
    }
}

function resolveVideoApiSources(config: AiConfig): VideoApiSource[] {
    if (config.channelMode === "remote") return [{ label: "系统后端", baseUrl: "", apiKey: "", apiProxy: false, timeout: Number(config.videoTimeout || config.textVideoTimeout || config.textTimeout || config.timeout), versioned: true }];
    const candidates = [
        {
            label: "视频 API",
            baseUrl: config.videoBaseUrl.trim(),
            apiKey: config.videoApiKey.trim() || config.textVideoApiKey.trim() || config.textApiKey.trim() || config.apiKey,
            apiProxy: Boolean(config.videoApiProxy),
            timeout: Number(config.videoTimeout || config.textVideoTimeout || config.textTimeout || config.timeout),
        },
        {
            label: "旧文字视频 API",
            baseUrl: config.textVideoBaseUrl.trim(),
            apiKey: config.textVideoApiKey.trim() || config.videoApiKey.trim() || config.textApiKey.trim() || config.apiKey,
            apiProxy: Boolean(config.textVideoApiProxy || config.videoApiProxy),
            timeout: Number(config.textVideoTimeout || config.videoTimeout || config.textTimeout || config.timeout),
        },
        {
            label: "文字 API",
            baseUrl: config.textBaseUrl.trim(),
            apiKey: config.textApiKey.trim() || config.videoApiKey.trim() || config.textVideoApiKey.trim() || config.apiKey,
            apiProxy: Boolean(config.textApiProxy || config.videoApiProxy || config.textVideoApiProxy),
            timeout: Number(config.textTimeout || config.videoTimeout || config.textVideoTimeout || config.timeout),
        },
        {
            label: "出图 API",
            baseUrl: config.baseUrl.trim(),
            apiKey: config.apiKey || config.videoApiKey.trim() || config.textApiKey.trim() || config.textVideoApiKey.trim(),
            apiProxy: false,
            timeout: Number(config.timeout || config.videoTimeout || config.textTimeout || config.textVideoTimeout),
        },
    ];
    const sources: VideoApiSource[] = [];
    const seen = new Set<string>();
    for (const candidate of candidates) {
        if (!candidate.baseUrl) continue;
        const normalizedBaseUrl = candidate.baseUrl.replace(/\/+$/, "");
        const key = `${normalizedBaseUrl}|${candidate.apiKey}|${candidate.apiProxy}`;
        if (!seen.has(key)) {
            seen.add(key);
            sources.push({ ...candidate, baseUrl: normalizedBaseUrl, versioned: true });
        }
        if (/\/v1$/i.test(normalizedBaseUrl) && !candidate.apiProxy) {
            const unversionedBaseUrl = normalizedBaseUrl.replace(/\/v1$/i, "");
            const unversionedKey = `${unversionedBaseUrl}|${candidate.apiKey}|${candidate.apiProxy}|no-v1`;
            if (!seen.has(unversionedKey)) {
                seen.add(unversionedKey);
                sources.push({ ...candidate, label: `${candidate.label}(无 /v1)`, baseUrl: unversionedBaseUrl, versioned: false });
            }
        }
    }
    return sources.length ? sources : [{ label: "出图 API", baseUrl: config.baseUrl.trim().replace(/\/+$/, ""), apiKey: config.apiKey, apiProxy: false, timeout: Number(config.timeout), versioned: true }];
}

function aiApiUrl(config: AiConfig, source: VideoApiSource, path: string) {
    if (config.channelMode === "remote") return `/api/v1${path}`;

    const proxyConfig = readClientDevProxyConfig();
    if (shouldUseApiProxy(source.apiProxy, proxyConfig)) return buildDevApiUrl(source.baseUrl, path, proxyConfig, true);
    if (source.versioned) return buildDevApiUrl(source.baseUrl, path, proxyConfig, false);
    const endpointPath = path.replace(/^\/+/, "");
    return source.baseUrl ? `${source.baseUrl}/${endpointPath}` : `/${endpointPath}`;
}

function aiHeaders(config: AiConfig, source: VideoApiSource) {
    const token = useUserStore.getState().token;
    const apiKey = source.apiKey;
    return config.channelMode === "remote" ? (token ? { Authorization: `Bearer ${token}` } : undefined) : { Authorization: `Bearer ${apiKey}` };
}

function refreshRemoteUser(config: AiConfig) {
    if (config.channelMode === "remote") void useUserStore.getState().hydrateUser();
}

function requestTimeout(source: VideoApiSource) {
    return Math.max(1, source.timeout || 120) * 1000;
}

export async function requestVideoGeneration(config: AiConfig, prompt: string, references: ReferenceImage[] = []) {
    const model = config.videoModel || config.model;
    const sources = resolveVideoApiSources(config);
    const failures: VideoAttemptError[] = [];
    const tryGeneration = async <T>(label: string, task: () => Promise<T>, shouldContinue: (error: unknown) => boolean) => {
        try {
            return await task();
        } catch (error) {
            const message = readAxiosError(error, "视频生成失败");
            failures.push(new VideoAttemptError(message, label));
            if (!shouldContinue(error)) throw buildVideoGenerationError(failures);
            return null;
        }
    };

    for (const source of sources) {
        const labelPrefix = sources.length > 1 ? `${source.label} ` : "";
        // Grok Video 3 在部分兼容站里挂在聊天接口下，直接走视频任务接口会返回 405。
        if (isGrokChatVideoModel(model)) {
            const result = await tryGeneration(`${labelPrefix}聊天兼容 /chat/completions`, () => requestChatCompletionsVideoGeneration(config, source, prompt, references, model), shouldFallbackToTaskVideoApi);
            if (result) return result;
        }

        // Sora 2 在 NewAPI 里对应 OpenAI 兼容的 /videos multipart 接口。
        if (isSoraVideoModel(model)) {
            const result = await tryGeneration(`${labelPrefix}Sora 兼容 /videos`, () => requestOpenAiCompatibleVideoGeneration(config, source, prompt, references, model, true), shouldFallbackToTaskVideoApi);
            if (result) return result;
        }

        const taskResult = await tryGeneration(`${labelPrefix}NewAPI 任务 /video/generations`, () => requestNewApiVideoGeneration(config, source, prompt, references, model), shouldFallbackToLegacyVideoApi);
        if (taskResult) return taskResult;

        // NewAPI 兼容接口不可用时，回退到旧版 /videos 流程。
        const openAiResult = await tryGeneration(`${labelPrefix}OpenAI 兼容 /videos`, () => requestOpenAiCompatibleVideoGeneration(config, source, prompt, references, model, false), shouldFallbackToTaskVideoApi);
        if (openAiResult) return openAiResult;

        if (!isGrokChatVideoModel(model)) {
            const chatResult = await tryGeneration(`${labelPrefix}聊天兼容 /chat/completions`, () => requestChatCompletionsVideoGeneration(config, source, prompt, references, model), shouldFallbackToTaskVideoApi);
            if (chatResult) return chatResult;
        }
    }

    throw buildVideoGenerationError(failures);
}

async function requestOpenAiCompatibleVideoGeneration(config: AiConfig, source: VideoApiSource, prompt: string, references: ReferenceImage[], model: string, isSoraCompatible: boolean) {
    const body = new FormData();
    body.append("model", model);
    body.append("prompt", prompt);
    body.append("seconds", normalizeVideoSeconds(config.videoSeconds));
    if (normalizeVideoSize(config.size)) body.append("size", normalizeVideoSize(config.size)!);
    if (!isSoraCompatible) {
        body.append("resolution_name", normalizeVideoResolution(config.vquality));
        body.append("preset", "normal");
    }
    const files = await Promise.all(references.slice(0, 7).map(async (image) => dataUrlToFile({ ...image, dataUrl: await imageToDataUrl(image) })));
    files.forEach((file) => body.append(isSoraCompatible ? "input_reference" : "input_reference[]", file));
    const created = unwrapVideoResponse((await axios.post<ApiVideoResponse>(aiApiUrl(config, source, "/videos"), body, { headers: aiHeaders(config, source), timeout: requestTimeout(source) })).data);
    if (!created.id) throw new Error("视频接口没有返回任务 ID");
    for (;;) {
        const video = unwrapVideoResponse((await axios.get<ApiVideoResponse>(aiApiUrl(config, source, `/videos/${created.id}`), { headers: aiHeaders(config, source), params: config.channelMode === "remote" ? { model } : undefined, timeout: requestTimeout(source) })).data);
        if (isVideoStatusCompleted(video.status)) break;
        if (isVideoStatusFailed(video.status)) throw new Error(video.error?.message || "视频生成失败");
        await new Promise((resolve) => setTimeout(resolve, 2500));
    }
    const content = await axios.get<Blob>(aiApiUrl(config, source, `/videos/${created.id}/content`), { headers: aiHeaders(config, source), params: config.channelMode === "remote" ? { model } : undefined, responseType: "blob", timeout: requestTimeout(source) });
    await assertVideoBlob(content.data);
    refreshRemoteUser(config);
    return content.data;
}

async function requestChatCompletionsVideoGeneration(config: AiConfig, source: VideoApiSource, prompt: string, references: ReferenceImage[], model: string) {
    const content = await buildChatVideoContent(config, prompt, references);
    const response = await axios.post(
        aiApiUrl(config, source, "/chat/completions"),
        {
            model,
            messages: [{ role: "user", content }],
            stream: false,
        },
        { headers: { ...aiHeaders(config, source), "Content-Type": "application/json" }, timeout: requestTimeout(source) },
    );
    const videoUrl = findVideoUrl(response.data);
    if (!videoUrl) throw new Error("视频接口没有返回视频地址");
    const dataUrl = await fetchImageUrlAsDataUrl(videoUrl, "video/mp4");
    const videoResponse = await fetch(dataUrl);
    refreshRemoteUser(config);
    return videoResponse.blob();
}

async function requestNewApiVideoGeneration(config: AiConfig, source: VideoApiSource, prompt: string, references: ReferenceImage[], model: string) {
    const payload: Record<string, unknown> = {
        model,
        prompt,
        seconds: Number(normalizeVideoSeconds(config.videoSeconds)),
        size: normalizeVideoSize(config.size) || undefined,
        resolution: normalizeVideoResolution(config.vquality),
    };
    const images = (await Promise.all(references.slice(0, 7).map((image) => imageToDataUrl(image)))).filter(Boolean);
    if (images.length) payload.image = images.length === 1 ? images[0] : images;

    const created = unwrapNewApiVideoResponse((await axios.post<NewApiVideoResponse>(aiApiUrl(config, source, "/video/generations"), payload, { headers: { ...aiHeaders(config, source), "Content-Type": "application/json" }, timeout: requestTimeout(source) })).data);
    if (!created.id) throw new Error("视频接口没有返回任务 ID");

    let task = created;
    for (;;) {
        if (isVideoTaskCompleted(task)) break;
        if (isVideoTaskFailed(task)) throw new Error(task.error?.message || "视频生成失败");
        await new Promise((resolve) => setTimeout(resolve, 2500));
        task = unwrapNewApiVideoResponse((await axios.get<NewApiVideoResponse>(aiApiUrl(config, source, `/video/generations/${created.id}`), { headers: aiHeaders(config, source), timeout: requestTimeout(source) })).data);
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
    return Boolean(task.url || task.videoUrl) || isVideoStatusCompleted(task.status);
}

function isVideoTaskFailed(task: NewApiVideoTask) {
    return isVideoStatusFailed(task.status);
}

function isVideoStatusCompleted(status?: string) {
    return ["completed", "succeeded", "success", "done"].includes((status || "").toLowerCase());
}

function isVideoStatusFailed(status?: string) {
    return ["failed", "cancelled", "canceled", "error"].includes((status || "").toLowerCase());
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

function isSoraVideoModel(model: string) {
    return /^sora(?:-|$)/i.test(model.trim());
}

function readAxiosError(error: unknown, fallback: string) {
    if (axios.isAxiosError(error)) {
        const responseData = error.response?.data;
        return sanitizeApiErrorMessage(extractApiErrorMessage(responseData) || (error.response?.status ? `${fallback}：${error.response.status}` : fallback));
    }
    return sanitizeApiErrorMessage(error instanceof Error ? error.message : fallback);
}

function extractApiErrorMessage(input: unknown): string {
    if (!input) return "";
    if (typeof input === "string") return input.trim();
    if (typeof input !== "object") return "";
    const record = input as Record<string, unknown>;
    const direct =
        stringValue(record.msg) ||
        stringValue(record.message) ||
        stringValue(record.detail) ||
        stringValue(record.reason) ||
        stringValue(record.error_message) ||
        stringValue(record.fail_reason);
    if (direct) return direct;
    if (typeof record.error === "string") return record.error.trim();
    return extractApiErrorMessage(record.error) || extractApiErrorMessage(record.data);
}

function buildVideoGenerationError(failures: VideoAttemptError[]) {
    const visibleFailures = failures.filter((failure) => failure.message.trim());
    if (!visibleFailures.length) return new Error("视频生成失败");
    const first = visibleFailures[0];
    const summary = visibleFailures
        .map((failure) => `${failure.label}：${failure.message}`)
        .filter((item, index, array) => array.indexOf(item) === index)
        .join("；");
    return new Error(visibleFailures.length > 1 ? `视频生成失败：${summary}` : first.message);
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
