import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir, platform } from "node:os";
import type { BrowserTreeNode, OSType, SyncResult, SyncStats } from "../shared/types";
import { parseArcSidebar, parseChromePreferences, parseDiaTree, parseFirefoxSessionstore, parseVivaldiPreferences, parseZenSessionstore } from "./parsers";
import type { SynctableDB } from "./db";
import { defaultKeychain, KeychainService } from "./keychain";
import { defaultRaindropClient, RaindropClient } from "./raindrop";

export interface BrowserProfile {
  browser: string;
  displayName: string;
  profileName: string;
  sourcePath: string;
  sessionPath?: string;
}

/**
 * Zen keeps the live session in recovery.jsonlz4 while it is running. This is
 * the same layout on macOS and Windows; only the application-data root differs.
 */
export function addZenProfiles(profiles: BrowserProfile[], zenProfilesDir: string): void {
  if (!existsSync(zenProfilesDir)) return;

  for (const entry of readdirSync(zenProfilesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const profileDir = join(zenProfilesDir, entry.name);
    const recoveryPath = join(profileDir, "sessionstore-backups", "recovery.jsonlz4");
    const sessionPath = join(profileDir, "sessionstore.jsonlz4");
    const sourcePath = existsSync(recoveryPath) ? recoveryPath : sessionPath;
    if (existsSync(sourcePath)) {
      profiles.push({ browser: "zen", displayName: "Zen Browser", profileName: entry.name, sourcePath });
    }
  }
}

export function canonicalizeTree(nodes: BrowserTreeNode[]): any {
  return nodes
    .map((node) => ({
      id: node.id,
      browser_name: node.browser_name,
      os_type: node.os_type,
      profile_name: node.profile_name,
      node_type: node.node_type,
      title: node.title,
      url: node.url,
      parent_id: node.parent_id,
      sort_order: node.sort_order,
      theme_color: node.theme_color ?? null,
      theme_colors: node.theme_colors ?? null,
      icon: node.icon ?? null,
      children: node.children ? canonicalizeTree(node.children) : [],
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function computeTreeHash(nodes: BrowserTreeNode[]): string {
  const canonical = canonicalizeTree(nodes);
  const jsonStr = JSON.stringify(canonical);
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(jsonStr);
  return hasher.digest("hex");
}

export class BrowserSyncManager {
  private db: SynctableDB;
  private keychain: KeychainService;
  private raindropClient: RaindropClient;
  private osType: OSType;
  private cacheDir: string;

  constructor(
    db: SynctableDB,
    keychain: KeychainService = defaultKeychain,
    raindropClient: RaindropClient = defaultRaindropClient
  ) {
    this.db = db;
    this.keychain = keychain;
    this.raindropClient = raindropClient;
    this.osType = this.detectOSType();
    this.cacheDir = join(homedir(), ".browser_sync_cache", "tmp");
    mkdirSync(this.cacheDir, { recursive: true });
  }

  private detectOSType(): OSType {
    const p = platform();
    if (p === "darwin") return "macos";
    if (p === "win32") return "windows";
    return "linux";
  }

  public getBrowserProfiles(): BrowserProfile[] {
    const home = homedir();
    const profiles: BrowserProfile[] = [];

    if (this.osType === "macos") {
      const appSupport = join(home, "Library", "Application Support");

      // Arc
      const arcPath = join(appSupport, "Arc", "StorableSidebar.json");
      if (existsSync(arcPath)) {
        profiles.push({ browser: "arc", displayName: "Arc Browser", profileName: "Default", sourcePath: arcPath });
      }

      // Chrome
      const chromeUserData = join(appSupport, "Google", "Chrome");
      if (existsSync(chromeUserData)) {
        const entries = readdirSync(chromeUserData, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && (entry.name === "Default" || entry.name.startsWith("Profile "))) {
            const prefPath = join(chromeUserData, entry.name, "Preferences");
            if (existsSync(prefPath)) {
              const sessionsDir = join(chromeUserData, entry.name, "Sessions");
              const sessionFiles = existsSync(sessionsDir)
                ? readdirSync(sessionsDir)
                    .filter((name) => name.startsWith("Session_"))
                    .map((name) => join(sessionsDir, name))
                    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs)
                : [];
              profiles.push({
                browser: "chrome",
                displayName: "Google Chrome",
                profileName: entry.name,
                sourcePath: prefPath,
                sessionPath: sessionFiles[0],
              });
            }
          }
        }
      }

      // Vivaldi
      const vivaldiUserData = join(appSupport, "Vivaldi");
      if (existsSync(vivaldiUserData)) {
        for (const entry of readdirSync(vivaldiUserData, { withFileTypes: true })) {
          if (!entry.isDirectory() || (entry.name !== "Default" && !entry.name.startsWith("Profile "))) continue;
          const profileDir = join(vivaldiUserData, entry.name);
          const vivaldiPref = join(profileDir, "Preferences");
          const sessionsDir = join(profileDir, "Sessions");
          const sessionFiles = existsSync(sessionsDir)
            ? readdirSync(sessionsDir).filter((name) => name.startsWith("Session_")).map((name) => join(sessionsDir, name)).sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs)
            : [];
          if (existsSync(vivaldiPref)) {
            profiles.push({ browser: "vivaldi", displayName: "Vivaldi", profileName: entry.name, sourcePath: vivaldiPref, sessionPath: sessionFiles[0] });
          }
        }
      }

      // Zen Browser
      addZenProfiles(profiles, join(appSupport, "zen", "Profiles"));

      // Firefox stores both the closed-session snapshot and its current live
      // recovery state in Mozilla's jsonlz4 format. Prefer recovery while it
      // exists so all open windows and their tab ordering are current.
      const firefoxProfilesDir = join(appSupport, "Firefox", "Profiles");
      if (existsSync(firefoxProfilesDir)) {
        for (const entry of readdirSync(firefoxProfilesDir, { withFileTypes: true })) {
          if (!entry.isDirectory()) continue;
          const profileDir = join(firefoxProfilesDir, entry.name);
          const recoveryPath = join(profileDir, "sessionstore-backups", "recovery.jsonlz4");
          const sessionPath = join(profileDir, "sessionstore.jsonlz4");
          const sourcePath = existsSync(recoveryPath) ? recoveryPath : sessionPath;
          if (existsSync(sourcePath)) {
            profiles.push({ browser: "firefox", displayName: "Firefox", profileName: entry.name, sourcePath });
          }
        }
      }

      // Dia stores its complete hierarchy in encrypted per-profile tabs.db
      // files. The local reader opens those databases read-only with the key
      // derived from Dia Safe Storage in macOS Keychain.
      const diaUserData = join(appSupport, "Dia", "User Data");
      if (existsSync(diaUserData)) {
        profiles.push({ browser: "dia", displayName: "Dia Browser", profileName: "Default", sourcePath: diaUserData });
      }
    } else if (this.osType === "windows") {
      // Zen is Firefox-based, so its profile data lives in the roaming app-data
      // directory on Windows rather than under the user's home directory.
      const appData = process.env.APPDATA;
      if (appData) addZenProfiles(profiles, join(appData, "zen", "Profiles"));
    }

    return profiles;
  }

  public async runSync(): Promise<SyncResult> {
    const syncTimestamp = new Date().toISOString();
    const profiles = this.getBrowserProfiles();
    let syncedNodesCount = 0;
    const errors: { browser: string; message: string }[] = [];

    for (const prof of profiles) {
      try {
        let nodes: BrowserTreeNode[] = [];
        if (prof.browser === "dia") {
          nodes = parseDiaTree({
            userDataPath: prof.sourcePath,
            osType: this.osType,
            snapshotTime: syncTimestamp,
          });
        } else {
          const safeTmpFile = join(this.cacheDir, `${prof.browser}_${prof.profileName.replace(/\s+/g, "_")}_${Date.now()}`);
          copyFileSync(prof.sourcePath, safeTmpFile);

          if (prof.browser === "arc") {
            nodes = parseArcSidebar({
              filePath: safeTmpFile,
              osType: this.osType,
              profileName: prof.profileName,
              snapshotTime: syncTimestamp,
            });
          } else if (prof.browser === "chrome") {
            const safeSessionFile = prof.sessionPath ? `${safeTmpFile}_session` : undefined;
            if (prof.sessionPath && safeSessionFile) copyFileSync(prof.sessionPath, safeSessionFile);
            nodes = parseChromePreferences({
              filePath: safeTmpFile,
              sessionFilePath: safeSessionFile,
              osType: this.osType,
              profileName: prof.profileName,
              snapshotTime: syncTimestamp,
            });
          } else if (prof.browser === "vivaldi") {
            const safeSessionFile = prof.sessionPath ? `${safeTmpFile}_session` : undefined;
            if (prof.sessionPath && safeSessionFile) copyFileSync(prof.sessionPath, safeSessionFile);
            nodes = parseVivaldiPreferences({
              filePath: safeTmpFile,
              sessionFilePath: safeSessionFile,
              osType: this.osType,
              profileName: prof.profileName,
              snapshotTime: syncTimestamp,
            });
          } else if (prof.browser === "zen") {
            nodes = parseZenSessionstore({
              filePath: safeTmpFile,
              osType: this.osType,
              profileName: prof.profileName,
              snapshotTime: syncTimestamp,
            });
          } else if (prof.browser === "firefox") {
            nodes = parseFirefoxSessionstore({
              filePath: safeTmpFile,
              osType: this.osType,
              profileName: prof.profileName,
              snapshotTime: syncTimestamp,
            });
          }
        }

        if (nodes.length > 0) {
          // Compare with existing DB nodes for this browser/profile to detect valid changes
          const existingNodes = prof.browser === "dia"
            ? this.db.getAllNodes(prof.browser)
            : this.db.getAllNodes(prof.browser, prof.profileName);

          let resolvedLastUpdateTime = syncTimestamp;
          if (existingNodes.length > 0) {
            const existingHash = computeTreeHash(existingNodes);
            const currentHash = computeTreeHash(nodes);

            if (existingHash === currentHash) {
              // No valid structural/content changes (created, deleted, renamed, reordered, url changed).
              // Retain previous lastUpdateTime.
              resolvedLastUpdateTime = existingNodes[0].lastUpdateTime || existingNodes[0].snapshot_time || syncTimestamp;
            } else {
              // Valid changes detected: update lastUpdateTime to now
              resolvedLastUpdateTime = syncTimestamp;
            }
          }

          // Apply resolved lastUpdateTime to all nodes
          for (const node of nodes) {
            node.lastUpdateTime = resolvedLastUpdateTime;
          }

          if (prof.browser === "dia") {
            // Dia's profile databases are merged into one browser-wide tree.
            // Remove legacy per-profile roots as part of every replacement.
            this.db.replaceBrowserNodes(prof.browser, nodes);
          } else {
            this.db.replaceProfileNodes(prof.browser, prof.profileName, nodes);
          }
          syncedNodesCount += nodes.length;
        }
      } catch (err: any) {
        errors.push({ browser: prof.browser, message: err?.message || String(err) });
      }
    }

    try {
      const fullTree = this.db.getTree();
      const currentTreeHash = computeTreeHash(fullTree);
      const previousTreeHash = this.db.getLastUploadedTreeHash();

      const raindropToken = this.keychain.getRaindropToken()?.trim();
      if (raindropToken && currentTreeHash !== previousTreeHash) {
        const deviceId = this.db.getOrCreateDeviceId();
        const deviceName = this.db.getAppPreferences().deviceName;
        await this.raindropClient.syncTree(raindropToken, deviceId, fullTree, deviceName);
        this.db.setLastUploadedTreeHash(currentTreeHash);
      }
    } catch (err: any) {
      const message = err?.message || String(err);
      console.error("[Synctable] Raindrop sync error:", message);
      errors.push({ browser: "raindrop", message });
    }

    return {
      success: errors.length === 0,
      syncedNodesCount,
      timestamp: syncTimestamp,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  public getStatsWithDetected(): SyncStats {
    const baseStats = this.db.getStats();
    const profiles = this.getBrowserProfiles();
    const lastUpdateTimes = this.db.getBrowserLastUpdateTimes();

    const browsers = [
      { name: "chrome", displayName: "Google Chrome" },
      { name: "firefox", displayName: "Firefox" },
      { name: "arc", displayName: "Arc Browser" },
      { name: "vivaldi", displayName: "Vivaldi" },
      { name: "zen", displayName: "Zen Browser" },
      { name: "dia", displayName: "Dia Browser" },
    ];

    const detected = browsers.map((b) => {
      const matched = profiles.filter((p) => p.browser === b.name);
      const lastUpdate = lastUpdateTimes[b.name.toLowerCase()] || undefined;
      return {
        name: b.name,
        displayName: b.displayName,
        detected: matched.length > 0,
        profileCount: matched.length,
        lastSync: lastUpdate,
        lastUpdateTime: lastUpdate,
      };
    });

    // Sort detected browsers by lastUpdateTime DESC
    detected.sort((a, b) => {
      const timeA = a.lastUpdateTime || "";
      const timeB = b.lastUpdateTime || "";
      if (timeA && timeB) {
        return timeB.localeCompare(timeA);
      }
      if (timeA) return -1;
      if (timeB) return 1;
      if (a.detected !== b.detected) {
        return a.detected ? -1 : 1;
      }
      return a.displayName.localeCompare(b.displayName);
    });

    baseStats.detectedBrowsers = detected;
    return baseStats;
  }
}
