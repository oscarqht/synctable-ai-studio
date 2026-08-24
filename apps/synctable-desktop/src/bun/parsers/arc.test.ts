import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { parseArcSidebar } from "./arc";

test("imports Arc's alternating sidebar records, folders, split views, and pinned tabs", () => {
  const directory = mkdtempSync(join(tmpdir(), "synctable-arc-"));
  const filePath = join(directory, "StorableSidebar.json");
  writeFileSync(filePath, JSON.stringify({ sidebar: { containers: [{ global: {} }, {
    topAppsContainerIDs: [{ default: true }, "favorites-root"],
    spaces: ["space-work", { id: "space-work", title: "Work", newContainerIDs: [{ unpinned: {} }, "open-root", { pinned: {} }, "pinned-root"] }],
    items: [
      "favorites-root", { id: "favorites-root", data: { itemContainer: {} }, childrenIds: ["favorite"] },
      "favorite", { id: "favorite", data: { tab: { savedURL: "https://favorite.example", savedTitle: "Favorite" } } },
      "pinned-root", { id: "pinned-root", data: { itemContainer: {} }, childrenIds: ["pin"] },
      "open-root", { id: "open-root", data: { itemContainer: {} }, childrenIds: ["folder", "split"] },
      "pin", { id: "pin", data: { tab: { savedURL: "https://pin.example", savedTitle: "Pinned" } } },
      "folder", { id: "folder", title: "Reading", data: { list: {} }, childrenIds: ["article"] },
      "article", { id: "article", data: { tab: { savedURL: "https://article.example", savedTitle: "Article" } } },
      "split", { id: "split", data: { splitView: {} }, childrenIds: ["left", "right", "nested-folder"] },
      "left", { id: "left", data: { tab: { savedURL: "https://left.example", savedTitle: "Left" } } },
      "right", { id: "right", data: { tab: { savedURL: "https://right.example", savedTitle: "Right" } } },
      "nested-folder", { id: "nested-folder", data: { list: {} }, childrenIds: ["not-in-split"] },
      "not-in-split", { id: "not-in-split", data: { tab: { savedURL: "https://ignored.example", savedTitle: "Ignored" } } },
    ],
  }] } }));

  const nodes = parseArcSidebar({ filePath, osType: "macos", profileName: "Default", snapshotTime: "now" });
  expect(nodes.filter((node) => node.node_type === "workspace").map((node) => node.title)).toEqual(["Favorites", "Work"]);
  expect(nodes.find((node) => node.title === "Favorite")?.parent_id).toBe("arc-space-arc-favorites-1");
  expect(nodes.find((node) => node.title === "Pinned")?.node_type).toBe("pinned_tab");
  expect(nodes.find((node) => node.title === "Reading")?.node_type).toBe("folder");
  const splitView = nodes.find((node) => node.title === "Split View");
  expect(splitView?.node_type).toBe("split_view");
  expect(nodes.filter((node) => node.parent_id === splitView?.id).map((node) => node.node_type)).toEqual(["tab", "tab"]);
  expect(nodes.find((node) => node.title === "Ignored")).toBeUndefined();
  expect(nodes.filter((node) => node.node_type === "tab").map((node) => node.url)).toEqual(["https://favorite.example", "https://article.example", "https://left.example", "https://right.example"]);
  expect(nodes.filter((node) => node.parent_id === "arc-space-space-work").map((node) => node.title)).toEqual(["Pinned", "Reading", "Split View"]);
});

