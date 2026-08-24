import { describe, expect, test } from "bun:test";
import { hostname } from "node:os";
import { SynctableDB } from "./db";
import type { BrowserTreeNode } from "../shared/types";

function root(id: string, profileName: string): BrowserTreeNode {
  return {
    id,
    browser_name: "dia",
    os_type: "macos",
    profile_name: profileName,
    node_type: "root",
    title: "Dia",
    url: null,
    parent_id: null,
    sort_order: 0,
    snapshot_time: "2026-08-19T00:00:00.000Z",
  };
}

describe("SynctableDB", () => {
  test("replaces all legacy Dia profile snapshots with the merged browser tree", () => {
    const db = new SynctableDB(":memory:");
    db.replaceProfileNodes("dia", "Default", [root("old-default", "Default")]);
    db.replaceProfileNodes("dia", "Profile 1", [root("old-profile-1", "Profile 1")]);

    db.replaceBrowserNodes("dia", [root("merged", "Default")]);

    expect(db.getAllNodes("dia").map((node) => [node.id, node.profile_name])).toEqual([
      ["merged", "Default"],
    ]);
  });

  test("uses the system device name until a custom device name is saved", () => {
    const db = new SynctableDB(":memory:");

    expect(db.getAppPreferences().deviceName).toBe(hostname());

    db.setDeviceName("  Tanya's MacBook Pro  ");

    expect(db.getAppPreferences().deviceName).toBe("Tanya's MacBook Pro");
  });

  test("creates and reuses a stable unique device identifier", () => {
    const db = new SynctableDB(":memory:");

    const id1 = db.getOrCreateDeviceId();
    expect(typeof id1).toBe("string");
    expect(id1.length).toBeGreaterThan(0);

    const id2 = db.getOrCreateDeviceId();
    expect(id2).toBe(id1);
  });

  test("persists and retrieves the last uploaded tree hash", () => {
    const db = new SynctableDB(":memory:");

    expect(db.getLastUploadedTreeHash()).toBeNull();

    db.setLastUploadedTreeHash("abc123hash");
    expect(db.getLastUploadedTreeHash()).toBe("abc123hash");

    db.setLastUploadedTreeHash("def456hash");
    expect(db.getLastUploadedTreeHash()).toBe("def456hash");
  });

  test("persists and retrieves theme_color, theme_colors, and icon", () => {
    const db = new SynctableDB(":memory:");
    const spaceNode: BrowserTreeNode = {
      id: "arc-space-work",
      browser_name: "arc",
      os_type: "macos",
      profile_name: "Default",
      node_type: "workspace",
      title: "Work Space",
      url: null,
      parent_id: null,
      sort_order: 0,
      snapshot_time: "2026-08-20T00:00:00.000Z",
      theme_color: "#8ef1cc",
      theme_colors: ["#8ef1cc", "#95dff1", "#99f09e"],
      icon: "🐻",
    };

    db.upsertNodes([spaceNode]);
    const nodes = db.getAllNodes("arc", "Default");
    expect(nodes).toHaveLength(1);
    expect(nodes[0].theme_color).toBe("#8ef1cc");
    expect(nodes[0].theme_colors).toEqual(["#8ef1cc", "#95dff1", "#99f09e"]);
    expect(nodes[0].icon).toBe("🐻");

    const tree = db.getTree("arc", "Default");
    expect(tree).toHaveLength(1);
    expect(tree[0].theme_color).toBe("#8ef1cc");
    expect(tree[0].theme_colors).toEqual(["#8ef1cc", "#95dff1", "#99f09e"]);
    expect(tree[0].icon).toBe("🐻");
  });

  test("persists lastUpdateTime and sorts getTree root nodes by lastUpdateTime DESC", () => {
    const db = new SynctableDB(":memory:");

    const olderChromeNode: BrowserTreeNode = {
      id: "chrome-root",
      browser_name: "chrome",
      os_type: "macos",
      profile_name: "Default",
      node_type: "root",
      title: "Chrome",
      url: null,
      parent_id: null,
      sort_order: 0,
      snapshot_time: "2026-08-21T10:00:00.000Z",
      lastUpdateTime: "2026-08-21T10:00:00.000Z",
    };

    const newerZenNode: BrowserTreeNode = {
      id: "zen-root",
      browser_name: "zen",
      os_type: "macos",
      profile_name: "Default",
      node_type: "root",
      title: "Zen",
      url: null,
      parent_id: null,
      sort_order: 0,
      snapshot_time: "2026-08-21T12:00:00.000Z",
      lastUpdateTime: "2026-08-21T12:00:00.000Z",
    };

    const newestArcNode: BrowserTreeNode = {
      id: "arc-root",
      browser_name: "arc",
      os_type: "macos",
      profile_name: "Default",
      node_type: "root",
      title: "Arc",
      url: null,
      parent_id: null,
      sort_order: 0,
      snapshot_time: "2026-08-21T14:00:00.000Z",
      lastUpdateTime: "2026-08-21T14:00:00.000Z",
    };

    db.upsertNodes([olderChromeNode, newestArcNode, newerZenNode]);

    const allNodes = db.getAllNodes();
    expect(allNodes).toHaveLength(3);
    const chromeFound = allNodes.find((n) => n.id === "chrome-root");
    expect(chromeFound?.lastUpdateTime).toBe("2026-08-21T10:00:00.000Z");

    const tree = db.getTree();
    expect(tree).toHaveLength(3);
    // Tree roots should be sorted DESC by lastUpdateTime: Arc (14:00), Zen (12:00), Chrome (10:00)
    expect(tree.map((n) => n.id)).toEqual(["arc-root", "zen-root", "chrome-root"]);

    const lastUpdates = db.getBrowserLastUpdateTimes();
    expect(lastUpdates).toEqual({
      chrome: "2026-08-21T10:00:00.000Z",
      zen: "2026-08-21T12:00:00.000Z",
      arc: "2026-08-21T14:00:00.000Z",
    });
  });
});

