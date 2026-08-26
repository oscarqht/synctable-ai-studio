import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import {
  extractZenColor,
  extractZenIcon,
  extractZenSpaceTheme,
  parseZenSessionData,
  parseZenSessionstore,
} from "./zen";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("extractZenColor", () => {
  test("extracts hex colors from various input formats", () => {
    expect(extractZenColor("#46eca8")).toBe("#46eca8");
    expect(extractZenColor("#FFF")).toBe("#ffffff");
    expect(extractZenColor("rgb(70, 236, 168)")).toBe("#46eca8");
    expect(extractZenColor("rgba(70, 236, 168, 0.8)")).toBe("#46eca8");
    expect(extractZenColor([70, 236, 168])).toBe("#46eca8");
    expect(extractZenColor({ c: [217, 199, 89] })).toBe("#d9c759");
    expect(extractZenColor({ c: "#5b6ea4" })).toBe("#5b6ea4");
    expect(extractZenColor({ r: 91, g: 110, b: 164 })).toBe("#5b6ea4");
    expect(extractZenColor({ red: 0.5, green: 0.5, blue: 0.5 })).toBe("#808080");
    expect(extractZenColor(null)).toBeNull();
    expect(extractZenColor("invalid")).toBeNull();
  });
});

describe("extractZenIcon", () => {
  test("extracts emojis and icon paths", () => {
    expect(extractZenIcon({ icon: "🎄" })).toBe("🎄");
    expect(extractZenIcon({ icon: "  🛳️  " })).toBe("🛳️");
    expect(extractZenIcon({ icon: "eye.svg" })).toBe("eye.svg");
    expect(extractZenIcon({ customIcon: "🧪" })).toBe("🧪");
    expect(extractZenIcon({ icon: { emoji: "💬" } })).toBe("💬");
    expect(extractZenIcon({ icon: "" })).toBeNull();
    expect(extractZenIcon({})).toBeNull();
  });
});

describe("extractZenSpaceTheme", () => {
  test("extracts theme colors and icons for single and gradient spaces", () => {
    const spaceGradient = {
      uuid: "test-space-1",
      name: "Personal",
      icon: "🎄",
      theme: {
        type: "gradient",
        gradientColors: [
          {
            c: [70, 236, 168],
            isPrimary: false,
          },
          {
            c: [217, 199, 89],
            isPrimary: true,
          },
        ],
      },
    };

    const extracted = extractZenSpaceTheme(spaceGradient);
    expect(extracted.icon).toBe("🎄");
    expect(extracted.theme_color).toBe("#d9c759");
    expect(extracted.theme_colors).toEqual(["#46eca8", "#d9c759"]);

    const spaceSolid = {
      uuid: "test-space-2",
      name: "Whisper",
      icon: "💬",
      theme: {
        type: "gradient",
        gradientColors: [
          {
            c: [91, 110, 164],
            isPrimary: true,
          },
        ],
      },
    };

    const extractedSolid = extractZenSpaceTheme(spaceSolid);
    expect(extractedSolid.icon).toBe("💬");
    expect(extractedSolid.theme_color).toBe("#5b6ea4");
    expect(extractedSolid.theme_colors).toEqual(["#5b6ea4"]);
  });
});

