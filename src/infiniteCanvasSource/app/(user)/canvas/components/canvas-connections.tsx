import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { Scissors } from "lucide-react";
import type { CanvasConnection, CanvasNodeData, ConnectionHandle, Position } from "../types";

export function ConnectionPath({ connection, from, to, active, selected, onSelect, onDelete }: { connection: CanvasConnection; from: CanvasNodeData; to: CanvasNodeData; active: boolean; selected: boolean; onSelect: () => void; onDelete: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const startX = from.position.x + from.width;
    const startY = from.position.y + from.height / 2;
    const endX = to.position.x;
    const endY = to.position.y + to.height / 2;
    const dx = Math.abs(endX - startX);
    const curvature = Math.max(dx * 0.5, 50);
    const pathD = `M ${startX} ${startY} C ${startX + curvature} ${startY}, ${endX - curvature} ${endY}, ${endX} ${endY}`;
    const mid = cubicPoint(
        { x: startX, y: startY },
        { x: startX + curvature, y: startY },
        { x: endX - curvature, y: endY },
        { x: endX, y: endY },
        0.5,
    );

    return (
        <g>
            <path
                data-connection-id={connection.id}
                d={pathD}
                stroke="transparent"
                strokeWidth="30"
                fill="none"
                style={{ cursor: "pointer", pointerEvents: "stroke" }}
                onClick={(event) => {
                    event.stopPropagation();
                    onSelect();
                }}
            />
            <path
                d={pathD}
                stroke={active ? theme.node.activeStroke : theme.node.muted}
                strokeWidth={active ? 3 : 2}
                strokeOpacity={active ? 1 : 0.82}
                fill="none"
                style={{ filter: active ? `drop-shadow(0 0 8px ${theme.node.activeStroke}66)` : undefined, pointerEvents: "none" }}
            />
            {selected ? (
                <g
                    transform={`translate(${mid.x - 10} ${mid.y - 10})`}
                    style={{ cursor: "pointer", pointerEvents: "all" }}
                    aria-label="删除连线"
                    onClick={(event) => {
                        event.stopPropagation();
                        onDelete();
                    }}
                    onMouseDown={(event) => {
                        event.stopPropagation();
                        event.preventDefault();
                    }}
                >
                    <title>删除连线</title>
                    <rect x="-8" y="-8" width="36" height="36" fill="transparent" />
                    <Scissors width={20} height={20} color={theme.node.activeStroke} strokeWidth={2.4} style={{ filter: "drop-shadow(0 2px 6px rgba(0,0,0,.45))", pointerEvents: "none" }} />
                </g>
            ) : null}
        </g>
    );
}

function cubicPoint(p0: Position, p1: Position, p2: Position, p3: Position, t: number): Position {
    const a = 1 - t;
    return {
        x: a ** 3 * p0.x + 3 * a ** 2 * t * p1.x + 3 * a * t ** 2 * p2.x + t ** 3 * p3.x,
        y: a ** 3 * p0.y + 3 * a ** 2 * t * p1.y + 3 * a * t ** 2 * p2.y + t ** 3 * p3.y,
    };
}

export function ActiveConnectionPath({ node, handle, mouseWorld }: { node?: CanvasNodeData; handle: ConnectionHandle; mouseWorld: Position }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    if (!node) return null;

    const startX = handle.handleType === "source" ? node.position.x + node.width : mouseWorld.x;
    const startY = handle.handleType === "source" ? node.position.y + node.height / 2 : mouseWorld.y;
    const endX = handle.handleType === "source" ? mouseWorld.x : node.position.x;
    const endY = handle.handleType === "source" ? mouseWorld.y : node.position.y + node.height / 2;
    const distance = Math.abs(endX - startX);
    const pathD = `M ${startX} ${startY} C ${startX + distance * 0.5} ${startY}, ${endX - distance * 0.5} ${endY}, ${endX} ${endY}`;

    return <path d={pathD} stroke={theme.node.activeStroke} strokeWidth="2" fill="none" strokeDasharray="5,5" />;
}
