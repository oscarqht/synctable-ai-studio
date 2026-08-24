"use client";

import React, { useState, useMemo } from "react";
import { Search, X } from "lucide-react";
import type { BrowserTreeNode } from "@/lib/types";
import {
  countTabs,
  pruneEmptyNodes,
  extractWorkspacesFromRoot,
  isDarkColor,
  getWorkspaceGradientStyle,
  type WorkspaceItem,
} from "@/lib/treeUtils";
import { ZenFolderItem } from "./ZenFolderItem";
import { ZenSplitViewItem } from "./ZenSplitViewItem";
import { ZenTabItem } from "./ZenTabItem";

export interface ZenSidebarViewProps {
  workspaceItem?: WorkspaceItem;
  rootNode?: BrowserTreeNode;
  searchQuery?: string;
  isSingleColumn?: boolean;
  alwaysShowActions?: boolean;
  onOpenExternal?: (url: string) => void;
}

export function ZenSidebarView({
  workspaceItem,
  rootNode: rawRootNode,
  searchQuery: externalSearch = "",
  isSingleColumn = false,
  alwaysShowActions = false,
  onOpenExternal,
}: ZenSidebarViewProps) {
  const [internalSearch, setInternalSearch] = useState("");
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  const activeSearch = externalSearch || internalSearch;

  // Resolve current workspace item from props
  const currentWorkspaceItem = useMemo<WorkspaceItem | null>(() => {
    if (workspaceItem) return workspaceItem;
    if (rawRootNode) {
      const extracted = extractWorkspacesFromRoot(rawRootNode);
      if (extracted.length > 0) return extracted[0];
      const pruned = pruneEmptyNodes(rawRootNode) || rawRootNode;
      return {
        id: pruned.id || "workspace",
        browserName: (pruned.browser_name || "browser").toLowerCase(),
        browserTitle: pruned.title || pruned.browser_name || "Browser",
        profileName: pruned.profile_name || "Default",
        workspaceTitle: pruned.title || "Workspace",
        themeColor: pruned.theme_color,
        themeColors: pruned.theme_colors,
        icon: pruned.icon,
        node: pruned,
        tabCount: countTabs(pruned),
      };
    }
    return null;
  }, [workspaceItem, rawRootNode]);

  const workspaceNode = currentWorkspaceItem?.node;

  // Collect all items in this workspace (pinned tabs, folders, split views, regular tabs)
  const allItems = useMemo(() => {
    if (!workspaceNode?.children) return [];
    return workspaceNode.children.filter((item) => countTabs(item) > 0);
  }, [workspaceNode]);

  // Filter items by search query
  const filteredItems = useMemo(() => {
    if (!activeSearch) return allItems;
    const q = activeSearch.toLowerCase();

    function matchRecursive(node: BrowserTreeNode): boolean {
      const match =
        (node.title && node.title.toLowerCase().includes(q)) ||
        (node.url && node.url.toLowerCase().includes(q));
      if (match) return true;
      if (node.children) {
        return node.children.some(matchRecursive);
      }
      return false;
    }

    return allItems.filter(matchRecursive);
  }, [allItems, activeSearch]);

function isPinnedNode(item: BrowserTreeNode): boolean {
  if (item.node_type === "pinned_tab") return true;
  if (item.node_type === "split_view" || item.node_type === "folder") {
    if (item.children && item.children.length > 0) {
      return item.children.every(isPinnedNode);
    }
  }
  return false;
}


  const isDark = Boolean(
    (currentWorkspaceItem?.themeColors && currentWorkspaceItem.themeColors.length > 0 && isDarkColor(currentWorkspaceItem.themeColors[0])) ||
    (currentWorkspaceItem?.themeColor && isDarkColor(currentWorkspaceItem.themeColor))
  );

  const handleSelectTab = (tab: BrowserTreeNode) => {
    setActiveTabId(tab.id || null);
  };

  const renderItem = (item: BrowserTreeNode, idx: number) => {
    if (item.node_type === "folder") {
      return (
        <ZenFolderItem
          key={item.id || `folder_${idx}`}
          folder={item}
          activeTabId={activeTabId}
          isDarkTheme={isDark}
          isSingleColumn={isSingleColumn}
          alwaysShowActions={alwaysShowActions}
          onSelectTab={handleSelectTab}
          onOpenExternal={onOpenExternal}
        />
      );
    }

    if (item.node_type === "split_view") {
      return (
        <ZenSplitViewItem
          key={item.id || `split_${idx}`}
          node={item}
          activeTabId={activeTabId}
          isDarkTheme={isDark}
          isSingleColumn={isSingleColumn}
          alwaysShowActions={alwaysShowActions}
          onSelectTab={handleSelectTab}
          onOpenExternal={onOpenExternal}
        />
      );
    }

    return (
      <ZenTabItem
        key={item.id || `tab_${idx}`}
        tab={item}
        isPinned={item.node_type === "pinned_tab"}
        isActive={activeTabId === item.id}
        isDarkTheme={isDark}
        isSingleColumn={isSingleColumn}
        alwaysShowActions={alwaysShowActions}
        onSelect={handleSelectTab}
        onOpenExternal={onOpenExternal}
      />
    );
  };

  if (!currentWorkspaceItem || currentWorkspaceItem.tabCount === 0) {
    return null;
  }

  const { browserTitle, profileName, workspaceTitle, tabCount } = currentWorkspaceItem;

  const hasThemeBg = Boolean(
    (currentWorkspaceItem.themeColors && currentWorkspaceItem.themeColors.length > 0) ||
    currentWorkspaceItem.themeColor
  );

  const themeBgStyle = getWorkspaceGradientStyle(
    currentWorkspaceItem.themeColors,
    currentWorkspaceItem.themeColor,
    isDark
  );

  return (
    <div
      style={themeBgStyle}
      className={`flex flex-col rounded-3xl p-3 sm:p-4 shadow-sm w-full transition-all ${
        hasThemeBg
          ? isDark
            ? "border border-white/20 shadow-md shadow-black/10"
            : "border border-black/[0.08] dark:border-white/10 shadow-sm shadow-slate-900/5"
          : "border border-gray-300 dark:border-gray-600 bg-slate-100/90 dark:bg-slate-900/90"
      }`}
    >
      {/* Top Controls: Browser & Profile Info + Tab Count */}
      <div className="flex items-center justify-between w-full pb-2 mb-2">
        <div className="flex items-center gap-2 min-w-0 px-1">
          <span className={`text-xs font-bold capitalize truncate ${
            isDark
              ? "text-white"
              : hasThemeBg
              ? "text-slate-900 dark:text-slate-100"
              : "text-slate-800 dark:text-slate-200"
          }`}>
            {browserTitle}
          </span>
          {profileName && profileName !== "Default" && (
            <span className={`text-[10px] font-medium truncate max-w-[120px] px-1.5 py-0.5 rounded ${
              isDark
                ? "text-white/80 bg-white/15"
                : hasThemeBg
                ? "text-slate-600 dark:text-slate-300 bg-white/40 dark:bg-white/10"
                : "text-slate-400 dark:text-slate-500"
            }`}>
              ({profileName})
            </span>
          )}
        </div>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
          isDark
            ? "text-white/90 bg-white/20 border border-white/20"
            : hasThemeBg
            ? "text-slate-700 dark:text-slate-200 bg-white/50 dark:bg-black/20 border border-white/40 dark:border-white/10 shadow-xs"
            : "text-slate-500 dark:text-slate-400 bg-slate-200/60 dark:bg-slate-800/60"
        }`}>
          {tabCount} {tabCount === 1 ? "tab" : "tabs"}
        </span>
      </div>

      {/* Search Input */}
      {!externalSearch && (
        <div className="relative mb-3 w-full">
          <Search className={`w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 ${
            isDark ? "text-white/60" : hasThemeBg ? "text-slate-500" : "text-slate-400"
          }`} />
          <input
            type="text"
            value={internalSearch}
            onChange={(e) => setInternalSearch(e.target.value)}
            placeholder="Search tabs..."
            className={`w-full pl-8 pr-7 py-1.5 text-xs rounded-xl focus:outline-hidden focus:ring-1.5 transition-all ${
              isDark
                ? "bg-white/15 border border-white/20 text-white placeholder:text-white/60 focus:bg-white/25 focus:ring-white/40"
                : hasThemeBg
                ? "bg-white/55 backdrop-blur-xs border border-white/50 text-slate-800 placeholder:text-slate-500/70 focus:bg-white/80 focus:border-white/80 focus:ring-black/10"
                : "bg-white/70 dark:bg-slate-950/70 border border-slate-200/80 dark:border-slate-800 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:ring-cyan-500"
            }`}
          />
          {internalSearch && (
            <button
              onClick={() => setInternalSearch("")}
              className={`absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 ${
                isDark ? "text-white/60 hover:text-white" : "text-slate-400 hover:text-slate-600"
              }`}
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {/* 1. Clean Workspace Label */}
      {workspaceTitle && (
        <div className="px-3.5 pt-1 pb-1 select-none">
          <span className={`text-xs sm:text-[13px] font-semibold tracking-tight flex items-center gap-1.5 ${
            isDark ? "text-white/90" : "text-slate-500/80 dark:text-slate-400/80"
          }`}>
            {currentWorkspaceItem.icon && <span className="text-sm">{currentWorkspaceItem.icon}</span>}
            <span>{workspaceTitle}</span>
          </span>
        </div>
      )}

      {/* 2. Tab and Folder List */}
      <div className="flex-1 w-full space-y-1 my-1">
        {filteredItems.length === 0 ? (
          <div className={`py-6 text-center text-xs ${
            isDark ? "text-white/70" : "text-slate-400"
          }`}>
            No tabs in this workspace
          </div>
        ) : (
          filteredItems.map((item, idx) => {
            const isCurrentPinned = isPinnedNode(item);
            const nextItem = filteredItems[idx + 1];
            const isNextUnpinned = nextItem ? !isPinnedNode(nextItem) : false;
            const showDivider = isCurrentPinned && isNextUnpinned;

            return (
              <React.Fragment key={item.id || `item_${idx}`}>
                {renderItem(item, idx)}
                {showDivider && (
                  <div className="my-2 border-b border-black/20 mx-1.5" />
                )}
              </React.Fragment>
            );
          })
        )}

      </div>
    </div>
  );
}
