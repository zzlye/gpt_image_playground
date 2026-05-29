"use client";

import { Menu, Settings2, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { navigationTools, type NavigationToolSlug } from "@/constant/navigation-tools";
import { MobileNavDrawer } from "@/components/layout/mobile-nav-drawer";
import { useThemeStore } from "@/stores/use-theme-store";
import { cn } from "@/lib/utils";
import { useState } from "react";

export function AppTopNav() {
    const pathname = usePathname();
    const router = useRouter();
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const fallbackTheme = useThemeStore((state) => state.theme);
    const setTheme = useThemeStore((state) => state.setTheme);
    const theme = router.appearanceTheme || fallbackTheme;
    const hideHeader = /^\/canvas\/[^/]+/.test(pathname);
    const slug = pathname.split("/").filter(Boolean)[0];
    const activeToolSlug = navigationTools.some((tool) => tool.slug === slug) ? (slug as NavigationToolSlug) : undefined;

    return (
        <>
            {!hideHeader ? (
                <header className="safe-area-top sticky top-0 z-20 shrink-0 border-b border-gray-200 bg-white/80 backdrop-blur dark:border-white/[0.08] dark:bg-gray-950/80">
                    <div className="safe-area-x safe-header-inner mx-auto flex max-w-7xl items-center justify-between gap-5">
                        <div className="flex min-w-0 items-center">
                            <div className="flex shrink-0 items-center gap-3 text-sm font-semibold leading-none tracking-tight text-gray-800 dark:text-gray-100">
                                <span className="text-[17px] font-bold tracking-tight sm:text-lg">画布工坊</span>
                                <button type="button" className="canvas-return-button" onClick={() => router.back()} aria-label="返回文运工坊" title="返回文运工坊">
                                    <Sparkles className="size-4" />
                                    <span>文运工坊</span>
                                </button>
                            </div>

                            <button
                                type="button"
                                className="ml-3 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 md:hidden dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-gray-100"
                                onClick={() => setMobileNavOpen(true)}
                                aria-label="打开导航菜单"
                                title="导航菜单"
                            >
                                <Menu className="size-5" />
                            </button>

                            <nav className="hide-scrollbar ml-8 hidden min-w-0 items-center gap-7 overflow-x-auto md:flex">
                                {navigationTools.map((tool) => {
                                    const Icon = tool.icon;
                                    const active = tool.slug === activeToolSlug;
                                    return (
                                        <Link
                                            key={tool.slug}
                                            href={`/${tool.slug}`}
                                            className={cn(
                                                "relative flex min-h-14 shrink-0 items-center gap-2 text-sm leading-6 transition after:absolute after:inset-x-0 after:bottom-0 after:h-px",
                                                active
                                                    ? "font-medium text-stone-950 after:bg-stone-950 dark:text-stone-100 dark:after:bg-stone-100"
                                                    : "text-stone-500 after:bg-transparent hover:text-stone-950 dark:text-stone-400 dark:hover:text-stone-100",
                                            )}
                                        >
                                            <Icon className="size-4" />
                                            <span className="truncate">{tool.label}</span>
                                        </Link>
                                    );
                                })}
                            </nav>
                        </div>

                        <div className="flex min-w-0 items-center justify-end gap-1 justify-self-end whitespace-nowrap">
                            <button
                                type="button"
                                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-gray-100 [&_svg]:h-5 [&_svg]:w-5"
                                onClick={() => router.openSettings()}
                                aria-label="配置"
                                title="配置"
                            >
                                <Settings2 className="size-4" />
                            </button>
                            <AnimatedThemeToggler
                                theme={theme}
                                onThemeChange={(nextTheme) => {
                                    setTheme(nextTheme);
                                    router.setAppearanceTheme(nextTheme);
                                }}
                                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-600 shadow-none transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-gray-100 [&_svg]:h-5 [&_svg]:w-5"
                                aria-label={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"}
                                title={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"}
                            />
                        </div>
                    </div>
                </header>
            ) : null}

            <MobileNavDrawer open={mobileNavOpen} activeToolSlug={activeToolSlug} onClose={() => setMobileNavOpen(false)} />
        </>
    );
}
