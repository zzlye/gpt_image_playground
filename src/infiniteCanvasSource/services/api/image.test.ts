import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_SETTINGS } from "../../../lib/apiProfiles";
import { useStore } from "../../../store";
import { defaultConfig } from "../../stores/use-config-store";
import { requestGeneration } from "./image";

describe("canvas image api", () => {
    const initialSettings = useStore.getState().settings;

    afterEach(() => {
        useStore.setState({ settings: initialSettings });
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
    });

    it("uses the same image API proxy path as the main workshop", async () => {
        vi.stubEnv("VITE_API_PROXY_AVAILABLE", "true");
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(JSON.stringify({ data: [{ b64_json: "ZmluYWw=" }] }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            }),
        );

        useStore.setState({
            settings: {
                ...DEFAULT_SETTINGS,
                profiles: DEFAULT_SETTINGS.profiles.map((profile, index) => ({
                    ...profile,
                    apiKey: "test-key",
                    apiProxy: index === 0,
                })),
            },
        });

        const images = await requestGeneration(
            {
                ...defaultConfig,
                baseUrl: "",
                apiKey: "test-key",
                model: "gpt-image-2",
                imageModel: "gpt-image-2",
                size: "1:1",
                quality: "auto",
                count: "1",
            },
            "prompt",
        );

        expect(fetchMock).toHaveBeenCalledWith(
            "/api-proxy/images/generations",
            expect.objectContaining({ method: "POST" }),
        );
        expect(images).toEqual([{ id: expect.any(String), dataUrl: "data:image/png;base64,ZmluYWw=" }]);
    });
});