describe("parseZenSessionstore", () => {
  test("uses Zen's workspace and folder metadata for the live tab hierarchy including theme colors and icons", () => {
    const dir = mkdtempSync(join(tmpdir(), "synctable-zen-"));
    tempDirs.push(dir);
    const filePath = join(dir, "recovery.jsonlz4");
    writeFileSync(filePath, JSON.stringify({
      windows: [{
        spaces: [
          {
            uuid: "space-tree",
            name: "Treeee",
            icon: "🎄",
            theme: {
              type: "gradient",
              gradientColors: [
                {
                  c: [70, 236, 168],
                  isPrimary: true,
                },
              ],
            },
          },
          {
            uuid: "space-lab",
            name: "Lab",
            icon: "🧪",
            theme: {
              type: "gradient",
              gradientColors: [
                {
                  c: [217, 199, 89],
                  isPrimary: false,
                },
                {
                  c: [91, 110, 164],
                  isPrimary: true,
                },
              ],
            },
          },
        ],
        folders: [
          { id: "folder-later", name: "later", workspaceId: "space-tree", parentId: null, color: "#e8710a" },
          { id: "folder-test", name: "test", workspaceId: "space-tree", parentId: null, themeColor: "#1a73e8" },
        ],
        tabs: [
          {
            entries: [{ url: "about:blank" }],
            index: 1,
            pinned: true,
            zenIsEmpty: true,
            groupId: "folder-test",
          },
          {
            entries: [{ url: "https://jira.example/board", title: "Alpha board" }],
            index: 1,
            pinned: false,
            zenWorkspace: "space-tree",
            groupId: "folder-test",
            zenStaticLabel: "alpha board",
          },
          {
            entries: [{ url: "https://example.com/standalone", title: "Standalone page" }],
            index: 1,
            pinned: false,
            zenWorkspace: "space-tree",
          },
          {
            entries: [{ url: "about:blank" }],
            index: 1,
            pinned: true,
            zenIsEmpty: true,
            groupId: "folder-later",
          },
        ],
      }],
    }));

    const nodes = parseZenSessionstore({
      filePath,
      osType: "macos",
      profileName: "Default",
      snapshotTime: "2026-08-19T00:00:00.000Z",
    });

    const workspace = nodes.find((node) => node.node_type === "workspace" && node.title === "Treeee");
    const labWorkspace = nodes.find((node) => node.node_type === "workspace" && node.title === "Lab");
    const folder = nodes.find((node) => node.node_type === "folder" && node.title === "test");
    const laterFolder = nodes.find((node) => node.node_type === "folder" && node.title === "later");
    const tab = nodes.find((node) => node.url === "https://jira.example/board");

    expect(workspace?.title).toBe("Treeee");
    expect(workspace?.icon).toBe("🎄");
    expect(workspace?.theme_color).toBe("#46eca8");
    expect(workspace?.theme_colors).toEqual(["#46eca8"]);

    expect(labWorkspace?.title).toBe("Lab");
    expect(labWorkspace?.icon).toBe("🧪");
    expect(labWorkspace?.theme_color).toBe("#5b6ea4");
    expect(labWorkspace?.theme_colors).toEqual(["#d9c759", "#5b6ea4"]);

    expect(folder?.title).toBe("test");
    expect(folder?.theme_color).toBe("#1a73e8");
    expect(folder?.parent_id).toBe(workspace?.id);
    expect(laterFolder?.theme_color).toBe("#e8710a");
    expect(tab).toMatchObject({ parent_id: folder?.id, title: "alpha board" });
    expect(folder?.sort_order).toBe(0);
    expect(laterFolder?.sort_order).toBe(3);
    expect(nodes.some((node) => node.url === "about:blank")).toBe(false);
  });

  test("imports Zen split-view groups as split views instead of folders", () => {
    const nodes = parseZenSessionData({
      windows: [{
        spaces: [{ uuid: "space-tree", name: "Treeee" }],
        folders: [
          { id: "folder-synctable", name: "Synctable", workspaceId: "space-tree", parentId: null },
          {
            id: "split-synctable",
            name: "",
            parentId: "folder-synctable",
            splitViewGroup: true,
            workspaceId: null,
          },
        ],
        tabs: [
          {
            entries: [{ url: "about:blank" }],
            index: 1,
            zenIsEmpty: true,
            groupId: "folder-synctable",
          },
          {
            entries: [{ url: "https://trello.example/synctable", title: "Synctable task" }],
            index: 1,
            groupId: "split-synctable",
            zenWorkspace: "space-tree",
          },
          {
            entries: [{ url: "https://github.example/oscarqht/synctable", title: "Synctable repo" }],
            index: 1,
            groupId: "split-synctable",
            zenWorkspace: "space-tree",
          },
        ],
      }],
    }, {
      osType: "macos",
      profileName: "Default",
      snapshotTime: "2026-08-19T00:00:00.000Z",
    });

    const folder = nodes.find((node) => node.title === "Synctable");
    const splitView = nodes.find((node) => node.node_type === "split_view");
    expect(splitView).toMatchObject({ title: "Split View", parent_id: folder?.id });
    expect(nodes.filter((node) => node.parent_id === splitView?.id).map((node) => node.url)).toEqual([
      "https://trello.example/synctable",
      "https://github.example/oscarqht/synctable",
    ]);
    expect(nodes.some((node) => node.node_type === "folder" && node.id?.includes("split-synctable"))).toBe(false);
  });

  test("imports direct split tabs sharing a groupId as a split view in the workspace", () => {
    const nodes = parseZenSessionData({
      windows: [{
        spaces: [{ uuid: "space-lab", name: "Lab" }],
        folders: [],
        tabs: [
          {
            entries: [{ url: "https://trello.example/lab", title: "Lab task" }],
            index: 1,
            zenWorkspace: "space-lab",
            pinned: true,
          },
          {
            entries: [{ url: "https://figma.com/file/123", title: "Figma design" }],
            index: 1,
            groupId: "1787620893988-31",
            zenWorkspace: "space-lab",
            _zenIsActiveTab: true,
          },
          {
            entries: [{ url: "http://localhost:3002/app", title: "Local app" }],
            index: 1,
            groupId: "1787620893988-31",
            zenWorkspace: "space-lab",
            zenStaticLabel: "dev (3002)",
            _zenIsActiveTab: true,
          },
        ],
      }],
    }, {
      osType: "macos",
      profileName: "Default",
      snapshotTime: "2026-08-19T00:00:00.000Z",
    });

    const workspace = nodes.find((node) => node.node_type === "workspace" && node.title === "Lab");
    const splitView = nodes.find((node) => node.node_type === "split_view");
    expect(splitView).toMatchObject({ title: "Split View", parent_id: workspace?.id, sort_order: 1 });

    const splitChildren = nodes.filter((node) => node.parent_id === splitView?.id);
    expect(splitChildren.map((node) => ({ title: node.title, url: node.url }))).toEqual([
      { title: "Figma design", url: "https://figma.com/file/123" },
      { title: "dev (3002)", url: "http://localhost:3002/app" },
    ]);
  });

  test("maintains correct visual order when a split view follows sibling tabs inside a folder", () => {
    const nodes = parseZenSessionData({
      windows: [{
        spaces: [{ uuid: "space-ai", name: "AI" }],
        folders: [
          { id: "folder-lab", name: "Lab", workspaceId: "space-ai", parentId: null, splitViewGroup: false },
          { id: "split-lab-figma-dev", name: "", parentId: "folder-lab", workspaceId: null, splitViewGroup: true },
        ],
        tabs: [
          { entries: [{ url: "https://trello.example/general" }], zenWorkspace: "space-ai", zenStaticLabel: "general" }, // idx 0
          { entries: [{ url: "https://trello.example/shipyard" }], zenWorkspace: "space-ai", zenStaticLabel: "shipyard" }, // idx 1
          { entries: [{ url: "about:blank" }], zenIsEmpty: true, groupId: "folder-lab", zenWorkspace: "space-ai" }, // idx 2 (folder anchor)
          { entries: [{ url: "https://trello.example/todo" }], groupId: "folder-lab", zenWorkspace: "space-ai", zenStaticLabel: "todo" }, // idx 3
          { entries: [{ url: "https://example.com/api" }], groupId: "folder-lab", zenWorkspace: "space-ai", zenStaticLabel: "api" }, // idx 4
          { entries: [{ url: "https://example.com/design" }], groupId: "folder-lab", zenWorkspace: "space-ai", zenStaticLabel: "design" }, // idx 5
          { entries: [{ url: "https://figma.com/design" }], groupId: "split-lab-figma-dev", zenWorkspace: "space-ai", zenStaticLabel: "figma" }, // idx 6
          { entries: [{ url: "http://localhost:3002/lab" }], groupId: "split-lab-figma-dev", zenWorkspace: "space-ai", zenStaticLabel: "dev (3002)" }, // idx 7
          { entries: [{ url: "http://localhost:3100" }], zenWorkspace: "space-ai", zenStaticLabel: "changes" }, // idx 8
        ],
      }],
    }, {
      osType: "macos",
      profileName: "Default",
      snapshotTime: "2026-08-26T00:00:00.000Z",
    });

    const folderLab = nodes.find((n) => n.id.includes("folder-lab"));
    expect(folderLab).toBeDefined();

    // Children of folder Lab sorted by sort_order
    const labChildren = nodes.filter((n) => n.parent_id === folderLab?.id).sort((a, b) => a.sort_order - b.sort_order);
    expect(labChildren.map((n) => n.title)).toEqual([
      "todo",
      "api",
      "design",
      "Split View",
    ]);

    const splitNode = labChildren.find((n) => n.node_type === "split_view");
    expect(splitNode?.sort_order).toBe(6);

    const splitMembers = nodes.filter((n) => n.parent_id === splitNode?.id).sort((a, b) => a.sort_order - b.sort_order);
    expect(splitMembers.map((n) => n.title)).toEqual([
      "figma",
      "dev (3002)",
    ]);
  });
});


