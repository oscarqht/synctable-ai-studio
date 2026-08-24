import { existsSync, readFileSync } from "node:fs";
import type { BrowserTreeNode, OSType } from "../../shared/types";

export interface ChromeParserOptions {
  filePath: string;
  sessionFilePath?: string;
  osType: OSType;
  profileName: string;
  snapshotTime: string;
}

type SessionTab = {
  id: number;
  windowId?: number;
  index: number;
  url?: string;
  title?: string;
  pinned: boolean;
  groupId?: string;
  splitId?: string;
};

type TabGroup = { id: string; title: string; color?: string | null };
const SESSION_MAGIC = "SNSS";

const CHROME_GROUP_COLORS: Record<string, string> = {
  "0": "#5f6368", // Grey
  "1": "#1a73e8", // Blue
  "2": "#d93025", // Red
  "3": "#f9ab00", // Yellow
  "4": "#1e8e3e", // Green
  "5": "#d01884", // Pink
  "6": "#9334e6", // Purple
  "7": "#129eaf", // Cyan
  "8": "#e8710a", // Orange
  grey: "#5f6368",
  gray: "#5f6368",
  blue: "#1a73e8",
  red: "#d93025",
  yellow: "#f9ab00",
  green: "#1e8e3e",
  pink: "#d01884",
  purple: "#9334e6",
  cyan: "#129eaf",
  orange: "#e8710a",
};

export function parseChromeGroupColor(val: unknown): string | null {
  if (val == null) return null;
  if (typeof val === "number" && Number.isFinite(val)) {
    return CHROME_GROUP_COLORS[String(val)] || null;
  }
  if (typeof val === "string") {
    const s = val.trim().toLowerCase();
    if (s.startsWith("#")) {
      if (s.length === 4) {
        return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toLowerCase();
      }
      return s.slice(0, 7).toLowerCase();
    }
    if (CHROME_GROUP_COLORS[s]) return CHROME_GROUP_COLORS[s];
  }
  return null;
}

function readPickleString(buffer: Buffer, offset: number): string | undefined {
  if (offset + 4 > buffer.length) return undefined;
  const length = buffer.readInt32LE(offset);
  if (length < 0 || offset + 4 + length > buffer.length) return undefined;
  return buffer.subarray(offset + 4, offset + 4 + length).toString("utf8");
}

function readPickleString16(buffer: Buffer, offset: number): string | undefined {
  if (offset + 4 > buffer.length) return undefined;
  const length = buffer.readInt32LE(offset);
  const byteLength = length * 2;
  if (length < 0 || offset + 4 + byteLength > buffer.length) return undefined;
  return buffer.subarray(offset + 4, offset + 4 + byteLength).toString("utf16le");
}

function tokenId(buffer: Buffer, offset: number): string {
  return `${buffer.readBigUInt64LE(offset).toString(16)}-${buffer.readBigUInt64LE(offset + 8).toString(16)}`;
}

