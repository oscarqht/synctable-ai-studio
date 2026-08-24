"use client";

import React, { useState } from "react";
import type { BrowserTreeNode } from "../../types";
import { isValidHttpUrl, getDomain, getFaviconUrl } from "../../utils/treeUtils";

export interface ZenTabItemProps {
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

  const handleOpenLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (tab.url) {
      if (onOpenExternal) {
        e.preventDefault();
        onOpenExternal(tab.url);
      }
    }
  };

  if (isCompact) {
    return (
      <div
        onClick={() => onSelect?.(tab)}
        title={`${tab.title || domain || "Tab"}\n${tab.url || ""}`}
        className={`w-10 h-10 rounded-lg flex items-center justify-center relative cursor-pointer group/tab transition-all duration-150 active:scale-95 ${
          isActive
            ? "bg-white dark:bg-surface-container-highest shadow-xs ring-2 ring-primary/50"
            : isDarkTheme
            ? "hover:bg-white/20 text-white"
            : "hover:bg-surface-container-low text-on-surface"
        }`}
      >
        {favicon && !imgError ? (
          <img
            src={favicon}
            alt=""
            onError={() => setImgError(true)}
            className="w-4 h-4 rounded object-contain shrink-0"
          />
        ) : (
          <span
            className={`w-5 h-5 rounded text-[11px] font-bold flex items-center justify-center uppercase ${
              isDarkTheme ? "bg-white/20 text-white" : "bg-surface-container text-on-surface"
            }`}
          >
            {domain ? domain.charAt(0) : "T"}
          </span>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelect?.(tab)}
      className={`group/tab relative flex items-center gap-2.5 w-full h-9 px-3 rounded-lg text-left cursor-pointer transition-colors duration-200 select-none ${
        isActive
          ? isDarkTheme
            ? "bg-white/25 text-white font-bold"
            : "bg-surface-container-high text-on-surface font-bold shadow-2xs"
          : isDarkTheme
          ? "hover:bg-white/20 text-inherit font-normal"
          : "hover:bg-surface-container-low text-on-surface font-normal"
      }`}
    >
      {/* Favicon / Domain Icon */}
      <div className="w-5 h-5 flex items-center justify-center shrink-0 overflow-hidden">
        {favicon && !imgError ? (
          <img
            src={favicon}
            alt=""
            onError={() => setImgError(true)}
            className="w-4 h-4 object-contain rounded"
          />
        ) : (
          <span className="material-symbols-outlined text-[16px] opacity-80 leading-none">
            public
          </span>
        )}
      </div>

      {/* Tab Title */}
      <span
        className={`font-body-sm text-body-sm truncate flex-1 min-w-0 ${
          isActive ? "font-bold" : ""
        }`}
        title={tab.title || domain || "Tab"}
      >
        {tab.title || domain || "Untitled Tab"}
      </span>

      {/* Action Buttons */}
      {tab.url && (
        <div
          className={`${
            isSingleColumn || alwaysShowActions
              ? "opacity-100"
              : "opacity-0 md:group-hover/tab:opacity-100 group-focus-within/tab:opacity-100"
          } flex items-center gap-1 shrink-0 transition-opacity duration-150`}
        >
          <span
            onClick={handleCopyUrl}
            title="Copy URL"
            role="button"
            tabIndex={0}
            className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${
              isDarkTheme
                ? "text-white/70 hover:text-white hover:bg-white/20"
                : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
            }`}
          >
            {copied ? (
              <span className="material-symbols-outlined text-[15px] text-primary leading-none">check</span>
            ) : (
              <span className="material-symbols-outlined text-[15px] leading-none">content_copy</span>
            )}
          </span>

          <a
            href={tab.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleOpenLink}
            title="Open in new tab"
            className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${
              isDarkTheme
                ? "text-white/70 hover:text-white hover:bg-white/20"
                : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
            }`}
          >
            <span className="material-symbols-outlined text-[15px] leading-none">open_in_new</span>
          </a>
        </div>
      )}
    </button>
  );
}
