"use client";

import { useEffect, useMemo, useState } from "react";
import { Empty, Input, Modal, Pagination, Tabs, Tag } from "antd";
import { Edit3, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { useAssetStore, type Asset } from "@/stores/use-asset-store";
import { CanvasNodeType, type CanvasNodeData } from "../types";

export type AssetPickerTab = "canvas" | "my-assets";

export type InsertAssetPayload = { kind: "text"; content: string; title: string } | { kind: "image"; dataUrl: string; title: string; storageKey?: string } | { kind: "video"; url: string; title: string; storageKey?: string; width?: number; height?: number };

type Props = {
    open: boolean;
    defaultTab?: AssetPickerTab;
    canvasNodes: CanvasNodeData[];
    onRenameCanvasNode: (nodeId: string, title: string) => void;
    onInsert: (payload: InsertAssetPayload) => void;
    onClose: () => void;
};

const PAGE_SIZE = 8;

const kindOptions = [
    { label: "全部", value: "all" },
    { label: "文本", value: "text" },
    { label: "图片", value: "image" },
    { label: "视频", value: "video" },
];

export function AssetPickerModal({ open, defaultTab = "my-assets", canvasNodes, onRenameCanvasNode, onInsert, onClose }: Props) {
    const [activeTab, setActiveTab] = useState<AssetPickerTab>(defaultTab);

    useEffect(() => {
        if (open) setActiveTab(defaultTab);
    }, [open, defaultTab]);

    return (
        <Modal title="选择素材" open={open} onCancel={onClose} footer={null} width={900} destroyOnHidden styles={{ body: { padding: "0 24px 24px", minHeight: 500 } }}>
            <Tabs
                activeKey={activeTab}
                onChange={(key) => setActiveTab(key as AssetPickerTab)}
                items={[
                    { key: "canvas", label: "画布", children: <CanvasAssetsTab nodes={canvasNodes} onRename={onRenameCanvasNode} onInsert={onInsert} /> },
                    { key: "my-assets", label: "我的素材", children: <MyAssetsTab onInsert={onInsert} /> },
                ]}
            />
        </Modal>
    );
}

function CanvasAssetsTab({ nodes, onRename, onInsert }: { nodes: CanvasNodeData[]; onRename: (nodeId: string, title: string) => void; onInsert: (payload: InsertAssetPayload) => void }) {
    const [keyword, setKeyword] = useState("");
    const [kindFilter, setKindFilter] = useState("all");
    const [page, setPage] = useState(1);

    const assets = useMemo(
        () =>
            nodes
                .filter((node) => node.type === CanvasNodeType.Text || node.type === CanvasNodeType.Image || node.type === CanvasNodeType.Video)
                .filter((node) => node.type === CanvasNodeType.Text || Boolean(node.metadata?.content)),
        [nodes],
    );

    const filtered = useMemo(() => {
        const query = keyword.trim().toLowerCase();
        return assets
            .filter((node) => kindFilter === "all" || node.type === kindFilter)
            .filter((node) => !query || [node.title, node.metadata?.content, node.metadata?.prompt].filter(Boolean).join(" ").toLowerCase().includes(query));
    }, [assets, keyword, kindFilter]);

    const visible = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);

    useEffect(() => {
        const maxPage = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
        setPage((value) => Math.min(value, maxPage));
    }, [filtered.length]);

    const handleInsert = (node: CanvasNodeData) => {
        if (node.type === CanvasNodeType.Text) {
            onInsert({ kind: "text", content: node.metadata?.content || "", title: node.title });
            return;
        }
        if (node.type === CanvasNodeType.Video) {
            onInsert({ kind: "video", url: node.metadata?.content || "", storageKey: node.metadata?.storageKey, title: node.title, width: node.metadata?.naturalWidth || node.width, height: node.metadata?.naturalHeight || node.height });
            return;
        }
        onInsert({ kind: "image", dataUrl: node.metadata?.content || "", storageKey: node.metadata?.storageKey, title: node.title });
    };

    return (
        <PickerList
            keyword={keyword}
            kindFilter={kindFilter}
            total={filtered.length}
            page={page}
            empty="当前画布没有可插入素材"
            onKeywordChange={(value) => {
                setPage(1);
                setKeyword(value);
            }}
            onKindChange={(value) => {
                setPage(1);
                setKindFilter(value);
            }}
            onPageChange={setPage}
        >
            {visible.map((node) => (
                <CanvasPickerCard key={node.id} node={node} onInsert={() => handleInsert(node)} onRename={(title) => onRename(node.id, title)} />
            ))}
        </PickerList>
    );
}