test("preserves visual ordering when a split view is placed between pinned tabs in an Arc space", () => {
  const directory = mkdtempSync(join(tmpdir(), "synctable-arc-order-"));
  const filePath = join(directory, "StorableSidebar.json");
  writeFileSync(filePath, JSON.stringify({
    sidebar: {
      containers: [{
        spaces: [
          "space-lab",
          {
            id: "space-lab",
            title: "Lab",
            newContainerIDs: [{ pinned: {} }, "pinned-container", { unpinned: {} }, "unpinned-container"],
          },
        ],
        items: [
          "pinned-container", { id: "pinned-container", data: { itemContainer: {} }, childrenIds: ["tab-todo", "split-api-design", "tab-dev"] },
          "unpinned-container", { id: "unpinned-container", data: { itemContainer: {} }, childrenIds: [] },
          "tab-todo", { id: "tab-todo", data: { tab: { savedURL: "https://todo.example", savedTitle: "todo" } } },
          "split-api-design", { id: "split-api-design", data: { splitView: {} }, childrenIds: ["tab-api", "tab-design"] },
          "tab-api", { id: "tab-api", data: { tab: { savedURL: "https://api.example", savedTitle: "api" } } },
          "tab-design", { id: "tab-design", data: { tab: { savedURL: "https://design.example", savedTitle: "design" } } },
          "tab-dev", { id: "tab-dev", data: { tab: { savedURL: "https://localhost:3002", savedTitle: "dev" } } },
        ],
      }],
    },
  }));

  const nodes = parseArcSidebar({ filePath, osType: "macos", profileName: "Default", snapshotTime: "now" });
  const labSpace = nodes.find((n) => n.node_type === "workspace" && n.title === "Lab");
  expect(labSpace).toBeDefined();

  const workspaceChildren = nodes
    .filter((n) => n.parent_id === labSpace?.id)
    .sort((a, b) => a.sort_order - b.sort_order);

  expect(workspaceChildren.map((n) => ({ title: n.title, type: n.node_type }))).toEqual([
    { title: "todo", type: "pinned_tab" },
    { title: "Split View", type: "split_view" },
    { title: "dev", type: "pinned_tab" },
  ]);

  const splitChildren = nodes
    .filter((n) => n.parent_id === workspaceChildren[1].id)
    .sort((a, b) => a.sort_order - b.sort_order);

  expect(splitChildren.map((n) => ({ title: n.title, type: n.node_type }))).toEqual([
    { title: "api", type: "pinned_tab" },
    { title: "design", type: "pinned_tab" },
  ]);
});

test("extracts Arc space theme colors and emoji icons for single colors and blended gradients", () => {
  const directory = mkdtempSync(join(tmpdir(), "synctable-arc-theme-"));
  const filePath = join(directory, "StorableSidebar.json");
  writeFileSync(
    filePath,
    JSON.stringify({
      sidebar: {
        containers: [
          {
            spaces: [
              "space-gradient",
              {
                id: "space-gradient",
                title: "Personal",
                customInfo: {
                  iconType: { emoji_v2: "🐻" },
                  windowTheme: {
                    background: {
                      single: {
                        _0: {
                          style: {
                            color: {
                              _0: {
                                blendedGradient: {
                                  _0: {
                                    baseColors: [
                                      { red: 0.55798, green: 0.9438, blue: 0.80186, alpha: 1 },
                                      { red: 0.58469, green: 0.87624, blue: 0.94357, alpha: 1 },
                                    ],
                                    overlayColors: [
                                      { red: 0, green: 0, blue: 0, alpha: 0 },
                                      { red: 0.60075, green: 0.94302, blue: 0.61872, alpha: 1 },
                                    ],
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
              "space-solid",
              {
                id: "space-solid",
                title: "Work",
                customInfo: {
                  iconType: { emoji: 128188 },
                  windowTheme: {
                    background: {
                      single: {
                        _0: {
                          style: {
                            color: {
                              _0: {
                                blendedSingleColor: {
                                  _0: {
                                    color: { red: 0.2, green: 0.4, blue: 0.8, alpha: 1 },
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
              "space-palette-fallback",
              {
                id: "space-palette-fallback",
                title: "Fallback",
                customInfo: {
                  windowTheme: {
                    primaryColorPalette: {
                      midTone: { red: 0.9, green: 0.1, blue: 0.2, alpha: 1 },
                    },
                  },
                },
              },
            ],
            items: [],
          },
        ],
      },
    })
  );

  const nodes = parseArcSidebar({ filePath, osType: "macos", profileName: "Default", snapshotTime: "now" });
  const personalSpace = nodes.find((n) => n.id === "arc-space-space-gradient");
  expect(personalSpace).toBeDefined();
  expect(personalSpace?.icon).toBe("🐻");
  expect(personalSpace?.theme_color).toBe("#8ef1cc");
  expect(personalSpace?.theme_colors).toEqual(["#8ef1cc", "#95dff1", "#99f09e"]);

  const workSpace = nodes.find((n) => n.id === "arc-space-space-solid");
  expect(workSpace).toBeDefined();
  expect(workSpace?.icon).toBe("💼");
  expect(workSpace?.theme_color).toBe("#3366cc");
  expect(workSpace?.theme_colors).toEqual(["#3366cc"]);

  const fallbackSpace = nodes.find((n) => n.id === "arc-space-space-palette-fallback");
  expect(fallbackSpace).toBeDefined();
  expect(fallbackSpace?.theme_color).toBe("#e61a33");
  expect(fallbackSpace?.theme_colors).toEqual(["#e61a33"]);
});

