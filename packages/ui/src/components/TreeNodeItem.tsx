"use client";

import React, { useState } from "react";
import {
  Folder,
  Globe,
  Layers,
  Layout,
  ExternalLink,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Pin,
  Columns,
  Compass,
} from "lucide-react";
import type { BrowserTreeNode, NodeType } from "../types";
import { countTabs, getAllTabUrls, isDarkColor, getDomain, getFaviconUrl, getWorkspaceGradientStyle } from "../utils/treeUtils";
import { ZenFolderIcon } from "./zen/ZenFolderIcon";
import { ZenSplitViewItem } from "./zen/ZenSplitViewItem";

export interface TreeNodeItemProps {
  node: BrowserTreeNode;
  searchQuery?: string;
  depth?: number;
  browserFilter?: string;
  nodeTypeFilter?: string;
  defaultExpanded?: boolean;
  isSingleColumn?: boolean;
  alwaysShowActions?: boolean;
  onOpenExternal?: (url: string) => void;
}

function getNodeBadge(nodeType: NodeType) {
  switch (nodeType) {
    case "workspace":
      return {
        label: "Space",
        className:
          "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800",
        icon: Layers,
      };
    case "folder":
      return {
        label: "Folder",
        className:
          "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800",
        icon: Folder,
      };
    case "window":
      return {
        label: "Window",
        className:
          "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
        icon: Layout,
      };
    case "split_view":
      return {
        label: "Split",
        className:
          "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/60 dark:text-cyan-300 dark:border-cyan-800",
        icon: Columns,
      };
    case "pinned_tab":
      return {
        label: "Pinned",
        className:
          "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800",
        icon: Pin,
      };
    case "tab":
      return {
        label: "Tab",
        className:
          "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800",
        icon: Globe,
      };
    case "root":
    default:
      return {
        label: "Browser",
        className:
          "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800",
        icon: Compass,
      };
  }
}

function getBrowserBadge(browserName: string) {
  const normalized = (browserName || "").toLowerCase();
  switch (normalized) {
    case "zen":
      return {
        label: "Zen",
        bg: "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/60 dark:text-cyan-300 dark:border-cyan-800",
      };
    case "arc":
      return {
        label: "Arc",
        bg: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800",
      };
    case "chrome":
      return {
        label: "Chrome",
        bg: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800",
      };
    case "firefox":
      return {
        label: "Firefox",
        bg: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-800",
      };
    case "vivaldi":
      return {
        label: "Vivaldi",
        bg: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800",
      };
    case "dia":
      return {
        label: "Dia",
        bg: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800",
      };
    case "safari":
      return {
        label: "Safari",
        bg: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800",
      };
    case "edge":
      return {
        label: "Edge",
        bg: "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-800",
      };
    default:
      return {
        label: browserName || "Browser",
        bg: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
      };
  }
}

function hasMatchRecursive(node: BrowserTreeNode, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const match =
    (node.title && node.title.toLowerCase().includes(q)) ||
    (node.url && node.url.toLowerCase().includes(q)) ||
    (node.profile_name && node.profile_name.toLowerCase().includes(q));
  if (match) return true;
  if (node.children && Array.isArray(node.children)) {
    return node.children.some((child) => hasMatchRecursive(child, query));
  }
  return false;
}

