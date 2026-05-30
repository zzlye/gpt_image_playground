"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { Clipboard, Copy, Plus, Redo2, Trash2, Undo2, Upload } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { ContextMenuState } from "../types";

type CanvasContextMenuProps = {
    menu: ContextMenuState;
    canUndo?: boolean;
    canRedo?: boolean;
    canPaste?: boolean;
    onClose: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
    onUpload?: () => void;
    onAddNode?: () => void;
    onUndo?: () => void;
    onRedo?: () => void;
    onCopyAll?: () => void;
    onPaste?: () => void;
};

export function CanvasNodeContextMenu({ menu, canUndo = false, canRedo = false, canPaste = false, onClose, onDuplicate, onDelete, onUpload, onAddNode, onUndo, onRedo, onCopyAll, onPaste }: CanvasContextMenuProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    useEffect(() => {
        const close = (event: PointerEvent) => {
            const target = event.target;
            if (target instanceof Element && target.closest(".ant-popover")) return;
            onClose();
        };
        window.addEventListener("pointerdown", close);
        return () => window.removeEventListener("pointerdown", close);
    }, [onClose]);

    return (
        <div
            className="fixed z-[80] min-w-[180px] overflow-hidden rounded-xl border py-2 shadow-2xl backdrop-blur-md"
            style={{ left: menu.x, top: menu.y, background: menu.type === "canvas" ? "rgba(25,25,25,.96)" : theme.toolbar.panel, borderColor: menu.type === "canvas" ? "rgba(255,255,255,.1)" : theme.toolbar.border, color: menu.type === "canvas" ? "#f8fafc" : theme.node.text }}
            onPointerDown={(event) => event.stopPropagation()}
        >
            {menu.type === "canvas" ? (
                <>
                    <CanvasMenuButton icon={<Upload className="size-4" />} label="上传" onClick={onUpload} />
                    <CanvasMenuButton icon={<Plus className="size-4" />} label="添加节点" onClick={onAddNode} />
                    <MenuDivider />
                    <CanvasMenuButton icon={<Undo2 className="size-4" />} label="撤销" shortcut="Ctrl+Z" disabled={!canUndo} onClick={onUndo} />
                    <CanvasMenuButton icon={<Redo2 className="size-4" />} label="重做" shortcut="Shift+Ctrl+Z" disabled={!canRedo} onClick={onRedo} />
                    <MenuDivider />
                    <CanvasMenuButton icon={<Copy className="size-4" />} label="复制所有节点" onClick={onCopyAll} />
                    <CanvasMenuButton icon={<Clipboard className="size-4" />} label="粘贴" shortcut="Ctrl+V" disabled={!canPaste} onClick={onPaste} />
                </>
            ) : (
                <>
                    <MenuButton icon={<Plus className="size-4" />} label="Duplicate" onClick={onDuplicate} />
                    <MenuButton icon={<Trash2 className="size-4" />} label="Delete" onClick={onDelete} danger />
                </>
            )}
        </div>
    );
}

function MenuDivider() {
    return <div className="mx-5 my-2 h-px bg-white/10" />;
}

function CanvasMenuButton({ icon, label, shortcut, disabled = false, onClick }: { icon: ReactNode; label: string; shortcut?: string; disabled?: boolean; onClick?: () => void }) {
    return (
        <button type="button" className="flex h-11 w-full items-center gap-3 px-5 text-left text-sm font-semibold transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-25" style={{ color: "#f8fafc" }} disabled={disabled} onClick={disabled ? undefined : onClick}>
            <span className="grid size-4 shrink-0 place-items-center text-white/70">{icon}</span>
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {shortcut ? <span className="text-[11px] font-normal text-white/35">{shortcut}</span> : null}
        </button>
    );
}

function MenuButton({ icon, label, onClick, danger = false }: { icon: ReactNode; label: string; onClick?: () => void; danger?: boolean }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    return (
        <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:opacity-80" style={{ color: danger ? "#f87171" : theme.node.text }} onClick={onClick}>
            {icon}
            <span>{label}</span>
        </button>
    );
}
