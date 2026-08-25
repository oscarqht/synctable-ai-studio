"use client";
import { usePersistentCollapse } from "../../hooks/usePersistentCollapse";

import React, { useState, useMemo } from "react";
import type { BrowserTreeNode, WorkspaceItem } from "../../types";
import {
  countTabs,
  getAllTabUrls,
  pruneEmptyNodes,
  extractWorkspacesFromRoot,
  isDarkColor,
  getWorkspaceGradientStyle,
} from "../../utils/treeUtils";
import { ZenFolderItem } from "./ZenFolderItem";
import { ZenSplitViewItem } from "./ZenSplitViewItem";
import { ZenTabItem } from "./ZenTabItem";

export interface ZenSidebarViewProps {
  workspaceItem?: WorkspaceItem;
  rootNode?: BrowserTreeNode;
  searchQuery?: string;
  isSingleColumn?: boolean;
  alwaysShowActions?: boolean;
  cardIndex?: number;
  onOpenExternal?: (url: string) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function ZenSidebarView({
  workspaceItem,
  rootNode: rawRootNode,
  searchQuery: externalSearch = "",
  isSingleColumn = false,
  alwaysShowActions = false,
  cardIndex = 0,
  onOpenExternal,
  isCollapsed: controlledIsCollapsed,
  onToggleCollapse,
}: ZenSidebarViewProps) {
  const [internalSearch, setInternalSearch] = useState("");
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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

  const collapseKey = `synctable_collapse_workspace_${currentWorkspaceItem?.id || 'unknown'}`;
  const internalCollapse = usePersistentCollapse(collapseKey, false);

  const isControlled = controlledIsCollapsed !== undefined;
  const isCollapsed = isControlled ? controlledIsCollapsed : internalCollapse.isCollapsed;
  const mounted = isControlled ? true : internalCollapse.mounted;
  const toggle = () => {
    if (onToggleCollapse) {
      onToggleCollapse();
    } else {
      internalCollapse.toggle();
    }
  };

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

  const hasExplicitColor = Boolean(
    (currentWorkspaceItem?.themeColors &&
      currentWorkspaceItem.themeColors.length > 0) ||
      currentWorkspaceItem?.themeColor
  );

  // Archetype rotation when no custom hex color is specified
  const archetype = useMemo<"neutral" | "primary" | "secondary" | "tertiary">(() => {
    const archetypes: Array<"neutral" | "primary" | "secondary" | "tertiary"> = [
      "neutral",
      "primary",
      "secondary",
      "tertiary",
    ];
    if (typeof cardIndex === "number") {
      const positiveIndex = ((cardIndex % archetypes.length) + archetypes.length) % archetypes.length;
      return archetypes[positiveIndex];
    }
    const str = currentWorkspaceItem?.id || currentWorkspaceItem?.workspaceTitle || "default";
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return archetypes[Math.abs(hash) % archetypes.length];
  }, [cardIndex, currentWorkspaceItem?.id, currentWorkspaceItem?.workspaceTitle]);

  const isDark = Boolean(
    hasExplicitColor
      ? (currentWorkspaceItem?.themeColors &&
          currentWorkspaceItem.themeColors.length > 0 &&
          isDarkColor(currentWorkspaceItem.themeColors[0])) ||
        (currentWorkspaceItem?.themeColor &&
          isDarkColor(currentWorkspaceItem.themeColor))
      : false
  );

  const handleSelectTab = (tab: BrowserTreeNode) => {
    setActiveTabId(tab.id || null);
  };

  const handleCopyAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!workspaceNode) return;
    const urls = getAllTabUrls(workspaceNode);
    if (urls.length > 0) {
      navigator.clipboard.writeText(urls.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  };

  const handleOpenAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!workspaceNode) return;
    const urls = getAllTabUrls(workspaceNode);
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

  const isCardDark = hasExplicitColor ? isDark : archetype === "neutral" ? false : false;

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

  const { browserTitle, workspaceTitle, tabCount } =
    currentWorkspaceItem;

  const displayTitle =
    workspaceTitle && workspaceTitle !== "Workspace" && workspaceTitle !== "Main Window"
      ? workspaceTitle
      : browserTitle;

  const customBgStyle = hasExplicitColor
    ? getWorkspaceGradientStyle(
        currentWorkspaceItem.themeColors,
        currentWorkspaceItem.themeColor,
        isDark
      )
    : undefined;

  // Resolve card container styling
  let containerClasses = "";
  let badgeClasses = "";
  let searchInputClasses = "";
  let headerActionClasses = "";

  const padClasses = isCollapsed ? "p-3.5 sm:p-4 gap-0" : "p-6 gap-6";

