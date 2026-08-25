import type { ElectrobunRPCSchema } from "electrobun/bun";

export type NodeType = "root" | "window" | "workspace" | "folder" | "split_view" | "tab" | "pinned_tab";
export type BrowserName = "chrome" | "firefox" | "vivaldi" | "arc" | "zen" | "dia" | "safari" | "edge" | string;
export type OSType = "macos" | "windows" | "linux";

export interface BrowserTreeNode {
  id: string;
  browser_name: BrowserName;
  os_type: OSType;
  profile_name: string;
  node_type: NodeType;
  title: string | null;
  url: string | null;
  parent_id: string | null;
  sort_order: number;
  snapshot_time: string;
  lastUpdateTime?: string | null;
  theme_color?: string | null;
  theme_colors?: string[] | null;
  icon?: string | null;
  children?: BrowserTreeNode[];
}

export interface SyncStats {
  totalNodes: number;
  totalWorkspaces: number;
  totalFolders: number;
  totalTabs: number;
  lastSyncTime: string | null;
  detectedBrowsers: {
    name: string;
    displayName: string;
    detected: boolean;
    profileCount: number;
    lastSync?: string;
    lastUpdateTime?: string;
  }[];
}

export interface SyncResult {
  success: boolean;
  syncedNodesCount: number;
  timestamp: string;
  errors?: { browser: string; message: string }[];
}

export interface AppPreferences {
  selectedBrowser: string;
  deviceName: string;
  raindropToken?: string;
}

export interface RaindropUserProfile {
  id: number;
  name: string;
  email?: string;
  avatarUrl?: string;
  isPro?: boolean;
}

export interface DeviceStats {
  totalNodes: number;
  totalTabs: number;
  totalWorkspaces: number;
  totalFolders: number;
  totalWindows: number;
  browsers: string[];
}

export interface CloudDeviceData {
  id: number | string;
  deviceId: string;
  deviceName: string;
  fileName: string;
  fileSize?: number;
  lastUpdated: string;
  tree: BrowserTreeNode[];
  stats: DeviceStats;
}

export interface CloudSyncResponse {
  authenticated: boolean;
  user?: RaindropUserProfile | null;
  collection?: {
    id: number;
    title: string;
    count: number;
  } | null;
  devices: CloudDeviceData[];
  error?: string;
}

export interface SynctableRPCSchema extends ElectrobunRPCSchema {
  bun: {
    requests: {
      getStats: {
        params: void;
        response: SyncStats;
      };
      getTree: {
        params: { browserName?: string; profileName?: string } | undefined;
        response: BrowserTreeNode[];
      };
      triggerSync: {
        params: void;
        response: SyncResult;
      };
      getAppPreferences: {
        params: void;
        response: AppPreferences;
      };
      setSelectedBrowser: {
        params: { selectedBrowser: string };
        response: void;
      };
      setDeviceName: {
        params: { deviceName: string };
        response: void;
      };
      getRaindropToken: {
        params: void;
        response: string;
      };
      setRaindropToken: {
        params: { token: string };
        response: void;
      };
      getCloudData: {
        params: { forceRefresh?: boolean } | undefined;
        response: CloudSyncResponse;
      };
      openExternalURL: {
        params: { url: string };
        response: void;
      };
      minimizeWindow: {
        params: void;
        response: void;
      };
      toggleMaximizeWindow: {
        params: void;
        response: void;
      };
      closeWindow: {
        params: void;
        response: void;
      };
    };
    messages: {
      syncStatusChanged: { status: "idle" | "syncing" | "error"; message?: string };
    };
  };
  webview: {
    requests: {};
    messages: {
      syncComplete: SyncResult;
    };
  };
}