function MyAssetsTab({ onInsert }: { onInsert: (payload: InsertAssetPayload) => void }) {
    const assets = useAssetStore((state) => state.assets);
    const updateAsset = useAssetStore((state) => state.updateAsset);
    const [keyword, setKeyword] = useState("");
    const [kindFilter, setKindFilter] = useState("all");
    const [page, setPage] = useState(1);

    const filtered = useMemo(() => {
        const query = keyword.trim().toLowerCase();
        return assets
            .filter((asset) => asset.kind === "text" || asset.kind === "image" || asset.kind === "video")
            .filter((asset) => kindFilter === "all" || asset.kind === kindFilter)
            .filter((asset) => !query || [asset.title, ...(asset.tags || [])].join(" ").toLowerCase().includes(query));
    }, [assets, keyword, kindFilter]);

    const visible = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);

    useEffect(() => {
        const maxPage = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
        setPage((value) => Math.min(value, maxPage));
    }, [filtered.length]);

    const handleInsert = (asset: Asset) => {
        if (asset.kind === "text") {
            onInsert({ kind: "text", content: asset.data.content, title: asset.title });
            return;
        }
        onInsert(asset.kind === "video" ? { kind: "video", url: asset.data.url, storageKey: asset.data.storageKey, title: asset.title, width: asset.data.width, height: asset.data.height } : { kind: "image", dataUrl: asset.data.dataUrl, storageKey: asset.data.storageKey, title: asset.title });
    };

    return (
        <PickerList
            keyword={keyword}
            kindFilter={kindFilter}
            total={filtered.length}
            page={page}
            empty="没有素材"
            onKeywordChange={(value) => {
                setPage(1);
                setKeyword(value);
            }}
            onKindChange={(value) => {
                setPage(1);
                setKindFilter(value);
            }}
            onPageChange={setPage}
        >
            {visible.map((asset) => (
                <StoredPickerCard key={asset.id} asset={asset} onInsert={() => handleInsert(asset)} onRename={(title) => updateAsset(asset.id, { title })} />
            ))}
        </PickerList>
    );
}

function PickerList({ keyword, kindFilter, total, page, empty, onKeywordChange, onKindChange, onPageChange, children }: { keyword: string; kindFilter: string; total: number; page: number; empty: string; onKeywordChange: (value: string) => void; onKindChange: (value: string) => void; onPageChange: (page: number) => void; children: React.ReactNode }) {
    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
                <Input className="w-60" size="small" prefix={<Search className="size-3.5 text-stone-400" />} placeholder="搜索素材" value={keyword} allowClear onChange={(event) => onKeywordChange(event.target.value)} />
                <div className="flex gap-1.5">
                    {kindOptions.map((opt) => (
                        <Tag.CheckableTag key={opt.value} checked={kindFilter === opt.value} className={cn("prompt-filter-tag", kindFilter === opt.value && "is-active")} onChange={() => onKindChange(opt.value)}>
                            {opt.label}
                        </Tag.CheckableTag>
                    ))}
                </div>
            </div>

            {total ? <div className="grid grid-cols-4 gap-3">{children}</div> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={empty} className="py-12" />}

            {total > PAGE_SIZE ? (
                <div className="flex justify-center">
                    <Pagination size="small" current={page} pageSize={PAGE_SIZE} total={total} onChange={onPageChange} showSizeChanger={false} />
                </div>
            ) : null}
        </div>
    );
}

