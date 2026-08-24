import { Database } from "bun:sqlite";
import { join } from "node:path";
import { homedir, hostname } from "node:os";
import { mkdirSync } from "node:fs";
import type { AppPreferences, BrowserTreeNode, SyncStats } from "../shared/types";

const DB_DIR = join(homedir(), ".browser_sync_cache");
mkdirSync(DB_DIR, { recursive: true });
const DB_PATH = join(DB_DIR, "synctable.sqlite");

export class SynctableDB {
  private db: Database;

  constructor(path = DB_PATH) {
    this.db = new Database(path);
    this.initSchema();
  }

  private initSchema() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS browser_trees (
        id VARCHAR(255) PRIMARY KEY,
        browser_name VARCHAR(50) NOT NULL,
        os_type VARCHAR(50) NOT NULL,
        profile_name VARCHAR(100) NOT NULL,
        node_type VARCHAR(50) NOT NULL,
        title TEXT,
        url TEXT,
        parent_id VARCHAR(255),
        sort_order INT NOT NULL,
        snapshot_time TIMESTAMP NOT NULL,
        last_update_time TIMESTAMP,
        theme_color TEXT,
        theme_colors TEXT,
        icon TEXT
      );
    `);

    // Safely migrate existing tables if columns do not exist
    const columns = this.db.query("PRAGMA table_info(browser_trees)").all() as { name: string }[];
    const colNames = new Set(columns.map((c) => c.name));
    if (!colNames.has("last_update_time")) {
      this.db.run("ALTER TABLE browser_trees ADD COLUMN last_update_time TIMESTAMP");
    }
    if (!colNames.has("theme_color")) {
      this.db.run("ALTER TABLE browser_trees ADD COLUMN theme_color TEXT");
    }
    if (!colNames.has("theme_colors")) {
      this.db.run("ALTER TABLE browser_trees ADD COLUMN theme_colors TEXT");
    }
    if (!colNames.has("icon")) {
      this.db.run("ALTER TABLE browser_trees ADD COLUMN icon TEXT");
    }

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_browser_parent 
      ON browser_trees (browser_name, parent_id);
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_browser_snapshot
      ON browser_trees (snapshot_time);
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS app_preferences (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  public getAppPreferences(): AppPreferences {
    const selectedBrowser = this.db
      .query("SELECT value FROM app_preferences WHERE key = 'selectedBrowser'")
      .get() as { value: string } | null;

    const deviceName = this.db
      .query("SELECT value FROM app_preferences WHERE key = 'deviceName'")
      .get() as { value: string } | null;

    return {
      selectedBrowser: selectedBrowser?.value ?? "",
      deviceName: deviceName?.value || hostname(),
    };
  }

  public setSelectedBrowser(selectedBrowser: string) {
    this.db.prepare(
      `INSERT INTO app_preferences (key, value) VALUES ('selectedBrowser', $selectedBrowser)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run({ $selectedBrowser: selectedBrowser });
  }

  public setDeviceName(deviceName: string) {
    const normalizedName = deviceName.trim();
    if (!normalizedName) {
      throw new Error("Device name cannot be empty");
    }

    this.db.prepare(
      `INSERT INTO app_preferences (key, value) VALUES ('deviceName', $deviceName)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run({ $deviceName: normalizedName });
  }

  public getOrCreateDeviceId(): string {
    const row = this.db
      .query("SELECT value FROM app_preferences WHERE key = 'deviceId'")
      .get() as { value: string } | null;

    if (row?.value) {
      return row.value;
    }

    const newId = crypto.randomUUID();
    this.db.prepare(
      `INSERT INTO app_preferences (key, value) VALUES ('deviceId', $deviceId)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run({ $deviceId: newId });

    return newId;
  }

  public getLastUploadedTreeHash(): string | null {
    const row = this.db
      .query("SELECT value FROM app_preferences WHERE key = 'lastUploadedTreeHash'")
      .get() as { value: string } | null;
    return row?.value ?? null;
  }

  public setLastUploadedTreeHash(hash: string): void {
    this.db.prepare(
      `INSERT INTO app_preferences (key, value) VALUES ('lastUploadedTreeHash', $hash)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run({ $hash: hash });
  }

  public getWindowSize(): { width: number; height: number } | null {
    const width = this.db
      .query("SELECT value FROM app_preferences WHERE key = 'windowWidth'")
      .get() as { value: string } | null;
    const height = this.db
      .query("SELECT value FROM app_preferences WHERE key = 'windowHeight'")
      .get() as { value: string } | null;
    const parsedWidth = Number(width?.value);
    const parsedHeight = Number(height?.value);

    return Number.isFinite(parsedWidth) && Number.isFinite(parsedHeight) && parsedWidth > 0 && parsedHeight > 0
      ? { width: parsedWidth, height: parsedHeight }
      : null;
  }

  public setWindowSize(width: number, height: number) {
    const savePreference = this.db.prepare(`
      INSERT INTO app_preferences (key, value) VALUES ($key, $value)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);

    this.db.transaction(() => {
      savePreference.run({ $key: "windowWidth", $value: String(width) });
      savePreference.run({ $key: "windowHeight", $value: String(height) });
    })();
  }

  public upsertNodes(nodes: BrowserTreeNode[]) {
    const upsertStmt = this.db.prepare(`
      INSERT INTO browser_trees (
        id, browser_name, os_type, profile_name, node_type, title, url, parent_id, sort_order, snapshot_time, last_update_time, theme_color, theme_colors, icon
      ) VALUES (
        $id, $browser_name, $os_type, $profile_name, $node_type, $title, $url, $parent_id, $sort_order, $snapshot_time, $last_update_time, $theme_color, $theme_colors, $icon
      )
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        url = excluded.url,
        parent_id = excluded.parent_id,
        sort_order = excluded.sort_order,
        snapshot_time = excluded.snapshot_time,
        last_update_time = excluded.last_update_time,
        theme_color = excluded.theme_color,
        theme_colors = excluded.theme_colors,
        icon = excluded.icon;
    `);

    const transaction = this.db.transaction((items: BrowserTreeNode[]) => {
      for (const item of items) {
        upsertStmt.run({
          $id: item.id,
          $browser_name: item.browser_name,
          $os_type: item.os_type,
          $profile_name: item.profile_name,
          $node_type: item.node_type,
          $title: item.title,
          $url: item.url,
          $parent_id: item.parent_id,
          $sort_order: item.sort_order,
          $snapshot_time: item.snapshot_time,
          $last_update_time: item.lastUpdateTime ?? item.snapshot_time,
          $theme_color: item.theme_color ?? null,
          $theme_colors: item.theme_colors ? JSON.stringify(item.theme_colors) : null,
          $icon: item.icon ?? null,
        });
      }
    });

    transaction(nodes);
  }

  public replaceProfileNodes(browserName: string, profileName: string, nodes: BrowserTreeNode[]) {
    const deleteStmt = this.db.prepare(
      "DELETE FROM browser_trees WHERE browser_name = $browserName AND profile_name = $profileName"
    );
    const upsertStmt = this.db.prepare(`
      INSERT INTO browser_trees (
        id, browser_name, os_type, profile_name, node_type, title, url, parent_id, sort_order, snapshot_time, last_update_time, theme_color, theme_colors, icon
      ) VALUES (
        $id, $browser_name, $os_type, $profile_name, $node_type, $title, $url, $parent_id, $sort_order, $snapshot_time, $last_update_time, $theme_color, $theme_colors, $icon
      )
    `);

    this.db.transaction((items: BrowserTreeNode[]) => {
      deleteStmt.run({ $browserName: browserName, $profileName: profileName });
      for (const item of items) {
        upsertStmt.run({
          $id: item.id,
          $browser_name: item.browser_name,
          $os_type: item.os_type,
          $profile_name: item.profile_name,
          $node_type: item.node_type,
          $title: item.title,
          $url: item.url,
          $parent_id: item.parent_id,
          $sort_order: item.sort_order,
          $snapshot_time: item.snapshot_time,
          $last_update_time: item.lastUpdateTime ?? item.snapshot_time,
          $theme_color: item.theme_color ?? null,
          $theme_colors: item.theme_colors ? JSON.stringify(item.theme_colors) : null,
          $icon: item.icon ?? null,
        });
      }
    })(nodes);
  }

  public replaceBrowserNodes(browserName: string, nodes: BrowserTreeNode[]) {
    const deleteStmt = this.db.prepare(
      "DELETE FROM browser_trees WHERE browser_name = $browserName"
    );
    const insertStmt = this.db.prepare(`
      INSERT INTO browser_trees (
        id, browser_name, os_type, profile_name, node_type, title, url, parent_id, sort_order, snapshot_time, last_update_time, theme_color, theme_colors, icon
      ) VALUES (
        $id, $browser_name, $os_type, $profile_name, $node_type, $title, $url, $parent_id, $sort_order, $snapshot_time, $last_update_time, $theme_color, $theme_colors, $icon
      )
    `);

    this.db.transaction((items: BrowserTreeNode[]) => {
      deleteStmt.run({ $browserName: browserName });
      for (const item of items) {
        insertStmt.run({
          $id: item.id,
          $browser_name: item.browser_name,
          $os_type: item.os_type,
          $profile_name: item.profile_name,
          $node_type: item.node_type,
          $title: item.title,
          $url: item.url,
          $parent_id: item.parent_id,
          $sort_order: item.sort_order,
          $snapshot_time: item.snapshot_time,
          $last_update_time: item.lastUpdateTime ?? item.snapshot_time,
          $theme_color: item.theme_color ?? null,
          $theme_colors: item.theme_colors ? JSON.stringify(item.theme_colors) : null,
          $icon: item.icon ?? null,
        });
      }
    })(nodes);
  }

  public getAllNodes(browserName?: string, profileName?: string): BrowserTreeNode[] {
    let query = "SELECT * FROM browser_trees";
    const params: any = {};

    const conditions: string[] = [];
    if (browserName) {
      conditions.push("browser_name = $browserName");
      params.$browserName = browserName;
    }
    if (profileName) {
      conditions.push("profile_name = $profileName");
      params.$profileName = profileName;
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    query += " ORDER BY sort_order ASC, id ASC";

    const rows = this.db.query(query).all(params) as any[];
    return rows.map((row) => ({
      ...row,
      lastUpdateTime: row.last_update_time || row.snapshot_time,
      theme_colors: row.theme_colors
        ? (typeof row.theme_colors === "string" ? JSON.parse(row.theme_colors) : row.theme_colors)
        : null,
    })) as BrowserTreeNode[];
  }

  public getTree(browserName?: string, profileName?: string): BrowserTreeNode[] {
    const flatNodes = this.getAllNodes(browserName, profileName);
    const nodeMap = new Map<string, BrowserTreeNode>();
    const rootNodes: BrowserTreeNode[] = [];

    for (const node of flatNodes) {
      nodeMap.set(node.id, { ...node, children: [] });
    }

    for (const node of flatNodes) {
      const current = nodeMap.get(node.id)!;
      if (node.parent_id && nodeMap.has(node.parent_id)) {
        const parent = nodeMap.get(node.parent_id)!;
        parent.children = parent.children || [];
        parent.children.push(current);
      } else {
        rootNodes.push(current);
      }
    }

    // Sort root nodes by their lastUpdateTime DESC (most recently updated browser first)
    rootNodes.sort((a, b) => {
      const timeA = a.lastUpdateTime || a.snapshot_time || "";
      const timeB = b.lastUpdateTime || b.snapshot_time || "";
      if (timeA && timeB) {
        return timeB.localeCompare(timeA);
      }
      if (timeA) return -1;
      if (timeB) return 1;
      return a.sort_order - b.sort_order;
    });

    return rootNodes;
  }

  public getBrowserLastUpdateTimes(): Record<string, string> {
    const rows = this.db
      .query(
        "SELECT browser_name, MAX(COALESCE(last_update_time, snapshot_time)) as lastUpdate FROM browser_trees GROUP BY browser_name"
      )
      .all() as { browser_name: string; lastUpdate: string | null }[];

    const result: Record<string, string> = {};
    for (const r of rows) {
      if (r.browser_name && r.lastUpdate) {
        result[r.browser_name.toLowerCase()] = r.lastUpdate;
      }
    }
    return result;
  }

  public getStats(): SyncStats {
    const totalRow = this.db.query("SELECT COUNT(*) as count FROM browser_trees").get() as { count: number };
    const workspacesRow = this.db.query("SELECT COUNT(*) as count FROM browser_trees WHERE node_type = 'workspace'").get() as { count: number };
    const foldersRow = this.db.query("SELECT COUNT(*) as count FROM browser_trees WHERE node_type = 'folder'").get() as { count: number };
    const tabsRow = this.db.query("SELECT COUNT(*) as count FROM browser_trees WHERE node_type IN ('tab', 'pinned_tab')").get() as { count: number };
    const latestRow = this.db.query("SELECT MAX(COALESCE(last_update_time, snapshot_time)) as lastSync FROM browser_trees").get() as { lastSync: string | null };

    return {
      totalNodes: totalRow?.count || 0,
      totalWorkspaces: workspacesRow?.count || 0,
      totalFolders: foldersRow?.count || 0,
      totalTabs: tabsRow?.count || 0,
      lastSyncTime: latestRow?.lastSync || null,
      detectedBrowsers: [],
    };
  }
}
