import { describe, expect, it } from "vitest";

import { CanvasNodeType, type CanvasNodeData, type CanvasNodeStatus } from "../types";
import { isCanvasNodeGenerationLocked, withRunningCanvasNode, withoutRunningCanvasNodes } from "./canvas-generation-running";

const node = (id: string, status?: CanvasNodeStatus): CanvasNodeData => ({
    id,
    type: CanvasNodeType.Image,
    title: id,
    position: { x: 0, y: 0 },
    width: 100,
    height: 100,
    metadata: status ? { status } : {},
});

describe("canvas generation running lock", () => {
    it("按节点集合分别锁定多个正在生成的节点", () => {
        const running = withRunningCanvasNode(withRunningCanvasNode(new Set<string>(), "node-a"), "node-b");

        expect(isCanvasNodeGenerationLocked(node("node-a"), running)).toBe(true);
        expect(isCanvasNodeGenerationLocked(node("node-b"), running)).toBe(true);
        expect(isCanvasNodeGenerationLocked(node("node-c"), running)).toBe(false);
    });

    it("节点处于 loading 状态时即使切换面板也保持锁定", () => {
        expect(isCanvasNodeGenerationLocked(node("node-a", "loading"), new Set())).toBe(true);
    });

    it("完成一个节点时不会误解锁其他正在生成的节点", () => {
        const running = withRunningCanvasNode(withRunningCanvasNode(new Set<string>(), "node-a"), "node-b");
        const next = withoutRunningCanvasNodes(running, ["node-a"]);

        expect(isCanvasNodeGenerationLocked(node("node-a"), next)).toBe(false);
        expect(isCanvasNodeGenerationLocked(node("node-b"), next)).toBe(true);
    });
});