function CanvasPickerCard({ node, onInsert, onRename }: { node: CanvasNodeData; onInsert: () => void; onRename: (title: string) => void }) {
    return <PickerCard title={node.title} kind={node.type} cover={node.type === CanvasNodeType.Image ? node.metadata?.content || "" : node.type === CanvasNodeType.Video ? node.metadata?.content || "" : ""} text={node.type === CanvasNodeType.Text ? node.metadata?.content || node.title : ""} onInsert={onInsert} onRename={onRename} />;
}

function StoredPickerCard({ asset, onInsert, onRename }: { asset: Asset; onInsert: () => void; onRename: (title: string) => void }) {
    const cover = asset.coverUrl || (asset.kind === "image" ? asset.data.dataUrl : asset.kind === "video" ? asset.data.url : "");
    const text = asset.kind === "text" ? asset.data.content : "";
    return <PickerCard title={asset.title} kind={asset.kind} cover={cover} text={text} onInsert={onInsert} onRename={onRename} />;
}

function PickerCard({ title, kind, cover, text, onInsert, onRename }: { title: string; kind: string; cover: string; text?: string; onInsert: () => void; onRename: (title: string) => void }) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(title);

    useEffect(() => {
        setDraft(title);
    }, [title]);

    const commitRename = () => {
        const next = draft.trim();
        setEditing(false);
        if (next && next !== title) onRename(next);
        else setDraft(title);
    };

    return (
        <div className="group relative overflow-hidden rounded-lg border border-stone-200 bg-white text-left transition hover:border-stone-400 hover:shadow-md dark:border-stone-700 dark:bg-stone-900 dark:hover:border-stone-500">
            <button type="button" className="block w-full cursor-pointer text-left" onClick={onInsert}>
                {kind === "video" && cover ? (
                    <video src={cover} className="aspect-[4/3] w-full bg-black object-cover" muted playsInline />
                ) : cover ? (
                    <img src={cover} alt={title} className="aspect-[4/3] w-full object-cover" />
                ) : (
                    <div className="flex aspect-[4/3] items-center justify-center bg-stone-100 p-3 text-center text-xs leading-5 text-stone-500 dark:bg-stone-800 dark:text-stone-400">{text || title}</div>
                )}
            </button>
            <div className="space-y-2 p-2.5">
                <div className="flex items-center justify-between gap-2">
                    {editing ? (
                        <Input
                            size="small"
                            value={draft}
                            autoFocus
                            onChange={(event) => setDraft(event.target.value)}
                            onBlur={commitRename}
                            onPressEnter={commitRename}
                            onClick={(event) => event.stopPropagation()}
                        />
                    ) : (
                        <button type="button" className="min-w-0 flex-1 cursor-pointer truncate text-left text-xs font-medium text-stone-800 dark:text-stone-200" onClick={onInsert} title={title}>
                            {title}
                        </button>
                    )}
                    <Tag className="m-0 shrink-0 text-[10px]">{kind === "image" ? "图片" : kind === "video" ? "视频" : "文本"}</Tag>
                </div>
                <button
                    type="button"
                    className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-stone-500 transition hover:bg-stone-100 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100"
                    onClick={(event) => {
                        event.stopPropagation();
                        setEditing(true);
                    }}
                >
                    <Edit3 className="size-3" />
                    重命名
                </button>
            </div>
            <div className="pointer-events-none absolute inset-x-0 top-0 flex aspect-[4/3] items-center justify-center bg-stone-950/0 text-sm font-medium text-white opacity-0 transition group-hover:bg-stone-950/45 group-hover:opacity-100">插入</div>
        </div>
    );
}
