import { apiGet, compactApiParams } from "@/services/api/request";

export type Prompt = {
    id: string;
    title: string;
    coverUrl: string;
    prompt: string;
    tags: string[];
    category: string;
    githubUrl: string;
    preview: string;
    createdAt: string;
    updatedAt: string;
};

export const ALL_PROMPTS_OPTION = "全部";

export type PromptListResponse = {
    items: Prompt[];
    tags: string[];
    categories: string[];
    total: number;
};

type PromptQuery = {
    keyword?: string;
    tag?: string[];
    category?: string;
    page?: number;
    pageSize?: number;
};

type SeedPrompt = Pick<Prompt, "title" | "prompt" | "tags" | "category" | "preview">;

const PROMPT_LIBRARY_REPO_URL = "https://github.com/YouMind-OpenLab/awesome-gpt-image-2";
const PROMPT_LIBRARY_RAW_README = "https://raw.githubusercontent.com/YouMind-OpenLab/awesome-gpt-image-2/main/README.md";
const PROMPT_LIBRARY_SOURCE_URLS = [
    PROMPT_LIBRARY_RAW_README,
    "https://cdn.jsdelivr.net/gh/YouMind-OpenLab/awesome-gpt-image-2@main/README.md",
];

const PROMPT_SEEDS: SeedPrompt[] = [
    {
        title: "电影感人像",
        category: "人物",
        tags: ["人物", "摄影", "电影感"],
        prompt: "A cinematic portrait of a young explorer standing under soft window light, natural skin texture, expressive eyes, 35mm lens, shallow depth of field, subtle film grain, refined color grading, highly detailed.",
        preview: "适合人像、角色封面和剧情氛围图。",
    },
    {
        title: "电商产品海报",
        category: "产品",
        tags: ["产品", "广告", "商业"],
        prompt: "A premium product advertisement poster for a minimalist skincare bottle on a reflective glass platform, clean studio lighting, soft blue highlights, elegant composition, realistic shadows, high-end commercial photography.",
        preview: "适合商品主图、品牌海报和宣传图。",
    },
    {
        title: "室内空间设计",
        category: "场景",
        tags: ["场景", "建筑", "室内"],
        prompt: "A modern cozy reading room with warm wood shelves, large window, soft afternoon sunlight, linen sofa, indoor plants, calm neutral palette, photorealistic interior design render, wide angle view.",
        preview: "适合室内设计、空间概念和生活方式场景。",
    },
    {
        title: "可爱插画角色",
        category: "插画",
        tags: ["插画", "角色", "可爱"],
        prompt: "A charming illustrated character mascot wearing a small backpack, cheerful expression, clean rounded shapes, warm color palette, soft textured background, storybook illustration style, high detail.",
        preview: "适合头像、IP 角色和儿童插画。",
    },
    {
        title: "未来科技概念",
        category: "概念设计",
        tags: ["科技", "未来感", "概念"],
        prompt: "A futuristic control room with holographic interfaces, translucent blue screens, precise industrial design, dramatic rim lighting, clean sci-fi architecture, cinematic wide shot, ultra detailed.",
        preview: "适合科幻场景、产品概念和科技视觉。",
    },
    {
        title: "自然风景摄影",
        category: "摄影",
        tags: ["风景", "摄影", "自然"],
        prompt: "A serene mountain lake at sunrise, mist floating above the water, golden light touching pine trees, realistic landscape photography, crisp atmosphere, balanced composition, high dynamic range.",
        preview: "适合风景图、背景图和氛围图。",
    },
];

let remotePromptCatalogPromise: Promise<Prompt[]> | null = null;

