import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { parseChromePreferences } from "./chrome";

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
  payload.writeInt32LE(urlBuffer.length, 12);
  urlBuffer.copy(payload, 16);
  return command(6, payload);
}

function splitTab(tabId: number, splitToken: Buffer, hasSplit = true) {
  const payload = Buffer.alloc(32);
  payload.writeInt32LE(tabId, 0);
  splitToken.copy(payload, 8);
  payload[24] = hasSplit ? 1 : 0;
  return command(36, payload);
}

function groupTab(tabId: number, groupToken: Buffer) {
  return command(25, Buffer.concat([
    Buffer.from([tabId, 0, 0, 0, 0, 0, 0, 0]),
    groupToken,
    Buffer.from([1, 0, 0, 0, 0, 0, 0, 0]),
  ]));
}

describe("parseChromePreferences", () => {
  test("imports Chrome session windows, tabs, pins, and current tab groups", () => {
    const dir = mkdtempSync(join(tmpdir(), "synctable-chrome-"));
    tempDirs.push(dir);
    const preferences = join(dir, "Preferences");
    const session = join(dir, "Session_test");
    writeFileSync(preferences, "{}");
    const groupToken = Buffer.alloc(16);
    groupToken.writeBigUInt64LE(1n, 0);
    groupToken.writeBigUInt64LE(2n, 8);
    const metadata = Buffer.alloc(20 + 4 + "Research".length * 2);
    groupToken.copy(metadata, 4);
    metadata.writeInt32LE("Research".length, 20);
    metadata.write("Research", 24, "utf16le");
    writeFileSync(session, Buffer.concat([
      Buffer.from([0x53, 0x4e, 0x53, 0x53, 3, 0, 0, 0]),
      command(0, Buffer.from([10, 0, 0, 0, 41, 0, 0, 0])), command(2, Buffer.from([41, 0, 0, 0, 0, 0, 0, 0])), navigation(41, "https://example.com"),
      command(0, Buffer.from([11, 0, 0, 0, 42, 0, 0, 0])), command(2, Buffer.from([42, 0, 0, 0, 0, 0, 0, 0])), navigation(42, "https://example.org"), command(12, Buffer.from([42, 0, 0, 0, 1])),
      command(25, Buffer.concat([Buffer.from([42, 0, 0, 0, 0, 0, 0, 0]), groupToken, Buffer.from([1, 0, 0, 0, 0, 0, 0, 0])])), command(27, metadata),
    ]));
    const nodes = parseChromePreferences({ filePath: preferences, sessionFilePath: session, osType: "macos", profileName: "Default", snapshotTime: "now" });
    const group = nodes.find((node) => node.node_type === "folder" && node.title === "Research");
    expect(nodes.filter((node) => node.node_type === "window")).toHaveLength(2);
    expect(nodes.find((node) => node.url === "https://example.org")).toMatchObject({ node_type: "pinned_tab", parent_id: group?.id });
    expect(nodes.find((node) => node.url === "https://example.com")?.parent_id).toContain("win-10-ws-default");
  });

  test("nests a Chrome split view inside its shared tab group", () => {
    const dir = mkdtempSync(join(tmpdir(), "synctable-chrome-"));
    tempDirs.push(dir);
    const preferences = join(dir, "Preferences");
    const session = join(dir, "Session_test");
    writeFileSync(preferences, "{}");
    const splitToken = Buffer.alloc(16);
    splitToken.writeBigUInt64LE(11n, 0);
    splitToken.writeBigUInt64LE(22n, 8);
    const groupToken = Buffer.alloc(16);
    groupToken.writeBigUInt64LE(31n, 0);
    groupToken.writeBigUInt64LE(32n, 8);
    const metadata = Buffer.alloc(20 + 4 + "Research".length * 2);
    groupToken.copy(metadata, 4);
    metadata.writeInt32LE("Research".length, 20);
    metadata.write("Research", 24, "utf16le");
    writeFileSync(session, Buffer.concat([
      Buffer.from([0x53, 0x4e, 0x53, 0x53, 3, 0, 0, 0]),
      command(0, Buffer.from([10, 0, 0, 0, 41, 0, 0, 0])), command(2, Buffer.from([41, 0, 0, 0, 0, 0, 0, 0])), navigation(41, "https://left.example"), groupTab(41, groupToken), splitTab(41, splitToken),
      command(0, Buffer.from([10, 0, 0, 0, 42, 0, 0, 0])), command(2, Buffer.from([42, 0, 0, 0, 1, 0, 0, 0])), navigation(42, "https://right.example"), groupTab(42, groupToken), splitTab(42, splitToken), command(27, metadata),
    ]));

    const nodes = parseChromePreferences({ filePath: preferences, sessionFilePath: session, osType: "macos", profileName: "Default", snapshotTime: "now" });
    const group = nodes.find((node) => node.node_type === "folder" && node.title === "Research");
    const splitView = nodes.find((node) => node.node_type === "split_view");
    expect(splitView).toMatchObject({ title: "Split View", parent_id: group?.id });
    expect(nodes.filter((node) => node.parent_id === splitView?.id).map((node) => node.url)).toEqual(["https://left.example", "https://right.example"]);
  });

  test("removes a Chrome tab from a split view when its session record clears it", () => {
    const dir = mkdtempSync(join(tmpdir(), "synctable-chrome-"));
    tempDirs.push(dir);
    const preferences = join(dir, "Preferences");
    const session = join(dir, "Session_test");
    writeFileSync(preferences, "{}");
    const splitToken = Buffer.alloc(16);
    splitToken.writeBigUInt64LE(11n, 0);
    splitToken.writeBigUInt64LE(22n, 8);
    writeFileSync(session, Buffer.concat([
      Buffer.from([0x53, 0x4e, 0x53, 0x53, 3, 0, 0, 0]),
      command(0, Buffer.from([10, 0, 0, 0, 41, 0, 0, 0])), command(2, Buffer.from([41, 0, 0, 0, 0, 0, 0, 0])), navigation(41, "https://example.com"), splitTab(41, splitToken), splitTab(41, splitToken, false),
    ]));

    const nodes = parseChromePreferences({ filePath: preferences, sessionFilePath: session, osType: "macos", profileName: "Default", snapshotTime: "now" });
    expect(nodes.some((node) => node.node_type === "split_view")).toBe(false);
    expect(nodes.find((node) => node.url === "https://example.com")?.parent_id).toContain("ws-default");
  });

  test("extracts tab group colors from session metadata and preferences", () => {
    const dir = mkdtempSync(join(tmpdir(), "synctable-chrome-"));
    tempDirs.push(dir);
    const preferences = join(dir, "Preferences");
    const session = join(dir, "Session_test");

    const groupToken1 = Buffer.alloc(16);
    groupToken1.writeBigUInt64LE(101n, 0);
    groupToken1.writeBigUInt64LE(102n, 8);

    const groupToken2 = Buffer.alloc(16);
    groupToken2.writeBigUInt64LE(201n, 0);
    groupToken2.writeBigUInt64LE(202n, 8);

    // Group 1 metadata in Session command 27 with title "BlueGroup" and color 1 (Blue)
    const title1 = "BlueGroup";
    const byteLen1 = title1.length * 2;
    const offsetAfterTitle1 = (24 + byteLen1 + 3) & ~3;
    const metadata = Buffer.alloc(offsetAfterTitle1 + 4);
    groupToken1.copy(metadata, 4);
    metadata.writeInt32LE(title1.length, 20);
    metadata.write(title1, 24, "utf16le");
    metadata.writeUInt32LE(1, offsetAfterTitle1); // 1 = Blue (#1a73e8)

    // Group 2 in Preferences with color 2 (Red -> #d93025)
    const group2Id = `${201n.toString(16)}-${202n.toString(16)}`;
    writeFileSync(preferences, JSON.stringify({
      tab_groups: {
        [group2Id]: {
          title: "RedGroup",
          color: 2,
        },
      },
    }));

    writeFileSync(session, Buffer.concat([
      Buffer.from([0x53, 0x4e, 0x53, 0x53, 3, 0, 0, 0]),
      command(0, Buffer.from([10, 0, 0, 0, 51, 0, 0, 0])), command(2, Buffer.from([51, 0, 0, 0, 0, 0, 0, 0])), navigation(51, "https://blue.example"), groupTab(51, groupToken1), command(27, metadata),
      command(0, Buffer.from([10, 0, 0, 0, 52, 0, 0, 0])), command(2, Buffer.from([52, 0, 0, 0, 1, 0, 0, 0])), navigation(52, "https://red.example"), groupTab(52, groupToken2),
    ]));

    const nodes = parseChromePreferences({ filePath: preferences, sessionFilePath: session, osType: "macos", profileName: "Default", snapshotTime: "now" });
    const blueFolder = nodes.find((node) => node.node_type === "folder" && node.title === "BlueGroup");
    const redFolder = nodes.find((node) => node.node_type === "folder" && node.title === "RedGroup");

    expect(blueFolder?.theme_color).toBe("#1a73e8");
    expect(blueFolder?.theme_colors).toEqual(["#1a73e8"]);
    expect(redFolder?.theme_color).toBe("#d93025");
    expect(redFolder?.theme_colors).toEqual(["#d93025"]);
  });
});
