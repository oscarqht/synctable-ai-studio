import { describe, expect, test, mock } from "bun:test";
import { BrowserSyncManager, canonicalizeTree, computeTreeHash } from "./sync";
import { SynctableDB } from "./db";
import { KeychainService } from "./keychain";
import { RaindropClient } from "./raindrop";
import type { BrowserTreeNode } from "../shared/types";

function createTab(id: string, title: string, url: string, time: string): BrowserTreeNode {
  return {
    id,
    browser_name: "chrome",
    os_type: "macos",
    profile_name: "Default",
    node_type: "tab",
    title,
    url,
    parent_id: null,
    sort_order: 0,
    snapshot_time: time,
  };
}

describe("canonicalizeTree & computeTreeHash", () => {
  test("computes identical hash regardless of snapshot_time changes", () => {
    const tree1 = [createTab("t1", "GitHub", "https://github.com", "2026-08-19T01:00:00.000Z")];
    const tree2 = [createTab("t1", "GitHub", "https://github.com", "2026-08-19T02:00:00.000Z")];

    expect(computeTreeHash(tree1)).toBe(computeTreeHash(tree2));
  });

  test("computes different hash when content changes", () => {
    const tree1 = [createTab("t1", "GitHub", "https://github.com", "2026-08-19T01:00:00.000Z")];
    const tree2 = [createTab("t1", "Google", "https://google.com", "2026-08-19T01:00:00.000Z")];

    expect(computeTreeHash(tree1)).not.toBe(computeTreeHash(tree2));
  });
});

