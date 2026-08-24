import { existsSync, readFileSync } from "node:fs";
import lz4js from "lz4js";
import type { BrowserTreeNode, OSType } from "../../shared/types";

export interface ZenParserOptions {
  filePath: string;
  osType: OSType;
  profileName: string;
  snapshotTime: string;
}

export function parseZenSessionstore(options: ZenParserOptions): BrowserTreeNode[] {
  const { filePath, osType, profileName, snapshotTime } = options;
  if (!existsSync(filePath)) return [];

  const buffer = readFileSync(filePath);
  let jsonString = "";

  // Mozilla jsonlz4 starts with 'mozLz40\0' (8 bytes), followed by 4-byte uncompressed size
  const MOZ_MAGIC = "mozLz40\0";
  if (buffer.length >= 12 && buffer.subarray(0, 8).toString("utf-8") === MOZ_MAGIC) {
    const uncompressedSize = buffer.readUInt32LE(8);
    const compressed = buffer.subarray(12);
    const uncompressed = new Uint8Array(uncompressedSize);
    lz4js.decompressBlock(compressed, uncompressed, 0, compressed.length, 0);
    jsonString = new TextDecoder().decode(uncompressed);
  } else {
    jsonString = buffer.toString("utf-8");
  }

  return parseZenSessionData(JSON.parse(jsonString), options);
}

function clamp255(val: unknown): number {
  if (typeof val !== "number" || isNaN(val)) return 0;
  const normalized = val > 1.5 ? val : val * 255;
  return Math.min(255, Math.max(0, Math.round(normalized)));
}

export function extractZenColor(colorObj: unknown): string | null {
  if (!colorObj) return null;
  if (typeof colorObj === "string") {
    const s = colorObj.trim();
    if (s.startsWith("#")) {
      if (s.length === 4) {
        return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toLowerCase();
      }
      return s.slice(0, 7).toLowerCase();
    }
    const rgbMatch = s.match(/rgba?\s*\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)/i);
    if (rgbMatch) {
      const r = clamp255(Number(rgbMatch[1])).toString(16).padStart(2, "0");
      const g = clamp255(Number(rgbMatch[2])).toString(16).padStart(2, "0");
      const b = clamp255(Number(rgbMatch[3])).toString(16).padStart(2, "0");
      return `#${r}${g}${b}`;
    }
    return null;
  }
  if (Array.isArray(colorObj) && colorObj.length >= 3 && typeof colorObj[0] === "number") {
    const r = clamp255(colorObj[0]).toString(16).padStart(2, "0");
    const g = clamp255(colorObj[1]).toString(16).padStart(2, "0");
    const b = clamp255(colorObj[2]).toString(16).padStart(2, "0");
    return `#${r}${g}${b}`;
  }
  if (typeof colorObj === "object") {
    const obj = colorObj as any;
    if ("c" in obj) {
      const fromC = extractZenColor(obj.c);
      if (fromC) return fromC;
    }
    if ("hex" in obj && typeof obj.hex === "string") {
      const fromHex = extractZenColor(obj.hex);
      if (fromHex) return fromHex;
    }
    if ("color" in obj) {
      const fromColor = extractZenColor(obj.color);
      if (fromColor) return fromColor;
    }
    const r = obj.r ?? obj.red;
    const g = obj.g ?? obj.green;
    const b = obj.b ?? obj.blue;
    if (typeof r === "number" && typeof g === "number" && typeof b === "number") {
      const hr = clamp255(r).toString(16).padStart(2, "0");
      const hg = clamp255(g).toString(16).padStart(2, "0");
      const hb = clamp255(b).toString(16).padStart(2, "0");
      return `#${hr}${hg}${hb}`;
    }
  }
  return null;
}

