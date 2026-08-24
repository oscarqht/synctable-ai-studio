"use client";

import React, { useState } from "react";
import { ExternalLink, Copy, Check } from "lucide-react";
import type { BrowserTreeNode } from "@/lib/types";
import { isValidHttpUrl, countTabs, getAllTabUrls } from "@/lib/treeUtils";
import { getDomain, getFaviconUrl } from "./ZenTabItem";

interface ZenSplitViewItemProps {
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
        className={`w-10 h-10 rounded-2xl flex items-center justify-center relative cursor-pointer group/tab transition-all duration-150 active:scale-95 ${
          isAnyTabActive
            ? "bg-white dark:bg-slate-800 shadow-sm ring-2 ring-cyan-500/50"
            : isDarkTheme
            ? "hover:bg-white/20 text-white"
            : "hover:bg-slate-200/60 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300"
        }`}
      >
        <div className="grid grid-cols-2 gap-0.5 w-6 h-6 p-0.5 items-center justify-center">
          {children.slice(0, 2).map((tab, idx) => {
            const fav = getFaviconUrl(tab.url);
            return (
              <div
                key={tab.id || idx}
                className="w-full h-full rounded bg-slate-200/80 dark:bg-slate-700/80 flex items-center justify-center overflow-hidden"
              >
                {fav ? (
                  <img src={fav} alt="" className="w-2.5 h-2.5 object-contain" />
                ) : (
                  <span className="text-[8px] font-bold text-slate-500">
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
      className={`group/tab relative flex items-center gap-2 px-3.5 py-2.5 min-h-[42px] rounded-2xl cursor-pointer transition-all duration-150 select-none ${
        isAnyTabActive
          ? "bg-white/90 dark:bg-slate-900/90 text-slate-900 dark:text-white shadow-xs border border-white/60 dark:border-white/10 font-bold backdrop-blur-xs"
          : isDarkTheme
          ? "hover:bg-white/20 text-white font-medium"
          : "hover:bg-white/40 dark:hover:bg-white/10 text-slate-800 dark:text-slate-200 font-semibold"
      } active:scale-[0.99]`}
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
                <div className="w-px h-3.5 shrink-0 bg-black/20" />
              )}
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectTab?.(tab);
                }}
                title={`${tab.title || domain || "Tab"}\n${tab.url || ""}`}
                className="flex-1 min-w-0 flex items-center gap-2 cursor-pointer overflow-hidden py-0.5 rounded-lg hover:opacity-80 transition-opacity"
              >
                {/* Favicon */}
                <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 overflow-hidden">
                  {favicon ? (
                    <img
                      src={favicon}
                      alt=""
                      className="w-4 h-4 object-contain rounded shrink-0"
                    />
                  ) : (
                    <span className="w-4 h-4 rounded bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center uppercase">
                      {domain ? domain.charAt(0) : `${idx + 1}`}
                    </span>
                  )}
                </div>

                {/* Tab Title */}
                <span
                  className={`text-sm truncate leading-tight tracking-tight ${
                    isDarkTheme && !isAnyTabActive
                      ? "text-white font-medium"
                      : ""
                  } ${isTabActive ? "underline decoration-cyan-500 underline-offset-2" : ""}`}
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
            : "flex md:hidden md:group-hover/tab:flex"
        } items-center gap-1 shrink-0 -my-1`}
      >
        <button
          onClick={handleCopySplitView}
          title={
            children.length > 1
              ? `Copy all ${children.length} URLs in split view`
              : "Copy URL"
          }
          className={`w-5 h-5 flex items-center justify-center rounded-md transition-all ${
            isDarkTheme
              ? "text-white/70 hover:text-white hover:bg-white/20"
              : "text-slate-400 hover:text-cyan-700 dark:hover:text-cyan-300 hover:bg-slate-100 dark:hover:bg-slate-700"
          }`}
        >
          {splitCopied ? (
            <Check className="w-3.5 h-3.5 text-emerald-600" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>

        <button
          onClick={handleOpenSplitView}
          title={
            children.length > 1
              ? `Open all ${children.length} tabs in browser`
              : "Open URL in browser"
          }
          className={`w-5 h-5 flex items-center justify-center rounded-md transition-all ${
            isDarkTheme
              ? "text-white/70 hover:text-white hover:bg-white/20"
              : "text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-slate-100 dark:hover:bg-slate-700"
          }`}
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
