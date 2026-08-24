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
});

