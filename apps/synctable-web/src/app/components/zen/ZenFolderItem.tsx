"use client";

import React, { useState } from "react";
import type { BrowserTreeNode } from "@/lib/types";
import { countTabs } from "@/lib/treeUtils";
import { ZenFolderIcon } from "./ZenFolderIcon";
import { ZenTabItem } from "./ZenTabItem";
import { ZenSplitViewItem } from "./ZenSplitViewItem";

interface ZenFolderItemProps {
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
  const children = (folder.children || []).filter((c) => countTabs(c) > 0);

  React.useEffect(() => {
    setIsOpen(defaultExpanded);
  }, [defaultExpanded]);

  if (countTabs(folder) === 0 || children.length === 0) {
    return null;
  }

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
        className={`w-10 h-10 rounded-2xl flex items-center justify-center cursor-pointer relative transition-all ${
          isDarkTheme ? "hover:bg-white/20 text-white" : "hover:bg-slate-200/60 dark:hover:bg-slate-800/60"
        }`}
      >
        <ZenFolderIcon isOpen={isOpen} size={22} color={folderColor} />
      </div>
    );
  }

  return (
    <div className="flex flex-col select-none my-0.5 group/folder">
      {/* Folder Row */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-3 px-3.5 py-2.5 rounded-2xl cursor-pointer transition-all duration-150 active:scale-[0.99] ${
          isDarkTheme
            ? "hover:bg-white/15 text-white"
            : "hover:bg-slate-200/50 dark:hover:bg-slate-800/50"
        }`}
      >
        {/* Color Outline Folder Icon or Emoji */}
        {folder.icon ? (
          <span className="text-base shrink-0 leading-none">{folder.icon}</span>
        ) : (
          <ZenFolderIcon isOpen={isOpen} size={22} color={folderColor} />
        )}

        {/* Folder Title */}
        <span className={`text-sm font-bold truncate flex-1 leading-tight tracking-tight flex items-center gap-2 ${
          isDarkTheme ? "text-white" : "text-slate-900 dark:text-slate-100"
        }`}>
          <span>{folder.title || "Folder"}</span>
          {folderColor && (
            <span
              className="w-2 h-2 rounded-full shrink-0 shadow-2xs"
              style={{ backgroundColor: folderColor }}
              title={`Color: ${folderColor}`}
            />
          )}
        </span>
      </div>

      {/* Nested Children Indented */}
      {isOpen && children.length > 0 && (
        <div className="flex flex-col space-y-0.5 pl-6 my-0.5 transition-all">
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