export function extractZenIcon(space: any): string | null {
  if (!space || typeof space !== "object") return null;
  const rawIcon = space.icon ?? space.customIcon ?? space.iconType;
  if (typeof rawIcon === "string") {
    const trimmed = rawIcon.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (rawIcon && typeof rawIcon === "object") {
    if (typeof rawIcon.emoji === "string" && rawIcon.emoji.trim()) {
      return rawIcon.emoji.trim();
    }
    if (typeof rawIcon.icon === "string" && rawIcon.icon.trim()) {
      return rawIcon.icon.trim();
    }
    if (typeof rawIcon.url === "string" && rawIcon.url.trim()) {
      return rawIcon.url.trim();
    }
  }
  return null;
}

export function extractZenSpaceTheme(space: any): {
  theme_color: string | null;
  theme_colors: string[] | null;
  icon: string | null;
} {
  const colors: string[] = [];
  let primaryHex: string | null = null;

  const theme = space?.theme;
  if (theme && typeof theme === "object") {
    const gradientColors = Array.isArray(theme.gradientColors) ? theme.gradientColors : [];
    for (const item of gradientColors) {
      const hex = extractZenColor(item);
      if (hex) {
        if (!colors.includes(hex)) colors.push(hex);
        if (item && typeof item === "object" && item.isPrimary && !primaryHex) {
          primaryHex = hex;
        }
      }
    }

    if (Array.isArray(theme.colors)) {
      for (const item of theme.colors) {
        const hex = extractZenColor(item);
        if (hex && !colors.includes(hex)) colors.push(hex);
      }
    }

    if (theme.primaryColor) {
      const hex = extractZenColor(theme.primaryColor);
      if (hex) {
        if (!colors.includes(hex)) colors.push(hex);
        if (!primaryHex) primaryHex = hex;
      }
    }
    if (theme.color) {
      const hex = extractZenColor(theme.color);
      if (hex && !colors.includes(hex)) colors.push(hex);
    }
    if (theme.accentColor) {
      const hex = extractZenColor(theme.accentColor);
      if (hex && !colors.includes(hex)) colors.push(hex);
    }
  }

  if (space?.color) {
    const hex = extractZenColor(space.color);
    if (hex && !colors.includes(hex)) colors.push(hex);
  }
  if (space?.themeColor) {
    const hex = extractZenColor(space.themeColor);
    if (hex && !colors.includes(hex)) colors.push(hex);
  }
  if (space?.accentColor) {
    const hex = extractZenColor(space.accentColor);
    if (hex && !colors.includes(hex)) colors.push(hex);
  }

  const icon = extractZenIcon(space);
  const theme_color = primaryHex || (colors.length > 0 ? colors[0] : null);
  const theme_colors = colors.length > 0 ? colors : null;

  return { theme_color, theme_colors, icon };
}

export function parseZenSessionData(data: any, options: Omit<ZenParserOptions, "filePath">): BrowserTreeNode[] {
  const { osType, profileName, snapshotTime } = options;
  const nodes: BrowserTreeNode[] = [];
  // Zen profile names contain spaces and punctuation. Keep every imported node
  // scoped to its profile so separate Zen profiles cannot overwrite each other.
  const profileId = encodeURIComponent(profileName);

  const rootId = `zen-${osType}-${profileId}-root`;
  nodes.push({
    id: rootId,
    browser_name: "zen",
    os_type: osType,
    profile_name: profileName,
    node_type: "root",
    title: `Zen Browser (${profileName})`,
    url: null,
    parent_id: null,
    sort_order: 0,
    snapshot_time: snapshotTime,
    lastUpdateTime: snapshotTime,
  });

  const windows = data.windows || [];
  windows.forEach((win: any, winIdx: number) => {
    const windowId = `zen-${profileId}-win-${winIdx}`;
    nodes.push({
      id: windowId,
      browser_name: "zen",
      os_type: osType,
      profile_name: profileName,
      node_type: "window",
      title: `Window ${winIdx + 1}`,
      url: null,
      parent_id: rootId,
      sort_order: winIdx,
      snapshot_time: snapshotTime,
      lastUpdateTime: snapshotTime,
    });

    const workspaceIds = new Map<string, string>();
    const spaces = Array.isArray(win.spaces) ? win.spaces : [];
    spaces.forEach((space: any, spaceIdx: number) => {
      const sourceId = String(space?.uuid || `default-${spaceIdx}`);
      const workspaceId = `zen-${profileId}-win-${winIdx}-ws-${encodeURIComponent(sourceId)}`;
      workspaceIds.set(sourceId, workspaceId);
      const { theme_color, theme_colors, icon } = extractZenSpaceTheme(space);
      nodes.push({
        id: workspaceId,
        browser_name: "zen",
        os_type: osType,
        profile_name: profileName,
        node_type: "workspace",
        title: space?.name || `Workspace ${spaceIdx + 1}`,
        url: null,
        parent_id: windowId,
        sort_order: spaceIdx,
        snapshot_time: snapshotTime,
        lastUpdateTime: snapshotTime,
        theme_color,
        theme_colors,
        icon,
      });
    });

    const defaultWorkspaceId = `zen-${profileId}-win-${winIdx}-ws-default`;
    const getWorkspaceId = (sourceId: unknown) => {
      const id = sourceId == null ? undefined : workspaceIds.get(String(sourceId));
      if (id) return id;
      if (!workspaceIds.has("__default__")) {
        workspaceIds.set("__default__", defaultWorkspaceId);
        nodes.push({
          id: defaultWorkspaceId,
          browser_name: "zen",
          os_type: osType,
          profile_name: profileName,
          node_type: "workspace",
          title: "Main Workspace",
          url: null,
          parent_id: windowId,
          sort_order: spaces.length,
          snapshot_time: snapshotTime,
          lastUpdateTime: snapshotTime,
        });
      }
      return defaultWorkspaceId;
    };

    const folderIds = new Map<string, string>();
    const folders = Array.isArray(win.folders) ? win.folders : [];
    const tabs = Array.isArray(win.tabs) ? win.tabs : [];
    // Zen represents each folder in its tab sequence with an internal empty
    // group-anchor tab. Its position is the folder's sidebar position.
    const folderSortOrders = new Map<string, number>();
    tabs.forEach((tab: any, tabIdx: number) => {
      if (tab?.zenIsEmpty && tab.groupId != null) {
        folderSortOrders.set(String(tab.groupId), tabIdx);
      }
    });
    folders.forEach((folder: any, folderIdx: number) => {
      if (folder?.id != null) {
        folderIds.set(String(folder.id), `zen-${profileId}-win-${winIdx}-folder-${encodeURIComponent(String(folder.id))}`);
      }
    });
    folders.forEach((folder: any, folderIdx: number) => {
      const folderId = folderIds.get(String(folder?.id));
      if (!folderId) return;
      const parentId = folder?.parentId != null
        ? folderIds.get(String(folder.parentId)) || getWorkspaceId(folder.workspaceId)
        : getWorkspaceId(folder.workspaceId);
      const { theme_color, theme_colors, icon } = extractZenSpaceTheme(folder);
      nodes.push({
        id: folderId,
        browser_name: "zen",
        os_type: osType,
        profile_name: profileName,
        // Zen stores split-tab collections in the same `folders` array as
        // ordinary folders. `splitViewGroup` is the distinguishing flag.
        node_type: folder?.splitViewGroup ? "split_view" : "folder",
        title: folder?.name || (folder?.splitViewGroup ? "Split View" : "Folder"),
        url: null,
        parent_id: parentId,
        sort_order: folderSortOrders.get(String(folder.id)) ?? folderIdx,
        snapshot_time: snapshotTime,
        lastUpdateTime: snapshotTime,
        theme_color,
        theme_colors,
        icon,
      });
    });

    tabs.forEach((tab: any, tabIdx: number) => {
      // Zen creates an empty about:blank tab as each folder's internal group
      // anchor. It is not displayed as a user tab and must not leak into Synctable.
      if (tab.zenIsEmpty) return;
      const activeEntryIdx = (tab.index || 1) - 1;
      const entry = tab.entries?.[activeEntryIdx] || tab.entries?.[tab.entries.length - 1];
      const url = entry?.url || null;
      const title = tab.zenStaticLabel?.trim() || entry?.title || tab.title || url || `Tab ${tabIdx + 1}`;
      const isPinned = Boolean(tab.pinned);
      const folderId = tab.groupId != null ? folderIds.get(String(tab.groupId)) : undefined;

      nodes.push({
        id: `zen-${profileId}-win-${winIdx}-tab-${tabIdx}`,
        browser_name: "zen",
        os_type: osType,
        profile_name: profileName,
        node_type: isPinned ? "pinned_tab" : "tab",
        title,
        url,
        parent_id: folderId || getWorkspaceId(tab.zenWorkspace),
        sort_order: tabIdx,
        snapshot_time: snapshotTime,
        lastUpdateTime: snapshotTime,
      });
    });
  });

  return nodes;
}
