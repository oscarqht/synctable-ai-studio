"use client";

import React, { useState } from "react";
import type { BrowserTreeNode } from "../../types";
import { countTabs, getAllTabUrls } from "../../utils/treeUtils";
import { ZenFolderIcon } from "./ZenFolderIcon";
import { ZenTabItem } from "./ZenTabItem";
import { ZenSplitViewItem } from "./ZenSplitViewItem";

export interface ZenFolderItemProps {
  folder: BrowserTreeNode;
  depth?: number;
  isCompact?: boolean;
  activeTabId?: string | null;
  defaultExpanded?: boolean;
  isDarkTheme?: boolean;
  isSingleColumn?: boolean;
  alwaysShowActions?: boolean;
  onSelectTab?: (tab: BrowserTreeNode) => void;
  onOpenExternal?: (url: string) => void;
}

export function ZenFolderItem({
  folder,
  depth = 0,
  isCompact = false,
  activeTabId,
  defaultExpanded = true,
  isDarkTheme = false,
  isSingleColumn = false,
  alwaysShowActions = false,
  onSelectTab,
  onOpenExternal,
}: ZenFolderItemProps) {
  const [isOpen, setIsOpen] = useState<boolean>(defaultExpanded);
  const [copied, setCopied] = useState<boolean>(false);
  const children = (folder.children || []).filter((c) => countTabs(c) > 0);

  React.useEffect(() => {
    setIsOpen(defaultExpanded);
  }, [defaultExpanded]);

  if (countTabs(folder) === 0 || children.length === 0) {
    return null;
  }

  const handleCopyFolder = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const urls = getAllTabUrls(folder);
    if (urls.length > 0) {
      navigator.clipboard.writeText(urls.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  };

  const handleOpenFolder = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const urls = getAllTabUrls(folder);
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

  const folderColor =
    folder.theme_color ||
    (folder.theme_colors && folder.theme_colors.length > 0
      ? folder.theme_colors[0]
      : null);

  if (isCompact) {
    return (
      <div
        onClick={() => setIsOpen(!isOpen)}
        title={`Folder: ${folder.title || "Folder"} (${children.length} tabs)`}
        className={`w-10 h-10 rounded-lg flex items-center justify-center cursor-pointer relative transition-all ${
          isDarkTheme ? "hover:bg-white/20 text-white" : "hover:bg-surface-container-low text-on-surface"
        }`}
      >
        <ZenFolderIcon isOpen={isOpen} size={20} color={folderColor} />
      </div>
    );
  }

  return (
    <div className="flex flex-col select-none my-1 group/folder">
      {/* Folder Row */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 h-8 rounded-lg cursor-pointer transition-colors duration-200 ${
          isDarkTheme
            ? "hover:bg-white/15 text-inherit opacity-85 hover:opacity-100"
            : "hover:bg-surface-container-low text-on-surface-variant hover:text-on-surface"
        }`}
      >
        {/* Folder Icon or Emoji */}
        {folder.icon ? (
          <span className="text-sm shrink-0 leading-none">{folder.icon}</span>
        ) : (
          <span className="material-symbols-outlined text-[16px] shrink-0 leading-none">
            {isOpen ? "folder_open" : "folder"}
          </span>
        )}

        {/* Folder Title */}
        <span className="font-label-md text-label-md truncate flex-1 min-w-0 font-semibold flex items-center gap-2">
          <span className="truncate">{folder.title || "Folder"}</span>
          {folderColor && (
            <span
              className="w-2 h-2 rounded-full shrink-0 shadow-2xs"
              style={{ backgroundColor: folderColor }}
              title={`Color: ${folderColor}`}
            />
          )}
        </span>

        {/* Action Buttons */}
        <div
          className={`${
            isSingleColumn || alwaysShowActions
              ? "opacity-100"
              : "opacity-0 md:group-hover/folder:opacity-100 group-focus-within/folder:opacity-100"
          } flex items-center gap-1 shrink-0 transition-opacity duration-150`}
        >
          <span
            onClick={handleCopyFolder}
            title={`Copy all ${countTabs(folder)} tab URLs`}
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
          <span
            onClick={handleOpenFolder}
            title={`Open all ${countTabs(folder)} tabs`}
            role="button"
            tabIndex={0}
            className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${
              isDarkTheme
                ? "text-white/70 hover:text-white hover:bg-white/20"
                : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
            }`}
          >
            <span className="material-symbols-outlined text-[15px] leading-none">open_in_new</span>
          </span>
        </div>
      </div>

      {/* Nested Children */}
      {isOpen && children.length > 0 && (
        <div className="flex flex-col space-y-1 pl-3 my-0.5 transition-all">
          {children.map((child, idx) => {
            if (child.node_type === "folder") {
              return (
                <ZenFolderItem
                  key={child.id || `folder_${idx}`}
                  folder={child}
                  depth={depth + 1}
                  isCompact={isCompact}
                  activeTabId={activeTabId}
                  defaultExpanded={defaultExpanded}
                  isDarkTheme={isDarkTheme}
                  isSingleColumn={isSingleColumn}
                  alwaysShowActions={alwaysShowActions}
                  onSelectTab={onSelectTab}
                  onOpenExternal={onOpenExternal}
                />
              );
            }
            if (child.node_type === "split_view") {
              return (
                <ZenSplitViewItem
                  key={child.id || `split_${idx}`}
                  node={child}
                  activeTabId={activeTabId}
                  isCompact={isCompact}
                  isDarkTheme={isDarkTheme}
                  isSingleColumn={isSingleColumn}
                  alwaysShowActions={alwaysShowActions}
                  onSelectTab={onSelectTab}
                  onOpenExternal={onOpenExternal}
                />
              );
            }
            return (
              <ZenTabItem
                key={child.id || `tab_${idx}`}
                tab={child}
                isPinned={child.node_type === "pinned_tab"}
                isCompact={isCompact}
                isActive={activeTabId === child.id}
                isDarkTheme={isDarkTheme}
                isSingleColumn={isSingleColumn}
                alwaysShowActions={alwaysShowActions}
                onSelect={onSelectTab}
                onOpenExternal={onOpenExternal}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
