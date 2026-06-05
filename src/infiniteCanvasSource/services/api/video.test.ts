import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { defaultConfig } from "../../stores/use-config-store";
import { requestVideoGeneration } from "./video";

vi.mock("axios", () => ({
    default: {
        post: vi.fn(),
        get: vi.fn(),
        isAxiosError: vi.fn((error: unknown) => Boolean((error as { isAxiosError?: boolean })?.isAxiosError)),
    },
}));

describe("canvas video api", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("uses multipart videos endpoint first for Grok video 3 pro models", async () => {
        (axios.post as Mock).mockResolvedValueOnce({ data: { id: "task-grok", status: "processing" } });
        (axios.get as Mock).mockResolvedValueOnce({ data: { id: "task-grok", status: "completed", video_url: "https://cdn.example.com/grok-video.mp4" } });
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(new Blob(["video"], { type: "video/mp4" })));

        const blob = await requestVideoGeneration({
            ...defaultConfig,
            videoBaseUrl: "https://api.example.com/v1",
            videoApiKey: "video-key",
            videoModel: "grok-video-3-pro",
            videoSeconds: "6",
            vquality: "720",
            size: "16:9",
        }, "prompt");

        const [url, body] = (axios.post as Mock).mock.calls[0];
        expect(url).toBe("https://api.example.com/v1/videos");
        expect(body).toBeInstanceOf(FormData);
        expect(body.get("model")).toBe("grok-video-3-pro");
        expect(body.get("prompt")).toBe("prompt");
        expect(body.get("seconds")).toBe("6");
        expect(axios.get).toHaveBeenCalledTimes(1);
        expect(fetch).toHaveBeenCalledWith("https://cdn.example.com/grok-video.mp4", expect.any(Object));
        expect(blob.type).toBe("video/mp4");
    });

    it("uses JSON videos endpoint first for Sora models without references", async () => {
        (axios.post as Mock).mockResolvedValueOnce({ data: { id: "task-sora", status: "queued" } });
        (axios.get as Mock).mockResolvedValueOnce({ data: { id: "task-sora", status: "completed", output: "https://cdn.example.com/sora.mp4" } });
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(new Blob(["video"], { type: "video/mp4" })));

        await requestVideoGeneration({
            ...defaultConfig,
            videoBaseUrl: "https://api.example.com/v1",
            videoApiKey: "video-key",
            videoModel: "sora-2",
            videoSeconds: "4",
            size: "16:9",
        }, "prompt");

        expect(axios.post).toHaveBeenCalledWith(
            "https://api.example.com/v1/videos",
            expect.objectContaining({ model: "sora-2", prompt: "prompt", seconds: "4", size: "1280x720" }),
            expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer video-key" }) }),
        );
        expect((axios.post as Mock).mock.calls[0][1]).not.toBeInstanceOf(FormData);
        expect(axios.get).toHaveBeenCalledTimes(1);
        expect(fetch).toHaveBeenCalledWith("https://cdn.example.com/sora.mp4", expect.any(Object));
    });

    it("keeps authorization when the videos status output points to the content endpoint", async () => {
        (axios.post as Mock).mockResolvedValueOnce({ data: { id: "task-sora", status: "queued" } });
        (axios.get as Mock).mockResolvedValueOnce({ data: { id: "task-sora", status: "completed", output: "https://api.example.com/v1/videos/task-sora/content" } });
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(new Blob(["video"], { type: "video/mp4" })));

        await requestVideoGeneration({
            ...defaultConfig,
            videoBaseUrl: "https://api.example.com/v1",
            videoApiKey: "video-key",
            videoModel: "sora-2",
        }, "prompt");

        expect(fetch).toHaveBeenCalledWith(
            "https://api.example.com/v1/videos/task-sora/content",
            expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer video-key" }) }),
        );
    });

    it("uses JSON videos endpoint first for Veo models", async () => {
        (axios.post as Mock).mockResolvedValueOnce({ data: { id: "task-veo", status: "queued" } });
        (axios.get as Mock).mockResolvedValueOnce({ data: { id: "task-veo", status: "completed", video_url: "https://cdn.example.com/veo.mp4" } });
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(new Blob(["video"], { type: "video/mp4" })));

        await requestVideoGeneration({
            ...defaultConfig,
            videoBaseUrl: "https://api.example.com/v1",
            videoApiKey: "video-key",
            videoModel: "veo_3_1-fast",
        }, "prompt");

        expect(axios.post).toHaveBeenNthCalledWith(
            1,
            "https://api.example.com/v1/videos",
            expect.objectContaining({ model: "veo_3_1-fast", prompt: "prompt" }),
            expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer video-key" }) }),
        );
    });

    it("uses NewAPI video generations endpoint before legacy videos endpoint", async () => {
        (axios.post as Mock).mockResolvedValueOnce({ data: { data: { task_id: "task-1", status: "queued" } } });
        (axios.get as Mock)
            .mockResolvedValueOnce({ data: { data: { id: "task-1", status: "completed", video_url: "https://cdn.example.com/video.mp4" } } });
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(new Blob(["video"], { type: "video/mp4" })));

        const blob = await requestVideoGeneration({
            ...defaultConfig,
            videoBaseUrl: "https://api.example.com/v1",
            videoApiKey: "video-key",
            videoModel: "video-model",
            videoSeconds: "6",
            vquality: "720",
            size: "16:9",
        }, "prompt");

        expect(axios.post).toHaveBeenCalledWith(
            "https://api.example.com/v1/video/generations",
            expect.objectContaining({ model: "video-model", prompt: "prompt" }),
            expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer video-key" }) }),
        );
        expect(axios.get).toHaveBeenCalledWith(
            "https://api.example.com/v1/video/generations/task-1",
            expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer video-key" }) }),
        );
        expect(blob.type).toBe("video/mp4");
    });

    it("falls back to text API settings when dedicated video API is empty", async () => {
        (axios.post as Mock).mockResolvedValueOnce({ data: { data: { task_id: "task-1", status: "queued" } } });
        (axios.get as Mock)
            .mockResolvedValueOnce({ data: { data: { id: "task-1", status: "completed", video_url: "https://cdn.example.com/video.mp4" } } });
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(new Blob(["video"], { type: "video/mp4" })));

        await requestVideoGeneration({
            ...defaultConfig,
            baseUrl: "https://image.example.com/v1",
            apiKey: "image-key",
            textBaseUrl: "https://text.example.com/v1",
            textApiKey: "text-key",
            videoBaseUrl: "",
            videoApiKey: "",
            videoModel: "veo_3_1",
        }, "prompt");

        expect(axios.post).toHaveBeenCalledWith(
            "https://text.example.com/v1/videos",
            expect.objectContaining({ model: "veo_3_1", prompt: "prompt" }),
            expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer text-key" }) }),
        );
    });

    it("tries task video endpoint for Sora when JSON videos endpoint returns 404", async () => {
        const notFound = Object.assign(new Error("not found"), {
            isAxiosError: true,
            response: { status: 404, data: { error: { message: "not found" } } },
        });
        (axios.post as Mock)
            .mockRejectedValueOnce(notFound)
            .mockResolvedValueOnce({ data: { data: { task_id: "task-2", status: "queued" } } });
        (axios.get as Mock)
            .mockResolvedValueOnce({ data: { data: { id: "task-2", status: "completed", video_url: "https://cdn.example.com/video.mp4" } } });
        vi.spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(new Response(new Blob(["video"], { type: "video/mp4" })))
            .mockResolvedValueOnce(new Response(new Blob(["video"], { type: "video/mp4" })));

        await requestVideoGeneration({
            ...defaultConfig,
            videoBaseUrl: "https://api.example.com/v1",
            videoApiKey: "video-key",
            videoModel: "sora-2",
        }, "prompt");

        expect(axios.post).toHaveBeenNthCalledWith(1, "https://api.example.com/v1/videos", expect.any(Object), expect.any(Object));
        expect((axios.post as Mock).mock.calls[0][1]).not.toBeInstanceOf(FormData);
        expect(axios.post).toHaveBeenNthCalledWith(
            2,
            "https://api.example.com/v1/video/generations",
            expect.objectContaining({ model: "sora-2", prompt: "prompt" }),
            expect.any(Object),
        );
    });

    it("tries unversioned API root when versioned video root returns 404", async () => {
        const notFound = Object.assign(new Error("not found"), {
            isAxiosError: true,
            response: { status: 404, data: { error: { message: "not found" } } },
        });
        (axios.post as Mock)
            .mockRejectedValueOnce(notFound)
            .mockRejectedValueOnce(notFound)
            .mockRejectedValueOnce(notFound)
            .mockRejectedValueOnce(notFound)
            .mockResolvedValueOnce({ data: { data: { task_id: "task-3", status: "queued" } } });
        (axios.get as Mock)
            .mockResolvedValueOnce({ data: { data: { id: "task-3", status: "completed", video_url: "https://cdn.example.com/video.mp4" } } });
        vi.spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(new Response(new Blob(["video"], { type: "video/mp4" })))
            .mockResolvedValueOnce(new Response(new Blob(["video"], { type: "video/mp4" })));

        await requestVideoGeneration({
            ...defaultConfig,
            videoBaseUrl: "https://api.example.com/v1",
            videoApiKey: "video-key",
            videoModel: "veo_3_1",
        }, "prompt");

        expect((axios.post as Mock).mock.calls.map((call) => call[0])).toEqual([
            "https://api.example.com/v1/videos",
            "https://api.example.com/v1/video/generations",
            "https://api.example.com/v1/videos",
            "https://api.example.com/v1/chat/completions",
            "https://api.example.com/videos",
        ]);
    });

    it("uses JSON videos endpoint with image payload for Sora models with references", async () => {
        (axios.post as Mock).mockResolvedValueOnce({ data: { id: "task-1", status: "queued" } });
        (axios.get as Mock)
            .mockResolvedValueOnce({ data: { id: "task-1", status: "completed", video_url: "https://cdn.example.com/sora-ref.mp4" } });
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(new Blob(["video"], { type: "video/mp4" })));

        const reference = {
            id: "ref-1",
            name: "reference.png",
            type: "image/png",
            dataUrl: "data:image/png;base64,cmVm",
        };

        await requestVideoGeneration({
            ...defaultConfig,
            videoBaseUrl: "https://api.example.com/v1",
            videoApiKey: "video-key",
            videoModel: "sora-2",
            videoSeconds: "6",
            vquality: "720",
            size: "16:9",
        }, "prompt", [reference]);

        const [url, body] = (axios.post as Mock).mock.calls[0];
        expect(url).toBe("https://api.example.com/v1/videos");
        expect(body).toEqual(expect.objectContaining({
            model: "sora-2",
            prompt: "prompt",
            seconds: "6",
            size: "1280x720",
            image: "data:image/png;base64,cmVm",
        }));
        expect(axios.get).toHaveBeenNthCalledWith(
            1,
            "https://api.example.com/v1/videos/task-1",
            expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer video-key" }) }),
        );
        expect(fetch).toHaveBeenCalledWith("https://cdn.example.com/sora-ref.mp4", expect.any(Object));
    });

    it("reads nested NewAPI video result url", async () => {
        (axios.post as Mock).mockResolvedValueOnce({ data: { data: { task_id: "task-2", status: "queued" } } });
        (axios.get as Mock)
            .mockResolvedValueOnce({ data: { data: { id: "task-2", status: "completed", result: { video_url: "https://cdn.example.com/nested.mp4" } } } });
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(new Blob(["video"], { type: "video/mp4" })));

        await expect(requestVideoGeneration({
            ...defaultConfig,
            videoBaseUrl: "https://api.example.com/v1",
            videoApiKey: "video-key",
            videoModel: "video-model",
        }, "prompt")).resolves.toEqual(expect.any(Blob));
    });
});
