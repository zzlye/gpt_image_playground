import type { CanvasNodeData } from "../types";

const LOADING_STATUS = "loading";

// 同时读取内存运行集合和节点持久状态，避免切换节点面板后重复提交生成任务。
export function isCanvasNodeGenerationLocked(node: Pick<CanvasNodeData, "id" | "metadata"> | null | undefined, runningNodeIds: ReadonlySet<string>) {
    return Boolean(node && (runningNodeIds.has(node.id) || node.metadata?.status === LOADING_STATUS));
}

export function withRunningCanvasNode(runningNodeIds: ReadonlySet<string>, nodeId: string) {
    const next = new Set(runningNodeIds);
    next.add(nodeId);
    return next;
}

export function withoutRunningCanvasNodes(runningNodeIds: ReadonlySet<string>, nodeIds: Iterable<string>) {
    const next = new Set(runningNodeIds);
    for (const nodeId of nodeIds) next.delete(nodeId);
    return next;
}
