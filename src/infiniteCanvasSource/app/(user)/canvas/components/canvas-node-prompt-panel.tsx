"use client";

import { Children, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { ArrowUp, LoaderCircle, Plus, Search, Upload, X } from "lucide-react";
import { Button, Empty, Input, Modal, Tabs, Tag } from "antd";

import { ModelPicker } from "@/components/model-picker";
import { defaultConfig, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { CreditSymbol, requestCreditCost } from "@/constant/credits";
import { canvasThemes } from "@/lib/canvas-theme";
import { uploadImage } from "@/services/image-storage";
import { useAssetStore, type Asset } from "@/stores/use-asset-store";
import { useThemeStore } from "@/stores/use-theme-store";
import type { InputImage } from "../../../../../types";
import { getActiveApiProfile, getImageModelSubmitCostText, normalizeImageModelForProfile, normalizeSettings } from "../../../../../lib/apiProfiles";
import { getAtImageQuery, getImageMentionLabel, getPromptIndexFromVisibleIndex, getPromptMentionParts, getSelectedImageMentionLabel, getSelectedTextMentionLabel, imageMentionMatches, insertImageMentionAtVisibleRange, isCursorInSelectedImageMention, remapImageMentionsForOrder, stripImageMentionMarkers } from "../../../../../lib/promptImageMentions";
import { useCanvasModelOptions } from "./canvas-model-options";
import { CanvasImageSettingsPopover } from "./canvas-image-settings-popover";
import { CanvasPromptLibrary } from "./canvas-prompt-library";
import { CanvasVideoSettingsPopover } from "./canvas-video-settings-popover";
import { CanvasNodeType, type CanvasGenerationMode, type CanvasNodeData, type CanvasReferenceImage } from "../types";
import { useStore } from "../../../../../store";

export type CanvasNodeGenerationMode = CanvasGenerationMode;

type CanvasNodePromptPanelProps = {
    node: CanvasNodeData;
    canvasNodes: CanvasNodeData[];
    isRunning: boolean;
    onPromptChange: (nodeId: string, prompt: string) => void;
    onConfigChange: (nodeId: string, patch: Partial<CanvasNodeData["metadata"]>) => void;
    onGenerate: (nodeId: string, mode: CanvasNodeGenerationMode, prompt: string) => void;
    onImageSettingsOpenChange?: (open: boolean) => void;
};

type ReferencePickerCategory = "人物" | "场景" | "物品" | "风格" | "其他";

const MAX_REFERENCE_IMAGES = 16;
const referenceCategoryOptions: Array<{ label: "全部" | ReferencePickerCategory; value: "all" | ReferencePickerCategory }> = [
    { label: "全部", value: "all" },
    { label: "人物", value: "人物" },
    { label: "场景", value: "场景" },
    { label: "物品", value: "物品" },
    { label: "风格", value: "风格" },
    { label: "其他", value: "其他" },
];
const referenceCategoryValues = referenceCategoryOptions.filter((item) => item.value !== "all").map((item) => item.value);

export function CanvasNodePromptPanel({ node, canvasNodes, isRunning, onPromptChange, onConfigChange, onGenerate, onImageSettingsOpenChange }: CanvasNodePromptPanelProps) {
    const inputRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const isUserInputRef = useRef(false);
    const globalConfig = useEffectiveConfig();
    const modelCosts = useConfigStore((state) => state.publicSettings?.modelChannel.modelCosts);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const settings = useStore((state) => state.settings);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const activeProfile = useMemo(() => getActiveApiProfile(normalizeSettings(settings)), [settings]);
    const mode = defaultMode(node.type);
    const config = buildNodeConfig(globalConfig, node, mode, activeProfile.id);
    const modelOptions = useCanvasModelOptions(config, mode, activeProfile.id);
    const hasTextContent = node.type === CanvasNodeType.Text && Boolean(node.metadata?.content?.trim());
    const hasImageContent = node.type === CanvasNodeType.Image && Boolean(node.metadata?.content);
    const isEditingExistingContent = hasTextContent || hasImageContent;
    const [prompt, setPrompt] = useState(isEditingExistingContent ? "" : node.metadata?.prompt || "");
    const [cursorPos, setCursorPos] = useState(0);
    const [menuLeft, setMenuLeft] = useState(0);
    const [atImageMenuIndex, setAtImageMenuIndex] = useState(0);
    const [atImageMenuDismissed, setAtImageMenuDismissed] = useState(false);
    const [referencePickerOpen, setReferencePickerOpen] = useState(false);
    const referenceImages = node.metadata?.referenceImages || [];
    const referenceInputImages = useMemo<InputImage[]>(() => referenceImages.map((image) => ({ id: image.id, dataUrl: image.dataUrl || image.url || "" })), [referenceImages]);
    const credits = requestCreditCost({ channelMode: config.channelMode, modelCosts, model: config.model, count: mode === "image" ? config.count : 1 });
    const imageCostText = mode === "image" ? getImageModelSubmitCostText(config.model) : null;
    const atReferenceLimit = referenceImages.length >= MAX_REFERENCE_IMAGES;
    const visiblePrompt = stripImageMentionMarkers(prompt);
    const atImageQuery = isCursorInSelectedImageMention(prompt, cursorPos) ? null : getAtImageQuery(visiblePrompt, cursorPos, { length: referenceInputImages.length });
    const atImageOptions = atImageQuery
        ? referenceInputImages
              .map((image, index) => ({ key: image.id, label: getImageMentionLabel(index), image, imageIndex: index }))
              .filter((option) => imageMentionMatches(atImageQuery.query, option.imageIndex))
        : [];
    const showAtImageMenu = !atImageMenuDismissed && atImageOptions.length > 0;

    useEffect(() => {
        setPrompt(isEditingExistingContent ? "" : node.metadata?.prompt || "");
        isUserInputRef.current = false;
    }, [isEditingExistingContent, node.id]);

    const updatePrompt = useCallback(
        (value: string) => {
            setPrompt(value);
            if (!isEditingExistingContent) onPromptChange(node.id, value);
        },
        [isEditingExistingContent, node.id, onPromptChange],
    );

    const syncPromptFromInput = useCallback(() => {
        const el = inputRef.current;
        if (!el) return;
        isUserInputRef.current = true;
        const range = getContentEditableSelection(el);
        setCursorPos(range.start);
        syncMentionTagSelection(el);
        updatePrompt(getContentEditablePlainText(el));
    }, [updatePrompt]);

    useEffect(() => {
        const el = inputRef.current;
        if (!el) return;
        if (isUserInputRef.current) {
            isUserInputRef.current = false;
            return;
        }
        const parts = getPromptMentionParts(prompt, referenceInputImages);
        const html = prompt
            ? parts
                  .map((part) =>
                      part.type === "mention"
                          ? `<span contenteditable="false" class="mention-tag" data-mention-text="${escapeHtml(part.mentionText ?? getSelectedImageMentionLabel(part.imageIndex ?? 0))}">${escapeHtml(part.text)}</span>`
                          : escapeHtml(part.text),
                  )
                  .join("")
            : "";
        if (el.innerHTML !== html) el.innerHTML = html;
    }, [prompt, referenceInputImages]);

    useEffect(() => {
        const handleSelectionChange = () => {
            const el = inputRef.current;
            if (!el) return;
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) return;
            const domRange = sel.getRangeAt(0);
            try {
                if (!domRange.intersectsNode(el)) {
                    syncMentionTagSelection(el);
                    return;
                }
            } catch {
                return;
            }
            const range = getContentEditableSelection(el);
            setCursorPos(range.start);
            syncMentionTagSelection(el);
            const rangeRect = domRange.getBoundingClientRect();
            const elRect = el.getBoundingClientRect();
            if (rangeRect.width === 0 && rangeRect.height === 0) return;
            setMenuLeft(rangeRect.left - elRect.left);
        };
        document.addEventListener("selectionchange", handleSelectionChange);
        return () => document.removeEventListener("selectionchange", handleSelectionChange);
    }, []);

    const commitReferenceImages = useCallback(
        (nextReferences: CanvasReferenceImage[], nextPrompt = prompt) => {
            onConfigChange(node.id, { referenceImages: nextReferences.slice(0, MAX_REFERENCE_IMAGES) });
            updatePrompt(nextPrompt);
        },
        [node.id, onConfigChange, prompt, updatePrompt],
    );

    const addReferenceImages = useCallback(
        (images: CanvasReferenceImage[]) => {
            const seen = new Set(referenceImages.map(referenceIdentity));
            const merged = [...referenceImages];
            for (const image of images) {
                const key = referenceIdentity(image);
                if (seen.has(key)) continue;
                seen.add(key);
                merged.push(image);
            }
            commitReferenceImages(merged);
        },
        [commitReferenceImages, referenceImages],
    );

    const removeReference = useCallback(
        (index: number) => {
            const nextReferences = referenceImages.filter((_, itemIndex) => itemIndex !== index);
            const nextPrompt = remapImageMentionsForOrder(prompt, referenceInputImages, nextReferences.map((image) => ({ id: image.id, dataUrl: image.dataUrl || image.url || "" })));
            commitReferenceImages(nextReferences, nextPrompt);
        },
        [commitReferenceImages, prompt, referenceImages, referenceInputImages],
    );

    const addReferenceFiles = useCallback(
        async (files?: FileList | null) => {
            const images = Array.from(files || []).filter((file) => file.type.startsWith("image/"));
            if (!images.length) return;
            const slots = Math.max(0, MAX_REFERENCE_IMAGES - referenceImages.length);
            const uploaded = await Promise.all(images.slice(0, slots).map((file) => uploadImage(file)));
            addReferenceImages(
                uploaded.map((image, index) => ({
                    id: `upload-ref-${node.id}-${Date.now()}-${index}`,
                    name: images[index]?.name || `reference-${index + 1}.png`,
                    type: image.mimeType,
                    dataUrl: image.url,
                    storageKey: image.storageKey,
                    width: image.width,
                    height: image.height,
                    bytes: image.bytes,
                    mimeType: image.mimeType,
                })),
            );
        },
        [addReferenceImages, node.id, referenceImages.length],
    );

    const selectAtImageOption = useCallback(
        (imageIndex: number) => {
            const el = inputRef.current;
            const cursor = el ? getContentEditableCursor(el) : prompt.length;
            const query = getAtImageQuery(stripImageMentionMarkers(prompt), cursor, { length: referenceInputImages.length });
            setAtImageMenuDismissed(true);
            setAtImageMenuIndex(0);
            if (!query) return;

            const nextCursor = query.start + getImageMentionLabel(imageIndex).length;
            if (el) {
                el.focus();
                setContentEditableSelection(el, query.start, cursor);
                if (document.execCommand("insertHTML", false, getMentionTagHtml(getImageMentionLabel(imageIndex)))) {
                    setContentEditableCursor(el, nextCursor);
                    syncPromptFromInput();
                    return;
                }
            }

            const next = insertImageMentionAtVisibleRange(prompt, query.start, cursor, imageIndex);
            isUserInputRef.current = false;
            updatePrompt(next.prompt);
            window.setTimeout(() => {
                if (!inputRef.current) return;
                inputRef.current.focus();
                setContentEditableCursor(inputRef.current, next.cursor);
            }, 0);
        },
        [prompt, referenceInputImages.length, syncPromptFromInput, updatePrompt],
    );

    const submit = useCallback(() => {
        const text = prompt.trim();
        if (!text || isRunning) return;
        onGenerate(node.id, mode, text);
        updatePrompt("");
        if (inputRef.current) inputRef.current.innerHTML = "";
    }, [isRunning, mode, node.id, onGenerate, prompt, updatePrompt]);

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (showAtImageMenu) {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                setAtImageMenuIndex((index) => (event.key === "ArrowDown" ? (index + 1) % atImageOptions.length : (index - 1 + atImageOptions.length) % atImageOptions.length));
                return;
            }
            if (event.key === "Enter" || event.key === "Tab") {
                event.preventDefault();
                selectAtImageOption(atImageOptions[Math.max(0, Math.min(atImageMenuIndex, atImageOptions.length - 1))].imageIndex);
                return;
            }
            if (event.key === "Escape") {
                event.preventDefault();
                setAtImageMenuDismissed(true);
                return;
            }
        }

        if (event.key !== "Enter" || event.ctrlKey || event.metaKey || event.shiftKey) return;
        event.preventDefault();
        submit();
    };

    return (
        <div
            className="rounded-2xl border p-3 shadow-2xl backdrop-blur"
            style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
        >
            <div className="rounded-xl border p-2 shadow-sm" style={{ background: theme.node.fill, borderColor: theme.node.stroke }}>
                <div className="mb-2 grid grid-cols-[repeat(auto-fill,52px)] gap-2">
                    {referenceImages.map((image, index) => (
                        <div key={image.id} className="group/ref relative h-[52px] w-[52px] shrink-0 overflow-hidden rounded-xl border shadow-sm" style={{ borderColor: theme.node.stroke }}>
                            <img src={image.dataUrl || image.url} alt={image.name} className="h-full w-full object-cover" />
                            <span className="absolute bottom-1 left-1 rounded-full bg-black/70 px-1.5 py-0.5 text-[9px] leading-none text-white">{index + 1}</span>
                            <button
                                type="button"
                                className="absolute right-0 top-0 grid size-5 translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-red-500 text-white opacity-0 shadow-md transition hover:bg-red-600 group-hover/ref:opacity-100"
                                onClick={() => removeReference(index)}
                                aria-label="移除参考图"
                                title="移除参考图"
                            >
                                <X className="size-3" />
                            </button>
                        </div>
                    ))}
                    <button
                        type="button"
                        className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-xl border border-dashed text-[10px] transition hover:border-blue-300 hover:bg-blue-50/60 disabled:cursor-not-allowed disabled:opacity-45 dark:hover:border-blue-400/40 dark:hover:bg-blue-500/10"
                        style={{ background: theme.toolbar.panel, borderColor: theme.node.stroke, color: theme.node.text }}
                        onClick={() => !atReferenceLimit && setReferencePickerOpen(true)}
                        disabled={atReferenceLimit}
                        title={atReferenceLimit ? `最多添加 ${MAX_REFERENCE_IMAGES} 张参考图` : "添加参考图"}
                    >
                        <span className="flex flex-col items-center gap-1 opacity-70">
                            <Plus className="size-4" />
                            添加
                        </span>
                    </button>
                </div>

                <div className="relative grid">
                    {showAtImageMenu ? (
                        <div style={{ left: `${menuLeft}px` }} className="absolute bottom-full z-50 mb-2 w-64 overflow-hidden rounded-2xl border border-gray-200/70 bg-white/95 p-1.5 shadow-xl ring-1 ring-black/5 backdrop-blur-xl dark:border-white/[0.08] dark:bg-gray-900/95 dark:ring-white/10">
                            <div className="px-2 pb-1 pt-0.5 text-[11px] text-gray-400 dark:text-gray-500">选择图片引用</div>
                            <div className="max-h-56 overflow-y-auto">
                                {atImageOptions.map((option, optionIndex) => (
                                    <button
                                        key={option.key}
                                        type="button"
                                        onMouseDown={(event) => {
                                            event.preventDefault();
                                            selectAtImageOption(option.imageIndex);
                                        }}
                                        onMouseEnter={() => setAtImageMenuIndex(optionIndex)}
                                        className={`flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-xs transition-colors ${
                                            optionIndex === atImageMenuIndex ? "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300" : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.06]"
                                        }`}
                                    >
                                        <img src={option.image.dataUrl} alt={option.label} className="size-8 shrink-0 rounded-lg object-cover" />
                                        <span className="min-w-0 flex-1 truncate font-medium">{option.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : null}
                    <div
                        ref={inputRef}
                        contentEditable
                        suppressContentEditableWarning
                        className="thin-scrollbar col-start-1 row-start-1 min-h-24 max-h-44 w-full overflow-y-auto whitespace-pre-wrap break-words rounded-lg border-0 bg-transparent px-2 py-1.5 text-sm leading-5 outline-none"
                        style={{ color: theme.node.text }}
                        onInput={(event) => {
                            isUserInputRef.current = true;
                            const range = getContentEditableSelection(event.currentTarget);
                            setCursorPos(range.start);
                            syncMentionTagSelection(event.currentTarget);
                            updatePrompt(getContentEditablePlainText(event.currentTarget));
                            setAtImageMenuIndex(0);
                            setAtImageMenuDismissed(false);
                        }}
                        onSelect={(event) => {
                            const range = getContentEditableSelection(event.currentTarget);
                            setCursorPos(range.start);
                            syncMentionTagSelection(event.currentTarget);
                            setAtImageMenuIndex(0);
                            setAtImageMenuDismissed(false);
                        }}
                        onKeyDown={handleKeyDown}
                        onPaste={(event) => {
                            event.preventDefault();
                            document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
                            syncPromptFromInput();
                        }}
                        onClick={(event) => {
                            const el = inputRef.current;
                            if (!el) return;
                            const target = event.target as HTMLElement;
                            if (target.classList.contains("mention-tag")) {
                                const sel = window.getSelection();
                                if (sel) {
                                    const range = document.createRange();
                                    range.selectNode(target);
                                    sel.removeAllRanges();
                                    sel.addRange(range);
                                    syncMentionTagSelection(el);
                                }
                                return;
                            }
                            syncMentionTagSelection(el);
                        }}
                        aria-label={getPromptPlaceholder(mode, hasImageContent, hasTextContent)}
                    />
                    {!prompt ? <div className="pointer-events-none col-start-1 row-start-1 px-2 py-1.5 text-sm leading-5" style={{ color: theme.node.placeholder }}>{getPromptPlaceholder(mode, hasImageContent, hasTextContent)}</div> : null}
                </div>
            </div>

            <div className="mt-2 flex min-w-0 items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                    <CanvasPromptLibrary onSelect={updatePrompt} />
                    {mode === "image" ? (
                        <>
                            <ModelPicker config={config} value={config.model} options={modelOptions} onChange={(model) => onConfigChange(node.id, { model })} onMissingConfig={() => openConfigDialog(true)} />
                            <CanvasImageSettingsPopover
                                config={config}
                                placement="topLeft"
                                buttonClassName="!h-10 !max-w-[170px] !justify-start !rounded-full !px-3"
                                onConfigChange={(key, value) => onConfigChange(node.id, key === "count" ? { count: Number(value) || 1 } : { [key]: value })}
                                onMissingConfig={() => openConfigDialog(true)}
                                onOpenChange={onImageSettingsOpenChange}
                            />
                        </>
                    ) : mode === "video" ? (
                        <>
                            <ModelPicker config={config} value={config.model} options={modelOptions} onChange={(model) => onConfigChange(node.id, { model })} onMissingConfig={() => openConfigDialog(true)} />
                            <CanvasVideoSettingsPopover config={config} buttonClassName="!h-10 !max-w-[170px] !justify-start !rounded-full !px-3" onConfigChange={(key, value) => onConfigChange(node.id, key === "videoSeconds" ? { seconds: value } : { [key]: value })} />
                        </>
                    ) : (
                        <ModelPicker config={config} value={config.model} options={modelOptions} onChange={(model) => onConfigChange(node.id, { model })} onMissingConfig={() => openConfigDialog(true)} />
                    )}
                </div>
                <Button type="primary" className="!h-10 !min-w-16 shrink-0 !rounded-full !px-3" disabled={isRunning || !prompt.trim()} onClick={submit} aria-label="生成">
                    <span className="flex items-center gap-1.5">
                        {mode === "image" && (
                            imageCostText ? (
                                <span className="inline-flex items-center gap-1 text-xs font-medium tabular-nums">{imageCostText}</span>
                            ) : (
                                <span className="inline-flex items-center gap-1 text-xs font-medium tabular-nums">
                                    <CreditSymbol />
                                    {credits.toLocaleString()}
                                </span>
                            )
                        )}
                        {isRunning ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
                    </span>
                </Button>
            </div>

            <CanvasReferencePickerModal
                open={referencePickerOpen}
                nodeId={node.id}
                canvasNodes={canvasNodes}
                selectedReferences={referenceImages}
                onUpload={() => fileInputRef.current?.click()}
                onSelect={addReferenceImages}
                onClose={() => setReferencePickerOpen(false)}
            />
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => {
                    void addReferenceFiles(event.target.files);
                    event.target.value = "";
                }}
            />
        </div>
    );
}

function CanvasReferencePickerModal({ open, nodeId, canvasNodes, selectedReferences, onUpload, onSelect, onClose }: { open: boolean; nodeId: string; canvasNodes: CanvasNodeData[]; selectedReferences: CanvasReferenceImage[]; onUpload: () => void; onSelect: (images: CanvasReferenceImage[]) => void; onClose: () => void }) {
    const [activeTab, setActiveTab] = useState<"canvas" | "assets">("canvas");
    const [keyword, setKeyword] = useState("");
    const [categoryFilter, setCategoryFilter] = useState<"all" | ReferencePickerCategory>("all");
    const assets = useAssetStore((state) => state.assets);
    const selectedKeys = useMemo(() => new Set(selectedReferences.map(referenceIdentity)), [selectedReferences]);

    useEffect(() => {
        if (!open) return;
        setActiveTab("canvas");
        setKeyword("");
        setCategoryFilter("all");
    }, [open]);

    const canvasImages = useMemo(() => {
        const query = keyword.trim().toLowerCase();
        return canvasNodes
            .filter((item) => item.id !== nodeId && item.type === CanvasNodeType.Image && item.metadata?.content)
            .filter((item) => categoryFilter === "all" || getCanvasImageCategory(item) === categoryFilter)
            .filter((item) => !query || [item.title, item.metadata?.prompt].filter(Boolean).join(" ").toLowerCase().includes(query));
    }, [canvasNodes, categoryFilter, keyword, nodeId]);

    const imageAssets = useMemo(() => {
        const query = keyword.trim().toLowerCase();
        return assets
            .filter((asset) => asset.kind === "image")
            .filter((asset) => categoryFilter === "all" || getAssetCategory(asset) === categoryFilter)
            .filter((asset) => !query || [asset.title, asset.source, asset.note, ...(asset.tags || [])].filter(Boolean).join(" ").toLowerCase().includes(query));
    }, [assets, categoryFilter, keyword]);

    const selectCanvasNode = (canvasNode: CanvasNodeData) => {
        if (!canvasNode.metadata?.content) return;
        onSelect([
            {
                id: `canvas-ref-${canvasNode.id}`,
                name: `${canvasNode.title || canvasNode.id}.png`,
                type: canvasNode.metadata.mimeType || "image/png",
                dataUrl: canvasNode.metadata.content,
                storageKey: canvasNode.metadata.storageKey,
                width: canvasNode.metadata.naturalWidth,
                height: canvasNode.metadata.naturalHeight,
                bytes: canvasNode.metadata.bytes,
                mimeType: canvasNode.metadata.mimeType,
            },
        ]);
    };

    const selectAsset = (asset: Asset) => {
        if (asset.kind !== "image") return;
        onSelect([
            {
                id: `asset-ref-${asset.id}`,
                name: `${asset.title || asset.id}.png`,
                type: asset.data.mimeType || "image/png",
                dataUrl: asset.data.dataUrl,
                storageKey: asset.data.storageKey,
                width: asset.data.width,
                height: asset.data.height,
                bytes: asset.data.bytes,
                mimeType: asset.data.mimeType,
            },
        ]);
    };

    return (
        <Modal title={null} open={open} footer={null} width={1080} centered destroyOnHidden onCancel={onClose} className="canvas-reference-picker-modal" styles={{ body: { padding: 0 } }}>
            <div className="min-h-[560px] rounded-2xl border border-stone-200 bg-white p-4 text-stone-900 shadow-2xl dark:border-white/[0.08] dark:bg-[#181818] dark:text-stone-100">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <Tabs
                        activeKey={activeTab}
                        onChange={(key) => setActiveTab(key as "canvas" | "assets")}
                        items={[
                            { key: "canvas", label: "画布" },
                            { key: "assets", label: "我的素材" },
                        ]}
                    />
                    <Input className="max-w-64 rounded-full" prefix={<Search className="size-4 text-stone-400" />} placeholder="搜索图片" value={keyword} allowClear onChange={(event) => setKeyword(event.target.value)} />
                </div>
                <div className="mb-4 flex flex-wrap items-center gap-2">
                    {referenceCategoryOptions.map((option) => (
                        <Tag.CheckableTag key={option.value} checked={categoryFilter === option.value} className={`prompt-filter-tag ${categoryFilter === option.value ? "is-active" : ""}`} onChange={() => setCategoryFilter(option.value)}>
                            {option.label}
                        </Tag.CheckableTag>
                    ))}
                </div>
                {activeTab === "canvas" ? (
                    <ReferenceGrid empty="当前画布没有可用图片">
                        <ReferenceUploadCard onUpload={onUpload} />
                        {canvasImages.map((item) => {
                            const reference = {
                                id: `canvas-ref-${item.id}`,
                                name: item.title,
                                type: item.metadata?.mimeType || "image/png",
                                dataUrl: item.metadata?.content || "",
                                storageKey: item.metadata?.storageKey,
                            };
                            return <ReferenceImageCard key={item.id} title={item.title} imageUrl={item.metadata?.content || ""} source={getCanvasImageCategory(item)} selected={selectedKeys.has(referenceIdentity(reference))} onClick={() => selectCanvasNode(item)} />;
                        })}
                    </ReferenceGrid>
                ) : (
                    <ReferenceGrid empty="我的素材里没有可用图片">
                        <ReferenceUploadCard onUpload={onUpload} />
                        {imageAssets.map((asset) => {
                            const reference = {
                                id: `asset-ref-${asset.id}`,
                                name: asset.title,
                                type: asset.data.mimeType || "image/png",
                                dataUrl: asset.data.dataUrl,
                                storageKey: asset.data.storageKey,
                            };
                            return <ReferenceImageCard key={asset.id} title={asset.title} imageUrl={asset.coverUrl || asset.data.dataUrl} source={getAssetCategory(asset)} selected={selectedKeys.has(referenceIdentity(reference))} onClick={() => selectAsset(asset)} />;
                        })}
                    </ReferenceGrid>
                )}
            </div>
        </Modal>
    );
}

function ReferenceGrid({ empty, children }: { empty: string; children: ReactNode }) {
    const items = Children.toArray(children).filter(Boolean);
    return (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {items}
            {items.length <= 1 ? (
                <div className="col-span-full">
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={empty} className="py-12" />
                </div>
            ) : null}
        </div>
    );
}

function ReferenceUploadCard({ onUpload }: { onUpload: () => void }) {
    return (
        <button type="button" className="group min-h-44 overflow-hidden rounded-xl border border-dashed border-stone-300 bg-stone-100/70 text-stone-500 transition hover:border-blue-300 hover:bg-blue-50 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-stone-400 dark:hover:border-blue-400/40 dark:hover:bg-blue-500/10" onClick={onUpload}>
            <span className="flex h-full min-h-44 flex-col items-center justify-center gap-2">
                <Upload className="size-7 opacity-70 transition group-hover:opacity-100" />
                <span className="text-sm font-medium">本地上传</span>
            </span>
        </button>
    );
}

function ReferenceImageCard({ title, imageUrl, source, selected, onClick }: { title: string; imageUrl: string; source: string; selected: boolean; onClick: () => void }) {
    return (
        <button type="button" className="group relative overflow-hidden rounded-xl border border-stone-200 bg-white text-left transition hover:border-stone-400 hover:shadow-md dark:border-white/[0.08] dark:bg-white/[0.03] dark:hover:border-stone-500" onClick={onClick}>
            <div className="relative aspect-[4/3] bg-stone-100 dark:bg-stone-900">
                <img src={imageUrl} alt={title} className="h-full w-full object-cover" />
                {selected ? <span className="absolute right-2 top-2 rounded-full bg-emerald-500 px-2 py-0.5 text-xs font-medium text-white">已引用</span> : null}
                <div className="pointer-events-none absolute inset-0 bg-stone-950/0 transition group-hover:bg-stone-950/25" />
            </div>
            <div className="space-y-1 p-3">
                <Tag className="m-0 text-[10px]">{source}</Tag>
                <div className="truncate text-sm font-medium text-stone-800 dark:text-stone-100">{title || "未命名图片"}</div>
            </div>
        </button>
    );
}

function getPromptPlaceholder(mode: CanvasNodeGenerationMode, hasImageContent: boolean, hasTextContent: boolean) {
    return mode === "video" ? "描述要生成的视频内容" : mode === "image" ? (hasImageContent ? "请输入你想要把这张图修改成什么" : "描述要生成的图片内容") : hasTextContent ? "请输入你想要将本段文本修改成什么" : "请输入你想要生成的文本内容";
}

function getCanvasImageCategory(node: CanvasNodeData): ReferencePickerCategory {
    const value = node.metadata?.assetCategory;
    return referenceCategoryValues.includes(value as ReferencePickerCategory) ? (value as ReferencePickerCategory) : "其他";
}

function getAssetCategory(asset: Asset): ReferencePickerCategory {
    const value = asset.metadata?.category || asset.tags?.[0];
    return referenceCategoryValues.includes(value as ReferencePickerCategory) ? (value as ReferencePickerCategory) : "其他";
}

function referenceIdentity(image: Pick<CanvasReferenceImage, "id" | "dataUrl" | "storageKey" | "url">) {
    return image.storageKey || image.url || image.dataUrl || image.id;
}

function defaultMode(type: CanvasNodeData["type"]): CanvasNodeGenerationMode {
    return type === CanvasNodeType.Text ? "text" : type === CanvasNodeType.Video ? "video" : "image";
}

function buildNodeConfig(globalConfig: AiConfig, node: CanvasNodeData, mode: CanvasNodeGenerationMode, activeProfileId: string): AiConfig {
    const defaultModel = mode === "image" ? globalConfig.imageModel : mode === "video" ? globalConfig.videoModel : globalConfig.textModel;
    const model = node.metadata?.model || defaultModel || globalConfig.model || defaultConfig.model;
    const resolvedModel = mode === "image" ? normalizeImageModelForProfile(model, activeProfileId) : model;
    return {
        ...globalConfig,
        model: resolvedModel,
        imageModel: mode === "image" ? resolvedModel : globalConfig.imageModel,
        textModel: mode === "text" ? resolvedModel : globalConfig.textModel,
        videoModel: mode === "video" ? resolvedModel : globalConfig.videoModel,
        quality: node.metadata?.quality || globalConfig.quality || defaultConfig.quality,
        size: node.metadata?.size || globalConfig.size || defaultConfig.size,
        videoSeconds: node.metadata?.seconds || globalConfig.videoSeconds || defaultConfig.videoSeconds,
        vquality: node.metadata?.vquality || globalConfig.vquality || defaultConfig.vquality,
        count: String(node.metadata?.count || (mode === "image" ? 1 : globalConfig.count) || defaultConfig.count),
    };
}

function getMentionTagTextLength(el: Element) {
    return el.textContent?.length ?? 0;
}

function getNodeVisibleTextLength(node: Node): number {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent?.length ?? 0;
    if (node instanceof HTMLElement && node.classList.contains("mention-tag")) return getMentionTagTextLength(node);
    return Array.from(node.childNodes).reduce((sum, child) => sum + getNodeVisibleTextLength(child), 0);
}

function getVisibleOffsetBeforeNode(root: HTMLElement, target: Node): number {
    let offset = 0;
    let found = false;
    const walk = (node: Node) => {
        if (found) return;
        if (node === target) {
            found = true;
            return;
        }
        if (node.nodeType === Node.TEXT_NODE) {
            offset += node.textContent?.length ?? 0;
            return;
        }
        if (node instanceof HTMLElement && node.classList.contains("mention-tag")) {
            offset += getMentionTagTextLength(node);
            return;
        }
        node.childNodes.forEach(walk);
    };
    root.childNodes.forEach(walk);
    return offset;
}

function getMentionTagForBoundary(root: HTMLElement, container: Node) {
    const el = container.nodeType === Node.ELEMENT_NODE ? (container as Element) : container.parentElement;
    const tag = el?.closest(".mention-tag");
    return tag && root.contains(tag) ? tag : null;
}

function getBoundaryOffsetInMention(tag: Element, container: Node, offset: number) {
    try {
        const range = document.createRange();
        range.selectNodeContents(tag);
        range.setEnd(container, offset);
        return range.toString().length;
    } catch {
        return getMentionTagTextLength(tag);
    }
}

function getContentEditableBoundaryOffset(root: HTMLElement, container: Node, offset: number, edge: "start" | "end", collapsed: boolean) {
    if (container === root) {
        let visibleOffset = 0;
        for (const child of Array.from(root.childNodes).slice(0, offset)) visibleOffset += getNodeVisibleTextLength(child);
        return visibleOffset;
    }
    if (!root.contains(container)) {
        const position = root.compareDocumentPosition(container);
        if (position & Node.DOCUMENT_POSITION_PRECEDING) return 0;
        if (position & Node.DOCUMENT_POSITION_FOLLOWING) return root.textContent?.length ?? 0;
        if (container.contains(root)) {
            const children = Array.from(container.childNodes);
            const rootIndex = children.indexOf(root as unknown as ChildNode);
            return offset <= rootIndex ? 0 : root.textContent?.length ?? 0;
        }
        return edge === "start" ? 0 : root.textContent?.length ?? 0;
    }
    const mentionTag = getMentionTagForBoundary(root, container);
    if (mentionTag) {
        const mentionStart = getVisibleOffsetBeforeNode(root, mentionTag);
        const mentionLength = getMentionTagTextLength(mentionTag);
        if (!collapsed) return edge === "start" ? mentionStart : mentionStart + mentionLength;
        const mentionOffset = getBoundaryOffsetInMention(mentionTag, container, offset);
        return mentionStart + (mentionOffset < mentionLength / 2 ? 0 : mentionLength);
    }
    if (container.nodeType === Node.TEXT_NODE) return getVisibleOffsetBeforeNode(root, container) + offset;
    const element = container.nodeType === Node.ELEMENT_NODE ? (container as Element) : null;
    if (element) {
        let visibleOffset = element === root ? 0 : getVisibleOffsetBeforeNode(root, element);
        for (const child of Array.from(element.childNodes).slice(0, offset)) visibleOffset += getNodeVisibleTextLength(child);
        return visibleOffset;
    }
    return root.textContent?.length ?? 0;
}

function getContentEditableCursor(el: HTMLElement): number {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return el.textContent?.length ?? 0;
    try {
        const range = sel.getRangeAt(0);
        if (!el.contains(range.startContainer)) return el.textContent?.length ?? 0;
        return getContentEditableBoundaryOffset(el, range.startContainer, range.startOffset, "start", range.collapsed);
    } catch {
        return el.textContent?.length ?? 0;
    }
}

function getContentEditableSelection(el: HTMLElement): { start: number; end: number } {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
        const end = el.textContent?.length ?? 0;
        return { start: end, end };
    }
    try {
        const range = sel.getRangeAt(0);
        const start = getContentEditableBoundaryOffset(el, range.startContainer, range.startOffset, "start", range.collapsed);
        const end = range.collapsed ? start : getContentEditableBoundaryOffset(el, range.endContainer, range.endOffset, "end", false);
        return { start, end };
    } catch {
        const end = el.textContent?.length ?? 0;
        return { start: end, end };
    }
}

function getContentEditablePlainText(el: HTMLElement): string {
    let text = "";
    const appendNodeText = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            text += node.textContent ?? "";
            return;
        }
        if (node instanceof HTMLElement && node.classList.contains("mention-tag")) {
            text += node.dataset.mentionText ?? node.textContent ?? "";
            return;
        }
        node.childNodes.forEach(appendNodeText);
    };
    el.childNodes.forEach(appendNodeText);
    return text.replace(/\r\n?/g, "\n");
}

function escapeHtml(text: string) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function getMentionTagHtml(text: string) {
    return `<span contenteditable="false" class="mention-tag" data-mention-text="${escapeHtml(getSelectedTextMentionLabel(text))}">${escapeHtml(text)}</span>`;
}

function syncMentionTagSelection(el: HTMLElement) {
    const tags = el.querySelectorAll<HTMLElement>(".mention-tag");
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
        tags.forEach((tag) => tag.classList.remove("selected"));
        return;
    }
    const range = sel.getRangeAt(0);
    if (range.collapsed) {
        tags.forEach((tag) => tag.classList.remove("selected"));
        return;
    }
    tags.forEach((tag) => {
        let isSelected = false;
        try {
            isSelected = range.intersectsNode(tag);
        } catch {
            isSelected = false;
        }
        tag.classList.toggle("selected", isSelected);
    });
}

