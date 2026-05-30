"use client";

import { useState } from "react";
import { Settings2 } from "lucide-react";
import { Button } from "antd";

import SizePickerModal from "../../../../../components/SizePickerModal";
import { calculateImageSize, normalizeImageSize } from "../../../../../lib/size";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { AiConfig } from "@/stores/use-config-store";

type CanvasImageSettingsPopoverProps = {
    config: AiConfig;
    onConfigChange: (key: keyof AiConfig, value: string) => void;
    onMissingConfig?: () => void;
    onOpenChange?: (open: boolean) => void;
    buttonClassName?: string;
    getPopupContainer?: (triggerNode: HTMLElement) => HTMLElement;
    placement?: "topLeft" | "top" | "topRight" | "bottomLeft" | "bottom" | "bottomRight";
    autoAdjustOverflow?: boolean;
};

export function CanvasImageSettingsPopover({ config, onConfigChange, onOpenChange, buttonClassName }: CanvasImageSettingsPopoverProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [open, setOpen] = useState(false);
    const currentSize = canvasSizeToWenyunSize(config.size);
    const count = Math.max(1, Math.min(15, Math.floor(Math.abs(Number(config.count)) || 1)));
    const updateOpen = (nextOpen: boolean) => {
        setOpen(nextOpen);
        onOpenChange?.(nextOpen);
    };

    return (
        <>
            <Button
                size="small"
                type="text"
                className={buttonClassName || "!h-8 !max-w-[180px] !justify-start !rounded-full !px-2.5"}
                style={{ background: theme.node.fill, color: theme.node.text }}
                icon={<Settings2 className="size-3.5" />}
                onClick={() => updateOpen(true)}
            >
                <span className="truncate">{currentSize} · {count} 张</span>
            </Button>
            {open ? (
                <SizePickerModal
                    currentSize={currentSize}
                    onSelect={(size) => onConfigChange("size", size)}
                    onClose={() => updateOpen(false)}
                />
            ) : null}
        </>
    );
}

function canvasSizeToWenyunSize(size: string) {
    const value = (size || "").trim();
    if (!value || value === "auto") return "1024x1024";
    if (/^\d+\s*[xX×]\s*\d+$/.test(value)) return normalizeImageSize(value);
    return calculateImageSize("1K", value) ?? value;
}
