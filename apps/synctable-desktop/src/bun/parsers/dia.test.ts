import { describe, expect, test } from "bun:test";
import { buildDiaNodes, type DiaDatabaseDump } from "./dia";

const timestamp = "2026-08-19T00:00:00.000Z";

function database(profile: string, spaceId: string, spaceTitle: string, rows: DiaDatabaseDump["tables"]): DiaDatabaseDump {
  return {
    path: `/Dia/User Data/${profile}/tabs.db`,
    context: `profile/${profile}/tabs`,
    tables: {
      spaces: [{ id: spaceId, title: spaceTitle }],
      tab_groups: [],
      content_panes: [],
      web_contents: [],
      ...rows,
    },
  };
}

function pane(tabNodeId: string, id: string, order = 0) {
  return { id: `${id}-node`, kind: "content_pane", entity_id: id, parent_id: tabNodeId, order, deleted_at: null };
}

function tab(tabNodeId: string, parentId: string, order: number, spaceId: string, paneId: string) {
  return [
    { id: tabNodeId, kind: "tab", entity_id: `${tabNodeId}-record`, parent_id: parentId, order, space_id: spaceId, deleted_at: null },
    pane(tabNodeId, paneId),
  ];
}

function web(paneId: string, title: string, url = `https://${title.toLowerCase().replaceAll(" ", "")}.example`) {
  return {
    pane: { id: paneId, node_id: `${paneId}-node`, custom_title: title === "test" || title === "rd" ? title : null },
    web: { id: `${paneId}-web`, content_pane_id: paneId, title, url },
  };
}

