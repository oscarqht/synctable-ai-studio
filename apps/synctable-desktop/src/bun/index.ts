import { ApplicationMenu, BrowserView, BrowserWindow, defineElectrobunRPC, Utils } from "electrobun/bun";
import { existsSync, watch } from "node:fs";
import { platform } from "node:os";
import { join } from "node:path";
import { SynctableDB } from "./db";
import { defaultKeychain } from "./keychain";
import { defaultRaindropClient } from "./raindrop";
import { BrowserSyncManager } from "./sync";
import type { CloudSyncResponse, SynctableRPCSchema } from "../shared/types";


const db = new SynctableDB();
const syncManager = new BrowserSyncManager(db);
const DEFAULT_WINDOW_FRAME = { x: 120, y: 80, width: 1150, height: 780 };
const savedWindowSize = db.getWindowSize();

if (platform() === "darwin") {
  ApplicationMenu.setApplicationMenu([
    {
      label: "Synctable",
      submenu: [
        { role: "about" },
        { type: "divider" },
        { role: "hide", accelerator: "Command+H" },
        { role: "hideOthers", accelerator: "Command+Alt+H" },
        { role: "showAll" },
        { type: "divider" },
        { role: "quit", accelerator: "Command+Q" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo", accelerator: "Command+Z" },
        { role: "redo", accelerator: "Command+Shift+Z" },
        { type: "divider" },
        { role: "cut", accelerator: "Command+X" },
        { role: "copy", accelerator: "Command+C" },
        { role: "paste", accelerator: "Command+V" },
        { role: "selectAll", accelerator: "Command+A" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize", accelerator: "Command+M" },
        { role: "zoom" },
        { role: "close", accelerator: "Command+W" },
      ],
    },
  ]);
}

const rpc = defineElectrobunRPC<SynctableRPCSchema>("bun", {
  handlers: {
    requests: {
      getStats: () => {
        return syncManager.getStatsWithDetected();
      },
      getTree: (params) => {
        return db.getTree(params?.browserName, params?.profileName);
      },
      triggerSync: async () => {
        const result = await syncManager.runSync();
        return result;
      },
      getAppPreferences: () => {
        const prefs = db.getAppPreferences();
        const raindropToken = defaultKeychain.getRaindropToken();
        return {
          ...prefs,
          raindropToken,
        };
      },
      setSelectedBrowser: ({ selectedBrowser }) => {
        db.setSelectedBrowser(selectedBrowser);
      },
      setDeviceName: ({ deviceName }) => {
        db.setDeviceName(deviceName);
        // Invalidate cache so updated device name is reflected
        cachedCloudData = null;
        inFlightCloudFetch = null;
        lastCloudFetchTime = 0;
      },
      getRaindropToken: () => {
        return defaultKeychain.getRaindropToken();
      },
      setRaindropToken: ({ token }) => {
        defaultKeychain.setRaindropToken(token);
        cachedCloudData = null;
        inFlightCloudFetch = null;
        lastCloudFetchTime = 0;
      },
      getCloudData: async (params) => {
        return await getCachedOrFreshCloudData(Boolean(params?.forceRefresh));
      },
      openExternalURL: ({ url }) => {
        if (!url) return;
        try {
          Utils.openExternal(url);
        } catch {
          if (platform() === "darwin") {
            Bun.spawn(["open", url]);
          }
        }
      },
      minimizeWindow: () => {
        win.minimize();
      },
      toggleMaximizeWindow: () => {
        if (win.isMaximized()) {
          win.unmaximize();
        } else {
          win.maximize();
        }
      },
      closeWindow: () => {
        win.close();
      },
    },
  },
});

let cachedCloudData: CloudSyncResponse | null = null;
let lastCloudFetchTime = 0;
let inFlightCloudFetch: Promise<CloudSyncResponse> | null = null;
const CLOUD_CACHE_TTL_MS = 25000; // 25 seconds cache

async function getCachedOrFreshCloudData(forceRefresh = false): Promise<CloudSyncResponse> {
  const token = defaultKeychain.getRaindropToken()?.trim();
  if (!token) {
    cachedCloudData = null;
    return {
      authenticated: false,
      devices: [],
      error: "Raindrop API token is not configured.",
    };
  }

  const now = Date.now();
  if (!forceRefresh && cachedCloudData && now - lastCloudFetchTime < CLOUD_CACHE_TTL_MS) {
    return cachedCloudData;
  }

  if (!forceRefresh && inFlightCloudFetch) {
    return inFlightCloudFetch;
  }

  inFlightCloudFetch = (async () => {
    try {
      const data = await defaultRaindropClient.fetchCloudDevices(token);
      if (data.authenticated) {
        cachedCloudData = data;
        lastCloudFetchTime = Date.now();
      }
      return data;
    } catch (err: any) {
      if (cachedCloudData) {
        return cachedCloudData;
      }
      return {
        authenticated: true,
        collection: null,
        devices: [],
        error: err?.message || String(err),
      };
    } finally {
      inFlightCloudFetch = null;
    }
  })();

  return inFlightCloudFetch;
}


// Create main window
const win = new BrowserWindow({
  title: "Synctable",
  frame: {
    ...DEFAULT_WINDOW_FRAME,
    ...savedWindowSize,
  },
  url: "views://mainview/index.html",
  renderer: "native",
  rpc,
  titleBarStyle: "hiddenInset",
  transparent: false,
  passthrough: false,
  sandbox: false,
  html: null,
  preload: null,
  viewsRoot: null,
  navigationRules: null,
});

let saveWindowSizeTimer: Timer | undefined;
const saveWindowSize = (event: unknown) => {
  const { width, height } = (event as { data: { width: number; height: number } }).data;
  clearTimeout(saveWindowSizeTimer);
  saveWindowSizeTimer = setTimeout(() => db.setWindowSize(width, height), 250);
};

win.on("resize", saveWindowSize);
win.on("close", () => db.setWindowSize(win.getSize().width, win.getSize().height));

async function syncAndNotify() {
  const result = await syncManager.runSync();
  // The renderer performs the same reload after a manual Sync Now. Send the
  // matching event for daemon syncs so new/closed windows appear without a restart.
  const mainView = BrowserView.getById(win.webviewId);
  mainView?.rpc?.send.syncComplete(result);
  return result;
}

// Start from a fresh local snapshot instead of waiting for the first interval.
void syncAndNotify();

// Background sync loop (1 minute)
const SYNC_INTERVAL_MS = 1 * 60 * 1000;
let autoSyncPaused = false;

async function runAutoSync(reason: "periodic" | "resumed" | "file_change") {
  if (autoSyncPaused) {
    console.log("[Synctable Daemon] Auto-sync paused while the session is inactive.");
    return;
  }

  try {
    console.log(`[Synctable Daemon] Starting ${reason} background sync...`);
    const result = await syncAndNotify();
    console.log(`[Synctable Daemon] Auto-sync complete (${result.syncedNodesCount} nodes).`);
  } catch (err) {
    console.error("[Synctable Daemon] Auto-sync error:", err);
  }
}

function findLifecycleMonitor() {
  const candidates = [
    join(process.cwd(), "src", "native", "bin", "sync-lifecycle-monitor"),
    join(import.meta.dir, "..", "native", "bin", "sync-lifecycle-monitor"),
    join(import.meta.dir, "..", "..", "bin", "sync-lifecycle-monitor"),
  ];
  return candidates.find(existsSync);
}

function monitorMacLifecycle() {
  if (platform() !== "darwin") return;

  const executable = findLifecycleMonitor();
  if (!executable) {
    console.error("[Synctable Daemon] Lifecycle monitor is unavailable; auto-sync will continue normally.");
    return;
  }

  const monitor = Bun.spawn([executable], { stdout: "pipe", stderr: "inherit" });
  void (async () => {
    const decoder = new TextDecoder();
    let buffered = "";

    for await (const chunk of monitor.stdout as any) {

      buffered += decoder.decode(chunk, { stream: true });
      const states = buffered.split("\n");
      buffered = states.pop() ?? "";

      for (const state of states) {
        if (state === "paused" && !autoSyncPaused) {
          autoSyncPaused = true;
          console.log("[Synctable Daemon] Auto-sync paused because macOS became inactive.");
        } else if (state === "resumed" && autoSyncPaused) {
          autoSyncPaused = false;
          console.log("[Synctable Daemon] Auto-sync resumed because macOS became active.");
          runAutoSync("resumed");
        }
      }
    }
  })().catch((err) => console.error("[Synctable Daemon] Lifecycle monitor error:", err));
}

function monitorBrowserFileChanges() {
  const profiles = syncManager.getBrowserProfiles();
  const watchedPaths = new Set<string>();

  let fileChangeTimer: Timer | undefined;
  const triggerFileChangeSync = (browser: string, path: string) => {
    clearTimeout(fileChangeTimer);
    fileChangeTimer = setTimeout(() => {
      console.log(`[Synctable Daemon] Detected change in ${browser} (${path}), triggering sync...`);
      runAutoSync("file_change");
    }, 1000);
  };

  for (const prof of profiles) {
    const pathsToWatch = [prof.sourcePath, prof.sessionPath].filter(Boolean) as string[];
    for (const p of pathsToWatch) {
      if (!watchedPaths.has(p) && existsSync(p)) {
        watchedPaths.add(p);
        try {
          watch(p, () => {
            triggerFileChangeSync(prof.browser, p);
          });
        } catch (err) {
          console.warn(`[Synctable Daemon] Could not watch ${p}:`, err);
        }
      }
    }
  }
}

monitorMacLifecycle();
monitorBrowserFileChanges();

setInterval(() => {
  runAutoSync("periodic");
}, SYNC_INTERVAL_MS);

console.log("Synctable Electrobun main process initialized.");
