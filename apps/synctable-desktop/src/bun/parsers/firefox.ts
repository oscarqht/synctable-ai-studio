import { existsSync, readFileSync } from "node:fs";
import lz4js from "lz4js";
import type { BrowserTreeNode, OSType } from "../../shared/types";

export interface FirefoxParserOptions {
  filePath: string;
  osType: OSType;
  profileName: string;
  snapshotTime: string;
}

type FirefoxGroup = { id: string; title?: string; name?: string; label?: string; color?: string | number };

const FIREFOX_GROUP_COLORS: Record<string, string> = {
  blue: "#0060df",
  turquoise: "#00b3a4",
  cyan: "#00b3a4",
  teal: "#00b3a4",
  green: "#12bc00",
  yellow: "#d8b200",
  orange: "#d97000",
  red: "#d70022",
  pink: "#b900b9",
  purple: "#7b00b5",
  gray: "#5f6368",
  grey: "#5f6368",
};

export function parseFirefoxGroupColor(val: unknown): string | null {
  if (val == null) return null;
  if (typeof val === "string") {
    const s = val.trim().toLowerCase();
    if (s.startsWith("#")) {
      if (s.length === 4) {
        return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toLowerCase();
      }
      return s.slice(0, 7).toLowerCase();
    }
    if (FIREFOX_GROUP_COLORS[s]) return FIREFOX_GROUP_COLORS[s];
  }
  return null;
}

function readMozillaSession(filePath: string): any {
  const buffer = readFileSync(filePath);
  const magic = "mozLz40\0";
  if (buffer.length < 12 || buffer.subarray(0, 8).toString("utf-8") !== magic) {
    return JSON.parse(buffer.toString("utf-8"));
  }

  const uncompressed = new Uint8Array(buffer.readUInt32LE(8));
  lz4js.decompressBlock(buffer.subarray(12), uncompressed, 0, buffer.length - 12, 0);
  return JSON.parse(new TextDecoder().decode(uncompressed));
}

function tabTitle(tab: any, tabIndex: number): string {
  const entryIndex = Math.max(0, Number(tab?.index || 1) - 1);
  const entry = tab?.entries?.[entryIndex] || tab?.entries?.at?.(-1);
  return entry?.title || tab?.title || entry?.url || `Tab ${tabIndex + 1}`;
}

function tabUrl(tab: any): string | null {
  const entryIndex = Math.max(0, Number(tab?.index || 1) - 1);
  return tab?.entries?.[entryIndex]?.url || tab?.entries?.at?.(-1)?.url || null;
}

/** Parses Firefox sessionstore/recovery snapshots without opening the live profile. */
export function parseFirefoxSessionstore(options: FirefoxParserOptions): BrowserTreeNode[] {
  if (!existsSync(options.filePath)) return [];
  return parseFirefoxSessionData(readMozillaSession(options.filePath), options);
}