export async function fetchPrompts({ keyword = "", tag = [], category = ALL_PROMPTS_OPTION, page, pageSize }: PromptQuery = {}) {
    try {
        const response = await apiGet<PromptListResponse>(
            "/api/prompts",
            compactApiParams({
                ...(keyword ? { keyword } : {}),
                ...(tag.length ? { tag } : {}),
                ...(category !== ALL_PROMPTS_OPTION ? { category } : {}),
                ...(page ? { page } : {}),
                ...(pageSize ? { pageSize } : {}),
            }),
        );

        if (response.items.length > 0 || response.total > 0 || response.tags.length > 0 || response.categories.length > 0) {
            return response;
        }

        // 后端接口返回空数据时，继续走公开 README 解析，避免提示词库空页。
        const fallbackPrompts = await loadFallbackPromptCatalog();
        return filterPromptCatalog(fallbackPrompts, { keyword, tag, category, page, pageSize });
    } catch {
        // Vite 集成版没有 Next 后端接口时，直接从公开提示词库 README 解析，避免页面空白。
        const fallbackPrompts = await loadFallbackPromptCatalog();
        return filterPromptCatalog(fallbackPrompts, { keyword, tag, category, page, pageSize });
    }
}

async function loadFallbackPromptCatalog() {
    if (!remotePromptCatalogPromise) {
        remotePromptCatalogPromise = (async () => {
            for (const sourceUrl of PROMPT_LIBRARY_SOURCE_URLS) {
                try {
                    const response = await fetch(sourceUrl);
                    if (!response.ok) continue;

                    const markdown = await response.text();
                    const parsed = parsePromptReadme(markdown);
                    if (parsed.length > 0) return parsed;
                } catch {
                    // 单个源失败时继续尝试下一个源，最后还有内置种子兜底。
                }
            }

            return PROMPT_SEEDS.map((seed) => buildPromptFromSeed(seed));
        })();
    }

    return remotePromptCatalogPromise;
}

function filterPromptCatalog(items: Prompt[], { keyword = "", tag = [], category = ALL_PROMPTS_OPTION, page = 1, pageSize }: PromptQuery) {
    const query = keyword.trim().toLowerCase();
    const selectedTags = tag.filter(Boolean);
    const filtered = items.filter((item) => {
        if (category !== ALL_PROMPTS_OPTION && item.category !== category) return false;
        if (selectedTags.length && !selectedTags.every((name) => item.tags.includes(name))) return false;
        if (!query) return true;

        const haystack = [item.title, item.prompt, item.preview, item.category, ...item.tags].join(" ").toLowerCase();
        return haystack.includes(query);
    });

    const limit = pageSize && pageSize > 0 ? pageSize : filtered.length;
    const currentPage = Math.max(1, page || 1);
    const start = limit > 0 ? (currentPage - 1) * limit : 0;
    const pageItems = limit > 0 ? filtered.slice(start, start + limit) : filtered;

    return {
        items: pageItems,
        tags: getUniqueSorted(items.flatMap((item) => item.tags)),
        categories: getUniqueSorted(items.map((item) => item.category)),
        total: filtered.length,
    };
}

