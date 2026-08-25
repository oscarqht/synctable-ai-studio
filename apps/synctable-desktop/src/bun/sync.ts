import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
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
  candidateSessionPaths?: string[];
}

/** Adds each regular Chrome profile and its newest persisted live-session log. */
export function addChromeProfiles(profiles: BrowserProfile[], chromeUserData: string): void {
  if (!existsSync(chromeUserData)) return;

  for (const entry of readdirSync(chromeUserData, { withFileTypes: true })) {
    if (!entry.isDirectory() || (entry.name !== "Default" && !entry.name.startsWith("Profile "))) continue;
    const profileDir = join(chromeUserData, entry.name);
    const preferencesPath = join(profileDir, "Preferences");
    if (!existsSync(preferencesPath)) continue;

    const sessionsDir = join(profileDir, "Sessions");
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
      sourcePath: preferencesPath,
      sessionPath: sessionFiles[0],
      candidateSessionPaths: sessionFiles,
    });
  }
}

/** Adds each regular Vivaldi profile and its newest persisted live-session log. */
export function addVivaldiProfiles(profiles: BrowserProfile[], vivaldiUserData: string): void {
  if (!existsSync(vivaldiUserData)) return;

  for (const entry of readdirSync(vivaldiUserData, { withFileTypes: true })) {
    if (!entry.isDirectory() || (entry.name !== "Default" && !entry.name.startsWith("Profile "))) continue;
    const profileDir = join(vivaldiUserData, entry.name);
    const vivaldiPref = join(profileDir, "Preferences");
    const sessionsDir = join(profileDir, "Sessions");
    const sessionFiles = existsSync(sessionsDir)
      ? readdirSync(sessionsDir)
          .filter((name) => name.startsWith("Session_"))
          .map((name) => join(sessionsDir, name))
          .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs)
      : [];
    if (existsSync(vivaldiPref)) {
      profiles.push({
        browser: "vivaldi",
        displayName: "Vivaldi",
        profileName: entry.name,
        sourcePath: vivaldiPref,
        sessionPath: sessionFiles[0],
        candidateSessionPaths: sessionFiles,
      });
    }
  }
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