export function parseFirefoxSessionData(data: any, options: Omit<FirefoxParserOptions, "filePath">): BrowserTreeNode[] {
  const { osType, profileName, snapshotTime } = options;
  const profileId = encodeURIComponent(profileName);
  const nodes: BrowserTreeNode[] = [];
  const rootId = `firefox-${osType}-${profileId}-root`;
  nodes.push({ id: rootId, browser_name: "firefox", os_type: osType, profile_name: profileName, node_type: "root", title: `Firefox (${profileName})`, url: null, parent_id: null, sort_order: 0, snapshot_time: snapshotTime, lastUpdateTime: snapshotTime });

  (Array.isArray(data?.windows) ? data.windows : []).forEach((window: any, windowIndex: number) => {
    const windowId = `firefox-${profileId}-win-${windowIndex}`;
    const workspaceId = `${windowId}-ws-default`;
    nodes.push({ id: windowId, browser_name: "firefox", os_type: osType, profile_name: profileName, node_type: "window", title: `Firefox Window ${windowIndex + 1}`, url: null, parent_id: rootId, sort_order: windowIndex, snapshot_time: snapshotTime, lastUpdateTime: snapshotTime });
    nodes.push({ id: workspaceId, browser_name: "firefox", os_type: osType, profile_name: profileName, node_type: "workspace", title: "Default Workspace", url: null, parent_id: windowId, sort_order: 0, snapshot_time: snapshotTime, lastUpdateTime: snapshotTime });

    const tabs: any[] = Array.isArray(window?.tabs) ? window.tabs : [];
    // Firefox's session format has used both `groupId` and `tabGroupId`; accept
    // both during its tab-groups rollout and keep a split collection non-nestable.
    const groupIdFor = (tab: any) => tab?.groupId ?? tab?.tabGroupId ?? tab?.tabGroup?.id;
    const splitIdFor = (tab: any) => tab?.splitViewId ?? tab?.splitId ?? tab?.split?.id;
    const groupMetadata = [window?.tabGroups, window?.groups, data?.tabGroups]
      .flatMap((groupList): FirefoxGroup[] => Array.isArray(groupList) ? groupList : []);
    const groups = new Map<string, FirefoxGroup>();
    groupMetadata.forEach((group: FirefoxGroup) => {
      if (group?.id != null) groups.set(String(group.id), group);
    });

    const firstTabIndex = (predicate: (tab: any) => boolean) => {
      const index = tabs.findIndex(predicate);
      return index === -1 ? Number.MAX_SAFE_INTEGER : index;
    };
    const groupIds = Array.from(new Set<string>(tabs.reduce<string[]>((ids, tab: any) => {
      const id = groupIdFor(tab);
      if (id != null) ids.push(String(id));
      return ids;
    }, [])));
    const groupNodeId = (id: string) => `${windowId}-group-${encodeURIComponent(id)}`;
    groupIds.forEach((groupId) => {
      const group = groups.get(groupId);
      const theme_color = parseFirefoxGroupColor(group?.color);
      const theme_colors = theme_color ? [theme_color] : null;
      nodes.push({
        id: groupNodeId(groupId), browser_name: "firefox", os_type: osType, profile_name: profileName, node_type: "folder",
        title: group?.title || group?.name || group?.label || "Tab Group", url: null, parent_id: workspaceId,
        sort_order: firstTabIndex((tab) => String(groupIdFor(tab)) === groupId), snapshot_time: snapshotTime, lastUpdateTime: snapshotTime,
        theme_color, theme_colors,
      });
    });

    const splitIds = Array.from(new Set<string>(tabs.reduce<string[]>((ids, tab: any) => {
      const id = splitIdFor(tab);
      if (id != null) ids.push(String(id));
      return ids;
    }, [])));
    const splitNodeId = (id: string) => `${windowId}-split-${encodeURIComponent(id)}`;
    const splitParentId = (splitId: string) => {
      const containingGroupIds = Array.from(new Set<string>(tabs.reduce<string[]>((ids, tab: any) => {
        if (String(splitIdFor(tab)) !== splitId) return ids;
        const groupId = groupIdFor(tab);
        if (groupId != null) ids.push(String(groupId));
        return ids;
      }, [])));
      // Firefox can split tabs within a tab group. Preserve that nesting only
      // when the whole split belongs to one group; a mixed split has no single
      // valid folder parent and remains directly under the workspace.
      return containingGroupIds.length === 1 && groupIds.includes(containingGroupIds[0])
        ? groupNodeId(containingGroupIds[0])
        : workspaceId;
    };
    splitIds.forEach((splitId) => {
      nodes.push({
        id: splitNodeId(splitId), browser_name: "firefox", os_type: osType, profile_name: profileName, node_type: "split_view",
        title: "Split View", url: null, parent_id: splitParentId(splitId),
        sort_order: firstTabIndex((tab) => String(splitIdFor(tab)) === splitId), snapshot_time: snapshotTime, lastUpdateTime: snapshotTime,
      });
    });

    tabs.forEach((tab: any, tabIndex: number) => {
      const url = tabUrl(tab);
      if (!url) return;
      const groupId = groupIdFor(tab);
      const splitId = splitIdFor(tab);
      const parentId = splitId != null && splitIds.includes(String(splitId))
        ? splitNodeId(String(splitId))
        : groupId != null && groupIds.includes(String(groupId))
          ? groupNodeId(String(groupId))
          : workspaceId;
      nodes.push({
        id: `${windowId}-tab-${tab?.permanentKey || tab?.tabId || tabIndex}`, browser_name: "firefox", os_type: osType, profile_name: profileName,
        node_type: tab?.pinned ? "pinned_tab" : "tab", title: tabTitle(tab, tabIndex), url, parent_id: parentId,
        sort_order: tabIndex, snapshot_time: snapshotTime, lastUpdateTime: snapshotTime,
      });
    });
  });

  return nodes;
}