describe("buildDiaNodes", () => {
  test("imports a Dia tab with multiple content panes as a split view", () => {
    const nodes = buildDiaNodes({ databases: [database("Default", "tree-space", "Treeee", {
      nodes: [
        { id: "tree-window", kind: "window", entity_id: "tree-window-record", parent_id: null, order: 0, space_id: "tree-space", deleted_at: null },
        { id: "split-tab", kind: "tab", entity_id: "split-tab-record", parent_id: "tree-window", order: 0, space_id: "tree-space", deleted_at: null },
        pane("split-tab", "google-pane", 0),
        pane("split-tab", "x-pane", 1),
      ],
      windows: [{ id: "tree-window-record", node_id: "tree-window", focused_space_id: "tree-space" }],
      content_panes: [
        { id: "google-pane", node_id: "google-pane-node", custom_title: null },
        { id: "x-pane", node_id: "x-pane-node", custom_title: null },
      ],
      web_contents: [
        { id: "google-web", content_pane_id: "google-pane", title: "Google", url: "https://www.google.com/" },
        { id: "x-web", content_pane_id: "x-pane", title: "Home / X", url: "https://x.com/home" },
      ],
    })] }, { osType: "macos", snapshotTime: timestamp });

    const splitView = nodes.find((node) => node.node_type === "split_view");
    expect(splitView).toMatchObject({ title: "Split View" });
    expect(nodes.filter((node) => node.parent_id === splitView?.id).map((node) => ({
      type: node.node_type,
      title: node.title,
      url: node.url,
    }))).toEqual([
      { type: "tab", title: "Google", url: "https://www.google.com/" },
      { type: "tab", title: "Home / X", url: "https://x.com/home" },
    ]);
  });

  test("merges profile databases into the complete ordered window, space, group, and tab tree", () => {
    const defaultPages = ["Extensions", "WhatsApp", "SeaTalk Web", "Google Calendar", "Google Tasks", "Trello", "Youtube"]
      .map((title, index) => web(`tree-pane-${index}`, title));
    const defaultNodes = [
      { id: "tree-favorites", kind: "favorites", entity_id: "tree-favorites", parent_id: null, order: 0, space_id: "tree-space", deleted_at: null },
      { id: "tree-window-1", kind: "window", entity_id: "tree-w1", parent_id: null, order: 0, space_id: "tree-space", deleted_at: null },
      { id: "tree-window-2", kind: "window", entity_id: "tree-w2", parent_id: null, order: 1, space_id: "tree-space", deleted_at: null },
      ...defaultPages.slice(0, 6).flatMap((_, index) => tab(`tree-tab-${index}`, "tree-favorites", index, "tree-space", `tree-pane-${index}`)),
      ...tab("tree-youtube", "tree-window-1", 0, "tree-space", "tree-pane-6"),
    ];

    const testPages = ["Google", "test", "rd", "Instagram", "Google", "New Tab", "Google"]
      .map((title, index) => web(`test-pane-${index}`, title, title === "New Tab" ? "dia://newtab" : undefined));
    const testNodes = [
      { id: "test-window-1", kind: "window", entity_id: "test-w1", parent_id: null, order: 0, space_id: "test-space", deleted_at: null },
      { id: "test-window-2", kind: "window", entity_id: "test-w2", parent_id: null, order: 1, space_id: "test-space", deleted_at: null },
      { id: "foo-node", kind: "group", entity_id: "foo-record", parent_id: "test-window-1", order: 0, space_id: "test-space", deleted_at: null },
      ...tab("foo-google", "foo-node", 0, "test-space", "test-pane-0"),
      ...tab("test-tab", "test-window-1", 1, "test-space", "test-pane-1"),
      ...tab("rd-tab", "test-window-1", 2, "test-space", "test-pane-2"),
      { id: "group3-node", kind: "group", entity_id: "group3-record", parent_id: "test-window-1", order: 3, space_id: "test-space", deleted_at: null },
      ...tab("instagram-tab", "group3-node", 0, "test-space", "test-pane-3"),
      ...tab("google-tab", "test-window-1", 4, "test-space", "test-pane-4"),
      ...tab("new-tab", "test-window-1", 5, "test-space", "test-pane-5"),
      ...tab("window2-google", "test-window-2", 0, "test-space", "test-pane-6"),
    ];

    const nodes = buildDiaNodes({ databases: [
      database("Default", "tree-space", "Treeee", {
        nodes: defaultNodes,
        windows: [
          { id: "tree-w1", node_id: "tree-window-1", focused_space_id: "tree-space" },
          { id: "tree-w2", node_id: "tree-window-2", focused_space_id: "tree-space" },
        ],
        content_panes: defaultPages.map((page) => page.pane),
        web_contents: defaultPages.map((page) => page.web),
      }),
      database("Profile 1", "test-space", "Test", {
        nodes: testNodes,
        windows: [
          { id: "test-w1", node_id: "test-window-1", focused_space_id: "test-space" },
          { id: "test-w2", node_id: "test-window-2", focused_space_id: "test-space" },
        ],
        spaces: [{ id: "test-space", title: "Test", theme: "green" }],
        tab_groups: [
          { id: "foo-record", node_id: "foo-node", title: "foo", theme: "blue", icon: "{\"emoji\":\"🧪\"}" },
          { id: "group3-record", node_id: "group3-node", title: "Group 3", theme: "yellow" },
        ],
        content_panes: testPages.map((page) => page.pane),
        web_contents: testPages.map((page) => page.web),
      }),
    ] }, { osType: "macos", snapshotTime: timestamp });

    const fooFolder = nodes.find((node) => node.node_type === "folder" && node.title === "foo");
    expect(fooFolder?.theme_color).toBe("#1a73e8");
    expect(fooFolder?.theme_colors).toEqual(["#1a73e8"]);
    expect(fooFolder?.icon).toBe("🧪");

    const group3Folder = nodes.find((node) => node.node_type === "folder" && node.title === "Group 3");
    expect(group3Folder?.theme_color).toBe("#f9ab00");
    expect(group3Folder?.theme_colors).toEqual(["#f9ab00"]);

    const testWorkspace = nodes.find((node) => node.node_type === "workspace" && node.title === "Test");
    expect(testWorkspace?.theme_color).toBe("#1e8e3e");

    const children = (parentId: string) => nodes
      .filter((node) => node.parent_id === parentId)
      .sort((left, right) => left.sort_order - right.sort_order);
    const describe = (parentId: string): unknown[] => children(parentId).map((node) => ({
      type: node.node_type,
      title: node.title,
      children: describe(node.id),
    }));

    expect(describe("dia-macos-root")).toEqual([
      { type: "window", title: "Window 1", children: [
        { type: "workspace", title: "Treeee", children: [
          ...["Extensions", "WhatsApp", "SeaTalk Web", "Google Calendar", "Google Tasks", "Trello"].map((title) => ({ type: "pinned_tab", title, children: [] })),
          { type: "tab", title: "Youtube", children: [] },
        ] },
        { type: "workspace", title: "Test", children: [
          { type: "folder", title: "foo", children: [{ type: "tab", title: "Google", children: [] }] },
          { type: "tab", title: "test", children: [] },
          { type: "tab", title: "rd", children: [] },
          { type: "folder", title: "Group 3", children: [{ type: "tab", title: "Instagram", children: [] }] },
          { type: "tab", title: "Google", children: [] },
          { type: "tab", title: "New Tab", children: [] },
        ] },
      ] },
      { type: "window", title: "Window 2", children: [
        { type: "workspace", title: "Treeee", children: [
          ...["Extensions", "WhatsApp", "SeaTalk Web", "Google Calendar", "Google Tasks", "Trello"].map((title) => ({ type: "pinned_tab", title, children: [] })),
        ] },
        { type: "workspace", title: "Test", children: [{ type: "tab", title: "Google", children: [] }] },
      ] },
    ]);
  });
});
