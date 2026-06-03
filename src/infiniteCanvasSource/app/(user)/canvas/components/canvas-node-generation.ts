import type { ChatCompletionMessage } from "@/services/api/image";
import type { ReferenceImage } from "@/types/image";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../types";

export type NodeGenerationContext = {
    prompt: string;
    referenceImages: ReferenceImage[];
    textCount: number;
    imageCount: number;
};

export type NodeGenerationInput = {
    nodeId: string;
    type: "text" | "image" | "video";
    title: string;
    text?: string;
    image?: ReferenceImage;
};

export function buildNodeGenerationContext(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[], prompt: string): NodeGenerationContext {
    const inputs = buildNodeGenerationInputs(nodeId, nodes, connections);
    const upstreamText = buildConnectedPromptText(inputs);
    const referenceImages = getNodeGenerationInputReferenceImages(inputs);

    return {
        prompt: combineNodeGenerationPrompt(prompt, upstreamText),
        referenceImages,
        textCount: inputs.filter((input) => input.type === "text").length,
        imageCount: referenceImages.length,
    };
}

export function combineNodeGenerationPrompt(prompt: string, connectedText: string) {
    const ownPrompt = prompt.trim();
    const upstreamPrompt = connectedText.trim();
    return [ownPrompt, upstreamPrompt].filter(Boolean).join("\n\n");
}

export function hasUsableNodeGenerationPrompt(prompt: string, connectedText: string) {
    return Boolean(prompt.trim() || connectedText.trim());
}

export function buildConnectedPromptText(inputs: NodeGenerationInput[]) {
    return inputs
        .filter((input) => input.type === "text")
        .map((input) => input.text?.trim())
        .filter(Boolean)
        .join("\n\n");
}

export function stripConnectedPromptSuffix(prompt: string, connectedText: string) {
    const suffix = connectedText.trim();
    if (!suffix) return prompt;
    const normalizedPrompt = prompt.trimEnd();
    if (normalizedPrompt === suffix) return "";
    const connectedSuffix = `\n\n${suffix}`;
    if (!normalizedPrompt.endsWith(connectedSuffix)) return prompt;
    // 兼容旧数据：旧逻辑会把上游连线文字按空行拼到节点自己的 prompt 末尾。
    return normalizedPrompt.slice(0, -connectedSuffix.length).trimEnd();
}

export function buildNodeGenerationInputs(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]): NodeGenerationInput[] {
    return getOrderedUpstreamNodes(nodeId, nodes, connections).flatMap((node): NodeGenerationInput[] => {
        const image = readReferenceImage(node);
        if (image) return [{ nodeId: node.id, type: "image" as const, title: node.title, image }];
        const text = readNodeTextInput(node);
        if (text) return [{ nodeId: node.id, type: "text" as const, title: node.title, text }];
        return [];
    });
}

export function getNodeGenerationInputReferenceImages(inputs: NodeGenerationInput[]) {
    return inputs.map((input) => input.image).filter((image): image is ReferenceImage => Boolean(image));
}

export function mergeNodeReferenceImages(...groups: ReferenceImage[][]) {
    const seen = new Set<string>();
    const result: ReferenceImage[] = [];
    for (const group of groups) {
        for (const image of group) {
            const key = referenceImageIdentity(image);
            if (seen.has(key)) continue;
            seen.add(key);
            result.push(image);
        }
    }
    return result;
}

export function referenceImageIdentity(image: Pick<ReferenceImage, "id" | "dataUrl" | "url" | "storageKey">) {
    return image.storageKey || image.url || image.dataUrl || image.id;
}

export function buildNodeChatMessages(context: NodeGenerationContext): ChatCompletionMessage[] {
    if (!context.referenceImages.length) {
        return [{ role: "user", content: context.prompt }];
    }

    return [
        {
            role: "user",
            content: [{ type: "text" as const, text: context.prompt }, ...context.referenceImages.map((image) => ({ type: "image_url" as const, image_url: { url: image.dataUrl } }))],
        },
    ];
}

export async function hydrateNodeGenerationContext(context: NodeGenerationContext) {
    const { imageToDataUrl } = await import("@/services/image-storage");
    return { ...context, referenceImages: await Promise.all(context.referenceImages.map(async (image) => ({ ...image, dataUrl: await imageToDataUrl(image) }))) };
}

function readNodeTextInput(node: CanvasNodeData) {
    if (node.type === CanvasNodeType.Text) return node.metadata?.content || node.metadata?.prompt || "";
    return node.metadata?.prompt || "";
}

function readReferenceImage(node: CanvasNodeData): ReferenceImage | null {
    if (node.type !== CanvasNodeType.Image || !node.metadata?.content) return null;
    return {
        id: node.id,
        name: `${node.title || node.id}.png`,
        type: node.metadata.mimeType || "image/png",
        dataUrl: node.metadata.content,
        storageKey: node.metadata.storageKey,
    };
}

function getOrderedUpstreamNodes(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    const target = nodes.find((node) => node.id === nodeId);
    const upstreamNodes = connections
        .filter((connection) => connection.toNodeId === nodeId)
        .map((connection) => nodes.find((node) => node.id === connection.fromNodeId))
        .filter((node): node is CanvasNodeData => Boolean(node));
    const order = target?.metadata?.inputOrder || [];
    return [...order.map((id) => upstreamNodes.find((node) => node.id === id)).filter((node): node is CanvasNodeData => Boolean(node)), ...upstreamNodes.filter((node) => !order.includes(node.id))];
}
