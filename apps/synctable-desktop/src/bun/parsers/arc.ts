import { existsSync, readFileSync } from "node:fs";
import type { BrowserTreeNode, OSType } from "../../shared/types";

export interface ArcParserOptions {
  filePath: string;
  osType: OSType;
  profileName: string;
  snapshotTime: string;
}

type ArcItem = Record<string, any> & { id?: string; parentID?: string; childrenIds?: unknown[] };
const ARC_SECTION_ORDER_OFFSET = 1_000_000;

/** Arc writes `spaces` and `items` as alternating [id, value] entries. */
function toArcMap(entries: unknown): Map<string, ArcItem> {
  const result = new Map<string, ArcItem>();
  if (Array.isArray(entries)) {
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      if (typeof entry === "string" && entries[index + 1] && typeof entries[index + 1] === "object") {
        result.set(entry, { ...(entries[index + 1] as ArcItem), id: (entries[index + 1] as ArcItem).id ?? entry });
        index += 1;
      } else if (entry && typeof entry === "object" && (entry as ArcItem).id) {
        result.set((entry as ArcItem).id!, entry as ArcItem);
      }
    }
  } else if (entries && typeof entries === "object") {
    for (const [id, value] of Object.entries(entries)) {
      if (value && typeof value === "object") result.set(id, { ...(value as ArcItem), id: (value as ArcItem).id ?? id });
    }
  }
  return result;
}

function arcId(value: unknown, fallback: string): string {
  return String(value ?? fallback).replace(/[^a-zA-Z0-9_-]/g, "_");
}

function itemKind(item: ArcItem): string | undefined {
  return Object.keys(item.data ?? {}).find((key) => ["tab", "list", "tabGroup", "itemContainer", "splitView"].includes(key));
}

function containerRoots(space: ArcItem): { id: string; pinned: boolean }[] {
  const roots: { id: string; pinned: boolean }[] = [];
  const values = space.newContainerIDs;
  if (!Array.isArray(values)) return roots;
  for (let index = 0; index < values.length - 1; index += 1) {
    const marker = values[index];
    const id = values[index + 1];
    if (typeof marker === "object" && marker && typeof id === "string") {
      roots.push({ id, pinned: "pinned" in marker });
      index += 1;
    }
  }
  return roots;
}

function topAppContainerIds(container: any): string[] {
  const values = container?.topAppsContainerIDs;
  if (!Array.isArray(values)) return [];
  return values.filter((value: unknown): value is string => typeof value === "string");
}

function clamp255(val: unknown): number {
  if (typeof val !== "number" || isNaN(val)) return 0;
  // If val is > 1.5, assume it is an integer in 0..255 range; otherwise treat as 0..1 float
  const normalized = val > 1.5 ? val : val * 255;
  return Math.min(255, Math.max(0, Math.round(normalized)));
}

export function extractArcColor(colorObj: unknown): string | null {
  if (!colorObj || typeof colorObj !== "object") return null;
  const obj = colorObj as any;
  if (typeof obj === "string" && obj.startsWith("#")) return obj;
  if (typeof obj.hex === "string" && obj.hex.startsWith("#")) return obj.hex;
  if (obj._0 && typeof obj._0 === "object") {
    const from0 = extractArcColor(obj._0);
    if (from0) return from0;
  }
  if (obj.color && typeof obj.color === "object") {
    const fromColor = extractArcColor(obj.color);
    if (fromColor) return fromColor;
  }
  const r = obj.red ?? obj.r;
  const g = obj.green ?? obj.g;
  const b = obj.blue ?? obj.b;
  if (typeof r === "number" && typeof g === "number" && typeof b === "number") {
    const hr = clamp255(r).toString(16).padStart(2, "0");
    const hg = clamp255(g).toString(16).padStart(2, "0");
    const hb = clamp255(b).toString(16).padStart(2, "0");
    return `#${hr}${hg}${hb}`;
  }
  return null;
}

export function extractArcIcon(space: ArcItem): string | null {
  const iconType = space.customInfo?.iconType ?? space.iconType ?? space.customInfo?.icon ?? space.icon;
  if (!iconType) return null;
  if (typeof iconType === "string") return iconType.trim() || null;
  if (typeof iconType.emoji_v2 === "string" && iconType.emoji_v2.trim()) {
    return iconType.emoji_v2.trim();
  }
  if (typeof iconType.emoji === "number") {
    try {
      return String.fromCodePoint(iconType.emoji);
    } catch {
      // ignore
    }
  } else if (typeof iconType.emoji === "string" && iconType.emoji.trim()) {
    return iconType.emoji.trim();
  }
  if (typeof iconType.icon === "string" && iconType.icon.trim()) {
    return iconType.icon.trim();
  }
  if (typeof iconType.sfSymbol === "string" && iconType.sfSymbol.trim()) {
    return iconType.sfSymbol.trim();
  }
  return null;
}

