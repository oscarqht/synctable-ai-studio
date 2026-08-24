"use client";

import React, { useState } from "react";
import { Copy, Check, ExternalLink } from "lucide-react";
import type { BrowserTreeNode } from "@/lib/types";
import { isValidHttpUrl } from "@/lib/treeUtils";

interface ZenTabItemProps {
  tab: BrowserTreeNode;
  isPinned?: boolean;
  isCompact?: boolean;
  isActive?: boolean;
  isDarkTheme?: boolean;
  isSingleColumn?: boolean;
  alwaysShowActions?: boolean;
  onSelect?: (tab: BrowserTreeNode) => void;
  onOpenExternal?: (url: string) => void;
}

export function getDomain(urlStr: string | null): string {
  if (!urlStr || !isValidHttpUrl(urlStr)) return "";
  try {
    const url = new URL(urlStr);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function getFaviconUrl(urlStr: string | null): string {
  if (!urlStr || !isValidHttpUrl(urlStr)) return "";
  try {
    const url = new URL(urlStr);
    return `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=64`;
  } catch {
    return "";
  }
}

export function ZenTabItem({
  tab,
  isPinned = false,
  isCompact = false,
  isActive = false,
  isDarkTheme = false,
  isSingleColumn = false,
  alwaysShowActions = false,
  onSelect,
  onOpenExternal,
}: ZenTabItemProps) {
  const [copied, setCopied] = useState(false);
  const [imgError, setImgError] = useState(false);

  if (!isValidHttpUrl(tab.url)) {
    return null;
  }

  const domain = getDomain(tab.url);
  const favicon = getFaviconUrl(tab.url);

  const handleCopyUrl = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (tab.url) {
      navigator.clipboard.writeText(tab.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  };

  if (isCompact) {
    return (
      <div
        onClick={() => onSelect?.(tab)}
        title={`${tab.title || domain || "Tab"}\n${tab.url || ""}`}
        className={`w-10 h-10 rounded-2xl flex items-center justify-center relative cursor-pointer group/tab transition-all duration-150 active:scale-95 ${
          isActive
            ? "bg-white dark:bg-slate-800 shadow-sm ring-2 ring-cyan-500/50"
            : isDarkTheme
            ? "hover:bg-white/20 text-white"
            : "hover:bg-slate-200/60 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300"
        }`}
      >
        {favicon && !imgError ? (
          <img
            src={favicon}
            alt=""
            onError={() => setImgError(true)}
            className="w-5 h-5 rounded object-contain shrink-0"
          />
        ) : (
          <span className={`w-5 h-5 rounded-lg text-[11px] font-bold flex items-center justify-center uppercase ${isDarkTheme ? "bg-white/20 text-white" : "bg-slate-200 dark:bg-slate-700"}`}>
            {domain ? domain.charAt(0) : "T"}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      onClick={() => onSelect?.(tab)}
      className={`group/tab relative flex items-center gap-3 px-3.5 py-2.5 min-h-[42px] rounded-2xl cursor-pointer transition-all duration-150 select-none ${
        isActive
          ? "bg-white text-slate-900 shadow-sm border border-slate-100 dark:border-slate-700/60 font-bold"
          : isDarkTheme
          ? "hover:bg-white/20 text-white font-medium"
          : "hover:bg-slate-200/50 dark:hover:bg-slate-800/50 text-slate-800 dark:text-slate-200 font-semibold"
      } active:scale-[0.99]`}
    >
      {/* Favicon / Domain badge */}
      <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 overflow-hidden">
        {favicon && !imgError ? (
          <img
            src={favicon}
            alt=""
            onError={() => setImgError(true)}
            className="w-4 h-4 object-contain rounded"
          />
        ) : (
          <span className="w-4 h-4 rounded bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center uppercase">
            {domain ? domain.charAt(0) : "M"}
          </span>
        )}
      </div>

      {/* Tab Title */}
      <div className="flex-1 min-w-0 flex items-center">
        <span
          className={`text-sm truncate leading-tight tracking-tight ${isDarkTheme && !isActive ? "text-white font-medium" : ""}`}
          title={tab.title || domain || "Tab"}
        >
          {tab.title || domain || "Untitled Tab"}
        </span>
      </div>

      {/* Action Buttons */}
      {tab.url && (
        <div
          className={`${
            isSingleColumn || alwaysShowActions
              ? "flex"
              : "flex md:hidden md:group-hover/tab:flex"
          } items-center gap-1 shrink-0 -my-1`}
        >
          <button
            onClick={handleCopyUrl}
            title="Copy URL"
            className={`w-5 h-5 flex items-center justify-center rounded-md transition-all ${
              isDarkTheme
                ? "text-white/70 hover:text-white hover:bg-white/20"
                : "text-slate-400 hover:text-cyan-700 dark:hover:text-cyan-300 hover:bg-slate-100 dark:hover:bg-slate-700"
            }`}
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>

          <a
            href={tab.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              e.stopPropagation();
              if (onOpenExternal && tab.url) {
                e.preventDefault();
                onOpenExternal(tab.url);
              }
            }}
            title="Open URL in new window"
            className={`w-5 h-5 flex items-center justify-center rounded-md transition-all ${
              isDarkTheme
                ? "text-white/70 hover:text-white hover:bg-white/20"
                : "text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-slate-100 dark:hover:bg-slate-700"
            }`}
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      )}
    </div>
  );
}
