import axios from "axios";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";

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
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("uses chat completions for Grok video 3 models", async () => {
        (axios.post as Mock).mockResolvedValueOnce({
            data: {
                choices: [
                    {
                        message: {
                            content: "视频已生成：https://cdn.example.com/grok-video.mp4",
                        },
                    },
                ],
            },
        });
        vi.spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(new Response(new Blob(["video"], { type: "video/mp4" })))
            .mockResolvedValueOnce(new Response(new Blob(["video"], { type: "video/mp4" })));

        const blob = await requestVideoGeneration({
            ...defaultConfig,
            videoBaseUrl: "https://api.example.com/v1",
            videoApiKey: "video-key",
            videoModel: "grok-video-3-pro",
            videoSeconds: "6",
            vquality: "720",
            size: "16:9",
        }, "prompt");

        expect(axios.post).toHaveBeenCalledWith(
            "https://api.example.com/v1/chat/completions",
            expect.objectContaining({
                model: "grok-video-3-pro",
                messages: expect.arrayContaining([
                    expect.objectContaining({
                        role: "user",
                        content: expect.stringContaining("prompt"),
                    }),
                ]),
            }),
            expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer video-key" }) }),
        );
        expect(blob.type).toBe("video/mp4");
    });

    it("uses NewAPI video generations endpoint before legacy videos endpoint", async () => {
        (axios.post as Mock).mockResolvedValueOnce({ data: { data: { task_id: "task-1", status: "queued" } } });
        (axios.get as Mock)
            .mockResolvedValueOnce({ data: { data: { id: "task-1", status: "completed", video_url: "https://cdn.example.com/video.mp4" } } });
        vi.spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(new Response(new Blob(["video"], { type: "video/mp4" })))
            .mockResolvedValueOnce(new Response(new Blob(["video"], { type: "video/mp4" })));

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

    it("reads nested NewAPI video result url", async () => {
        (axios.post as Mock).mockResolvedValueOnce({ data: { data: { task_id: "task-2", status: "queued" } } });
        (axios.get as Mock)
            .mockResolvedValueOnce({ data: { data: { id: "task-2", status: "completed", result: { video_url: "https://cdn.example.com/nested.mp4" } } } });
        vi.spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(new Response(new Blob(["video"], { type: "video/mp4" })))
            .mockResolvedValueOnce(new Response(new Blob(["video"], { type: "video/mp4" })));

        await expect(requestVideoGeneration({
            ...defaultConfig,
            videoBaseUrl: "https://api.example.com/v1",
            videoApiKey: "video-key",
            videoModel: "video-model",
        }, "prompt")).resolves.toEqual(expect.any(Blob));
    });
});
