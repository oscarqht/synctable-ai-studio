export type NodeType =
  | "root"
  | "window"
  | "workspace"
  | "folder"
  | "split_view"
  | "tab"
  | "pinned_tab";

export type BrowserName =
  | "chrome"
  | "firefox"
  | "vivaldi"
  | "arc"
  | "zen"
  | "dia"
  | "safari"
  | "edge"
  | string;

export type OSType = "macos" | "windows" | "linux" | string;

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

export interface DeviceStats {
  totalNodes: number;
  totalTabs: number;
  totalWorkspaces: number;
  totalFolders: number;
  totalWindows: number;
  browsers: string[];
}

export interface DeviceTreeData {
  id: number; // Raindrop item ID
  deviceId: string;
  deviceName: string;
  fileName: string;
  fileSize?: number;
  lastUpdated: string;
  tree: BrowserTreeNode[];
  stats: DeviceStats;
}

export interface SynctableSyncResponse {
  authenticated: boolean;
  collection: {
    id: number;
    title: string;
    count: number;
  } | null;
  devices: DeviceTreeData[];
  error?: string;
}