function extractColorsFromTarget(target: any, colors: string[], maxColors = 6): void {
  if (!target || typeof target !== "object" || colors.length >= maxColors) return;

  // Direct color object
  const directHex = extractArcColor(target);
  if (directHex && (target.alpha === undefined || target.alpha > 0.01)) {
    if (!colors.includes(directHex)) colors.push(directHex);
    return;
  }

  // Base colors, overlay colors, colors, colorList arrays
  const arrayProps = ["baseColors", "overlayColors", "colors", "colorList", "stops"];
  for (const prop of arrayProps) {
    if (Array.isArray(target[prop])) {
      for (const item of target[prop]) {
        if (item && (item.alpha === undefined || item.alpha > 0.01)) {
          const hex = extractArcColor(item);
          if (hex && !colors.includes(hex) && colors.length < maxColors) {
            colors.push(hex);
          }
        }
      }
    }
  }

  if (colors.length > 0) return;

  // Traverse nested known style/gradient/color wrappers
  const priorityKeys = [
    "single",
    "_0",
    "style",
    "color",
    "blendedGradient",
    "blendedLinearGradient",
    "blendedRadialGradient",
    "blendedSingleColor",
    "singleColor",
    "gradient",
    "linearGradient",
    "radialGradient",
  ];

  for (const key of priorityKeys) {
    if (target[key] && typeof target[key] === "object") {
      extractColorsFromTarget(target[key], colors, maxColors);
      if (colors.length > 0) return;
    }
  }

  // Generic fallback traversal for any remaining sub-objects
  for (const [key, val] of Object.entries(target)) {
    if (
      !priorityKeys.includes(key) &&
      !arrayProps.includes(key) &&
      val &&
      typeof val === "object" &&
      key !== "primaryColorPalette" &&
      key !== "semanticColorPalette" &&
      key !== "modifiers" &&
      key !== "wheel"
    ) {
      extractColorsFromTarget(val, colors, maxColors);
      if (colors.length > 0) return;
    }
  }
}

export function extractArcSpaceTheme(space: ArcItem): {
  theme_color: string | null;
  theme_colors: string[] | null;
  icon: string | null;
} {
  const colors: string[] = [];

  const windowTheme = space.customInfo?.windowTheme ?? space.windowTheme ?? space.theme ?? space.customInfo?.theme;
  if (windowTheme && typeof windowTheme === "object") {
    // 1. Background style / gradient / colors
    if (windowTheme.background) {
      extractColorsFromTarget(windowTheme.background, colors);
    }
    if (colors.length === 0 && (windowTheme.gradient || windowTheme.color || windowTheme.style)) {
      extractColorsFromTarget(windowTheme, colors);
    }

    // 2. Primary Color Palette fallback
    if (colors.length === 0 && windowTheme.primaryColorPalette) {
      const p = windowTheme.primaryColorPalette;
      const palette = [p.midTone, p.shaded, p.shadedDark, p.tintedLight];
      for (const item of palette) {
        const hex = extractArcColor(item);
        if (hex && !colors.includes(hex)) colors.push(hex);
      }
    }

    // 3. Semantic Color Palette fallback
    if (colors.length === 0 && windowTheme.semanticColorPalette?.appearanceBased) {
      const app = windowTheme.semanticColorPalette.appearanceBased;
      const palette = app.light || app.dark;
      if (palette) {
        const hex1 = extractArcColor(palette.background);
        if (hex1 && !colors.includes(hex1)) colors.push(hex1);
        const hex2 = extractArcColor(palette.foregroundPrimary);
        if (hex2 && !colors.includes(hex2)) colors.push(hex2);
      }
    }
  }

  // 4. Fallback direct color fields
  if (colors.length === 0) {
    if (space.customInfo?.color) {
      const h = extractArcColor(space.customInfo.color);
      if (h && !colors.includes(h)) colors.push(h);
    }
    if (space.color) {
      const h = extractArcColor(space.color);
      if (h && !colors.includes(h)) colors.push(h);
    }
  }

  const icon = extractArcIcon(space);
  const theme_color = colors.length > 0 ? colors[0] : null;
  const theme_colors = colors.length > 0 ? colors : null;

  return { theme_color, theme_colors, icon };
}

