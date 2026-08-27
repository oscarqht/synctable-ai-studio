"use client";

import React, { useState } from "react";
import type { BrowserTreeNode } from "../../types";
import {
  isValidHttpUrl,
  countTabs,
  getAllTabUrls,
  getDomain,
  getFaviconUrl,
} from "../../utils/treeUtils";

export interface ZenSplitViewItemProps {
  node: BrowserTreeNode;
  isCompact?: boolean;
  activeTabId?: string | null;
  isDarkTheme?: boolean;
  isSingleColumn?: boolean;
  alwaysShowActions?: boolean;
  onSelectTab?: (tab: BrowserTreeNode) => void;
  onOpenExternal?: (url: string) => void;
}

export function ZenSplitViewItem({
  node,
  isCompact = false,
  activeTabId,
  isDarkTheme = false,
  isSingleColumn = false,
  alwaysShowActions = false,
  onSelectTab,
  onOpenExternal,
}: ZenSplitViewItemProps) {
  const [splitCopied, setSplitCopied] = useState<boolean>(false);
  const children = (node.children || []).filter((c) => isValidHttpUrl(c.url));

  if (countTabs(node) === 0 || children.length === 0) {
    return null;
  }

  const isAnyTabActive =
    (activeTabId && (node.id === activeTabId || children.some((c) => c.id === activeTabId))) ||
    false;

  const handleCopySplitView = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const urls = getAllTabUrls(node);
    if (urls.length > 0) {
      navigator.clipboard.writeText(urls.join("\n"));
      setSplitCopied(true);
      setTimeout(() => setSplitCopied(false), 1600);
    }
  };

  const handleOpenSplitView = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const urls = getAllTabUrls(node);
    if (urls.length > 0) {
      if (onOpenExternal) {
        urls.forEach((url) => onOpenExternal(url));
      } else {
        urls.forEach((url) => {
          window.open(url, "_blank", "noopener,noreferrer");
        });
      }
    }
  };

  if (isCompact) {
    return (
      <div
        title={`Split View: ${children.map((c) => c.title || getDomain(c.url)).join(" | ")}`}
        className={`w-10 h-10 rounded-lg flex items-center justify-center relative cursor-pointer group/tab transition-all duration-150 active:scale-95 ${
          isAnyTabActive
            ? "bg-white dark:bg-surface-container-highest shadow-xs ring-2 ring-primary/50"
            : isDarkTheme
            ? "hover:bg-white/20 text-white"
            : "hover:bg-surface-container-low text-on-surface"
        }`}
      >
        <div className="grid grid-cols-2 gap-0.5 w-6 h-6 p-0.5 items-center justify-center">
          {children.slice(0, 2).map((tab, idx) => {
            const fav = getFaviconUrl(tab.url);
            return (
              <div
                key={tab.id || idx}
                className="w-full h-full rounded bg-surface-container-high flex items-center justify-center overflow-hidden"
              >
                {fav ? (
                  <img
                    src={fav}
                    alt=""
                    className="w-2.5 h-2.5 object-contain"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                ) : (
                  <span className="text-[8px] font-bold text-on-surface-variant">
                    {idx + 1}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={() => {
        if (children.length > 0) {
          onSelectTab?.(children[0]);
        }
      }}
      className={`group/tab relative flex items-center gap-2 px-3 h-9 rounded-lg cursor-pointer transition-colors duration-200 select-none ${
        isAnyTabActive
          ? isDarkTheme
            ? "bg-white/25 text-white font-bold"
            : "bg-black/15 text-inherit font-bold shadow-2xs"
          : isDarkTheme
          ? "hover:bg-white/20 text-white font-normal"
          : "hover:bg-black/10 text-inherit font-normal"
      }`}
    >
      {/* Side-by-side split panes separated by clean divider lines */}
      <div className="flex-1 min-w-0 flex items-center gap-2 overflow-hidden">
        {children.map((tab, idx) => {
          const domain = getDomain(tab.url);
          const favicon = getFaviconUrl(tab.url);
          const isTabActive = activeTabId === tab.id;

          return (
            <React.Fragment key={tab.id || `${tab.title}_${idx}`}>
              {idx > 0 && (
                <div className={`w-px h-3.5 shrink-0 ${isDarkTheme ? "bg-white/20" : "bg-black/20"}`} />
              )}
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectTab?.(tab);
                }}
                title={`${tab.title || domain || "Tab"}\n${tab.url || ""}`}
                className="flex-1 min-w-0 flex items-center gap-2 cursor-pointer overflow-hidden py-0.5 rounded hover:opacity-80 transition-opacity"
              >
                {/* Favicon */}
                <div className="w-4 h-4 flex items-center justify-center shrink-0 overflow-hidden">
                  {favicon ? (
                    <img
                      src={favicon}
                      alt=""
                      className="w-4 h-4 object-contain rounded shrink-0"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <span className="material-symbols-outlined text-[14px] leading-none">public</span>
                  )}
                </div>

                {/* Tab Title */}
                <span
                  className={`font-body-sm text-body-sm truncate ${
                    isTabActive ? "underline underline-offset-2 font-bold" : ""
                  }`}
                >
                  {tab.title || domain || `Pane ${idx + 1}`}
                </span>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* Action Buttons */}
      <div
        className={`${
          isSingleColumn || alwaysShowActions
            ? "flex"
            : "flex md:hidden md:group-hover/tab:flex group-focus-within/tab:flex"
        } items-center gap-1 shrink-0`}
      >
        <span
          onClick={handleCopySplitView}
          title={
            children.length > 1
              ? `Copy all ${children.length} URLs in split view`
              : "Copy URL"
          }
          role="button"
          tabIndex={0}
          className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${
            isDarkTheme
              ? "text-white/70 hover:text-white hover:bg-white/20"
              : "text-inherit opacity-75 hover:opacity-100 hover:bg-black/10"
          }`}
        >
          {splitCopied ? (
            <span className="material-symbols-outlined text-[15px] leading-none">check</span>
          ) : (
            <span className="material-symbols-outlined text-[15px] leading-none">content_copy</span>
          )}
        </span>

        <span
          onClick={handleOpenSplitView}
          title={
            children.length > 1
              ? `Open all ${children.length} tabs in browser`
              : "Open URL in browser"
          }
          role="button"
          tabIndex={0}
          className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${
            isDarkTheme
              ? "text-white/70 hover:text-white hover:bg-white/20"
              : "text-inherit opacity-75 hover:opacity-100 hover:bg-black/10"
          }`}
        >
          <span className="material-symbols-outlined text-[15px] leading-none">open_in_new</span>
        </span>
      </div>
    </div>
  );
}