function setContentEditableCursor(el: HTMLElement, offset: number) {
    const sel = window.getSelection();
    if (!sel) return;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let remaining = offset;
    let node: Text | null = null;
    while (walker.nextNode()) {
        node = walker.currentNode as Text;
        const mentionTag = node.parentElement?.closest(".mention-tag");
        if (mentionTag) {
            if (remaining <= node.length) {
                const range = document.createRange();
                if (remaining < node.length / 2) range.setStartBefore(mentionTag);
                else range.setStartAfter(mentionTag);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
                return;
            }
            remaining -= node.length;
            continue;
        }
        if (remaining <= node.length) {
            const range = document.createRange();
            range.setStart(node, remaining);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
            return;
        }
        remaining -= node.length;
    }
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
}

function setContentEditableSelection(el: HTMLElement, start: number, end: number) {
    const sel = window.getSelection();
    if (!sel) return;
    const locate = (offset: number) => {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let remaining = offset;
        let lastText: Text | null = null;
        while (walker.nextNode()) {
            const text = walker.currentNode as Text;
            lastText = text;
            if (remaining <= text.length) return { node: text, offset: remaining };
            remaining -= text.length;
        }
        return lastText ? { node: lastText, offset: lastText.length } : { node: el, offset: el.childNodes.length };
    };
    const startPoint = locate(start);
    const endPoint = locate(end);
    const range = document.createRange();
    range.setStart(startPoint.node, startPoint.offset);
    range.setEnd(endPoint.node, endPoint.offset);
    sel.removeAllRanges();
    sel.addRange(range);
}
