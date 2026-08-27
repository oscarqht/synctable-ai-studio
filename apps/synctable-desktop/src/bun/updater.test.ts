import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { AutoUpdater, type GitHubReleaseResponse, type PendingUpdateMeta } from "./updater";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("AutoUpdater", () => {
  const testUpdatesDir = join(tmpdir(), `synctable-test-updates-${Date.now()}`);

  beforeEach(() => {
    mkdirSync(testUpdatesDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testUpdatesDir)) {
      rmSync(testUpdatesDir, { recursive: true, force: true });
    }
  });

  describe("compareSemver", () => {
    it("correctly identifies newer versions", () => {
      expect(AutoUpdater.compareSemver("0.4.0", "0.3.0")).toBe(1);
      expect(AutoUpdater.compareSemver("v0.3.1", "0.3.0")).toBe(1);
      expect(AutoUpdater.compareSemver("1.0.0", "0.9.9")).toBe(1);
      expect(AutoUpdater.compareSemver("0.3.0-rc1", "0.3.0")).toBe(0);
    });

    it("correctly identifies equal versions", () => {
      expect(AutoUpdater.compareSemver("0.3.0", "0.3.0")).toBe(0);
      expect(AutoUpdater.compareSemver("v0.3.0", "0.3.0")).toBe(0);
      expect(AutoUpdater.compareSemver("v1.2.3", "v1.2.3")).toBe(0);
    });

    it("correctly identifies older versions", () => {
      expect(AutoUpdater.compareSemver("0.2.9", "0.3.0")).toBe(-1);
      expect(AutoUpdater.compareSemver("0.3.0", "v0.3.1")).toBe(-1);
      expect(AutoUpdater.compareSemver("0.9.9", "1.0.0")).toBe(-1);
    });
  });

  describe("selectAssetForPlatform", () => {
    const updater = new AutoUpdater({ updatesDir: testUpdatesDir, currentVersion: "0.3.0", isDev: false });

    it("selects appropriate asset for current platform", () => {
      const mockAssets = [
        {
          name: "stable-macos-arm64-Synctable.app.tar.zst",
          browser_download_url: "https://example.com/mac-arm64.tar.zst",
          size: 1000,
          content_type: "application/octet-stream",
        },
        {
          name: "stable-macos-arm64-Synctable.dmg",
          browser_download_url: "https://example.com/mac.dmg",
          size: 1000,
          content_type: "application/octet-stream",
        },
        {
          name: "Synctable-Setup.exe",
          browser_download_url: "https://example.com/setup.exe",
          size: 1000,
          content_type: "application/octet-stream",
        },
      ];

      const selected = updater.selectAssetForPlatform(mockAssets);
      expect(selected).not.toBeNull();
      if (process.platform === "darwin") {
        expect(selected?.name).toContain("macos");
      } else if (process.platform === "win32") {
        expect(selected?.name).toContain(".exe");
      }
    });
  });

  describe("Metadata management", () => {
    it("persists, retrieves, and clears pending update metadata", () => {
      const updater = new AutoUpdater({ updatesDir: testUpdatesDir, currentVersion: "0.3.0", isDev: false });

      expect(updater.getPendingUpdateMeta()).toBeNull();

      const meta: PendingUpdateMeta = {
        status: "ready_to_install",
        version: "0.4.0",
        releaseName: "Synctable Desktop v0.4.0",
        releaseNotes: "New features added",
        downloadedAssetPath: join(testUpdatesDir, "test.tar.zst"),
        stagedAppPath: join(testUpdatesDir, "staged", "Synctable.app"),
        downloadedAt: new Date().toISOString(),
      };

      updater.savePendingUpdateMeta(meta);

      const saved = updater.getPendingUpdateMeta();
      expect(saved).not.toBeNull();
      expect(saved?.version).toBe("0.4.0");
      expect(saved?.status).toBe("ready_to_install");
      expect(saved?.releaseName).toBe("Synctable Desktop v0.4.0");

      updater.clearPendingUpdate();
      expect(updater.getPendingUpdateMeta()).toBeNull();
    });
  });

  describe("checkAndApplyPendingUpdate", () => {
    it("ignores or cleans up stale pending updates in production mode", () => {
      const updater = new AutoUpdater({ updatesDir: testUpdatesDir, currentVersion: "0.4.0", isDev: false });

      // Staged update for an older version (0.3.0)
      updater.savePendingUpdateMeta({
        status: "ready_to_install",
        version: "0.3.0",
        releaseName: "Synctable Desktop v0.3.0",
        releaseNotes: "Old release",
      });

      const applied = updater.checkAndApplyPendingUpdate();
      expect(applied).toBe(false);
      expect(updater.getPendingUpdateMeta()).toBeNull();
    });
  });

  describe("installUpdateAndRelaunch", () => {
    it("returns error when no update is ready to install", () => {
      const updater = new AutoUpdater({ updatesDir: testUpdatesDir, currentVersion: "0.3.0", isDev: false });
      const result = updater.installUpdateAndRelaunch();
      expect(result.success).toBe(false);
    });
  });

  describe("dismissUpdate", () => {
    it("records dismissed update version", () => {
      const updater = new AutoUpdater({ updatesDir: testUpdatesDir, currentVersion: "0.3.0", isDev: false });
      updater.savePendingUpdateMeta({
        status: "ready_to_install",
        version: "0.4.0",
        releaseName: "Synctable Desktop v0.4.0",
        releaseNotes: "New update",
      });

      updater.dismissUpdate();
      expect(updater.getPendingUpdateMeta()?.version).toBe("0.4.0");
    });
  });

  describe("isDevMode", () => {
    it("skips periodic checks and pending update application in dev mode", () => {
      const devUpdater = new AutoUpdater({
        updatesDir: testUpdatesDir,
        currentVersion: "0.3.0",
        isDev: true,
      });

      expect(devUpdater.isDevMode()).toBe(true);

      // Staged update should not be applied in dev mode
      devUpdater.savePendingUpdateMeta({
        status: "ready_to_install",
        version: "0.4.0",
        releaseName: "Synctable Desktop v0.4.0",
        releaseNotes: "Dev test",
      });

      const applied = devUpdater.checkAndApplyPendingUpdate();
      expect(applied).toBe(false);
    });

    it("skips automatic checkForUpdates in dev mode unless forceCheck is true", async () => {
      const devUpdater = new AutoUpdater({
        updatesDir: testUpdatesDir,
        currentVersion: "0.3.0",
        isDev: true,
      });

      const result = await devUpdater.checkForUpdates();
      expect(result.updateAvailable).toBe(false);
    });
  });

  describe("stageDownloadedAsset", () => {
    it("verifies staged bundle structure and rejects invalid extractions", () => {
      const updater = new AutoUpdater({ updatesDir: testUpdatesDir, currentVersion: "0.3.0", isDev: false });
      const stagedDir = join(testUpdatesDir, "staged-test");
      mkdirSync(stagedDir, { recursive: true });

      // Non-existent or dummy asset without valid .app structure
      const stagedPath = updater.stageDownloadedAsset("invalid-package.tar.zst", join(testUpdatesDir, "dummy.tar.zst"), stagedDir);
      expect(stagedPath).toBeNull();
    });

    it("accepts valid staged .app bundle structure", () => {
      const updater = new AutoUpdater({ updatesDir: testUpdatesDir, currentVersion: "0.3.0", isDev: false });
      const stagedDir = join(testUpdatesDir, "staged-valid");
      const mockAppBundle = join(stagedDir, "Synctable.app", "Contents", "MacOS");
      mkdirSync(mockAppBundle, { recursive: true });

      const stagedPath = updater.stageDownloadedAsset("dummy.tar.zst", join(testUpdatesDir, "dummy.tar.zst"), stagedDir);
      if (process.platform === "darwin") {
        expect(stagedPath).toBe(join(stagedDir, "Synctable.app"));
      }
    });
  });

  describe("downloadUpdate", () => {
    it("returns already-ready update if metadata already indicates ready_to_install", async () => {
      const updater = new AutoUpdater({ updatesDir: testUpdatesDir, currentVersion: "0.3.0", isDev: false });
      const stagedDir = join(testUpdatesDir, "staged");
      mkdirSync(join(stagedDir, "Synctable.app", "Contents", "MacOS"), { recursive: true });

      updater.savePendingUpdateMeta({
        status: "ready_to_install",
        version: "0.4.0",
        releaseName: "Synctable Desktop v0.4.0",
        releaseNotes: "Ready update",
        stagedAppPath: join(stagedDir, "Synctable.app"),
      });

      const res = await updater.downloadUpdate();
      expect(res.success).toBe(true);
      expect(res.updateInfo?.status).toBe("ready_to_install");
      expect(res.updateInfo?.version).toBe("0.4.0");
    });
  });
});