/** Reads Chrome's persisted Session_* log without opening or modifying the live profile. */
function parseSessionSnapshot(sessionFilePath?: string): { tabs: SessionTab[]; groups: TabGroup[] } {
  if (!sessionFilePath || !existsSync(sessionFilePath)) return { tabs: [], groups: [] };
  const buffer = readFileSync(sessionFilePath);
  if (buffer.length < 8 || buffer.subarray(0, 4).toString("ascii") !== SESSION_MAGIC) return { tabs: [], groups: [] };

  const tabs = new Map<number, SessionTab>();
  const groups = new Map<string, TabGroup>();
  const tab = (id: number) => {
    let value = tabs.get(id);
    if (!value) {
      value = { id, index: Number.MAX_SAFE_INTEGER, pinned: false };
      tabs.set(id, value);
    }
    return value;
  };

  for (let offset = 8; offset + 2 <= buffer.length;) {
    const recordLength = buffer.readUInt16LE(offset);
    if (recordLength < 1 || offset + 2 + recordLength > buffer.length) break;
    const command = buffer[offset + 2];
    const payload = buffer.subarray(offset + 3, offset + 2 + recordLength);
    offset += 2 + recordLength;

    if (command === 0 && payload.length >= 8) { // SetTabWindow
      tab(payload.readInt32LE(4)).windowId = payload.readInt32LE(0);
    } else if (command === 2 && payload.length >= 8) { // SetTabIndexInWindow
      tab(payload.readInt32LE(0)).index = payload.readInt32LE(4);
    } else if (command === 6 && payload.length >= 16) { // UpdateTabNavigation
      const value = tab(payload.readInt32LE(4));
      const url = readPickleString(payload, 12);
      if (url && /^(https?|file|chrome):/i.test(url)) value.url = url;
      const title = url ? readPickleString16(payload, (16 + Buffer.byteLength(url) + 3) & ~3) : undefined;
      if (title) value.title = title;
    } else if (command === 12 && payload.length >= 5) { // SetPinnedState
      tab(payload.readInt32LE(0)).pinned = payload[4] !== 0;
    } else if (command === 25 && payload.length >= 21) { // SetTabGroup
      const value = tab(payload.readInt32LE(0));
      // Chrome 140+ writes a padding/reserved uint32 before the 128-bit token.
      const modernLayout = payload.length >= 25 && payload[24] !== 0;
      const groupOffset = modernLayout ? 8 : 4;
      const presentOffset = modernLayout ? 24 : 20;
      value.groupId = payload[presentOffset] !== 0 ? tokenId(payload, groupOffset) : undefined;
    } else if (command === 27 && payload.length >= 24) { // SetTabGroupMetadata2
      const groupId = tokenId(payload, 4);
      let title: string | undefined;
      let color: string | null = null;

      // Current Chrome stores the title as a UTF-16 pickle at byte 20; older
      // snapshots use a UTF-8 pickle at the same position.
      const length16 = payload.readInt32LE(20);
      const byteLength16 = length16 * 2;
      if (length16 >= 0 && 24 + byteLength16 <= payload.length) {
        title = payload.subarray(24, 24 + byteLength16).toString("utf16le");
        const afterTitleOffset = (24 + byteLength16 + 3) & ~3;
        if (payload.length >= afterTitleOffset + 4) {
          const colorId = payload.readUInt32LE(afterTitleOffset);
          color = parseChromeGroupColor(colorId);
        }
      }

      if (!title) {
        const length8 = payload.readInt32LE(20);
        if (length8 >= 0 && 24 + length8 <= payload.length) {
          title = payload.subarray(24, 24 + length8).toString("utf8");
          const afterTitleOffset = (24 + length8 + 3) & ~3;
          if (payload.length >= afterTitleOffset + 4) {
            const colorId = payload.readUInt32LE(afterTitleOffset);
            color = parseChromeGroupColor(colorId);
          }
        }
      }

      groups.set(groupId, { id: groupId, title: title || "Tab Group", color });
    } else if (command === 36 && payload.length >= 25) { // SetSplitTab
      // Chromium serializes SplitTabPayload as an aligned C++ struct:
      // tab ID, four bytes of padding, a 128-bit split token, then has_split.
      // A later command with has_split unset removes a tab from the split.
      const value = tab(payload.readInt32LE(0));
      value.splitId = payload[24] !== 0 ? tokenId(payload, 8) : undefined;
    } else if (command === 16 && payload.length >= 4) { // TabClosed
      tabs.delete(payload.readInt32LE(0));
    }
  }

  return { tabs: [...tabs.values()].filter((item) => item.url), groups: [...groups.values()] };
}

function tabTitle(url: string): string {
  try { return new URL(url).hostname || url; } catch { return url; }
}

