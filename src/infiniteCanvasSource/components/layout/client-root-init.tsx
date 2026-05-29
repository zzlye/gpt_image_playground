"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";

import { useConfigStore } from "@/stores/use-config-store";

export function ClientRootInit({ children }: { children: ReactNode }) {
    const loadPublicSettings = useConfigStore((state) => state.loadPublicSettings);

    useEffect(() => {
        void loadPublicSettings();
    }, [loadPublicSettings]);

    return <>{children}</>;
}
