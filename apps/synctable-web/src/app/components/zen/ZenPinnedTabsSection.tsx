"use client";

import React, { useState } from "react";
import type { BrowserTreeNode } from "@/lib/types";
import { getDomain, getFaviconUrl } from "./ZenTabItem";
import { Globe } from "lucide-react";

interface ZenPinnedTabsSectionProps {
  pinnedTabs: BrowserTreeNode[];
  isCompact?: boolean;
  activeTabId?: string | null;
  onSelectTab?: (tab: BrowserTreeNode) => void;
}

export function ZenPinnedTabsSection({
  pinnedTabs,
  isCompact = false,
  activeTabId,
  onSelectTab,
}: ZenPinnedTabsSectionProps) {
  if (pinnedTabs.length === 0) return null;

  return (
    <div className="w-full mb-3 select-none">
      {/* Horizontal row of rounded squircle pinned tiles */}
      <div
        className={`grid gap-2 w-full ${
          pinnedTabs.length === 1
            ? "grid-cols-1"
            : pinnedTabs.length === 2
            ? "grid-cols-2"
            : pinnedTabs.length === 3
            ? "grid-cols-3"
            : "grid-cols-4"
        }`}
      >
        {pinnedTabs.map((tab, idx) => {
          const favicon = getFaviconUrl(tab.url);
          const domain = getDomain(tab.url);
          const isActive = activeTabId === tab.id;

          return (
            <button
              key={tab.id || `pinned_${idx}`}
              onClick={() => onSelectTab?.(tab)}
              title={`${tab.title || domain || "Pinned Tab"}\n${tab.url || ""}`}
              className={`h-11 sm:h-12 rounded-2xl flex items-center justify-center transition-all duration-150 relative group/tile active:scale-95 ${
                isActive
                  ? "bg-white dark:bg-slate-800 shadow-sm ring-2 ring-cyan-500/50"
                  : "bg-slate-200/50 dark:bg-slate-800/40 hover:bg-slate-300/60 dark:hover:bg-slate-700/60"
              }`}
            >
              {favicon ? (
                <img
                  src={favicon}
                  alt=""
                  className="w-5 h-5 object-contain rounded drop-shadow-2xs transition-transform group-hover/tile:scale-105"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = "none";
                  }}
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 flex items-center justify-center text-xs font-bold shadow-2xs">
                  {domain ? domain.charAt(0).toUpperCase() : "•"}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
