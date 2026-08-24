import { describe, it, expect } from "bun:test";
import { countTabs, countWorkspaces, extractWorkspacesFromRoot, getWorkspaceGradientStyle, getAllTabUrls } from "./treeUtils";
import type { BrowserTreeNode } from "./types";

describe("treeUtils - workspace extraction", () => {
  it("extracts each workspace as a separate card item for Arc Browser with multiple spaces", () => {
    const arcTree: BrowserTreeNode = {
      id: "arc-macos-default-root",
      browser_name: "arc",
      os_type: "macos",
      profile_name: "default",
      node_type: "root",
      title: "Arc Browser",
      url: null,
      parent_id: null,
      sort_order: 0,
      snapshot_time: "2026-08-20T10:00:00Z",
      children: [
        {
          id: "arc-default-win-default",
          browser_name: "arc",
          os_type: "macos",
          profile_name: "default",
          node_type: "window",
          title: "Main Window",
          url: null,
          parent_id: "arc-macos-default-root",
          sort_order: 0,
          snapshot_time: "2026-08-20T10:00:00Z",
          children: [
            {
              id: "arc-favorites",
              browser_name: "arc",
              os_type: "macos",
              profile_name: "default",
              node_type: "workspace",
              title: "Favorites",
              url: null,
              parent_id: "arc-default-win-default",
              sort_order: 0,
              snapshot_time: "2026-08-20T10:00:00Z",
              children: [
                {
                  id: "tab-1",
                  browser_name: "arc",
                  os_type: "macos",
                  profile_name: "default",
                  node_type: "tab",
                  title: "YouTube Music",
                  url: "https://music.youtube.com",
                  parent_id: "arc-favorites",
                  sort_order: 0,
                  snapshot_time: "2026-08-20T10:00:00Z",
                },
              ],
            },
            {
              id: "arc-space-oscar",
              browser_name: "arc",
              os_type: "macos",
              profile_name: "default",
              node_type: "workspace",
              title: "Oscar",
              url: null,
              parent_id: "arc-default-win-default",
              sort_order: 1,
              snapshot_time: "2026-08-20T10:00:00Z",
              theme_color: "#8ef1cc",
              theme_colors: ["#8ef1cc", "#95dff1", "#99f09e"],
              icon: "🐻",
              children: [
                {
                  id: "tab-2",
                  browser_name: "arc",
                  os_type: "macos",
                  profile_name: "default",
                  node_type: "tab",
                  title: "GitHub",
                  url: "https://github.com",
                  parent_id: "arc-space-oscar",
                  sort_order: 0,
                  snapshot_time: "2026-08-20T10:00:00Z",
                },
              ],
            },
            {
              id: "arc-space-test",
              browser_name: "arc",
              os_type: "macos",
              profile_name: "default",
              node_type: "workspace",
              title: "Test",
              url: null,
              parent_id: "arc-default-win-default",
              sort_order: 2,
              snapshot_time: "2026-08-20T10:00:00Z",
              theme_color: "#ffffff",
              theme_colors: ["#ffffff"],
              children: [
                {
                  id: "tab-3",
                  browser_name: "arc",
                  os_type: "macos",
                  profile_name: "default",
                  node_type: "tab",
                  title: "Google",
                  url: "https://google.com",
                  parent_id: "arc-space-test",
                  sort_order: 0,
                  snapshot_time: "2026-08-20T10:00:00Z",
                },
              ],
            },
          ],
        },
      ],
    };

    const workspaces = extractWorkspacesFromRoot(arcTree);
    expect(workspaces).toHaveLength(3);
    expect(workspaces[0].workspaceTitle).toBe("Favorites");
    expect(workspaces[0].tabCount).toBe(1);
    expect(workspaces[1].workspaceTitle).toBe("Oscar");
    expect(workspaces[1].tabCount).toBe(1);
    expect(workspaces[1].themeColor).toBe("#8ef1cc");
    expect(workspaces[1].themeColors).toEqual(["#8ef1cc", "#95dff1", "#99f09e"]);
    expect(workspaces[1].icon).toBe("🐻");
    expect(workspaces[2].workspaceTitle).toBe("Test");
    expect(workspaces[2].tabCount).toBe(1);
    expect(workspaces[2].themeColor).toBe("#ffffff");

    expect(countWorkspaces(arcTree)).toBe(3);
    expect(countTabs(arcTree)).toBe(3);
  });

  it("extracts multiple windows as separate cards when windows have default workspaces", () => {
    const chromeTree: BrowserTreeNode = {
      id: "chrome-macos-default-root",
      browser_name: "chrome",
      os_type: "macos",
      profile_name: "default",
      node_type: "root",
      title: "Chrome (default)",
      url: null,
      parent_id: null,
      sort_order: 0,
      snapshot_time: "2026-08-20T10:00:00Z",
      children: [
        {
          id: "chrome-win-1",
          browser_name: "chrome",
          os_type: "macos",
          profile_name: "default",
          node_type: "window",
          title: "Chrome Window 1",
          url: null,
          parent_id: "chrome-macos-default-root",
          sort_order: 0,
          snapshot_time: "2026-08-20T10:00:00Z",
          children: [
            {
              id: "chrome-ws-1",
              browser_name: "chrome",
              os_type: "macos",
              profile_name: "default",
              node_type: "workspace",
              title: "Default Workspace",
              url: null,
              parent_id: "chrome-win-1",
              sort_order: 0,
              snapshot_time: "2026-08-20T10:00:00Z",
              children: [
                {
                  id: "tab-c1",
                  browser_name: "chrome",
                  os_type: "macos",
                  profile_name: "default",
                  node_type: "tab",
                  title: "Vercel",
                  url: "https://vercel.com",
                  parent_id: "chrome-ws-1",
                  sort_order: 0,
                  snapshot_time: "2026-08-20T10:00:00Z",
                },
              ],
            },
          ],
        },
        {
          id: "chrome-win-2",
          browser_name: "chrome",
          os_type: "macos",
          profile_name: "default",
          node_type: "window",
          title: "Chrome Window 2",
          url: null,
          parent_id: "chrome-macos-default-root",
          sort_order: 1,
          snapshot_time: "2026-08-20T10:00:00Z",
          children: [
            {
              id: "chrome-ws-2",
              browser_name: "chrome",
              os_type: "macos",
              profile_name: "default",
              node_type: "workspace",
              title: "Default Workspace",
              url: null,
              parent_id: "chrome-win-2",
              sort_order: 0,
              snapshot_time: "2026-08-20T10:00:00Z",
              children: [
                {
                  id: "tab-c2",
                  browser_name: "chrome",
                  os_type: "macos",
                  profile_name: "default",
                  node_type: "tab",
                  title: "Next.js",
                  url: "https://nextjs.org",
                  parent_id: "chrome-ws-2",
                  sort_order: 0,
                  snapshot_time: "2026-08-20T10:00:00Z",
                },
              ],
            },
          ],
        },
      ],
    };

    const workspaces = extractWorkspacesFromRoot(chromeTree);
    expect(workspaces).toHaveLength(2);
    expect(workspaces[0].workspaceTitle).toBe("Chrome Window 1");
    expect(workspaces[1].workspaceTitle).toBe("Chrome Window 2");
  });

  it("uses the main color to render the workspace card as solid color background with getWorkspaceGradientStyle", () => {
    // Multi-color / gradient theme uses the main color as solid background
    const multiStyle = getWorkspaceGradientStyle(["#8ef1cc", "#95dff1", "#99f09e"], "#8ef1cc");
    expect(multiStyle).toBeDefined();
    expect(multiStyle?.backgroundColor).toBe("#8ef1cc");
    expect(multiStyle?.backgroundImage).toBeUndefined();

    // Single color subtle theme
    const singleStyle = getWorkspaceGradientStyle(null, "#3366cc");
    expect(singleStyle).toBeDefined();
    expect(singleStyle?.backgroundColor).toBe("#3366cc");
    expect(singleStyle?.backgroundImage).toBeUndefined();

    // Empty/null
    expect(getWorkspaceGradientStyle(null, null)).toBeUndefined();
    expect(getWorkspaceGradientStyle([], null)).toBeUndefined();
  });
});

