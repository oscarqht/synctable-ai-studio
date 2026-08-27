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
            ? isDarkTheme
              ? "bg-white/30 text-white shadow-xs ring-2 ring-white/50"
              : "bg-black/15 text-inherit shadow-xs ring-2 ring-black/20"
            : isDarkTheme
            ? "hover:bg-white/20 text-white"
            : "hover:bg-black/10 text-inherit"
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
              isDarkTheme ? "bg-white/20 text-white" : "bg-black/10 text-inherit"
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
            : "bg-black/15 text-inherit font-bold shadow-2xs"
          : isDarkTheme
          ? "hover:bg-white/20 text-white font-normal"
          : "hover:bg-black/10 text-inherit font-normal"
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
              ? "flex"
              : "flex md:hidden md:group-hover/tab:flex group-focus-within/tab:flex"
          } items-center gap-1 shrink-0`}
        >
          <span
            onClick={handleCopyUrl}
            title="Copy URL"
            role="button"
            tabIndex={0}
            className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${
              isDarkTheme
                ? "text-white/70 hover:text-white hover:bg-white/20"
                : "text-inherit opacity-75 hover:opacity-100 hover:bg-black/10"
            }`}
          >
            {copied ? (
              <span className="material-symbols-outlined text-[15px] leading-none">check</span>
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
                : "text-inherit opacity-75 hover:opacity-100 hover:bg-black/10"
            }`}
          >
            <span className="material-symbols-outlined text-[15px] leading-none">open_in_new</span>
          </a>
        </div>
      )}
    </button>
  );
}