  if (hasExplicitColor) {
    containerClasses = `rounded-lg ${padClasses} flex flex-col shadow-sm hover:shadow-md transition-all duration-300 border ${
      isDark
        ? "border-white/10 text-[#ffffff]"
        : "border-black/[0.08] text-[#191c1b]"
    }`;
    badgeClasses = isDark
      ? "bg-white/30 text-[#ffffff]"
      : "bg-black/10 font-label-md text-label-md text-[#404945]";
    searchInputClasses = isDark
      ? "bg-white/20 text-[#ffffff] placeholder:text-white/70 focus:ring-white"
      : "bg-black/5 text-[#191c1b] placeholder:text-black/60 focus:ring-black/20";
    headerActionClasses = isDark
      ? "text-white/80 hover:text-white"
      : "text-[#404945] hover:text-[#191c1b]";
  } else if (archetype === "primary") {
    containerClasses =
      `bg-[#7daf9c] text-[#0e4334] rounded-lg ${padClasses} flex flex-col shadow-sm hover:-translate-y-0.5 transition-transform duration-300`;
    badgeClasses = "bg-white/30 text-[#0e4334]";
    searchInputClasses =
      "bg-white/20 text-[#0e4334] placeholder:text-[#0e4334]/70 focus:ring-white";
    headerActionClasses = "text-[#0e4334]/80 hover:text-[#0e4334]";
  } else if (archetype === "secondary") {
    containerClasses =
      `bg-[#ffca98] text-[#7a532a] rounded-lg ${padClasses} flex flex-col shadow-sm hover:-translate-y-0.5 transition-transform duration-300`;
    badgeClasses = "bg-white/40 text-[#7a532a]";
    searchInputClasses =
      "bg-white/40 text-[#7a532a] placeholder:text-[#7a532a]/70 focus:ring-white";
    headerActionClasses = "text-[#7a532a]/80 hover:text-[#7a532a]";
  } else if (archetype === "tertiary") {
    containerClasses =
      `bg-[#d4958e] text-[#5b2e29] rounded-lg ${padClasses} flex flex-col shadow-sm hover:-translate-y-0.5 transition-transform duration-300`;
    badgeClasses = "bg-white/30 text-[#5b2e29]";
    searchInputClasses =
      "bg-white/20 text-[#5b2e29] placeholder:text-[#5b2e29]/70 focus:ring-white";
    headerActionClasses = "text-[#5b2e29]/80 hover:text-[#5b2e29]";
  } else {
    // Neutral archetype
    containerClasses =
      `bg-surface-container-lowest border border-surface-variant text-on-surface rounded-lg ${padClasses} flex flex-col shadow-sm hover:shadow-md transition-shadow duration-300`;
    badgeClasses = "bg-surface-container text-on-surface-variant";
    searchInputClasses =
      "bg-surface-container-low text-on-surface placeholder:text-on-surface-variant focus:ring-outline";
    headerActionClasses = "text-on-surface-variant hover:text-on-surface";
  }

  return (
    <div style={customBgStyle} className={containerClasses}>
      {/* Top Header */}
      <div
        className="flex justify-between items-center cursor-pointer select-none group"
        onClick={toggle}
      >
        <div className="flex items-center gap-2 min-w-0 pr-2">
          <span
            className={`material-symbols-outlined transition-transform duration-200 ${!isCollapsed ? 'rotate-90' : ''}`}
          >
            chevron_right
          </span>
          {currentWorkspaceItem.icon && (
            <span
              className="text-lg shrink-0 select-none"
              style={{
                fontFamily:
                  '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", "Segoe UI Symbol", sans-serif',
              }}
            >
              {currentWorkspaceItem.icon}
            </span>
          )}
          <h4 className="font-title-md text-title-md font-bold truncate">
            {displayTitle}
          </h4>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCopyAll}
            title="Copy all URLs in workspace"
            className={`${headerActionClasses} transition-opacity p-0.5 rounded`}
          >
            {copied ? (
              <span className="material-symbols-outlined text-[18px] text-primary">check</span>
            ) : (
              <span className="material-symbols-outlined text-[18px]">content_copy</span>
            )}
          </button>

          <button
            type="button"
            onClick={handleOpenAll}
            title="Open all tabs in browser"
            className={`${headerActionClasses} transition-opacity p-0.5 rounded`}
          >
            <span className="material-symbols-outlined text-[18px]">open_in_new</span>
          </button>
        </div>
      </div>

      {(!mounted || !isCollapsed) && (
        <>
          {/* Card Search Bar */}
      {!externalSearch && (
        <div className="relative">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 opacity-70 text-[18px] pointer-events-none">
            search
          </span>
          <input
            type="text"
            value={internalSearch}
            onChange={(e) => setInternalSearch(e.target.value)}
            placeholder="Search tabs..."
            className={`w-full border-none rounded-full py-2 pl-10 pr-7 font-body-sm text-body-sm focus:ring-1 focus:outline-none transition-all ${searchInputClasses}`}
          />
          {internalSearch && (
            <button
              type="button"
              onClick={() => setInternalSearch("")}
              className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 opacity-70 hover:opacity-100 text-[16px] p-0.5"
            >
              close
            </button>
          )}
        </div>
      )}

      {/* Tab and Folder List */}
      <div className="flex flex-col gap-1">
        {filteredItems.length === 0 ? (
          <div className="py-4 text-center text-xs opacity-60">
            No matching tabs
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
                  <div className="my-2 border-b border-current opacity-15 mx-1.5" />
                )}
              </React.Fragment>
            );
          })
        )}
      </div>
        </>
      )}
    </div>
  );
}
