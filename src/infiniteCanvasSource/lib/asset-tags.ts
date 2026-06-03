import type { Asset } from "@/stores/use-asset-store";

export type AssetTag = "人物" | "场景" | "物品" | "风格" | "其他";
export type AssetTagFilter = "all" | AssetTag;

export const assetTagOptions: Array<{ label: "全部" | AssetTag; value: AssetTagFilter }> = [
    { label: "全部", value: "all" },
    { label: "人物", value: "人物" },
    { label: "场景", value: "场景" },
    { label: "物品", value: "物品" },
    { label: "风格", value: "风格" },
    { label: "其他", value: "其他" },
];

export const assetTagValues = assetTagOptions.filter((item) => item.value !== "all").map((item) => item.value) as AssetTag[];

export function normalizeAssetTag(value: unknown): AssetTag {
    return assetTagValues.includes(value as AssetTag) ? (value as AssetTag) : "其他";
}

export function getAssetTag(asset: Asset): AssetTag {
    return normalizeAssetTag(asset.metadata?.category || asset.tags?.[0]);
}

export function buildAssetTagList(tags: string[] | undefined, tag: AssetTag): string[] {
    return [tag, ...(tags || []).filter((item) => !assetTagValues.includes(item as AssetTag) && item !== tag)];
}

export function buildAssetTagPatch(asset: Asset, tag: AssetTag): Pick<Asset, "tags" | "metadata"> {
    return {
        tags: buildAssetTagList(asset.tags, tag),
        metadata: { ...(asset.metadata || {}), category: tag },
    };
}
