import { describe, expect, it } from "vitest";

import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../types";
import { buildConnectedPromptText, buildNodeGenerationContext, buildNodeGenerationInputs, stripConnectedPromptSuffix } from "./canvas-node-generation";

const baseNode = (node: Partial<CanvasNodeData> & Pick<CanvasNodeData, "id" | "type">): CanvasNodeData => ({
    title: node.id,
    position: { x: 0, y: 0 },
    width: 100,
    height: 100,
    metadata: {},
    ...node,
});

describe("canvas node generation prompt handling", () => {
    it("发送上下文合并上游文字，但节点自身提示词可以单独剥离", () => {
        const textNode = baseNode({
            id: "text-1",
            type: CanvasNodeType.Text,
            metadata: { content: "唐三\n\n小舞" },
        });
        const imageNode = baseNode({
            id: "image-1",
            type: CanvasNodeType.Image,
            metadata: { prompt: "两人站在森林里\n\n唐三\n\n小舞" },
        });
        const connections: CanvasConnection[] = [{ id: "conn-1", fromNodeId: textNode.id, toNodeId: imageNode.id }];

        const inputs = buildNodeGenerationInputs(imageNode.id, [textNode, imageNode], connections);
        const connectedText = buildConnectedPromptText(inputs);

        expect(buildNodeGenerationContext(imageNode.id, [textNode, imageNode], connections, "两人站在森林里").prompt).toBe("两人站在森林里\n\n唐三\n\n小舞");
        expect(stripConnectedPromptSuffix(imageNode.metadata?.prompt || "", connectedText)).toBe("两人站在森林里");
    });
});