function parsePromptReadme(markdown: string) {
    const blocks = markdown
        .replace(/\r\n/g, "\n")
        .split(/\n(?=###\s+No\.\s+\d+:)/g)
        .filter((block) => /^###\s+No\.\s+\d+:/m.test(block));

    return blocks
        .map((block, index) => parsePromptBlock(block, index))
        .filter((item): item is Prompt => Boolean(item))
        .slice(0, 240);
}

function parsePromptBlock(block: string, index: number): Prompt | null {
    const titleMatch = block.match(/^###\s+No\.\s+(\d+):\s*(.+)$/m);
    if (!titleMatch) return null;

    const title = cleanMarkdownText(titleMatch[2]);
    const description = cleanMarkdownText(extractMarkdownSection(block, "#### 📖 Description", ["#### 📝 Prompt", "#### 📌 Details", "### No."]));
    const prompt = cleanPromptText(extractMarkdownSection(block, "#### 📝 Prompt", ["#### 🖼️", "#### 📌", "##### Image", "### No."]));
    if (!title || !prompt) return null;

    const details = extractMarkdownSection(block, "#### 📌 Details", ["### No."]);
    const publishedAt = parsePublishedAt(details) || new Date().toISOString();
    const category = inferPromptCategory(`${title}\n${description}\n${prompt}`);
    const tags = buildPromptTags(category, `${title}\n${description}\n${prompt}\n${details}`);
    const coverUrl = resolvePromptCover(findFirstImageUrl(block), title, category);

    return {
        id: `remote-${titleMatch[1] || index}-${hashText(title + prompt)}`,
        title,
        coverUrl,
        prompt,
        tags,
        category,
        githubUrl: PROMPT_LIBRARY_REPO_URL,
        preview: description || createPreview(prompt),
        createdAt: publishedAt,
        updatedAt: publishedAt,
    };
}

function buildPromptFromSeed(seed: SeedPrompt): Prompt {
    const now = new Date().toISOString();
    return {
        id: `seed-${hashText(seed.title + seed.prompt)}`,
        title: seed.title,
        coverUrl: buildPromptCoverDataUrl(seed.title, seed.category),
        prompt: seed.prompt,
        tags: getUniqueSorted(seed.tags),
        category: seed.category,
        githubUrl: PROMPT_LIBRARY_REPO_URL,
        preview: seed.preview,
        createdAt: now,
        updatedAt: now,
    };
}

function extractMarkdownSection(source: string, marker: string, endMarkers: string[]) {
    const start = source.indexOf(marker);
    if (start === -1) return "";

    const body = source.slice(start + marker.length);
    const end = endMarkers.reduce((cursor, endMarker) => {
        const index = body.indexOf(endMarker);
        return index === -1 ? cursor : Math.min(cursor, index);
    }, body.length);

    return body.slice(0, end);
}

function cleanPromptText(value: string) {
    return value
        .replace(/^\s{4}/gm, "")
        .replace(/^\s*```[a-z-]*\s*/i, "")
        .replace(/\s*```\s*$/i, "")
        .replace(/^\s*`/, "")
        .replace(/`\s*$/, "")
        .trim();
}

function cleanMarkdownText(value: string) {
    return value
        .replace(/^\s{4}/gm, "")
        .replace(/!\[[^\]]*]\([^)]+\)/g, "")
        .replace(/\[[^\]]+]\(([^)]+)\)/g, "")
        .replace(/[`*_>#]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function findFirstImageUrl(block: string) {
    // 跳过 shields.io badge 和其他小图标，只提取实际的封面图片
    const badgePattern = /img\.shields\.io|badge\.svg|badge-/i;
    // 尝试匹配所有 markdown 图片和 HTML img 标签
    const markdownImages = [...block.matchAll(/!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)];
    const htmlImages = [...block.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)];
    const allUrls = [
        ...markdownImages.map((m) => m[1]),
        ...htmlImages.map((m) => m[1]),
    ];
    // 过滤掉 badge 类的 URL，返回第一个有效封面图
    return allUrls.find((url) => !badgePattern.test(url)) || "";
}

function resolvePromptCover(value: string, title: string, category: string) {
    if (!value) return buildPromptCoverDataUrl(title, category);
    if (/^data:/i.test(value) || /^https?:\/\//i.test(value)) return value;
    if (value.startsWith("//")) return `https:${value}`;

    try {
        const normalizedPath = value.startsWith("/") ? value.slice(1) : value;
        return new URL(normalizedPath, PROMPT_LIBRARY_RAW_README).toString();
    } catch {
        return buildPromptCoverDataUrl(title, category);
    }
}

function parsePublishedAt(details: string) {
    const match = details.match(/Published:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/i);
    if (!match) return "";

    const date = new Date(`${match[1]}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function inferPromptCategory(text: string) {
    const lower = text.toLowerCase();
    const rules: Array<[string, RegExp[]]> = [
        ["人物", [/portrait/i, /character/i, /people/i, /person/i, /avatar/i, /人像/, /人物/, /角色/]],
        ["产品", [/product/i, /packaging/i, /advert/i, /brand/i, /bottle/i, /商品/, /产品/, /广告/, /品牌/]],
        ["场景", [/interior/i, /architecture/i, /building/i, /room/i, /city/i, /landscape/i, /场景/, /建筑/, /室内/]],
        ["插画", [/illustration/i, /anime/i, /cartoon/i, /comic/i, /storybook/i, /插画/, /漫画/, /动画/]],
        ["概念设计", [/futuristic/i, /sci-fi/i, /cyber/i, /concept/i, /robot/i, /未来/, /科幻/, /概念/]],
        ["摄影", [/photo/i, /photography/i, /camera/i, /lens/i, /cinematic/i, /摄影/, /电影感/]],
    ];

    return rules.find(([, patterns]) => patterns.some((pattern) => pattern.test(lower)))?.[0] || "综合";
}

function buildPromptTags(category: string, text: string) {
    const lower = text.toLowerCase();
    const tags = [category];
    const rules: Array<[string, RegExp[]]> = [
        ["摄影", [/photo/i, /photography/i, /camera/i, /lens/i, /studio/i, /摄影/]],
        ["电影感", [/cinematic/i, /film/i, /movie/i, /电影/]],
        ["插画", [/illustration/i, /anime/i, /comic/i, /插画/, /漫画/]],
        ["3D", [/\b3d\b/i, /render/i, /blender/i, /unreal/i, /octane/i]],
        ["商业", [/advert/i, /product/i, /brand/i, /poster/i, /商业/, /广告/]],
        ["建筑", [/architecture/i, /interior/i, /room/i, /building/i, /建筑/, /室内/]],
        ["风景", [/landscape/i, /mountain/i, /lake/i, /nature/i, /风景/, /自然/]],
        ["科技", [/futuristic/i, /technology/i, /sci-fi/i, /cyber/i, /科技/, /未来/]],
        ["可爱", [/cute/i, /charming/i, /mascot/i, /可爱/]],
    ];

    rules.forEach(([tag, patterns]) => {
        if (patterns.some((pattern) => pattern.test(lower))) tags.push(tag);
    });

    if (/chinese|中文/i.test(text)) tags.push("中文");
    if (/english|英文/i.test(text)) tags.push("英文");

    return getUniqueSorted(tags).slice(0, 6);
}

function createPreview(value: string) {
    return value.length > 120 ? `${value.slice(0, 120)}...` : value;
}

function getUniqueSorted(values: string[]) {
    return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function buildPromptCoverDataUrl(title: string, category: string) {
    const hue = hashText(`${title}-${category}`) % 360;
    const accent = `hsl(${hue}, 84%, 55%)`;
    const accentSoft = `hsl(${(hue + 32) % 360}, 92%, 88%)`;
    const safeTitle = escapeXml(title.length > 24 ? `${title.slice(0, 24)}...` : title);
    const safeCategory = escapeXml(category);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${accentSoft}"/><stop offset="100%" stop-color="#ffffff"/></linearGradient></defs><rect width="1200" height="900" fill="url(#g)"/><rect x="92" y="92" width="1016" height="716" rx="42" fill="rgba(255,255,255,0.72)" stroke="rgba(15,23,42,0.08)"/><circle cx="998" cy="166" r="72" fill="${accent}" opacity="0.18"/><text x="144" y="206" font-family="Arial, sans-serif" font-size="44" font-weight="700" fill="${accent}">${safeCategory}</text><text x="144" y="462" font-family="Arial, sans-serif" font-size="70" font-weight="700" fill="#0f172a">${safeTitle}</text><text x="144" y="540" font-family="Arial, sans-serif" font-size="34" fill="#475569">Prompt Library</text></svg>`;

    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function escapeXml(value: string) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function hashText(value: string) {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
        hash = (hash << 5) - hash + value.charCodeAt(index);
        hash |= 0;
    }
    return Math.abs(hash);
}

export function formatPromptDate(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