/** Adds Firefox profiles and their newest recovery or shutdown session. */
export function addFirefoxProfiles(profiles: BrowserProfile[], firefoxProfilesDir: string): void {
  if (!existsSync(firefoxProfilesDir)) return;

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

/** Adds Arc profile. */
export function addArcProfiles(profiles: BrowserProfile[], arcPath: string): void {
  if (existsSync(arcPath)) {
    profiles.push({ browser: "arc", displayName: "Arc Browser", profileName: "Default", sourcePath: arcPath });
  }
}

/** Safely copies a browser file, using elevated Win32 unlocker if file is locked on Windows. */
export function safeCopyBrowserFile(sourcePath: string, destPath: string): boolean {
  if (!existsSync(sourcePath)) return false;
  try {
    copyFileSync(sourcePath, destPath);
    return true;
  } catch (err: any) {
    if (platform() === "win32") {
      const candidatePaths = [
        join(import.meta.dir, "..", "bin", "win-file-reader.exe"),
        join(dirname(process.execPath), "win-file-reader.exe"),
        join(dirname(process.execPath), "..", "Resources", "app", "bin", "win-file-reader.exe"),
        join(import.meta.dir, "..", "native", "bin", "win-file-reader.exe"),
        join(import.meta.dir, "..", "..", "..", "bin", "win-file-reader.exe"),
        join(import.meta.dir, "..", "..", "src", "native", "bin", "win-file-reader.exe"),
        join(process.cwd(), "bin", "win-file-reader.exe"),
        join(process.cwd(), "Resources", "app", "bin", "win-file-reader.exe"),
        join(process.cwd(), "apps", "synctable-desktop", "src", "native", "bin", "win-file-reader.exe"),
        join(process.cwd(), "src", "native", "bin", "win-file-reader.exe"),
      ];



      for (const helperExe of candidatePaths) {
        if (existsSync(helperExe)) {
          try {
            const res = Bun.spawnSync([helperExe, sourcePath, destPath]);
            if (res.exitCode === 0 && existsSync(destPath)) {
              return true;
            }
          } catch {
            // continue
          }
        }
      }
    }
    return false;
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
      addArcProfiles(profiles, join(appSupport, "Arc", "StorableSidebar.json"));

      // Chrome
      addChromeProfiles(profiles, join(appSupport, "Google", "Chrome"));

      // Vivaldi
      addVivaldiProfiles(profiles, join(appSupport, "Vivaldi"));

      // Zen Browser
      addZenProfiles(profiles, join(appSupport, "zen", "Profiles"));

      // Firefox
      addFirefoxProfiles(profiles, join(appSupport, "Firefox", "Profiles"));

      // Dia
      const diaUserData = join(appSupport, "Dia", "User Data");
      if (existsSync(diaUserData)) {
        profiles.push({ browser: "dia", displayName: "Dia Browser", profileName: "Default", sourcePath: diaUserData });
      }
    } else if (this.osType === "windows") {
      const localAppData = process.env.LOCALAPPDATA;
      const appData = process.env.APPDATA;

      // Chrome on Windows
      if (localAppData) {
        addChromeProfiles(profiles, join(localAppData, "Google", "Chrome", "User Data"));
      }

      // Vivaldi on Windows
      if (localAppData) {
        addVivaldiProfiles(profiles, join(localAppData, "Vivaldi", "User Data"));
      }

      // Arc on Windows
      if (localAppData) {
        const standardArc = join(localAppData, "Arc", "StorableSidebar.json");
        if (existsSync(standardArc)) {
          addArcProfiles(profiles, standardArc);
        } else {
          const packagesDir = join(localAppData, "Packages");
          if (existsSync(packagesDir)) {
            try {
              for (const entry of readdirSync(packagesDir)) {
                if (entry.startsWith("TheBrowserCompany.Arc")) {
                  const packagedArc = join(packagesDir, entry, "LocalCache", "Local", "Arc", "StorableSidebar.json");
                  if (existsSync(packagedArc)) {
                    addArcProfiles(profiles, packagedArc);
                    break;
                  }
                }
              }
            } catch {
              // Ignore packages read errors
            }
          }
        }
      }

      // Zen Browser on Windows
      if (appData) {
        addZenProfiles(profiles, join(appData, "zen", "Profiles"));
      }

      // Firefox on Windows
      if (appData) {
        addFirefoxProfiles(profiles, join(appData, "Mozilla", "Firefox", "Profiles"));
      }
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
          const sourceCopied = safeCopyBrowserFile(prof.sourcePath, safeTmpFile);
          if (!sourceCopied) {
            continue;
          }

          if (prof.browser === "arc") {
            nodes = parseArcSidebar({
              filePath: safeTmpFile,
              osType: this.osType,
              profileName: prof.profileName,
              snapshotTime: syncTimestamp,
            });
          } else if (prof.browser === "chrome") {
            const candidateSessions = prof.candidateSessionPaths && prof.candidateSessionPaths.length > 0
              ? prof.candidateSessionPaths
              : (prof.sessionPath ? [prof.sessionPath] : []);

            let parsedNodes: BrowserTreeNode[] = [];
            for (const sessionPath of candidateSessions) {
              const safeSessionFile = `${safeTmpFile}_session_${Date.now()}`;
              const copied = safeCopyBrowserFile(sessionPath, safeSessionFile);
              if (copied && existsSync(safeSessionFile)) {
                const candidateNodes = parseChromePreferences({
                  filePath: safeTmpFile,
                  sessionFilePath: safeSessionFile,
                  osType: this.osType,
                  profileName: prof.profileName,
                  snapshotTime: syncTimestamp,
                  browserName: prof.browser,
                });
                if (candidateNodes.some((n) => n.node_type === "tab" || n.node_type === "pinned_tab")) {
                  parsedNodes = candidateNodes;
                  break;
                }
              }
            }

            if (parsedNodes.length === 0) {
              parsedNodes = parseChromePreferences({
                filePath: safeTmpFile,
                osType: this.osType,
                profileName: prof.profileName,
                snapshotTime: syncTimestamp,
                browserName: prof.browser,
              });
            }
            nodes = parsedNodes;

          } else if (prof.browser === "vivaldi") {
            const candidateSessions = prof.candidateSessionPaths && prof.candidateSessionPaths.length > 0
              ? prof.candidateSessionPaths
              : (prof.sessionPath ? [prof.sessionPath] : []);

            let parsedNodes: BrowserTreeNode[] = [];
            for (const sessionPath of candidateSessions) {
              const safeSessionFile = `${safeTmpFile}_session_${Date.now()}`;
              const copied = safeCopyBrowserFile(sessionPath, safeSessionFile);
              if (copied && existsSync(safeSessionFile)) {
                const candidateNodes = parseVivaldiPreferences({
                  filePath: safeTmpFile,
                  sessionFilePath: safeSessionFile,
                  osType: this.osType,
                  profileName: prof.profileName,
                  snapshotTime: syncTimestamp,
                });
                if (candidateNodes.some((n) => n.node_type === "tab" || n.node_type === "pinned_tab")) {
                  parsedNodes = candidateNodes;
                  break;
                }
              }
            }

            if (parsedNodes.length === 0) {
              parsedNodes = parseVivaldiPreferences({
                filePath: safeTmpFile,
                osType: this.osType,
                profileName: prof.profileName,
                snapshotTime: syncTimestamp,
              });
            }
            nodes = parsedNodes;
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

          const existingHasTabs = existingNodes.some((n) => n.node_type === "tab" || n.node_type === "pinned_tab");
          const newHasTabs = nodes.some((n) => n.node_type === "tab" || n.node_type === "pinned_tab");

          // CRITICAL: If the current sync produced 0 tabs (e.g. Chrome is actively locking its in-flight session file),
          // DO NOT wipe out the existing tabs from the database! Retain existing nodes.
          if (!newHasTabs && existingHasTabs) {
            continue;
          }

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