describe("treeUtils - getAllTabUrls", () => {
  it("extracts all valid http/https URLs from a workspace with pinned tabs, folders, and split views in tree order", () => {
    const complexWorkspace: BrowserTreeNode = {
      id: "ws-1",
      browser_name: "zen",
      os_type: "macos",
      profile_name: "default",
      node_type: "workspace",
      title: "Dev Workspace",
      url: null,
      parent_id: null,
      sort_order: 0,
      snapshot_time: "2026-08-20T10:00:00Z",
      children: [
        {
          id: "pinned-1",
          browser_name: "zen",
          os_type: "macos",
          profile_name: "default",
          node_type: "pinned_tab",
          title: "GitHub",
          url: "https://github.com/oscarqht/synctable",
          parent_id: "ws-1",
          sort_order: 0,
          snapshot_time: "2026-08-20T10:00:00Z",
        },
        {
          id: "folder-1",
          browser_name: "zen",
          os_type: "macos",
          profile_name: "default",
          node_type: "folder",
          title: "Documentation",
          url: null,
          parent_id: "ws-1",
          sort_order: 1,
          snapshot_time: "2026-08-20T10:00:00Z",
          children: [
            {
              id: "tab-doc-1",
              browser_name: "zen",
              os_type: "macos",
              profile_name: "default",
              node_type: "tab",
              title: "React Docs",
              url: "https://react.dev",
              parent_id: "folder-1",
              sort_order: 0,
              snapshot_time: "2026-08-20T10:00:00Z",
            },
            {
              id: "tab-doc-2",
              browser_name: "zen",
              os_type: "macos",
              profile_name: "default",
              node_type: "tab",
              title: "MDN Web Docs",
              url: "https://developer.mozilla.org",
              parent_id: "folder-1",
              sort_order: 1,
              snapshot_time: "2026-08-20T10:00:00Z",
            },
          ],
        },
        {
          id: "split-1",
          browser_name: "zen",
          os_type: "macos",
          profile_name: "default",
          node_type: "split_view",
          title: "Side by Side",
          url: null,
          parent_id: "ws-1",
          sort_order: 2,
          snapshot_time: "2026-08-20T10:00:00Z",
          children: [
            {
              id: "tab-split-left",
              browser_name: "zen",
              os_type: "macos",
              profile_name: "default",
              node_type: "tab",
              title: "Vite",
              url: "https://vitejs.dev",
              parent_id: "split-1",
              sort_order: 0,
              snapshot_time: "2026-08-20T10:00:00Z",
            },
            {
              id: "tab-split-right",
              browser_name: "zen",
              os_type: "macos",
              profile_name: "default",
              node_type: "tab",
              title: "Bun",
              url: "https://bun.sh",
              parent_id: "split-1",
              sort_order: 1,
              snapshot_time: "2026-08-20T10:00:00Z",
            },
          ],
        },
        {
          id: "tab-regular",
          browser_name: "zen",
          os_type: "macos",
          profile_name: "default",
          node_type: "tab",
          title: "Twitter",
          url: "https://x.com",
          parent_id: "ws-1",
          sort_order: 3,
          snapshot_time: "2026-08-20T10:00:00Z",
        },
        {
          id: "tab-about-blank",
          browser_name: "zen",
          os_type: "macos",
          profile_name: "default",
          node_type: "tab",
          title: "New Tab",
          url: "about:blank",
          parent_id: "ws-1",
          sort_order: 4,
          snapshot_time: "2026-08-20T10:00:00Z",
        },
      ],
    };

    const workspaceUrls = getAllTabUrls(complexWorkspace);
    expect(workspaceUrls).toEqual([
      "https://github.com/oscarqht/synctable",
      "https://react.dev",
      "https://developer.mozilla.org",
      "https://vitejs.dev",
      "https://bun.sh",
      "https://x.com",
    ]);

    // Folder extraction
    const folderUrls = getAllTabUrls(complexWorkspace.children![1]);
    expect(folderUrls).toEqual([
      "https://react.dev",
      "https://developer.mozilla.org",
    ]);

    // Split view extraction
    const splitUrls = getAllTabUrls(complexWorkspace.children![2]);
    expect(splitUrls).toEqual([
      "https://vitejs.dev",
      "https://bun.sh",
    ]);

    // Single tab node
    expect(getAllTabUrls(complexWorkspace.children![0])).toEqual([
      "https://github.com/oscarqht/synctable",
    ]);

    // Invalid / empty URL node
    expect(getAllTabUrls(complexWorkspace.children![4])).toEqual([]);

    // Null or undefined
    expect(getAllTabUrls(null)).toEqual([]);
    expect(getAllTabUrls(undefined)).toEqual([]);
  });
});

