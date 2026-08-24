import React, { useMemo } from "react";
import type { BrowserTreeNode, SyncStats } from "@synctable/ui";
import {
  DeviceCard,
  countTabs,
  pruneEmptyNodes,
} from "@synctable/ui";

export interface LocalTabProps {
  stats: SyncStats | null;
  trees: BrowserTreeNode[];
  syncing: boolean;
  onSync: () => void;
  onOpenExternal?: (url: string) => void;
  deviceName?: string;
  searchQuery?: string;
  selectedBrowser?: string;
}

export function LocalTab({
  stats,
  trees,
  syncing,
  onSync,
  onOpenExternal,
  deviceName,
  searchQuery = "",
  selectedBrowser = "all",
}: LocalTabProps) {
  // Compute non-empty valid trees
  const validTrees = useMemo(() => {
    return trees
      .map(pruneEmptyNodes)
      .filter((node): node is BrowserTreeNode => node !== null && countTabs(node) > 0);
  }, [trees]);

  // Main Content Area
  if (validTrees.length === 0) {
    return (
      <div className="py-16 px-8 bg-surface-container-lowest rounded-lg border border-surface-variant text-center max-w-lg mx-auto space-y-6 shadow-sm my-6">
        <div className="w-14 h-14 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center mx-auto text-2xl">
          <span className="material-symbols-outlined text-[28px]">laptop_mac</span>
        </div>
        <div className="space-y-1.5">
          <h3 className="font-title-md text-title-md font-bold text-on-surface">
            No Browser Snapshots Yet
          </h3>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Click &quot;Sync Now&quot; to poll and parse your local browser trees.
          </p>
        </div>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={onSync}
            disabled={syncing}
            className="flex items-center gap-2 px-6 h-12 rounded-full bg-primary text-on-primary hover:bg-surface-tint disabled:opacity-50 font-label-md text-label-md transition-colors shadow-sm cursor-pointer"
          >
            <span className={`material-symbols-outlined text-[18px] ${syncing ? "animate-spin" : ""}`}>
              sync
            </span>
            <span>{syncing ? "Syncing..." : "Sync Now"}</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <DeviceCard
      deviceName={deviceName || "Current Device"}
      badge="Local"
      lastUpdated={stats?.lastSyncTime}
      lastUpdatedLabel="Last snapshot"
      trees={validTrees}
      selectedBrowser={selectedBrowser}
      searchQuery={searchQuery}
      onOpenExternal={onOpenExternal}
      emptyMessage="No tree snapshots match the current filters on this device."
    />
  );
}
