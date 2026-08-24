import type { BrowserTreeNode } from "./types";

/**
 * Checks whether a URL starts with http:// or https:// (case-insensitive)
 */
export function isValidHttpUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const trimmed = url.trim().toLowerCase();
  return trimmed.startsWith("http://") || trimmed.startsWith("https://");
}

/**
 * Extracts hostname from URL for favicon and domain badges
 */
export function getDomain(urlStr: string | null): string {
  if (!urlStr || !isValidHttpUrl(urlStr)) return "";
  try {
    const url = new URL(urlStr);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * Generates Google S2 Favicon URL for a domain
 */
export function getFaviconUrl(urlStr: string | null): string {
  if (!urlStr || !isValidHttpUrl(urlStr)) return "";
  try {
    const url = new URL(urlStr);
    return `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=64`;
  } catch {
    return "";
  }
}

/**
 * Formats a relative timestamp (e.g. "Just now", "5m ago", "Yesterday")
 */
export function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (isNaN(diffMs)) return "Unknown";
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 45) return "Just now";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}h ago`;
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay === 1) return "Yesterday";
    if (diffDay < 7) return `${diffDay}d ago`;
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateString;
  }
}

/**
 * Recursively count the number of valid http/https tabs under a node.
 */
export function countTabs(node: BrowserTreeNode): number {
  if (!node) return 0;
  if (node.node_type === "tab" || node.node_type === "pinned_tab") {
    return isValidHttpUrl(node.url) ? 1 : 0;
  }
  if (!node.children || !Array.isArray(node.children) || node.children.length === 0) {
    return isValidHttpUrl(node.url) ? 1 : 0;
  }
  return node.children.reduce((sum, child) => sum + countTabs(child), 0);
}

/**
 * Recursively extracts all valid http/https tab URLs from a node in order.
 */
export function getAllTabUrls(node?: BrowserTreeNode | null): string[] {
  if (!node) return [];
  const urls: string[] = [];

  function traverse(n: BrowserTreeNode) {
    if ((n.node_type === "tab" || n.node_type === "pinned_tab") && isValidHttpUrl(n.url)) {
      urls.push(n.url!.trim());
      return;
    }
    if ((!n.children || n.children.length === 0) && isValidHttpUrl(n.url)) {
      urls.push(n.url!.trim());
      return;
    }
    if (n.children && Array.isArray(n.children)) {
      for (const child of n.children) {
        traverse(child);
      }
    }
  }

  traverse(node);
  return urls;
}

/**
 * Recursively prune empty containers and invalid/non-http tabs.
 * Returns null if the node itself or all of its children are empty.
 */
export function pruneEmptyNodes(node: BrowserTreeNode): BrowserTreeNode | null {
  if (!node) return null;

  // Leaf tab nodes: keep only if it has a valid http/https URL
  if (node.node_type === "tab" || node.node_type === "pinned_tab") {
    return isValidHttpUrl(node.url) ? node : null;
  }

  // Leaf node with no children: keep only if it has a valid http/https URL
  if (!node.children || !Array.isArray(node.children) || node.children.length === 0) {
    return isValidHttpUrl(node.url) ? node : null;
  }

  // Recursively prune children
  const prunedChildren = node.children
    .map(pruneEmptyNodes)
    .filter((child): child is BrowserTreeNode => child !== null);

  // If no children remain with valid http/https tabs, prune this container
  if (prunedChildren.length === 0) {
    return null;
  }

  return {
    ...node,
    children: prunedChildren,
  };
}

/**
 * Recursively count non-empty workspaces under a node.
 */
export function countWorkspaces(node: BrowserTreeNode): number {
  if (!node) return 0;
  return extractWorkspacesFromRoot(node).length;
}

export interface WorkspaceItem {
  id: string;
  browserName: string;
  browserTitle: string;
  profileName: string;
  windowTitle?: string;
  workspaceTitle: string;
  themeColor?: string | null;
  themeColors?: string[] | null;
  icon?: string | null;
  node: BrowserTreeNode;
  tabCount: number;
}

/**
 * Extracts individual non-empty workspace units from a browser root node.
 * For browsers with multiple profiles, windows, or workspaces, each workspace is returned
 * so it can be rendered as a separate card.
 */
export function extractWorkspacesFromRoot(rawRootNode: BrowserTreeNode): WorkspaceItem[] {
  const rootNode = pruneEmptyNodes(rawRootNode);
  if (!rootNode || countTabs(rootNode) === 0) return [];

  const browserName = (rootNode.browser_name || "browser").toLowerCase();
  const browserTitle = rootNode.title || rootNode.browser_name || "Browser";
  const profileName = rootNode.profile_name || "Default";

  const list: WorkspaceItem[] = [];

  // Check if rootNode has window children
  const windowChildren = (rootNode.children || []).filter(
    (c) => c.node_type === "window" && countTabs(c) > 0
  );

  if (windowChildren.length > 0) {
    for (const win of windowChildren) {
      const workspaceChildren = (win.children || []).filter(
        (c) => c.node_type === "workspace" && countTabs(c) > 0
      );

      if (workspaceChildren.length > 0) {
        for (const ws of workspaceChildren) {
          let wsTitle = ws.title?.trim() || "";
          if (!wsTitle || wsTitle === "Default Workspace" || wsTitle === "Main Workspace") {
            if (win.title && win.title !== "Main Window" && win.title !== "Default") {
              wsTitle = win.title;
            } else {
              wsTitle = ws.title || "Workspace";
            }
          }

          list.push({
            id: ws.id || `${rootNode.id}-${win.id}-${ws.id}`,
            browserName,
            browserTitle,
            profileName,
            windowTitle: win.title || undefined,
            workspaceTitle: wsTitle,
            themeColor: ws.theme_color,
            themeColors: ws.theme_colors,
            icon: ws.icon,
            node: ws,
            tabCount: countTabs(ws),
          });
        }
      } else {
        // Window has direct tabs/folders without workspace nodes
        list.push({
          id: win.id || `${rootNode.id}-${win.id}`,
          browserName,
          browserTitle,
          profileName,
          windowTitle: win.title || undefined,
          workspaceTitle: win.title || "Main Window",
          themeColor: win.theme_color,
          themeColors: win.theme_colors,
          icon: win.icon,
          node: {
            ...win,
            node_type: "workspace",
          },
          tabCount: countTabs(win),
        });
      }
    }
  } else {
    // No window children on rootNode. Check for workspace children directly.
    const workspaceChildren = (rootNode.children || []).filter(
      (c) => c.node_type === "workspace" && countTabs(c) > 0
    );

    if (workspaceChildren.length > 0) {
      for (const ws of workspaceChildren) {
        list.push({
          id: ws.id || `${rootNode.id}-${ws.id}`,
          browserName,
          browserTitle,
          profileName,
          workspaceTitle: ws.title || "Workspace",
          themeColor: ws.theme_color,
          themeColors: ws.theme_colors,
          icon: ws.icon,
          node: ws,
          tabCount: countTabs(ws),
        });
      }
    } else {
      // Root has direct tabs/folders
      list.push({
        id: `${rootNode.id}-workspace`,
        browserName,
        browserTitle,
        profileName,
        workspaceTitle: rootNode.title || "Personal",
        themeColor: rootNode.theme_color,
        themeColors: rootNode.theme_colors,
        icon: rootNode.icon,
        node: {
          ...rootNode,
          node_type: "workspace",
        },
        tabCount: countTabs(rootNode),
      });
    }
  }

  return list;
}

/**
 * Checks whether a hex color is dark enough to require light text
 */
export function isDarkColor(hexColor?: string | null): boolean {
  if (!hexColor || !hexColor.startsWith("#")) return false;
  const hex = hexColor.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16) || 0;
  const g = parseInt(hex.substring(2, 4), 16) || 0;
  const b = parseInt(hex.substring(4, 6), 16) || 0;
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq < 140;
}

/**
 * Generates solid background CSS properties for workspace cards using the main color.
 */
export function getWorkspaceGradientStyle(
  themeColors?: string[] | null,
  themeColor?: string | null,
  _isDark?: boolean
): React.CSSProperties | undefined {
  const colors = (themeColors || []).filter(
    (c): c is string => typeof c === "string" && Boolean(c.trim())
  );

  const mainColor =
    colors[0] || (typeof themeColor === "string" && themeColor.trim() ? themeColor : null);

  if (mainColor) {
    return {
      backgroundColor: mainColor,
    };
  }

  return undefined;
}