describe("BrowserSyncManager Raindrop Sync", () => {
  test("skips Raindrop upload when token is empty", async () => {
    const db = new SynctableDB(":memory:");
    db.upsertNodes([createTab("t1", "GitHub", "https://github.com", "2026-08-19T01:00:00.000Z")]);

    const keychain = new KeychainService("mock");
    keychain.getRaindropToken = () => "";

    let syncTreeCalled = false;
    const raindropClient = new RaindropClient();
    raindropClient.syncTree = async () => {
      syncTreeCalled = true;
      return { collectionId: 123 };
    };

    const manager = new BrowserSyncManager(db, keychain, raindropClient);
    // Override getBrowserProfiles to return empty so it doesn't touch local filesystem
    manager.getBrowserProfiles = () => [];

    const res = await manager.runSync();
    expect(res.success).toBe(true);
    expect(syncTreeCalled).toBe(false);
  });

  test("uploads full tree to Raindrop when token is present and tree changed", async () => {
    const db = new SynctableDB(":memory:");
    db.upsertNodes([createTab("t1", "GitHub", "https://github.com", "2026-08-19T01:00:00.000Z")]);

    const keychain = new KeychainService("mock");
    keychain.getRaindropToken = () => "secret-token";

    let capturedToken = "";
    let capturedDeviceId = "";
    let capturedDeviceName: string | undefined = "";
    let capturedTree: BrowserTreeNode[] = [];

    const raindropClient = new RaindropClient();
    raindropClient.syncTree = async (token, deviceId, tree, deviceName) => {
      capturedToken = token;
      capturedDeviceId = deviceId;
      capturedTree = tree;
      capturedDeviceName = deviceName;
      return { collectionId: 123, raindropId: 456 };
    };

    const manager = new BrowserSyncManager(db, keychain, raindropClient);
    manager.getBrowserProfiles = () => [];

    const res = await manager.runSync();
    expect(res.success).toBe(true);
    expect(capturedToken).toBe("secret-token");
    expect(capturedDeviceId).toBe(db.getOrCreateDeviceId());
    expect(capturedDeviceName).toBe(db.getAppPreferences().deviceName);
    expect(capturedTree.length).toBe(1);
    expect(capturedTree[0].title).toBe("GitHub");

    // Check that lastUploadedTreeHash was set
    const expectedHash = computeTreeHash(capturedTree);
    expect(db.getLastUploadedTreeHash()).toBe(expectedHash);

    // Running sync again without tree changes should skip upload
    let secondSyncCalled = false;
    raindropClient.syncTree = async () => {
      secondSyncCalled = true;
      return { collectionId: 123 };
    };

    const res2 = await manager.runSync();
    expect(res2.success).toBe(true);
    expect(secondSyncCalled).toBe(false);
  });

  test("captures Raindrop errors in SyncResult without throwing", async () => {
    const db = new SynctableDB(":memory:");
    db.upsertNodes([createTab("t1", "GitHub", "https://github.com", "2026-08-19T01:00:00.000Z")]);

    const keychain = new KeychainService("mock");
    keychain.getRaindropToken = () => "bad-token";

    const raindropClient = new RaindropClient();
    raindropClient.syncTree = async () => {
      throw new Error("Unauthorized (401)");
    };

    const manager = new BrowserSyncManager(db, keychain, raindropClient);
    manager.getBrowserProfiles = () => [];

    const res = await manager.runSync();
    expect(res.success).toBe(false);
    expect(res.errors).toEqual([{ browser: "raindrop", message: "Unauthorized (401)" }]);
    expect(db.getLastUploadedTreeHash()).toBeNull();
  });

  test("getStatsWithDetected returns lastUpdateTime and sorts detected browsers DESC", () => {
    const db = new SynctableDB(":memory:");
    db.upsertNodes([
      {
        id: "chrome-t1",
        browser_name: "chrome",
        os_type: "macos",
        profile_name: "Default",
        node_type: "tab",
        title: "Chrome Tab",
        url: "https://chrome.com",
        parent_id: null,
        sort_order: 0,
        snapshot_time: "2026-08-21T08:00:00.000Z",
        lastUpdateTime: "2026-08-21T08:00:00.000Z",
      },
      {
        id: "zen-t1",
        browser_name: "zen",
        os_type: "macos",
        profile_name: "Default",
        node_type: "tab",
        title: "Zen Tab",
        url: "https://zen.com",
        parent_id: null,
        sort_order: 0,
        snapshot_time: "2026-08-21T16:00:00.000Z",
        lastUpdateTime: "2026-08-21T16:00:00.000Z",
      },
    ]);

    const manager = new BrowserSyncManager(db, new KeychainService("mock"), new RaindropClient());
    manager.getBrowserProfiles = () => [
      { browser: "chrome", displayName: "Google Chrome", profileName: "Default", sourcePath: "/mock/chrome" },
      { browser: "zen", displayName: "Zen Browser", profileName: "Default", sourcePath: "/mock/zen" },
      { browser: "firefox", displayName: "Firefox", profileName: "Default", sourcePath: "/mock/firefox" },
    ];

    const stats = manager.getStatsWithDetected();
    expect(stats.detectedBrowsers).toBeDefined();
    // Zen (16:00) should be before Chrome (08:00), followed by detected without timestamp (Firefox)
    const zen = stats.detectedBrowsers.find((b) => b.name === "zen");
    expect(zen?.lastUpdateTime).toBe("2026-08-21T16:00:00.000Z");
    expect(zen?.detected).toBe(true);

    const chrome = stats.detectedBrowsers.find((b) => b.name === "chrome");
    expect(chrome?.lastUpdateTime).toBe("2026-08-21T08:00:00.000Z");
    expect(chrome?.detected).toBe(true);

    expect(stats.detectedBrowsers[0].name).toBe("zen");
    expect(stats.detectedBrowsers[1].name).toBe("chrome");
  });

  test("only updates lastUpdateTime when there are actual valid changes", async () => {
    const db = new SynctableDB(":memory:");
    const manager = new BrowserSyncManager(db, new KeychainService("mock"), new RaindropClient());

    // Initial state: Arc has 1 tab
    const initialArcNodes: BrowserTreeNode[] = [
      {
        id: "arc-root",
        browser_name: "arc",
        os_type: "macos",
        profile_name: "Default",
        node_type: "root",
        title: "Arc",
        url: null,
        parent_id: null,
        sort_order: 0,
        snapshot_time: "2026-08-21T10:00:00.000Z",
        lastUpdateTime: "2026-08-21T10:00:00.000Z",
      },
      {
        id: "arc-tab-1",
        browser_name: "arc",
        os_type: "macos",
        profile_name: "Default",
        node_type: "tab",
        title: "GitHub",
        url: "https://github.com",
        parent_id: "arc-root",
        sort_order: 0,
        snapshot_time: "2026-08-21T10:00:00.000Z",
        lastUpdateTime: "2026-08-21T10:00:00.000Z",
      },
    ];
    db.replaceProfileNodes("arc", "Default", initialArcNodes);

    // Verify existing node hash
    const initialHash = computeTreeHash(initialArcNodes);
    expect(initialHash).toBeDefined();

    // Mock unchanged sync: identical nodes
    const identicalNodes: BrowserTreeNode[] = [
      {
        id: "arc-root",
        browser_name: "arc",
        os_type: "macos",
        profile_name: "Default",
        node_type: "root",
        title: "Arc",
        url: null,
        parent_id: null,
        sort_order: 0,
        snapshot_time: "2026-08-21T11:00:00.000Z",
      },
      {
        id: "arc-tab-1",
        browser_name: "arc",
        os_type: "macos",
        profile_name: "Default",
        node_type: "tab",
        title: "GitHub",
        url: "https://github.com",
        parent_id: "arc-root",
        sort_order: 0,
        snapshot_time: "2026-08-21T11:00:00.000Z",
      },
    ];

    // Comparing hashes: identical
    expect(computeTreeHash(identicalNodes)).toBe(initialHash);

    // When valid change occurs: tab URL changed
    const urlChangedNodes: BrowserTreeNode[] = [
      {
        id: "arc-root",
        browser_name: "arc",
        os_type: "macos",
        profile_name: "Default",
        node_type: "root",
        title: "Arc",
        url: null,
        parent_id: null,
        sort_order: 0,
        snapshot_time: "2026-08-21T12:00:00.000Z",
      },
      {
        id: "arc-tab-1",
        browser_name: "arc",
        os_type: "macos",
        profile_name: "Default",
        node_type: "tab",
        title: "GitHub",
        url: "https://github.com/oscarqht/synctable", // URL changed
        parent_id: "arc-root",
        sort_order: 0,
        snapshot_time: "2026-08-21T12:00:00.000Z",
      },
    ];
    expect(computeTreeHash(urlChangedNodes)).not.toBe(initialHash);

    // When valid change occurs: tab renamed
    const titleChangedNodes: BrowserTreeNode[] = [
      {
        id: "arc-root",
        browser_name: "arc",
        os_type: "macos",
        profile_name: "Default",
        node_type: "root",
        title: "Arc",
        url: null,
        parent_id: null,
        sort_order: 0,
        snapshot_time: "2026-08-21T12:00:00.000Z",
      },
      {
        id: "arc-tab-1",
        browser_name: "arc",
        os_type: "macos",
        profile_name: "Default",
        node_type: "tab",
        title: "GitHub - Synctable Repo", // Title changed
        url: "https://github.com",
        parent_id: "arc-root",
        sort_order: 0,
        snapshot_time: "2026-08-21T12:00:00.000Z",
      },
    ];
    expect(computeTreeHash(titleChangedNodes)).not.toBe(initialHash);

    // When valid change occurs: tab created
    const tabCreatedNodes: BrowserTreeNode[] = [
      ...initialArcNodes,
      {
        id: "arc-tab-2",
        browser_name: "arc",
        os_type: "macos",
        profile_name: "Default",
        node_type: "tab",
        title: "Google",
        url: "https://google.com",
        parent_id: "arc-root",
        sort_order: 1,
        snapshot_time: "2026-08-21T12:00:00.000Z",
      },
    ];
    expect(computeTreeHash(tabCreatedNodes)).not.toBe(initialHash);

    // When valid change occurs: tab order changed
    const orderChangedNodes: BrowserTreeNode[] = [
      { ...initialArcNodes[0] },
      { ...initialArcNodes[1], sort_order: 5 },
    ];
    expect(computeTreeHash(orderChangedNodes)).not.toBe(initialHash);
  });
});
