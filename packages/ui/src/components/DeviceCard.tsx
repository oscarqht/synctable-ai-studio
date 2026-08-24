"use client";
import { usePersistentCollapse } from "../hooks/usePersistentCollapse";

import React, { useMemo, useState, useEffect } from "react";
import type { BrowserTreeNode, WorkspaceItem } from "../types";
import {
  countTabs,
  countWorkspaces,
  extractWorkspacesFromRoot,
  formatRelativeTime,
  getBrowserIconPath,
  getNodeLastUpdateTime,
} from "../utils/treeUtils";
import { ZenSidebarView } from "./zen/ZenSidebarView";

export interface DeviceCardProps {
  deviceName: string;
  badge?: string;
  lastUpdated?: string | null;
  lastUpdatedLabel?: string;
  trees: BrowserTreeNode[];
  selectedBrowser?: string;
  searchQuery?: string;
  onOpenExternal?: (url: string) => void;
  emptyMessage?: string;
}

function BrowserSection({
  deviceName,
  browserName,
  browserTrees,
  browserLastUpdateTime,
  searchQuery,
  onOpenExternal,
}: {
  deviceName: string;
  browserName: string;
  browserTrees: BrowserTreeNode[];
  browserLastUpdateTime: string;
  searchQuery: string;
  onOpenExternal?: (url: string) => void;
}) {
  const collapseKey = `synctable_collapse_browser_${deviceName}_${browserName}`;
  const { isCollapsed: isSectionCollapsed, toggle: toggleSection, mounted: sectionMounted } = usePersistentCollapse(collapseKey, false);

  const workspaces = useMemo(() => {
    return browserTrees.flatMap(extractWorkspacesFromRoot);
  }, [browserTrees]);

  const [workspaceCollapseMap, setWorkspaceCollapseMap] = useState<Record<string, boolean>>({});
  const [workspacesMounted, setWorkspacesMounted] = useState(false);

  useEffect(() => {
    setWorkspacesMounted(true);
    const initialMap: Record<string, boolean> = {};
    for (const ws of workspaces) {
      const key = `synctable_collapse_workspace_${ws.id}`;
      try {
        const stored = localStorage.getItem(key);
        if (stored !== null) {
          initialMap[ws.id] = stored === "true";
        }
      } catch {
        // Ignore localStorage read errors
      }
    }
    setWorkspaceCollapseMap(initialMap);
  }, [workspaces]);

  const toggleWorkspace = (id: string) => {
    setWorkspaceCollapseMap((prev) => {
      const currentState = prev[id] ?? false;
      const nextState = !currentState;
      const key = `synctable_collapse_workspace_${id}`;
      try {
        localStorage.setItem(key, String(nextState));
      } catch (e) {
        console.warn("Failed to save workspace collapse to localStorage", e);
      }
      return {
        ...prev,
        [id]: nextState,
      };
    });
  };

  const originalIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    workspaces.forEach((ws, idx) => {
      map.set(ws.id, idx);
    });
    return map;
  }, [workspaces]);

  const { expandedWorkspaces, collapsedWorkspaces } = useMemo(() => {
    const expanded: WorkspaceItem[] = [];
    const collapsed: WorkspaceItem[] = [];

    for (const ws of workspaces) {
      const isWsCollapsed = workspacesMounted ? (workspaceCollapseMap[ws.id] ?? false) : false;
      if (isWsCollapsed) {
        collapsed.push(ws);
      } else {
        expanded.push(ws);
      }
    }

    // Sort collapsed browser cards according to their last update time (DESC)
    collapsed.sort((a, b) => {
      const timeA = getNodeLastUpdateTime(a.node);
      const timeB = getNodeLastUpdateTime(b.node);
      if (timeA && timeB) {
        return timeB.localeCompare(timeA);
      }
      if (timeA) return -1;
      if (timeB) return 1;
      return a.workspaceTitle.localeCompare(b.workspaceTitle);
    });

    return { expandedWorkspaces: expanded, collapsedWorkspaces: collapsed };
  }, [workspaces, workspaceCollapseMap, workspacesMounted]);

  if (workspaces.length === 0) return null;

  return (
    <div className="space-y-6">
      {/* Section Title */}
      <div
        className="flex justify-between items-end border-b border-surface-container-high pb-4 cursor-pointer select-none group"
        onClick={toggleSection}
      >
        <div className="flex items-center gap-2">
          <span
            className={`material-symbols-outlined text-on-surface-variant transition-transform duration-200 ${!isSectionCollapsed ? 'rotate-90' : ''}`}
          >
            chevron_right
          </span>
          <img
            src={getBrowserIconPath(browserName)}
            alt={browserName}
            className="w-5 h-5 object-contain"
            onError={(e) => {
              // Hide the image if the browser icon is not found
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
          <h3 className="font-title-md text-title-md font-bold uppercase text-on-surface group-hover:text-primary transition-colors">
            {browserName}
          </h3>
        </div>
        {browserLastUpdateTime && (
          <span className="font-body-sm text-body-sm text-outline">
            Updated {formatRelativeTime(browserLastUpdateTime)}
          </span>
        )}
      </div>

      {/* Workspace Cards Grid */}
      {(!sectionMounted || !isSectionCollapsed) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 min-[1500px]:grid-cols-5 2xl:grid-cols-5 gap-gutter items-start">
          {/* Expanded browser cards */}
          {expandedWorkspaces.map((wsItem) => (
            <ZenSidebarView
              key={wsItem.id}
              workspaceItem={wsItem}
              cardIndex={originalIndexMap.get(wsItem.id) ?? 0}
              searchQuery={searchQuery}
              onOpenExternal={onOpenExternal}
              isCollapsed={false}
              onToggleCollapse={() => toggleWorkspace(wsItem.id)}
            />
          ))}

          {/* Stacked Collapsed Browser Cards Column (same width as normal browser card) */}
          {collapsedWorkspaces.length > 0 && (
            <div className="flex flex-col gap-3 min-w-0 w-full">
              {collapsedWorkspaces.map((wsItem) => (
                <ZenSidebarView
                  key={wsItem.id}
                  workspaceItem={wsItem}
                  cardIndex={originalIndexMap.get(wsItem.id) ?? 0}
                  searchQuery={searchQuery}
                  onOpenExternal={onOpenExternal}
                  isCollapsed={true}
                  onToggleCollapse={() => toggleWorkspace(wsItem.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function DeviceCard({
  deviceName,
  badge,
  lastUpdated,
  lastUpdatedLabel = "Last synced",
  trees,
  selectedBrowser = "all",
  searchQuery = "",
  onOpenExternal,
  emptyMessage,
}: DeviceCardProps) {
  const collapseKey = `synctable_collapse_device_${deviceName}`;
  const { isCollapsed, toggle, mounted } = usePersistentCollapse(collapseKey, false);

  const filteredRoots = useMemo(() => {
    return trees.filter((node) => {
      if (countTabs(node) === 0) return false;
      if (selectedBrowser && selectedBrowser !== "all" && node.browser_name) {
        return node.browser_name.toLowerCase() === selectedBrowser.toLowerCase();
      }
      return true;
    });
  }, [trees, selectedBrowser]);

  const deviceTabsCount = useMemo(() => {
    return filteredRoots.reduce((acc, r) => acc + countTabs(r), 0);
  }, [filteredRoots]);

  const deviceWorkspacesCount = useMemo(() => {
    return filteredRoots.reduce((acc, r) => acc + countWorkspaces(r), 0);
  }, [filteredRoots]);

  const getBrowserLastUpdateTime = (nodes: BrowserTreeNode[]): string => {
    let latest = "";
    const walk = (node: BrowserTreeNode) => {
      const time = node.lastUpdateTime || node.snapshot_time || "";
      if (time > latest) latest = time;
      if (node.children) {
        node.children.forEach(walk);
      }
    };
    nodes.forEach(walk);
    return latest;
  };

  const browserGroups = useMemo(() => {
    const map = new Map<string, BrowserTreeNode[]>();
    for (const root of filteredRoots) {
      const bName = (root.browser_name || "browser").toLowerCase();
      if (!map.has(bName)) {
        map.set(bName, []);
      }
      map.get(bName)!.push(root);
    }
    const entries = Array.from(map.entries());
    return entries.sort(([nameA, treesA], [nameB, treesB]) => {
      const timeA = getBrowserLastUpdateTime(treesA);
      const timeB = getBrowserLastUpdateTime(treesB);
      if (timeA && timeB) {
        return timeB.localeCompare(timeA);
      }
      if (timeA) return -1;
      if (timeB) return 1;
      return nameA.localeCompare(nameB);
    });
  }, [filteredRoots]);

  const deviceBrowsers = useMemo(() => {
    const browserTimeMap = new Map<string, string>();
    for (const root of filteredRoots) {
      const bName = (root.browser_name || "").toLowerCase();
      if (bName) {
        const time = root.lastUpdateTime || root.snapshot_time || "";
        const existing = browserTimeMap.get(bName) || "";
        if (time > existing) {
          browserTimeMap.set(bName, time);
        }
      }
    }
    return Array.from(browserTimeMap.keys()).sort((a, b) => {
      const timeA = browserTimeMap.get(a) || "";
      const timeB = browserTimeMap.get(b) || "";
      if (timeA && timeB) {
        return timeB.localeCompare(timeA);
      }
      if (timeA) return -1;
      if (timeB) return 1;
      return a.localeCompare(b);
    });
  }, [filteredRoots]);

  const resolvedEmptyMessage =
    emptyMessage ||
    (badge
      ? `No tree snapshots match the current filters inside ${badge}.`
      : "No tree snapshots match the current filters.");

  return (
    <div className="flex flex-col gap-8 w-full">
      {/* Dashboard Header */}
      <div className="flex flex-col gap-2">
        <div
          className="flex items-center gap-3 text-on-surface-variant flex-wrap cursor-pointer select-none group"
          onClick={toggle}
        >
          <span
            className={`material-symbols-outlined text-on-surface-variant transition-transform duration-200 ${!isCollapsed ? 'rotate-90' : ''}`}
          >
            chevron_right
          </span>
          <span className="material-symbols-outlined bg-surface-container-high text-on-surface p-2 rounded-lg group-hover:bg-primary-container group-hover:text-on-primary-container transition-colors">
            laptop_mac
          </span>
          <h2 className="font-headline-lg text-headline-lg font-bold text-on-surface group-hover:text-primary transition-colors">
            {deviceName}
          </h2>
          {badge && (
            <span className="px-3 py-1 rounded bg-surface-container-high font-label-md text-label-md text-on-surface-variant font-mono">
              {badge}
            </span>
          )}
          {deviceBrowsers.length > 0 && (
            <div className="ml-auto flex items-center gap-2">
              {deviceBrowsers.map((b) => (
                <span
                  key={b}
                  className="px-3 py-1 rounded-full border border-outline-variant font-label-md text-label-md font-bold uppercase text-on-surface"
                >
                  {b}
                </span>
              ))}
            </div>
          )}
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          {lastUpdatedLabel} {lastUpdated ? formatRelativeTime(lastUpdated) : "Never"} · {deviceTabsCount} {deviceTabsCount === 1 ? "tab" : "tabs"} · {deviceWorkspacesCount} {deviceWorkspacesCount === 1 ? "workspace" : "workspaces"}
        </p>
      </div>

      {/* Content Area: Workspaces per Browser */}
      {(!mounted || !isCollapsed) && (
        filteredRoots.length === 0 ? (
          <div className="py-12 px-6 bg-surface-container-lowest border border-surface-variant rounded-lg text-center font-body-sm text-body-sm text-on-surface-variant">
            {resolvedEmptyMessage}
          </div>
        ) : (
          <div className="space-y-10">
            {browserGroups.map(([browserName, browserTrees]) => {
              const browserLastUpdateTime = getBrowserLastUpdateTime(browserTrees);
              return (
                <BrowserSection
                  key={browserName}
                  deviceName={deviceName}
                  browserName={browserName}
                  browserTrees={browserTrees}
                  browserLastUpdateTime={browserLastUpdateTime}
                  searchQuery={searchQuery}
                  onOpenExternal={onOpenExternal}
                />
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
