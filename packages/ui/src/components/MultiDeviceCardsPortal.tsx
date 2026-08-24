"use client";

import React, { useState, useMemo, useEffect } from "react";
import type { SynctableSyncResponse, BrowserTreeNode } from "../types";
import { countTabs } from "../utils/treeUtils";
import { DeviceCard } from "./DeviceCard";


const DEVICE_FILTER_KEY = "synctable_device_filter";
const BROWSER_FILTER_KEY = "synctable_browser_filter";

export interface MultiDeviceCardsPortalProps {
  data: SynctableSyncResponse | null;
  loading?: boolean;
  onRefresh?: () => void;
  onOpenExternal?: (url: string) => void;
  onSaveToken?: (token: string) => Promise<void> | void;
  onSwitchToLocal?: () => void;
  hideToolbar?: boolean;
  searchQuery?: string;
  selectedBrowser?: string;
}

export function MultiDeviceCardsPortal({
  data,
  loading = false,
  onRefresh,
  onOpenExternal,
  onSaveToken,
  onSwitchToLocal,
  hideToolbar = false,
  searchQuery: externalSearchQuery,
  selectedBrowser: externalSelectedBrowser,
}: MultiDeviceCardsPortalProps) {
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("all");
  const [internalSelectedBrowser, setInternalSelectedBrowser] = useState<string>("all");

  // Load saved filters on mount
  useEffect(() => {
    try {
      const savedDevice = localStorage.getItem(DEVICE_FILTER_KEY);
      if (savedDevice) setSelectedDeviceId(savedDevice);

      const savedBrowser = localStorage.getItem(BROWSER_FILTER_KEY);
      if (savedBrowser) setInternalSelectedBrowser(savedBrowser);
    } catch (e) {
      console.warn("Failed to read filters from localStorage", e);
    }
  }, []);

  // Save filters on change
  useEffect(() => {
    try {
      localStorage.setItem(DEVICE_FILTER_KEY, selectedDeviceId);
    } catch (e) {
      console.warn("Failed to save device filter to localStorage", e);
    }
  }, [selectedDeviceId]);

  useEffect(() => {
    try {
      localStorage.setItem(BROWSER_FILTER_KEY, internalSelectedBrowser);
    } catch (e) {
      console.warn("Failed to save browser filter to localStorage", e);
    }
  }, [internalSelectedBrowser]);
  const [internalSearchQuery, setInternalSearchQuery] = useState<string>("");
  const [tokenInput, setTokenInput] = useState<string>("");
  const [savingToken, setSavingToken] = useState<boolean>(false);

  const searchQuery = externalSearchQuery !== undefined ? externalSearchQuery : internalSearchQuery;
  const selectedBrowser = externalSelectedBrowser !== undefined ? externalSelectedBrowser : internalSelectedBrowser;

  // Compute valid devices with non-empty tabs
  const validDevices = useMemo(() => {
    if (!data?.devices) return [];
    return data.devices.filter((dev) => {
      const tabs = dev.tree.reduce((acc, node) => acc + countTabs(node), 0);
      return tabs > 0;
    });
  }, [data]);

  // Compute available browsers across all valid devices, sorted by lastUpdateTime DESC
  const availableBrowsers = useMemo(() => {
    const browserTimeMap = new Map<string, string>();
    validDevices.forEach((dev) => {
      dev.tree.forEach((node) => {
        if (node.browser_name && countTabs(node) > 0) {
          const b = node.browser_name.toLowerCase();
          const time = node.lastUpdateTime || node.snapshot_time || "";
          const existing = browserTimeMap.get(b) || "";
          if (time > existing) {
            browserTimeMap.set(b, time);
          }
        }
      });
    });
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
  }, [validDevices]);

  // Filter visible devices based on device selection
  const visibleDevices = useMemo(() => {
    if (selectedDeviceId === "all") return validDevices;
    return validDevices.filter((d) => d.deviceId === selectedDeviceId);
  }, [validDevices, selectedDeviceId]);

  const handleTokenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = tokenInput.trim();
    if (!token || !onSaveToken) return;

    setSavingToken(true);
    try {
      await onSaveToken(token);
    } finally {
      setSavingToken(false);
    }
  };

  // 1. Loading State (when no data loaded yet or actively loading without existing data)
  if (!data || (loading && !data)) {
    return (
      <div className="py-20 flex flex-col items-center justify-center space-y-4 bg-surface-container-lowest rounded-lg border border-surface-variant my-6">
        <span className="material-symbols-outlined text-4xl animate-spin text-primary">
          sync
        </span>
        <div className="text-center space-y-1">
          <p className="font-title-md text-title-md font-bold text-on-surface">
            Locating Synctable collection & downloading snapshots...
          </p>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Querying Raindrop.io REST API and parsing JSON workspace files
          </p>
        </div>
      </div>
    );
  }

  // 2. Unauthenticated / Missing Token State
  if (data.authenticated === false && onSaveToken) {
    return (
      <div className="py-16 px-8 bg-surface-container-lowest rounded-lg border border-surface-variant text-center max-w-lg mx-auto space-y-6 shadow-sm my-6">
        <div className="w-14 h-14 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center mx-auto text-2xl">
          <span className="material-symbols-outlined text-[28px]">key</span>
        </div>
        <div className="space-y-1.5">
          <h3 className="font-title-md text-title-md font-bold text-on-surface">
            Raindrop.io API Token Required
          </h3>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            {data.error ||
              "Enter your Raindrop.io API Test Token below to connect and view browser workspaces from all your devices."}
          </p>
        </div>

        <form onSubmit={handleTokenSubmit} className="space-y-4 text-left pt-2 max-w-sm mx-auto">
          <div>
            <input
              type="password"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="Paste Raindrop API test token here"
              className="w-full h-12 px-4 rounded-full bg-surface-container text-on-surface border-none focus:ring-2 focus:ring-primary-container font-body-sm placeholder:text-on-surface-variant"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={savingToken || !tokenInput.trim()}
              className="flex-1 flex items-center justify-center gap-2 h-12 px-6 rounded-full bg-primary text-on-primary hover:bg-surface-tint disabled:opacity-50 font-label-md text-label-md transition-colors shadow-sm cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">
                {savingToken ? "sync" : "dataset"}
              </span>
              <span>Connect API Token</span>
            </button>
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={loading}
                className="w-12 h-12 rounded-full border border-outline-variant flex items-center justify-center text-on-surface-variant hover:bg-surface-container-low transition-colors"
              >
                <span className={`material-symbols-outlined text-[20px] ${loading ? "animate-spin" : ""}`}>
                  refresh
                </span>
              </button>
            )}
          </div>
          <p className="font-label-md text-label-md text-on-surface-variant text-center">
            Get your token from{" "}
            <a
              href="https://app.raindrop.io/settings/integrations"
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                if (onOpenExternal) {
                  e.preventDefault();
                  onOpenExternal("https://app.raindrop.io/settings/integrations");
                }
              }}
              className="text-primary font-bold hover:underline"
            >
              Raindrop.io Settings → Integrations
            </a>
          </p>
        </form>
      </div>
    );
  }

  // 3. Error State
  if ((data.authenticated === false && !onSaveToken) || (data.error && validDevices.length === 0 && !data.collection)) {
    return (
      <div className="py-16 px-8 bg-surface-container-lowest rounded-lg border border-error/30 text-center max-w-lg mx-auto space-y-6 shadow-sm my-6">
        <div className="w-14 h-14 rounded-full bg-error-container text-on-error-container flex items-center justify-center mx-auto">
          <span className="material-symbols-outlined text-[28px]">error</span>
        </div>
        <div className="space-y-1.5">
          <h3 className="font-title-md text-title-md font-bold text-on-surface">
            {data.authenticated === false ? "Authentication Required" : "Failed to Load Raindrop Snapshots"}
          </h3>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            {data.error || "Please log in again to access your Synctable workspaces."}
          </p>
        </div>
        {onRefresh && (
          <div className="flex justify-center pt-2">
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="flex items-center gap-2 px-6 h-12 rounded-full bg-primary text-on-primary hover:bg-surface-tint font-label-md text-label-md transition-colors shadow-sm"
            >
              <span className={`material-symbols-outlined text-[18px] ${loading ? "animate-spin" : ""}`}>
                refresh
              </span>
              <span>Try Again</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  // 4. No Synctable Collection Found State
  if (!data?.collection) {
    return (
      <div className="py-16 px-8 bg-surface-container-lowest rounded-lg border border-surface-variant text-center max-w-2xl mx-auto space-y-6 shadow-sm my-6">
        <div className="w-14 h-14 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center mx-auto">
          <span className="material-symbols-outlined text-[28px]">folder_open</span>
        </div>
        <div className="space-y-2">
          <h3 className="font-headline-lg text-headline-lg font-bold text-on-surface">
            No &quot;Synctable&quot; Collection Found in Raindrop
          </h3>
          <p className="font-body-sm text-body-sm text-on-surface-variant max-w-lg mx-auto">
            We could not find a collection named <strong>Synctable</strong> in your Raindrop
            account. Follow these quick steps to upload your first snapshot:
          </p>
        </div>

        {/* Instruction Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
          <div className="p-4 rounded-lg bg-surface-container-low border border-surface-variant space-y-1">
            <span className="font-label-md text-label-md font-bold text-primary px-2 py-0.5 rounded bg-primary-container/20">
              STEP 1
            </span>
            <h4 className="font-title-md text-title-md font-bold text-on-surface pt-1">
              Open Current Device
            </h4>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Switch to the Current Device tab.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-surface-container-low border border-surface-variant space-y-1">
            <span className="font-label-md text-label-md font-bold text-primary px-2 py-0.5 rounded bg-primary-container/20">
              STEP 2
            </span>
            <h4 className="font-title-md text-title-md font-bold text-on-surface pt-1">
              Set Raindrop Token
            </h4>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Paste your token in Preferences dialog.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-surface-container-low border border-surface-variant space-y-1">
            <span className="font-label-md text-label-md font-bold text-primary px-2 py-0.5 rounded bg-primary-container/20">
              STEP 3
            </span>
            <h4 className="font-title-md text-title-md font-bold text-on-surface pt-1">
              Click Sync Now
            </h4>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Trigger a sync to upload snapshot.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-center gap-4 pt-2">
          {onSwitchToLocal && (
            <button
              onClick={onSwitchToLocal}
              className="flex items-center gap-2 px-6 h-12 rounded-full border border-outline-variant bg-surface hover:bg-surface-container-low font-label-md text-label-md text-on-surface transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">laptop_mac</span>
              <span>Current Device</span>
            </button>
          )}
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={loading}
              className="flex items-center gap-2 px-6 h-12 rounded-full bg-primary text-on-primary hover:bg-surface-tint font-label-md text-label-md transition-colors shadow-sm"
            >
              <span className={`material-symbols-outlined text-[18px] ${loading ? "animate-spin" : ""}`}>
                refresh
              </span>
              <span>Check Raindrop Again</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  // 5. Collection Found But 0 Valid Items State
  if (validDevices.length === 0) {
    return (
      <div className="py-16 px-8 bg-surface-container-lowest rounded-lg border border-surface-variant text-center max-w-lg mx-auto space-y-6 shadow-sm my-6">
        <div className="w-14 h-14 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center mx-auto">
          <span className="material-symbols-outlined text-[28px]">devices</span>
        </div>
        <div className="space-y-1.5">
          <h3 className="font-title-md text-title-md font-bold text-on-surface">
            Collection &quot;Synctable&quot; is Empty
          </h3>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            The root collection was found, but no device snapshots have been uploaded yet.
            Trigger a sync from your Synctable desktop app.
          </p>
        </div>
        <div className="flex items-center justify-center gap-3">
          {onSwitchToLocal && (
            <button
              onClick={onSwitchToLocal}
              className="flex items-center gap-2 px-6 h-12 rounded-full border border-outline-variant bg-surface hover:bg-surface-container-low font-label-md text-label-md text-on-surface transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">laptop_mac</span>
              <span>Current Device</span>
            </button>
          )}
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={loading}
              className="flex items-center gap-2 px-6 h-12 rounded-full bg-primary text-on-primary hover:bg-surface-tint font-label-md text-label-md transition-colors shadow-sm"
            >
              <span className={`material-symbols-outlined text-[18px] ${loading ? "animate-spin" : ""}`}>
                refresh
              </span>
              <span>Refresh</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  // 6. Main Multi-Device Portal View
  return (
    <div className="flex flex-col gap-10 w-full">
      {/* Global Search & Context Bar */}
      {!hideToolbar && (
        <div className="flex flex-row items-center gap-2 md:gap-4 w-full">
          {/* Search Input */}
          <div className="flex-1 min-w-0 relative">
            <span className="material-symbols-outlined absolute left-3 md:left-4 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px] md:text-[20px] pointer-events-none">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                if (externalSearchQuery === undefined) {
                  setInternalSearchQuery(e.target.value);
                }
              }}
              placeholder="Search tabs, URLs, or workspaces across all devices..."
              className="w-full h-10 md:h-12 pl-9 md:pl-12 pr-8 md:pr-10 rounded-full bg-surface-container text-on-surface border-none focus:ring-2 focus:ring-primary-container font-body-sm md:font-body-lg text-sm md:text-base placeholder:text-on-surface-variant transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  if (externalSearchQuery === undefined) {
                    setInternalSearchQuery("");
                  }
                }}
                className="absolute right-2.5 md:right-4 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface p-1"
                title="Clear search"
              >
                <span className="material-symbols-outlined text-[16px] md:text-[20px]">close</span>
              </button>
            )}
          </div>

          {/* Filter Dropdowns & Refresh */}
          <div className="flex items-center gap-2 md:gap-4 shrink-0">
            {/* Devices Dropdown */}
            <label className="relative shrink-0 flex items-center justify-center w-10 h-10 md:w-auto md:h-12 rounded-full border border-outline-variant bg-surface hover:bg-surface-container-low transition-colors cursor-pointer" title="Filter by Device">
              <span className="material-symbols-outlined text-[20px] md:text-[18px] text-on-surface-variant md:absolute md:left-4 md:top-1/2 md:-translate-y-1/2 pointer-events-none select-none">
                laptop_mac
              </span>

              <select
                value={selectedDeviceId}
                onChange={(e) => setSelectedDeviceId(e.target.value)}
                className="opacity-0 md:opacity-100 absolute inset-0 w-full h-full md:static md:w-auto md:h-full md:pl-11 md:pr-10 md:min-w-[170px] md:bg-transparent font-label-md text-label-md text-on-surface appearance-none cursor-pointer truncate select-none"
              >
                <option value="all">All Devices ({validDevices.length})</option>
                {validDevices.map((device) => {
                  const tabs = device.tree.reduce((acc, t) => acc + countTabs(t), 0);
                  return (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.deviceName} ({tabs} tabs)
                    </option>
                  );
                })}
              </select>

              <span className="hidden md:inline-block pointer-events-none">
                <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px] select-none">
                  expand_more
                </span>
              </span>
            </label>

            {/* Browsers Dropdown */}
            <label className="relative shrink-0 flex items-center justify-center w-10 h-10 md:w-auto md:h-12 rounded-full border border-outline-variant bg-surface hover:bg-surface-container-low transition-colors cursor-pointer" title="Filter by Browser">
              <span className="material-symbols-outlined text-[20px] md:text-[18px] text-on-surface-variant md:absolute md:left-4 md:top-1/2 md:-translate-y-1/2 pointer-events-none select-none">
                language
              </span>

              <select
                value={selectedBrowser}
                onChange={(e) => {
                  if (externalSelectedBrowser === undefined) {
                    setInternalSelectedBrowser(e.target.value);
                  }
                }}
                className="opacity-0 md:opacity-100 absolute inset-0 w-full h-full md:static md:w-auto md:h-full md:pl-11 md:pr-10 md:min-w-[160px] md:bg-transparent font-label-md text-label-md text-on-surface appearance-none cursor-pointer truncate select-none"
              >
                <option value="all">All Browsers</option>
                {availableBrowsers.map((b) => (
                  <option key={b} value={b}>
                    {b.toUpperCase()} Browser
                  </option>
                ))}
              </select>

              <span className="hidden md:inline-block pointer-events-none">
                <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px] select-none">
                  expand_more
                </span>
              </span>
            </label>

            {/* Refresh Button */}
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={loading}
                className="flex items-center justify-center gap-2 w-10 h-10 md:w-auto md:px-6 md:h-12 rounded-full bg-primary text-on-primary hover:bg-surface-tint transition-colors font-label-md text-label-md shadow-sm shrink-0 cursor-pointer"
                title="Refresh Snapshots"
              >
                <span className={`material-symbols-outlined text-[18px] md:text-[20px] ${loading ? "animate-spin" : ""}`}>
                  refresh
                </span>
                <span className="hidden md:inline">Refresh</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Device Cards List */}
      <div className="space-y-12">
        {visibleDevices.map((device) => (
          <DeviceCard
            key={device.deviceId}
            deviceName={device.deviceName}
            badge={device.fileName}
            lastUpdated={device.lastUpdated}
            lastUpdatedLabel="Last synced"
            trees={device.tree}
            selectedBrowser={selectedBrowser}
            searchQuery={searchQuery}
            onOpenExternal={onOpenExternal}
          />
        ))}
      </div>
    </div>
  );
}
