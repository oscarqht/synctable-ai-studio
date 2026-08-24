import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { parseVivaldiPreferences } from "./vivaldi";

const tempDirs: string[] = [];
afterEach(() => { for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function command(id: number, payload: Buffer) {
  const record = Buffer.alloc(3 + payload.length);
  record.writeUInt16LE(payload.length + 1, 0);
  record[2] = id;
  payload.copy(record, 3);
  return record;
}

function navigation(tabId: number, url: string) {
  const urlBuffer = Buffer.from(url);
  const payload = Buffer.alloc(16 + urlBuffer.length);
  payload.writeUInt32LE(payload.length - 4, 0);
  payload.writeInt32LE(tabId, 4);
  payload.writeInt32LE(0, 8);
  payload.writeInt32LE(urlBuffer.length, 12);
  urlBuffer.copy(payload, 16);
  return command(6, payload);
}

function tabData(tabId: number, data: object) {
  const json = Buffer.from(JSON.stringify(data));
  const payload = Buffer.alloc(12 + json.length);
  payload.writeUInt32LE(payload.length - 4, 0);
  payload.writeInt32LE(tabId, 4);
  payload.writeInt32LE(json.length, 8);
  json.copy(payload, 12);
  return command(21, payload);
}

describe("parseVivaldiPreferences", () => {
  test("imports Vivaldi session tabs and their named groups", () => {
    const dir = mkdtempSync(join(tmpdir(), "synctable-vivaldi-"));
    tempDirs.push(dir);
    const preferences = join(dir, "Preferences");
    const session = join(dir, "Session_test");
    writeFileSync(preferences, JSON.stringify({ vivaldi: { workspaces: { list: [{ id: "sea", name: "Sea" }] } } }));
    const groupToken = Buffer.alloc(16);
    groupToken.writeBigUInt64LE(1n, 0);
    groupToken.writeBigUInt64LE(2n, 8);
    const group = Buffer.alloc(30);
    groupToken.copy(group, 4);
    group.writeInt32LE(6, 20);
    group.write("Launch", 24);
    writeFileSync(session, Buffer.concat([
      Buffer.from([0x53, 0x4e, 0x53, 0x53, 3, 0, 0, 0]),
      command(0, Buffer.from([10, 0, 0, 0, 41, 0, 0, 0])), command(2, Buffer.from([41, 0, 0, 0, 0, 0, 0, 0])),
      navigation(41, "https://example.com/first"),
      command(0, Buffer.from([10, 0, 0, 0, 42, 0, 0, 0])), command(2, Buffer.from([42, 0, 0, 0, 1, 0, 0, 0])),
      navigation(42, "https://example.com/launch"), command(12, Buffer.from([42, 0, 0, 0, 1])),
      command(25, Buffer.concat([Buffer.from([42, 0, 0, 0]), groupToken, Buffer.from([1])])), command(27, group),
    ]));
    const nodes = parseVivaldiPreferences({ filePath: preferences, sessionFilePath: session, osType: "macos", profileName: "Default", snapshotTime: "now" });
    const tab = nodes.find((node) => node.url === "https://example.com/launch");
    const tabGroup = nodes.find((node) => node.node_type === "folder" && node.title === "Launch");
    expect(tab).toMatchObject({ node_type: "pinned_tab", title: "example.com", parent_id: tabGroup?.id });
    expect(tabGroup?.parent_id).toContain("ws-default");
  });

  test("places tabs in the Vivaldi workspace recorded in their session metadata", () => {
    const dir = mkdtempSync(join(tmpdir(), "synctable-vivaldi-"));
    tempDirs.push(dir);
    const preferences = join(dir, "Preferences");
    const session = join(dir, "Session_test");
    writeFileSync(preferences, JSON.stringify({ vivaldi: { workspaces: { list: [
      { id: 100, name: "Tasks" }, { id: 200, name: "Sea" }, { id: 300, name: "Lab" },
    ] } } }));
    writeFileSync(session, Buffer.concat([
      Buffer.from([0x53, 0x4e, 0x53, 0x53, 3, 0, 0, 0]),
      command(0, Buffer.from([10, 0, 0, 0, 41, 0, 0, 0])), command(2, Buffer.from([41, 0, 0, 0, 0, 0, 0, 0])), navigation(41, "https://tasks.example"), tabData(41, { workspaceId: 100 }),
      command(0, Buffer.from([10, 0, 0, 0, 42, 0, 0, 0])), command(2, Buffer.from([42, 0, 0, 0, 1, 0, 0, 0])), navigation(42, "https://sea.example"), tabData(42, { workspaceId: 200 }),
      command(0, Buffer.from([10, 0, 0, 0, 43, 0, 0, 0])), command(2, Buffer.from([43, 0, 0, 0, 2, 0, 0, 0])), navigation(43, "https://lab.example"), tabData(43, { workspaceId: 300 }),
    ]));

    const nodes = parseVivaldiPreferences({ filePath: preferences, sessionFilePath: session, osType: "macos", profileName: "Default", snapshotTime: "now" });
    const workspaceIdByTitle = new Map(nodes.filter((node) => node.node_type === "workspace").map((node) => [node.title, node.id]));
    expect(nodes.find((node) => node.url === "https://tasks.example")?.parent_id).toBe(workspaceIdByTitle.get("Tasks"));
    expect(nodes.find((node) => node.url === "https://sea.example")?.parent_id).toBe(workspaceIdByTitle.get("Sea"));
    expect(nodes.find((node) => node.url === "https://lab.example")?.parent_id).toBe(workspaceIdByTitle.get("Lab"));
  });

  test("uses Vivaldi's fixed tab and stack metadata", () => {
    const dir = mkdtempSync(join(tmpdir(), "synctable-vivaldi-"));
    tempDirs.push(dir);
    const preferences = join(dir, "Preferences");
    const session = join(dir, "Session_test");
    writeFileSync(preferences, "{}");
    writeFileSync(session, Buffer.concat([
      Buffer.from([0x53, 0x4e, 0x53, 0x53, 3, 0, 0, 0]),
      command(0, Buffer.from([10, 0, 0, 0, 41, 0, 0, 0])), command(2, Buffer.from([41, 0, 0, 0, 0, 0, 0, 0])),
      navigation(41, "https://example.com/first"),
      command(0, Buffer.from([10, 0, 0, 0, 42, 0, 0, 0])), command(2, Buffer.from([42, 0, 0, 0, 1, 0, 0, 0])),
      navigation(42, "https://www.reddit.com/"),
      tabData(42, { fixedTitle: "reddit", group: "stack-id", fixedGroupTitle: "old name" }),
      tabData(42, { fixedTitle: "reddit", group: "stack-id", fixedGroupTitle: "renamed" }),
      command(16, Buffer.from([41, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])),
    ]));
    const nodes = parseVivaldiPreferences({ filePath: preferences, sessionFilePath: session, osType: "macos", profileName: "Default", snapshotTime: "now" });
    const stack = nodes.find((node) => node.node_type === "folder" && node.title === "renamed");
    expect(nodes.find((node) => node.url === "https://www.reddit.com/")).toMatchObject({ title: "reddit", parent_id: stack?.id });
    expect(stack?.sort_order).toBe(1);
    expect(nodes.some((node) => node.url === "https://example.com/first")).toBe(false);
  });

  test("nests Vivaldi tiled tabs in a split view inside their shared tab stack", () => {
    const dir = mkdtempSync(join(tmpdir(), "synctable-vivaldi-"));
    tempDirs.push(dir);
    const preferences = join(dir, "Preferences");
    const session = join(dir, "Session_test");
    writeFileSync(preferences, "{}");
    writeFileSync(session, Buffer.concat([
      Buffer.from([0x53, 0x4e, 0x53, 0x53, 3, 0, 0, 0]),
      command(0, Buffer.from([10, 0, 0, 0, 41, 0, 0, 0])), command(2, Buffer.from([41, 0, 0, 0, 0, 0, 0, 0])),
      navigation(41, "https://left.example"), tabData(41, { group: "stack-id", fixedGroupTitle: "Research", tiling: { id: "split-id", index: 1, layout: "row", type: "selection" } }),
      command(0, Buffer.from([10, 0, 0, 0, 42, 0, 0, 0])), command(2, Buffer.from([42, 0, 0, 0, 1, 0, 0, 0])),
      navigation(42, "https://right.example"), tabData(42, { group: "stack-id", fixedGroupTitle: "Research", tiling: { id: "split-id", index: 0, layout: "row", type: "selection" } }),
    ]));

    const nodes = parseVivaldiPreferences({ filePath: preferences, sessionFilePath: session, osType: "macos", profileName: "Default", snapshotTime: "now" });
    const stack = nodes.find((node) => node.node_type === "folder" && node.title === "Research");
    const splitView = nodes.find((node) => node.node_type === "split_view");
    expect(splitView).toMatchObject({ title: "Split View", parent_id: stack?.id });
    expect(nodes.filter((node) => node.parent_id === splitView?.id).sort((left, right) => left.sort_order - right.sort_order).map((node) => node.url)).toEqual(["https://right.example", "https://left.example"]);
  });

  test("keeps each Vivaldi window's stack in its own tree", () => {
    const dir = mkdtempSync(join(tmpdir(), "synctable-vivaldi-"));
    tempDirs.push(dir);
    const preferences = join(dir, "Preferences");
    const session = join(dir, "Session_test");
    writeFileSync(preferences, "{}");
    writeFileSync(session, Buffer.concat([
      Buffer.from([0x53, 0x4e, 0x53, 0x53, 3, 0, 0, 0]),
      command(0, Buffer.from([10, 0, 0, 0, 42, 0, 0, 0])), command(2, Buffer.from([42, 0, 0, 0, 0, 0, 0, 0])), navigation(42, "https://example.com/grouped"),
      tabData(42, { group: "stack-id", fixedGroupTitle: "stack" }),
      command(0, Buffer.from([11, 0, 0, 0, 43, 0, 0, 0])), command(2, Buffer.from([43, 0, 0, 0, 0, 0, 0, 0])), navigation(43, "https://example.com/second-window"),
    ]));
    const nodes = parseVivaldiPreferences({ filePath: preferences, sessionFilePath: session, osType: "macos", profileName: "Default", snapshotTime: "now" });
    const windows = nodes.filter((node) => node.node_type === "window");
    expect(windows).toHaveLength(2);
    expect(nodes.filter((node) => node.node_type === "folder" && node.title === "stack")).toHaveLength(1);
  });

  test("extracts Vivaldi tab stack colors from tabData", () => {
    const dir = mkdtempSync(join(tmpdir(), "synctable-vivaldi-"));
    tempDirs.push(dir);
    const preferences = join(dir, "Preferences");
    const session = join(dir, "Session_test");
    writeFileSync(preferences, "{}");
    writeFileSync(session, Buffer.concat([
      Buffer.from([0x53, 0x4e, 0x53, 0x53, 3, 0, 0, 0]),
      command(0, Buffer.from([10, 0, 0, 0, 42, 0, 0, 0])), command(2, Buffer.from([42, 0, 0, 0, 0, 0, 0, 0])),
      navigation(42, "https://example.com/orange-stack"),
      tabData(42, { group: "orange-stack-id", fixedGroupTitle: "Orange Stack", groupColor: "color9" }),
      command(0, Buffer.from([10, 0, 0, 0, 43, 0, 0, 0])), command(2, Buffer.from([43, 0, 0, 0, 1, 0, 0, 0])),
      navigation(43, "https://example.com/blue-stack"),
      tabData(43, { group: "blue-stack-id", fixedGroupTitle: "Blue Stack", groupColor: "color2" }),
    ]));
    const nodes = parseVivaldiPreferences({ filePath: preferences, sessionFilePath: session, osType: "macos", profileName: "Default", snapshotTime: "now" });
    const orangeStack = nodes.find((node) => node.node_type === "folder" && node.title === "Orange Stack");
    expect(orangeStack?.theme_color).toBe("#fa903e");
    expect(orangeStack?.theme_colors).toEqual(["#fa903e"]);
    const blueStack = nodes.find((node) => node.node_type === "folder" && node.title === "Blue Stack");
    expect(blueStack?.theme_color).toBe("#1a73e9");
    expect(blueStack?.theme_colors).toEqual(["#1a73e9"]);
  });
});
