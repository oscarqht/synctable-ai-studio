export type BrowserName = "arc" | "zen" | "chrome" | "firefox" | "vivaldi" | "dia";

export type NodeType =
  | "root"
  | "window"
  | "workspace"
  | "space"
  | "group"
  | "folder"
  | "split_view"
  | "tab"
  | "pinned_tab";

export interface BrowserTreeNode {
  id: string;
  browser_name: string;
  os_type: string;
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

export interface WorkspaceItem {
  id: string;
  browserName: string;
  browserTitle: string;
  profileName: string;
  workspaceTitle: string;
  themeColor?: string | null;
  themeColors?: string[] | null;
  icon?: string | null;
  node: BrowserTreeNode;
  tabCount: number;
}

export interface RaindropUserProfile {
  id: number;
  name: string;
  email?: string;
  avatarUrl?: string;
  isPro: boolean;
}

export interface DeviceStats {
  totalTabs: number;
  totalWorkspaces: number;
  browsers: string[];
}

export interface CloudDeviceData {
  id: string | number;
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
  user?: RaindropUserProfile | null;
  collection?: {
    id: number;
    title: string;
    count: number;
  } | null;
  devices: CloudDeviceData[];
  error?: string;
}

export interface SyncStats {
  totalNodes: number;
  totalTabs: number;
  browserCounts: Record<string, number>;
  lastSyncTime: string | null;
}
