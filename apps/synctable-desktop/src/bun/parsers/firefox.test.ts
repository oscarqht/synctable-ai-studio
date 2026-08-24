import { describe, expect, test } from "bun:test";
import { parseFirefoxSessionData } from "./firefox";

const options = {
  osType: "macos" as const,
  profileName: "dev.default-release",
  snapshotTime: "2026-08-19T00:00:00.000Z",
};

describe("parseFirefoxSessionData", () => {
  test("preserves Firefox windows, pins, groups, split views, and their visual order", () => {
    const nodes = parseFirefoxSessionData({
      windows: [
        {
          groups: [{ id: "research", name: "Research", color: "orange" }],
          splitViews: [{ id: 7, numberOfTabs: 2 }],
          tabs: [
            { entries: [{ url: "https://start.example", title: "Start" }], index: 1, pinned: true },
            { entries: [{ url: "https://docs.example", title: "Docs" }], index: 1, groupId: "research" },
            { entries: [{ url: "https://left.example", title: "Left" }], index: 1, groupId: "research", splitViewId: 7 },
            { entries: [{ url: "https://right.example", title: "Right" }], index: 1, groupId: "research", splitViewId: 7 },
            { entries: [{ url: "https://end.example", title: "End" }], index: 1 },
          ],
        },
        {
          tabs: [
            { entries: [{ url: "https://second-window.example", title: "Second window" }], index: 1 },
          ],
        },
      ],
    }, options);

    const windows = nodes.filter((node) => node.node_type === "window");
    const group = nodes.find((node) => node.node_type === "folder" && node.title === "Research");
    const splitView = nodes.find((node) => node.node_type === "split_view");
    const start = nodes.find((node) => node.url === "https://start.example");
    const docs = nodes.find((node) => node.url === "https://docs.example");
    const splitTabs = nodes.filter((node) => node.parent_id === splitView?.id);

    expect(windows.map((node) => node.sort_order)).toEqual([0, 1]);
    expect(start).toMatchObject({ node_type: "pinned_tab", sort_order: 0 });
    expect(group).toMatchObject({ sort_order: 1, theme_color: "#d97000", theme_colors: ["#d97000"] });
    expect(docs).toMatchObject({ parent_id: group?.id, sort_order: 1 });
    expect(splitView).toMatchObject({ title: "Split View", parent_id: group?.id, sort_order: 2 });
    expect(splitTabs.map((node) => ({ url: node.url, sort_order: node.sort_order }))).toEqual([
      { url: "https://left.example", sort_order: 2 },
      { url: "https://right.example", sort_order: 3 },
    ]);
    expect(nodes.find((node) => node.url === "https://second-window.example")?.parent_id).toContain("win-1-ws-default");
  });

  test("uses the current history entry and keeps an ungrouped tab in its workspace", () => {
    const nodes = parseFirefoxSessionData({
      windows: [{
        tabs: [{
          entries: [
            { url: "https://old.example", title: "Old" },
            { url: "https://current.example", title: "Current" },
          ],
          index: 2,
        }],
      }],
    }, options);

    expect(nodes.find((node) => node.node_type === "tab")).toMatchObject({
      url: "https://current.example",
      title: "Current",
      parent_id: expect.stringContaining("ws-default"),
      sort_order: 0,
    });
  });
});