export function parseChromePreferences(options: ChromeParserOptions): BrowserTreeNode[] {
  const { filePath, sessionFilePath, osType, profileName, snapshotTime } = options;
  if (!existsSync(filePath)) return [];

  const raw = readFileSync(filePath, "utf-8");
  const data = JSON.parse(raw);
  const nodes: BrowserTreeNode[] = [];

  const rootId = `chrome-${osType}-${profileName}-root`;
  nodes.push({
    id: rootId,
    browser_name: "chrome",
    os_type: osType,
    profile_name: profileName,
    node_type: "root",
    title: `Chrome (${profileName})`,
    url: null,
    parent_id: null,
    sort_order: 0,
    snapshot_time: snapshotTime,
    lastUpdateTime: snapshotTime,
  });

  const session = parseSessionSnapshot(sessionFilePath);
  const preferenceGroups = new Map(
    Object.entries<any>(data?.tab_groups || {}).map(([id, group]) => [
      id,
      {
        title: typeof group?.title === "string" ? group.title : undefined,
        color: parseChromeGroupColor(group?.color),
      },
    ])
  );
  const sessionWindowIds = [...new Set(session.tabs.map((item) => item.windowId).filter((id): id is number => id !== undefined))];
  const windowIds = sessionWindowIds.length > 0 ? sessionWindowIds : [0];

  windowIds.forEach((sourceWindowId, windowIndex) => {
    const windowId = `chrome-${profileName}-win-${sourceWindowId}`;
    const workspaceId = `chrome-${profileName}-win-${sourceWindowId}-ws-default`;
    nodes.push({ id: windowId, browser_name: "chrome", os_type: osType, profile_name: profileName, node_type: "window", title: `Chrome Window ${windowIndex + 1}`, url: null, parent_id: rootId, sort_order: windowIndex, snapshot_time: snapshotTime, lastUpdateTime: snapshotTime });
    nodes.push({ id: workspaceId, browser_name: "chrome", os_type: osType, profile_name: profileName, node_type: "workspace", title: "Default Workspace", url: null, parent_id: windowId, sort_order: 0, snapshot_time: snapshotTime, lastUpdateTime: snapshotTime });

    const windowTabs = session.tabs.filter((item) => item.windowId === sourceWindowId);
    const groupIds = new Set(windowTabs.flatMap((item) => item.groupId ? [item.groupId] : []));
    for (const groupId of groupIds) {
      const group = session.groups.find((item) => item.id === groupId);
      const prefGroup = preferenceGroups.get(groupId);
      const title = prefGroup?.title || group?.title || "Tab Group";
      const theme_color = prefGroup?.color || group?.color || null;
      const theme_colors = theme_color ? [theme_color] : null;
      const firstTabIndex = Math.min(...windowTabs.filter((item) => item.groupId === groupId).map((item) => item.index));
      nodes.push({
        id: `chrome-${profileName}-group-${groupId}`,
        browser_name: "chrome",
        os_type: osType,
        profile_name: profileName,
        node_type: "folder",
        title,
        url: null,
        parent_id: workspaceId,
        sort_order: firstTabIndex,
        snapshot_time: snapshotTime,
        lastUpdateTime: snapshotTime,
        theme_color,
        theme_colors,
      });
    }

    const splitIds = new Set(windowTabs.flatMap((item) => item.splitId ? [item.splitId] : []));
    const splitNodeId = (splitId: string) => `chrome-${profileName}-win-${sourceWindowId}-split-${splitId}`;
    for (const splitId of splitIds) {
      const firstTabIndex = Math.min(...windowTabs.filter((item) => item.splitId === splitId).map((item) => item.index));
      const containingGroupIds = new Set(windowTabs
        .filter((item) => item.splitId === splitId)
        .flatMap((item) => item.groupId ? [item.groupId] : []));
      // A split nested inside one Chrome tab group belongs to that group. A
      // split spanning ungrouped or differently grouped tabs has no unique
      // folder parent, so it remains directly under the workspace.
      const parentId = containingGroupIds.size === 1
        ? `chrome-${profileName}-group-${[...containingGroupIds][0]}`
        : workspaceId;
      nodes.push({ id: splitNodeId(splitId), browser_name: "chrome", os_type: osType, profile_name: profileName, node_type: "split_view", title: "Split View", url: null, parent_id: parentId, sort_order: firstTabIndex, snapshot_time: snapshotTime, lastUpdateTime: snapshotTime });
    }

    windowTabs.sort((left, right) => left.index - right.index || left.id - right.id).forEach((item) => {
      // Split views can be nested within a tab group, but tabs themselves
      // remain direct children of the split-view collection.
      const parentId = item.splitId && splitIds.has(item.splitId)
        ? splitNodeId(item.splitId)
        : item.groupId && groupIds.has(item.groupId)
          ? `chrome-${profileName}-group-${item.groupId}`
          : workspaceId;
      nodes.push({ id: `chrome-${profileName}-tab-${item.id}`, browser_name: "chrome", os_type: osType, profile_name: profileName, node_type: item.pinned ? "pinned_tab" : "tab", title: item.title || tabTitle(item.url!), url: item.url!, parent_id: parentId, sort_order: item.index, snapshot_time: snapshotTime, lastUpdateTime: snapshotTime });
    });

    // Preferences alone still make named groups visible when Chrome has not
    // yet created a recoverable session snapshot for this profile.
    if (windowTabs.length === 0) {
      let groupIndex = 0;
      for (const [groupId, prefGroup] of preferenceGroups) {
        const theme_color = prefGroup.color || null;
        nodes.push({
          id: `chrome-${profileName}-group-${groupId}`,
          browser_name: "chrome",
          os_type: osType,
          profile_name: profileName,
          node_type: "folder",
          title: prefGroup.title || `Group ${groupIndex + 1}`,
          url: null,
          parent_id: workspaceId,
          sort_order: groupIndex++,
          snapshot_time: snapshotTime,
          lastUpdateTime: snapshotTime,
          theme_color,
          theme_colors: theme_color ? [theme_color] : null,
        });
      }
    }
  });

  return nodes;
}
