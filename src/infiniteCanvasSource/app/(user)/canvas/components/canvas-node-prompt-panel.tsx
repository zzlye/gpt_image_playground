"use client";

import { Children, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, LoaderCircle, Plus, Search, Upload, X } from "lucide-react";
import { Button, Empty, Input, Modal, Tabs, Tag } from "antd";

import { ModelPicker } from "@/components/model-picker";
import { defaultConfig, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { CreditSymbol, requestCreditCost } from "@/constant/credits";
import { canvasThemes } from "@/lib/canvas-theme";
import { uploadImage } from "@/services/image-storage";
import { useAssetStore, type Asset } from "@/stores/use-asset-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { getActiveApiProfile, getImageModelSubmitCostText, normalizeImageModelForProfile, normalizeSettings } from "../../../../../lib/apiProfiles";
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

const MAX_REFERENCE_IMAGES = 16;

export function CanvasNodePromptPanel({ node, canvasNodes, isRunning, onPromptChange, onConfigChange, onGenerate, onImageSettingsOpenChange }: CanvasNodePromptPanelProps) {
    const referenceInputRef = useRef<HTMLInputElement>(null);
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
    const referenceImages = node.metadata?.referenceImages || [];
    const [referencePickerOpen, setReferencePickerOpen] = useState(false);
    const credits = requestCreditCost({ channelMode: config.channelMode, modelCosts, model: config.model, count: mode === "image" ? config.count : 1 });
    const imageCostText = mode === "image" ? getImageModelSubmitCostText(config.model) : null;
    const atReferenceLimit = referenceImages.length >= MAX_REFERENCE_IMAGES;

    useEffect(() => {
        setPrompt(isEditingExistingContent ? "" : node.metadata?.prompt || "");
    }, [isEditingExistingContent, node.id]);

    const updatePrompt = (value: string) => {
        setPrompt(value);
        if (!isEditingExistingContent) onPromptChange(node.id, value);
    };

    const submit = () => {
        const text = prompt.trim();
        if (!text || isRunning) return;
        onGenerate(node.id, mode, text);
        setPrompt("");
    };

    const addReferenceFiles = async (files?: FileList | null) => {
        const images = Array.from(files || []).filter((file) => file.type.startsWith("image/"));
        if (!images.length) return;
        const uploaded = await Promise.all(images.map((file) => uploadImage(file)));
        addReferenceImages(
            uploaded.map((image, index) => ({
                id: `${node.id}-ref-${Date.now()}-${index}`,
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
        setReferencePickerOpen(false);
    };

    const addReferenceImages = (images: CanvasReferenceImage[]) => {
        const seen = new Set(referenceImages.map(referenceIdentity));
        const merged = [...referenceImages];
        images.forEach((image) => {
            const key = referenceIdentity(image);
            if (seen.has(key)) return;
            seen.add(key);
            merged.push(image);
        });
        onConfigChange(node.id, { referenceImages: merged.slice(0, MAX_REFERENCE_IMAGES) });
    };

    const removeReference = (id: string) => {
        onConfigChange(node.id, { referenceImages: referenceImages.filter((image) => image.id !== id) });
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
                <div className="mb-2 flex max-h-[116px] flex-wrap items-start gap-2 overflow-y-auto pr-1">
                    {referenceImages.map((image, index) => (
                        <div key={image.id} className="group/ref relative h-[52px] w-[52px] shrink-0 overflow-hidden rounded-xl border shadow-sm" style={{ borderColor: theme.node.stroke }}>
                            <img src={image.dataUrl || image.url} alt={image.name} className="h-full w-full object-cover" />
                            <span className="absolute bottom-1 left-1 rounded-full bg-black/70 px-1.5 py-0.5 text-[9px] leading-none text-white">{index + 1}</span>
                            <button
                                type="button"
                                className="absolute right-0 top-0 grid size-5 translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-red-500 text-white opacity-0 shadow-md transition hover:bg-red-600 group-hover/ref:opacity-100"
                                onClick={() => removeReference(image.id)}
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

                <textarea
                    value={prompt}
                    onChange={(event) => updatePrompt(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key !== "Enter" || event.ctrlKey || event.metaKey || event.shiftKey) return;
                        event.preventDefault();
                        submit();
                    }}
                    className="thin-scrollbar h-24 w-full resize-none rounded-lg border-0 bg-transparent px-2 py-1.5 text-sm leading-5 outline-none"
                    style={{ color: theme.node.text }}
                    placeholder={mode === "video" ? "描述要生成的视频内容" : mode === "image" ? (hasImageContent ? "请输入你想要把这张图修改成什么" : "描述要生成的图片内容") : hasTextContent ? "请输入你想要将本段文本修改成什么" : "请输入你想要生成的文本内容"}
                />
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
                <Button
                    type="primary"
                    className="!h-10 !min-w-16 shrink-0 !rounded-full !px-3"
                    disabled={isRunning || !prompt.trim()}
                    onClick={submit}
                    aria-label="生成"
                >
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
                onUpload={() => referenceInputRef.current?.click()}
                onSelect={addReferenceImages}
                onClose={() => setReferencePickerOpen(false)}
            />
            <input
                ref={referenceInputRef}
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
    const assets = useAssetStore((state) => state.assets);
    const selectedKeys = useMemo(() => new Set(selectedReferences.map(referenceIdentity)), [selectedReferences]);

    useEffect(() => {
        if (!open) return;
        setActiveTab("canvas");
        setKeyword("");
    }, [open]);

    const canvasImages = useMemo(() => {
        const query = keyword.trim().toLowerCase();
        return canvasNodes
            .filter((item) => item.id !== nodeId && item.type === CanvasNodeType.Image && item.metadata?.content)
            .filter((item) => !query || [item.title, item.metadata?.prompt].filter(Boolean).join(" ").toLowerCase().includes(query));
    }, [canvasNodes, keyword, nodeId]);

    const imageAssets = useMemo(() => {
        const query = keyword.trim().toLowerCase();
        return assets.filter((asset) => asset.kind === "image").filter((asset) => !query || [asset.title, asset.source, asset.note, ...(asset.tags || [])].filter(Boolean).join(" ").toLowerCase().includes(query));
    }, [assets, keyword]);

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

    const canvasItems = (
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
                return <ReferenceImageCard key={item.id} title={item.title} imageUrl={item.metadata?.content || ""} source="画布" selected={selectedKeys.has(referenceIdentity(reference))} onClick={() => selectCanvasNode(item)} />;
            })}
        </ReferenceGrid>
    );

    const assetItems = (
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
                return <ReferenceImageCard key={asset.id} title={asset.title} imageUrl={asset.coverUrl || asset.data.dataUrl} source="图片" selected={selectedKeys.has(referenceIdentity(reference))} onClick={() => selectAsset(asset)} />;
            })}
        </ReferenceGrid>
    );

    return (
        <Modal title={null} open={open} footer={null} width={1080} centered destroyOnHidden onCancel={onClose} className="canvas-reference-picker-modal" styles={{ body: { padding: 0 } }}>
            <div className="min-h-[560px] rounded-2xl border border-stone-200 bg-white p-4 text-stone-900 shadow-2xl dark:border-white/[0.08] dark:bg-[#181818] dark:text-stone-100">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <Tabs
                        activeKey={activeTab}
                        onChange={(key) => setActiveTab(key as "canvas" | "assets")}
                        items={[
                            { key: "canvas", label: "画布" },
                            { key: "assets", label: "我的素材" },
                        ]}
                    />
                    <Input
                        className="max-w-64 rounded-full"
                        prefix={<Search className="size-4 text-stone-400" />}
                        placeholder="搜索节点名称"
                        value={keyword}
                        allowClear
                        onChange={(event) => setKeyword(event.target.value)}
                    />
                </div>
                {activeTab === "canvas" ? canvasItems : assetItems}
            </div>
        </Modal>
    );
}

function ReferenceGrid({ empty, children }: { empty: string; children: React.ReactNode }) {
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