export function TreeNodeItem({
  node,
  searchQuery = "",
  depth = 0,
  browserFilter = "all",
  nodeTypeFilter = "all",
  defaultExpanded = true,
  isSingleColumn = false,
  alwaysShowActions = false,
  onOpenExternal,
}: TreeNodeItemProps) {
  const [expanded, setExpanded] = useState<boolean>(defaultExpanded);
  const [copied, setCopied] = useState(false);

  const nodeUrls = React.useMemo(() => {
    if (!node) return [];
    if (node.url) return [node.url];
    return getAllTabUrls(node);
  }, [node]);

  React.useEffect(() => {
    setExpanded(defaultExpanded);
  }, [defaultExpanded]);

  // Ignore empty tab groups / spaces / windows / containers
  if (countTabs(node) === 0) {
    return null;
  }

  // Filter by browser if top-level root
  if (
    browserFilter !== "all" &&
    node.browser_name &&
    node.browser_name.toLowerCase() !== browserFilter.toLowerCase() &&
    depth === 0
  ) {
    return null;
  }

  // Filter by search query
  if (searchQuery && !hasMatchRecursive(node, searchQuery)) {
    return null;
  }

  // Filter by node type (only filter leaves if tabs/workspaces selected)
  if (nodeTypeFilter === "tabs") {
    const isTab = node.node_type === "tab" || node.node_type === "pinned_tab";
    const hasTabChildren =
      node.children &&
      node.children.some(
        (c) =>
          c.node_type === "tab" ||
          c.node_type === "pinned_tab" ||
          hasMatchRecursive(c, "")
      );
    if (!isTab && !hasTabChildren && depth > 0) {
      return null;
    }
  }

  // Special rendering for Split View nodes in the hierarchy
  if (node.node_type === "split_view") {
    return (
      <div style={{ paddingLeft: `${Math.max(depth * 16 + 4, 4)}px` }}>
        <ZenSplitViewItem
          node={node}
          isSingleColumn={isSingleColumn}
          alwaysShowActions={alwaysShowActions}
          onOpenExternal={onOpenExternal}
        />
      </div>
    );
  }

  const hasChildren = Boolean(node.children && node.children.length > 0);
  const badge = getNodeBadge(node.node_type);
  const BadgeIcon = badge.icon;
  const browserBadge = getBrowserBadge(node.browser_name);
  const favicon = getFaviconUrl(node.url);
  const domain = getDomain(node.url);

  const handleCopyUrl = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (nodeUrls.length > 0) {
      navigator.clipboard.writeText(nodeUrls.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  };

  const handleOpenLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (nodeUrls.length > 0) {
      if (onOpenExternal) {
        nodeUrls.forEach((url) => onOpenExternal(url));
      } else {
        nodeUrls.forEach((url) => {
          window.open(url, "_blank", "noopener,noreferrer");
        });
      }
    }
  };

  const isRoot = node.node_type === "root" || depth === 0;
  const isFolder = node.node_type === "folder";
  const isWorkspace = node.node_type === "workspace";

  const isDark = Boolean(
    isWorkspace &&
      ((node.theme_colors &&
        node.theme_colors.length > 0 &&
        isDarkColor(node.theme_colors[0])) ||
        (node.theme_color && isDarkColor(node.theme_color)))
  );

  const workspaceBgStyle: React.CSSProperties | undefined = isWorkspace
    ? getWorkspaceGradientStyle(node.theme_colors, node.theme_color, isDark)
    : undefined;

  return (
    <div className="flex flex-col select-none group/node">
      {/* Node Row */}
      <div
        onClick={() => hasChildren && setExpanded(!expanded)}
        style={{
          paddingLeft: `${Math.max(depth * 16 + 8, 8)}px`,
          ...workspaceBgStyle,
        }}
        className={`flex items-center gap-2 py-1.5 px-2.5 min-h-[32px] rounded-xl transition-all duration-150 active:scale-[0.99] ${
          hasChildren ? "cursor-pointer" : "cursor-default"
        } ${
          isRoot
            ? "bg-slate-100/90 dark:bg-slate-800/90 hover:bg-slate-200/70 border border-slate-200/90 dark:border-slate-700/90 my-1 shadow-xs font-semibold"
            : isWorkspace
            ? workspaceBgStyle
              ? isDark
                ? "border border-white/20 text-white shadow-xs my-0.5"
                : "border border-black/10 text-slate-900 shadow-xs my-0.5"
              : "bg-purple-50/50 dark:bg-purple-950/20 hover:bg-purple-100/60 dark:hover:bg-purple-900/30 border border-purple-200/60 dark:border-purple-800/60 my-0.5"
            : isFolder
            ? "hover:bg-amber-50/50 dark:hover:bg-amber-950/20 border border-transparent hover:border-amber-200/50"
            : "hover:bg-slate-100/70 dark:hover:bg-slate-800/60 border border-transparent hover:border-slate-200/60"
        }`}
      >
        {/* Expand / Collapse Chevron */}
        <div
          className={`w-4 h-4 flex items-center justify-center shrink-0 transition-colors ${
            isDark
              ? "text-white/70 group-hover/node:text-white"
              : "text-slate-400 group-hover/node:text-slate-600 dark:group-hover/node:text-slate-200"
          }`}
        >
          {hasChildren ? (
            expanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )
          ) : (
            <span
              className={`w-1 h-1 rounded-full ml-1 ${
                isDark ? "bg-white/40" : "bg-slate-300 dark:bg-slate-600"
              }`}
            />
          )}
        </div>

        {/* Node Icon / Zen 3D Folder / Badge */}
        {isRoot ? (
          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border shadow-xs ${browserBadge.bg}`}
            >
              {browserBadge.label}
            </span>
            {node.profile_name && (
              <span className="text-[11px] font-medium text-slate-500 bg-slate-200/70 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                {node.profile_name}
              </span>
            )}
          </div>
        ) : isFolder ? (
          /* Zen Signature 3D Folder Flap / Custom Emoji */
          <div className="flex items-center gap-1.5 shrink-0">
            {node.icon ? (
              <span
                className="text-sm shrink-0 leading-none select-none"
                style={{
                  fontFamily:
                    '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", "Segoe UI Symbol", sans-serif',
                }}
              >
                {node.icon}
              </span>
            ) : (
              <ZenFolderIcon
                isOpen={expanded}
                size={20}
                color={
                  node.theme_color ||
                  (node.theme_colors && node.theme_colors.length > 0
                    ? node.theme_colors[0]
                    : undefined)
                }
              />
            )}
            <span
              style={
                node.theme_color
                  ? {
                      backgroundColor: `${node.theme_color}18`,
                      borderColor: `${node.theme_color}50`,
                      color: node.theme_color,
                    }
                  : undefined
              }
              className="text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.2 rounded border border-amber-200 dark:border-amber-800 flex items-center gap-1"
            >
              <span>Folder</span>
              {node.theme_color && (
                <span
                  className="w-1.5 h-1.5 rounded-full inline-block"
                  style={{ backgroundColor: node.theme_color }}
                />
              )}
            </span>
          </div>
        ) : isWorkspace ? (
          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${
                isDark
                  ? "text-white bg-white/20 border-white/30"
                  : "text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-950/60 border-purple-200 dark:border-purple-800"
              }`}
            >
              Space
            </span>
            {node.icon && (
              <span
                className="text-xs select-none"
                style={{
                  fontFamily:
                    '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", "Segoe UI Symbol", sans-serif',
                }}
              >
                {node.icon}
              </span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1 shrink-0">
            {favicon ? (
              <img
                src={favicon}
                alt=""
                className="w-3.5 h-3.5 object-contain rounded shrink-0 mr-0.5"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = "none";
                }}
              />
            ) : null}
            <span
              className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md border ${badge.className}`}
            >
              <BadgeIcon className="w-2.5 h-2.5" />
              <span>{badge.label}</span>
            </span>
          </div>
        )}

        {/* Title */}
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span
            className={`text-xs truncate ${
              isRoot
                ? "text-slate-900 dark:text-white font-semibold"
                : isWorkspace
                ? isDark
                  ? "text-white font-semibold"
                  : "text-slate-900 dark:text-slate-100 font-semibold"
                : isFolder
                ? "text-slate-900 dark:text-slate-100 font-semibold"
                : "text-slate-700 dark:text-slate-300 font-normal"
            }`}
            title={node.title || "(Untitled)"}
          >
            {node.title || (node.url ? domain : "(Untitled)")}
          </span>

          {/* Child count */}
          {hasChildren && (
            <span className="text-[10px] font-medium text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.2 rounded-full">
              {node.children?.length}
            </span>
          )}

          {/* Hostname / Domain */}
          {node.url && (
            <span className="hidden sm:inline-block text-[10px] text-slate-400 hover:text-cyan-600 transition-colors truncate max-w-[200px]">
              {domain}
            </span>
          )}
        </div>

        {/* Actions for Tab / Workspace / Folder Nodes */}
        {nodeUrls.length > 0 && (
          <div
            className={`${
              isSingleColumn || alwaysShowActions
                ? "flex"
                : "flex md:hidden md:group-hover/node:flex"
            } items-center gap-1 shrink-0 ml-2 -my-1`}
          >
            <button
              onClick={handleCopyUrl}
              title={
                node.url
                  ? "Copy URL"
                  : `Copy all ${nodeUrls.length} tab URLs`
              }
              className="w-5 h-5 flex items-center justify-center rounded-md text-slate-400 hover:text-cyan-700 hover:bg-cyan-50 dark:hover:bg-slate-800 border border-transparent hover:border-cyan-200 transition-all"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              onClick={handleOpenLink}
              title={
                node.url
                  ? "Open tab in browser"
                  : `Open all ${nodeUrls.length} tabs in browser`
              }
              className="w-5 h-5 flex items-center justify-center rounded-md text-slate-400 hover:text-indigo-700 hover:bg-indigo-50 dark:hover:bg-slate-800 border border-transparent hover:border-indigo-200 transition-all"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Children Nodes (Recursive) */}
      {hasChildren && expanded && (
        <div
          style={
            isFolder && node.theme_color
              ? { borderLeftColor: `${node.theme_color}60` }
              : undefined
          }
          className="flex flex-col border-l border-slate-200/70 dark:border-slate-800 ml-4 pl-1 space-y-0.5"
        >
          {node.children!
            .filter((child) => countTabs(child) > 0)
            .map((child) => (
              <TreeNodeItem
                key={
                  child.id ||
                  `${child.node_type}_${child.sort_order}_${child.title}`
                }
                node={child}
                searchQuery={searchQuery}
                depth={depth + 1}
                browserFilter={browserFilter}
                nodeTypeFilter={nodeTypeFilter}
                defaultExpanded={defaultExpanded}
                isSingleColumn={isSingleColumn}
                alwaysShowActions={alwaysShowActions}
                onOpenExternal={onOpenExternal}
              />
            ))}
        </div>
      )}
    </div>
  );
}
