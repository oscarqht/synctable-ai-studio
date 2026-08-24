import React, { useState, useEffect, useCallback, useMemo } from "react";
import type {
  BrowserTreeNode,
  SyncStats,
  SynctableSyncResponse,
} from "@synctable/ui";
import { MultiDeviceCardsPortal, countTabs } from "@synctable/ui";
import { LocalTab } from "./LocalTab";
import { SettingsModal } from "./SettingsModal";

interface AppProps {
  rpc: any;
}

export function App({ rpc }: AppProps) {
  const [activeTab, setActiveTab] = useState<"local" | "cloud">("local");
  const [stats, setStats] = useState<SyncStats | null>(null);
  const [trees, setTrees] = useState<BrowserTreeNode[]>([]);
  const [localSyncing, setLocalSyncing] = useState<boolean>(false);

  const [cloudData, setCloudData] = useState<SynctableSyncResponse | null>(null);
  const [cloudLoading, setCloudLoading] = useState<boolean>(false);

  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedBrowser, setSelectedBrowser] = useState<string>("all");

  const [savedDeviceName, setSavedDeviceName] = useState<string>("");
  const [savedRaindropToken, setSavedRaindropToken] = useState<string>("");
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  // Load preferences
  const loadPreferences = useCallback(async () => {
    try {
      const prefs = await rpc.request.getAppPreferences();
      setSavedDeviceName(prefs?.deviceName || "");
      setSavedRaindropToken(prefs?.raindropToken || "");
    } catch (err) {
      console.error("Failed to load preferences:", err);
    }
  }, [rpc]);

  // Load local trees & stats
  const loadLocalData = useCallback(async () => {
    try {
      const currentStats = await rpc.request.getStats();
      setStats(currentStats);
      const currentTrees = await rpc.request.getTree({});
      setTrees(currentTrees || []);
    } catch (err) {
      console.error("Failed to load local trees:", err);
    }
  }, [rpc]);

  // Load cloud multi-device data
  const loadCloudData = useCallback(
    async (isBackground = false, forceRefresh = false) => {
      if (!isBackground) setCloudLoading(true);
      try {
        const data: SynctableSyncResponse = await rpc.request.getCloudData(
          forceRefresh ? { forceRefresh: true } : undefined
        );
        if (data.authenticated && !data.error) {
          setCloudData(data);
        } else if (data.error) {
          // If we already have devices loaded, keep existing view on transient/background errors
          setCloudData((prev) => {
            if (!prev || prev.devices.length === 0) return data;
            return prev;
          });
        } else {
          setCloudData(data);
        }
      } catch (err: any) {
        console.error("Failed to load cloud sync data:", err);
        setCloudData((prev) => {
          if (!prev || prev.devices.length === 0) {
            return {
              authenticated: false,
              devices: [],
              error: err?.message || String(err),
            };
          }
          return prev;
        });
      } finally {
        if (!isBackground) setCloudLoading(false);
      }
    },
    [rpc]
  );

  // Initial load and syncComplete listener
  useEffect(() => {
    loadPreferences();
    loadLocalData();
    loadCloudData(true);

    const handleSyncEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.success) {
        loadLocalData();
        loadCloudData(true);
      }
    };

    window.addEventListener("synctable:syncComplete", handleSyncEvent);
    return () => {
      window.removeEventListener("synctable:syncComplete", handleSyncEvent);
    };
  }, [loadPreferences, loadLocalData, loadCloudData]);

  // Handle Tab Switch
  const handleTabSwitch = (tab: "local" | "cloud") => {
    setActiveTab(tab);
    if (tab === "local") {
      loadLocalData();
    } else {
      loadCloudData();
    }
  };

  // Handle Manual Sync Now
  const handleSyncNow = async () => {
    setLocalSyncing(true);
    try {
      const result = await rpc.request.triggerSync();
      if (result.success) {
        await loadLocalData();
        if (activeTab === "cloud") {
          await loadCloudData(true, true);
        }
      }
    } catch (err) {
      console.error("Manual sync failed:", err);
    } finally {
      setLocalSyncing(false);
    }
  };

  // Handle External URL open
  const handleOpenExternal = (url: string) => {
    rpc.request.openExternalURL({ url });
  };

  // Handle Save Token from inline form
  const handleSaveToken = async (token: string) => {
    await rpc.request.setRaindropToken({ token });
    setSavedRaindropToken(token);
    await loadPreferences();
    await loadCloudData(false, true);
  };

  // Handle Save Full Settings
  const handleSaveSettings = async (deviceName: string, token: string) => {
    await rpc.request.setDeviceName({ deviceName });
    await rpc.request.setRaindropToken({ token });
    setSavedDeviceName(deviceName);
    setSavedRaindropToken(token);
    await loadPreferences();
    await loadLocalData();
    await loadCloudData(false, true);
  };

  const validDevicesCount = (cloudData?.devices || []).filter(
    (d) => d.tree.reduce((acc, n) => acc + countTabs(n), 0) > 0
  ).length;

  // Compute available browsers across local trees or cloud devices
  const availableBrowsers = useMemo(() => {
    const browserTimeMap = new Map<string, string>();
    if (activeTab === "local") {
      trees.forEach((node) => {
        if (node.browser_name && countTabs(node) > 0) {
          const b = node.browser_name.toLowerCase();
          const time = node.lastUpdateTime || node.snapshot_time || "";
          const existing = browserTimeMap.get(b) || "";
          if (time > existing) browserTimeMap.set(b, time);
        }
      });
    } else {
      (cloudData?.devices || []).forEach((dev) => {
        dev.tree.forEach((node) => {
          if (node.browser_name && countTabs(node) > 0) {
            const b = node.browser_name.toLowerCase();
            const time = node.lastUpdateTime || node.snapshot_time || "";
            const existing = browserTimeMap.get(b) || "";
            if (time > existing) browserTimeMap.set(b, time);
          }
        });
      });
    }
    return Array.from(browserTimeMap.keys()).sort((a, b) => {
      const timeA = browserTimeMap.get(a) || "";
      const timeB = browserTimeMap.get(b) || "";
      if (timeA && timeB) return timeB.localeCompare(timeA);
      if (timeA) return -1;
      if (timeB) return 1;
      return a.localeCompare(b);
    });
  }, [activeTab, trees, cloudData]);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-surface text-on-surface font-body-lg select-none">
      {/* Top Navigation Bar with macOS Inset Drag Area */}
      <header
        style={{ WebkitAppRegion: "drag", appRegion: "drag" } as React.CSSProperties}
        className="bg-surface dark:bg-surface-dim border-b border-outline-variant/60 dark:border-outline px-container-padding py-2.5 flex items-center justify-between shrink-0 electrobun-webkit-app-region-drag titlebar-drag-region sticky top-0 z-50 gap-4"
      >
        {/* Left: Brand logo + Synctable text, immediately followed by the Segmented Tab Switcher */}
        <div className="flex items-center gap-3.5 pl-16 shrink-0">
          <div className="flex items-center gap-2.5 select-none">
            <div className="w-8 h-8 rounded-xl bg-surface-container-high border border-outline-variant/60 flex items-center justify-center shadow-xs overflow-hidden shrink-0">
              <img src="assets/logo.png" alt="Synctable" className="w-6 h-6 object-contain" />
            </div>
            <span className="font-headline-lg text-[18px] font-bold text-on-surface leading-tight">
              Synctable
            </span>
          </div>

          {/* Segmented Pill Tab Switcher */}
          <div
            style={{ WebkitAppRegion: "no-drag", appRegion: "no-drag" } as React.CSSProperties}
            className="flex items-center p-0.5 rounded-full bg-surface-container border border-outline-variant/60 electrobun-webkit-app-region-no-drag titlebar-no-drag shrink-0"
          >
            <button
              onClick={() => handleTabSwitch("local")}
              title="Current Device"
              className={`flex items-center gap-1.5 px-2.5 min-[700px]:px-3.5 py-1 rounded-full font-label-md text-label-md font-semibold transition-all cursor-pointer ${
                activeTab === "local"
                  ? "bg-surface text-on-surface shadow-2xs"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">laptop_mac</span>
              <span className="hidden min-[700px]:inline">Current Device</span>
            </button>

            <button
              onClick={() => handleTabSwitch("cloud")}
              title={`All Devices (${validDevicesCount})`}
              className={`flex items-center gap-1.5 px-2.5 min-[700px]:px-3.5 py-1 rounded-full font-label-md text-label-md font-semibold transition-all cursor-pointer ${
                activeTab === "cloud"
                  ? "bg-surface text-on-surface shadow-2xs"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">cloud</span>
              <span className="hidden min-[700px]:inline">All Devices</span>
              {validDevicesCount > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-primary-container text-on-primary-container">
                  {validDevicesCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Center: Search Input (Hidden when < 1080px) */}
        <div
          style={{ WebkitAppRegion: "no-drag", appRegion: "no-drag" } as React.CSSProperties}
          className="hidden min-[1080px]:flex flex-1 max-w-xl mx-4 relative electrobun-webkit-app-region-no-drag titlebar-no-drag"
        >
          <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px] pointer-events-none">
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              activeTab === "local"
                ? "Search tabs, URLs, or workspaces in current device..."
                : "Search tabs, URLs, or workspaces across all devices..."
            }
            className="w-full h-9 pl-10 pr-8 rounded-full bg-surface-container text-on-surface border-none focus:ring-2 focus:ring-primary-container font-body-sm text-body-sm placeholder:text-on-surface-variant transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface p-0.5"
              title="Clear search"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          )}
        </div>

        {/* Right Actions: Browser Filter, Sync/Refresh, and Settings */}
        <div
          style={{ WebkitAppRegion: "no-drag", appRegion: "no-drag" } as React.CSSProperties}
          className="flex items-center gap-2 min-[1080px]:gap-3 shrink-0 electrobun-webkit-app-region-no-drag titlebar-no-drag"
        >
          {/* Browser Filter Dropdown (Icon-only when < 1080px, expanded pill when >= 1080px) */}
          <label
            className="relative shrink-0 flex items-center justify-center w-9 h-9 min-[1080px]:w-auto min-[1080px]:h-9 rounded-full border border-outline-variant bg-surface hover:bg-surface-container-low transition-colors cursor-pointer"
            title="Filter by Browser"
          >
            <span className="material-symbols-outlined text-[18px] min-[1080px]:text-[16px] text-on-surface-variant min-[1080px]:absolute min-[1080px]:left-3 min-[1080px]:top-1/2 min-[1080px]:-translate-y-1/2 pointer-events-none select-none">
              language
            </span>

            <select
              value={selectedBrowser}
              onChange={(e) => setSelectedBrowser(e.target.value)}
              className="opacity-0 min-[1080px]:opacity-100 absolute inset-0 w-full h-full min-[1080px]:static min-[1080px]:w-auto min-[1080px]:min-w-[140px] min-[1080px]:max-w-[150px] min-[1080px]:h-full min-[1080px]:pl-9 min-[1080px]:pr-8 min-[1080px]:bg-transparent font-label-md text-label-md text-on-surface appearance-none cursor-pointer truncate select-none"
            >
              <option value="all">All Browsers</option>
              {availableBrowsers.map((b) => (
                <option key={b} value={b}>
                  {b.toUpperCase()} Browser
                </option>
              ))}
            </select>

            <span className="hidden min-[1080px]:inline-block pointer-events-none">
              <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-[16px] select-none">
                expand_more
              </span>
            </span>
          </label>

          {/* Sync / Refresh Button (Icon-only when < 1080px, expanded pill when >= 1080px) */}
          {activeTab === "local" ? (
            <button
              onClick={handleSyncNow}
              disabled={localSyncing}
              className="flex items-center justify-center gap-1.5 w-9 h-9 min-[1080px]:w-auto min-[1080px]:px-4 min-[1080px]:h-9 rounded-full bg-primary text-on-primary hover:bg-surface-tint disabled:opacity-50 font-label-md text-label-md transition-colors shadow-2xs shrink-0 cursor-pointer"
              title={localSyncing ? "Syncing..." : "Sync Now (Poll and Parse Local Browser Trees)"}
            >
              <span className={`material-symbols-outlined text-[18px] min-[1080px]:text-[16px] ${localSyncing ? "animate-spin" : ""}`}>
                sync
              </span>
              <span className="hidden min-[1080px]:inline">
                {localSyncing ? "Syncing..." : "Sync Now"}
              </span>
            </button>
          ) : (
            <button
              onClick={() => loadCloudData(false, true)}
              disabled={cloudLoading}
              className="flex items-center justify-center gap-1.5 w-9 h-9 min-[1080px]:w-auto min-[1080px]:px-4 min-[1080px]:h-9 rounded-full bg-primary text-on-primary hover:bg-surface-tint disabled:opacity-50 font-label-md text-label-md transition-colors shadow-2xs shrink-0 cursor-pointer"
              title={cloudLoading ? "Refreshing..." : "Refresh Snapshots from Cloud"}
            >
              <span className={`material-symbols-outlined text-[18px] min-[1080px]:text-[16px] ${cloudLoading ? "animate-spin" : ""}`}>
                refresh
              </span>
              <span className="hidden min-[1080px]:inline">
                {cloudLoading ? "Refreshing..." : "Refresh"}
              </span>
            </button>
          )}

          {/* Settings Button */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors duration-200 cursor-pointer shrink-0"
            title="Preferences"
          >
            <span className="material-symbols-outlined text-[20px]">settings</span>
          </button>
        </div>
      </header>

      {/* Main Content View Canvas */}
      <main className="flex-1 w-full overflow-y-auto zen-scrollbar">
        <div className="w-full max-w-max-width mx-auto px-container-padding py-6 flex flex-col gap-10">
          {activeTab === "local" ? (
            <LocalTab
              stats={stats}
              trees={trees}
              syncing={localSyncing}
              onSync={handleSyncNow}
              onOpenExternal={handleOpenExternal}
              deviceName={savedDeviceName}
              searchQuery={searchQuery}
              selectedBrowser={selectedBrowser}
            />
          ) : (
            <MultiDeviceCardsPortal
              data={cloudData}
              loading={cloudLoading}
              onRefresh={() => loadCloudData(false, true)}
              onOpenExternal={handleOpenExternal}
              onSaveToken={handleSaveToken}
              onSwitchToLocal={() => setActiveTab("local")}
              hideToolbar={true}
              searchQuery={searchQuery}
              selectedBrowser={selectedBrowser}
            />
          )}
        </div>
      </main>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        savedDeviceName={savedDeviceName}
        savedRaindropToken={savedRaindropToken}
        onSave={handleSaveSettings}
        onOpenExternal={handleOpenExternal}
      />
    </div>
  );
}