export function parseArcSidebar(options: ArcParserOptions): BrowserTreeNode[] {
  const { filePath, osType, profileName, snapshotTime } = options;
  if (!existsSync(filePath)) return [];
  const data = JSON.parse(readFileSync(filePath, "utf-8"));
  const containers = data?.sidebar?.containers ?? [data?.sidebar ?? data];
  const nodes: BrowserTreeNode[] = [];
  const rootId = `arc-${osType}-${arcId(profileName, "default")}-root`;
  const windowId = `arc-${arcId(profileName, "default")}-win-default`;
  const addNode = (node: Omit<BrowserTreeNode, "browser_name" | "os_type" | "profile_name" | "snapshot_time">) =>
    nodes.push({
      ...node,
      browser_name: "arc",
      os_type: osType,
      profile_name: profileName,
      snapshot_time: snapshotTime,
      lastUpdateTime: snapshotTime,
    });

  addNode({ id: rootId, node_type: "root", title: "Arc Browser", url: null, parent_id: null, sort_order: 0 });
  addNode({ id: windowId, node_type: "window", title: "Main Window", url: null, parent_id: rootId, sort_order: 0 });

  let workspaceIndex = 0;
  for (const [containerIndex, container] of containers.entries()) {
    let spaces = toArcMap(container?.spaces);
    const items = toArcMap(container?.items);
    const favoriteContainerIds = topAppContainerIds(container);
    if (favoriteContainerIds.length > 0) {
      // Arc keeps Favorites in a profile-level top-apps container rather than
      // in any Space. Model it as its own leading workspace so it appears once
      // in the tree without duplicating the same favorites under every Space.
      const favoriteSpace: ArcItem = {
        id: `arc-favorites-${containerIndex}`,
        title: "Favorites",
        newContainerIDs: favoriteContainerIds.flatMap((id) => [{ favorites: true }, id]),
      };
      spaces = new Map([[favoriteSpace.id!, favoriteSpace], ...spaces]);
    }
    for (const [spaceKey, space] of spaces) {
      const workspaceId = `arc-space-${arcId(space.id ?? spaceKey, `space-${workspaceIndex}`)}`;
      const { theme_color, theme_colors, icon } = extractArcSpaceTheme(space);
      addNode({
        id: workspaceId,
        node_type: "workspace",
        title: space.title || `Space ${workspaceIndex + 1}`,
        url: null,
        parent_id: windowId,
        sort_order: workspaceIndex++,
        theme_color,
        theme_colors,
        icon,
      });
      const visited = new Set<string>();
      const walk = (itemId: string, parentId: string, sortOrder: number, pinned: boolean): void => {
        if (visited.has(itemId)) return;
        const item = items.get(itemId);
        if (!item) return;
        visited.add(itemId);
        const kind = itemKind(item);
        const possibleChildren: unknown[] = Array.isArray(item.childrenIds)
          ? item.childrenIds
          : Array.isArray(item.children)
            ? item.children
            : [];
        const children = possibleChildren.filter((child): child is string => typeof child === "string");
        if (kind === "itemContainer") {
          // The container itself is not displayed in Arc. Keep the two sections
          // disjoint after flattening it so regular tabs cannot tie with (and
          // sort ahead of) pinned tabs in the database's global sort order.
          children.forEach((child, index) => walk(child, parentId, sortOrder + index, pinned));
          return;
        }
        const itemIdForTree = `arc-item-${arcId(item.id ?? itemId, itemId)}`;
        if (kind === "splitView") {
          // Arc split views are a non-nestable collection of the tabs displayed
          // together. Keep that semantic distinction instead of treating them
          // as folders, and do not admit a nested folder into the collection.
          addNode({ id: itemIdForTree, node_type: "split_view", title: item.title || "Split View", url: null, parent_id: parentId, sort_order: sortOrder });
          children.forEach((child, index) => {
            const childItem = items.get(child);
            if (!childItem || itemKind(childItem) !== "tab" || visited.has(child)) return;
            // Insert the child directly rather than recursing: even malformed
            // sidebar data cannot make a split view contain a nested container.
            visited.add(child);
            const tab = childItem.data?.tab ?? {};
            const url = tab.savedURL || tab.url || childItem.url || childItem.data?.url || null;
            addNode({
              id: `arc-item-${arcId(childItem.id ?? child, child)}`,
              node_type: pinned || tab.pinned || childItem.isPinned ? "pinned_tab" : "tab",
              title: childItem.title || tab.savedTitle || childItem.data?.title || url || "Tab",
              url,
              parent_id: itemIdForTree,
              sort_order: index,
            });
          });
          return;
        }
        if (kind === "list" || kind === "tabGroup" || children.length > 0) {
          const { theme_color, theme_colors, icon } = extractArcSpaceTheme(item);
          addNode({
            id: itemIdForTree,
            node_type: "folder",
            title: item.title || item.data?.tabGroup?.title || "Folder",
            url: null,
            parent_id: parentId,
            sort_order: sortOrder,
            theme_color,
            theme_colors,
            icon,
          });
          children.forEach((child, index) => walk(child, itemIdForTree, index, pinned));
          return;
        }
        const tab = item.data?.tab ?? {};
        const url = tab.savedURL || tab.url || item.url || item.data?.url || null;
        addNode({ id: itemIdForTree, node_type: pinned || tab.pinned || item.isPinned ? "pinned_tab" : "tab", title: item.title || tab.savedTitle || item.data?.title || url || "Tab", url, parent_id: parentId, sort_order: sortOrder });
      };
      const roots = containerRoots(space).sort((left, right) => Number(right.pinned) - Number(left.pinned));
      roots.forEach((root, index) => walk(root.id, workspaceId, index * ARC_SECTION_ORDER_OFFSET, root.pinned));
      if (roots.length === 0) {
        [...items.entries()].filter(([, item]) => item.parentID === space.id || item.parentID === spaceKey).forEach(([itemId], index) => walk(itemId, workspaceId, index, false));
      }
    }
  }
  return nodes;
}