describe("treeUtils - browser lastUpdateTime sorting", () => {
  it("sorts browsers in descending order of lastUpdateTime", () => {
    const devicesTrees: BrowserTreeNode[] = [
      {
        id: "chrome-root",
        browser_name: "chrome",
        os_type: "macos",
        profile_name: "default",
        node_type: "root",
        title: "Chrome",
        url: null,
        parent_id: null,
        sort_order: 0,
        snapshot_time: "2026-08-21T09:00:00Z",
        lastUpdateTime: "2026-08-21T09:00:00Z",
        children: [
          {
            id: "chrome-tab",
            browser_name: "chrome",
            os_type: "macos",
            profile_name: "default",
            node_type: "tab",
            title: "Google",
            url: "https://google.com",
            parent_id: "chrome-root",
            sort_order: 0,
            snapshot_time: "2026-08-21T09:00:00Z",
            lastUpdateTime: "2026-08-21T09:00:00Z",
          },
        ],
      },
      {
        id: "arc-root",
        browser_name: "arc",
        os_type: "macos",
        profile_name: "default",
        node_type: "root",
        title: "Arc",
        url: null,
        parent_id: null,
        sort_order: 0,
        snapshot_time: "2026-08-21T15:00:00Z",
        lastUpdateTime: "2026-08-21T15:00:00Z",
        children: [
          {
            id: "arc-tab",
            browser_name: "arc",
            os_type: "macos",
            profile_name: "default",
            node_type: "tab",
            title: "Arc Home",
            url: "https://arc.net",
            parent_id: "arc-root",
            sort_order: 0,
            snapshot_time: "2026-08-21T15:00:00Z",
            lastUpdateTime: "2026-08-21T15:00:00Z",
          },
        ],
      },
      {
        id: "zen-root",
        browser_name: "zen",
        os_type: "macos",
        profile_name: "default",
        node_type: "root",
        title: "Zen",
        url: null,
        parent_id: null,
        sort_order: 0,
        snapshot_time: "2026-08-21T12:00:00Z",
        lastUpdateTime: "2026-08-21T12:00:00Z",
        children: [
          {
            id: "zen-tab",
            browser_name: "zen",
            os_type: "macos",
            profile_name: "default",
            node_type: "tab",
            title: "Zen Browser",
            url: "https://zen-browser.app",
            parent_id: "zen-root",
            sort_order: 0,
            snapshot_time: "2026-08-21T12:00:00Z",
            lastUpdateTime: "2026-08-21T12:00:00Z",
          },
        ],
      },
    ];

    const browserTimeMap = new Map<string, string>();
    devicesTrees.forEach((node) => {
      if (node.browser_name && countTabs(node) > 0) {
        const b = node.browser_name.toLowerCase();
        const time = node.lastUpdateTime || node.snapshot_time || "";
        const existing = browserTimeMap.get(b) || "";
        if (time > existing) {
          browserTimeMap.set(b, time);
        }
      }
    });

    const sortedBrowsers = Array.from(browserTimeMap.keys()).sort((a, b) => {
      const timeA = browserTimeMap.get(a) || "";
      const timeB = browserTimeMap.get(b) || "";
      return timeB.localeCompare(timeA);
    });

    expect(sortedBrowsers).toEqual(["arc", "zen", "chrome"]);
  });
});
