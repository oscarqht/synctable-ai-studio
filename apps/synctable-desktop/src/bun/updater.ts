import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { Utils } from "electrobun/bun";
import type { UpdateCheckResult, UpdateInfo } from "../shared/types";

export interface GitHubReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
  content_type: string;
}

export interface GitHubReleaseResponse {
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  html_url: string;
  draft: boolean;
  prerelease: boolean;
  assets: GitHubReleaseAsset[];
}

export interface PendingUpdateMeta {
  status: "available" | "downloading" | "ready_to_install" | "error";
  version: string;
  releaseName: string;
  releaseNotes: string;
  publishedAt?: string;
  htmlUrl?: string;
  assetName?: string;
  downloadedAssetPath?: string;
  stagedAppPath?: string;
  downloadedAt?: string;
  errorMessage?: string;
}

export class AutoUpdater {
  private repo: string;
  private updatesDir: string;
  private currentVersion: string;
  private checkIntervalMs = 60 * 60 * 1000; // 1 hour
  private intervalTimer?: Timer;
  private isChecking = false;
  private isDownloading = false;
  private activeDownloadPromise: Promise<boolean> | null = null;
  private isDevOverride?: boolean;
  private dismissedVersion: string | null = null;
  private onUpdateAvailableCallback?: (info: UpdateInfo) => void;
  private onStatusChangedCallback?: (info: UpdateInfo) => void;

  constructor(options?: {
    repo?: string;
    updatesDir?: string;
    currentVersion?: string;
    checkIntervalMs?: number;
    isDev?: boolean;
  }) {
    this.repo = options?.repo || process.env.SYNCTABLE_GITHUB_REPO || "oscarqht/synctable-ai-studio";
    this.updatesDir = options?.updatesDir || join(homedir(), ".synctable", "updates");
    this.currentVersion = options?.currentVersion || this.readAppVersion();
    if (options?.checkIntervalMs) {
      this.checkIntervalMs = options.checkIntervalMs;
    }
    if (options?.isDev !== undefined) {
      this.isDevOverride = options.isDev;
    }
  }

  public getVersion(): string {
    return this.currentVersion;
  }

  public isDevMode(): boolean {
    if (this.isDevOverride !== undefined) {
      return this.isDevOverride;
    }

    if (
      process.env.NODE_ENV === "development" ||
      process.env.ELECTROBUN_DEV === "1" ||
      process.env.SYNCTABLE_DEV === "1"
    ) {
      return true;
    }

    try {
      const candidatePaths = [
        join(dirname(process.execPath), "..", "Resources", "version.json"),
        join(process.cwd(), "version.json"),
        join(import.meta.dir, "..", "..", "version.json"),
      ];
      for (const p of candidatePaths) {
        if (existsSync(p)) {
          const content = JSON.parse(readFileSync(p, "utf8"));
          if (content.channel === "dev" || content.hash === "dev" || content.name?.includes("-dev")) {
            return true;
          }
        }
      }
    } catch {
      // Fallback
    }

    // Check if running from local source tree / dev build directory
    if (process.platform === "darwin") {
      const runningAppBundlePath = resolve(dirname(process.execPath), "..", "..");
      if (!runningAppBundlePath.endsWith(".app") || runningAppBundlePath.includes("dev-macos") || runningAppBundlePath.includes("build/")) {
        return true;
      }
    } else {
      if (process.cwd().includes("apps/synctable-desktop") || dirname(process.execPath).includes("build")) {
        return true;
      }
    }

    return false;
  }

  public setCallbacks(callbacks: {
    onUpdateAvailable?: (info: UpdateInfo) => void;
    onStatusChanged?: (info: UpdateInfo) => void;
  }) {
    if (callbacks.onUpdateAvailable) this.onUpdateAvailableCallback = callbacks.onUpdateAvailable;
    if (callbacks.onStatusChanged) this.onStatusChangedCallback = callbacks.onStatusChanged;
  }

  /**
   * Reads the current app version from version.json or package.json
   */
  public readAppVersion(): string {
    // 1. Try Resources/version.json in Electrobun app
    try {
      const candidatePaths = [
        join(dirname(process.execPath), "..", "Resources", "version.json"),
        join(process.cwd(), "version.json"),
        join(import.meta.dir, "..", "..", "version.json"),
      ];
      for (const p of candidatePaths) {
        if (existsSync(p)) {
          const content = JSON.parse(readFileSync(p, "utf8"));
          if (content.version && content.version !== "dev" && content.version !== "0.1.0") {
            return content.version;
          }
        }
      }
    } catch {
      // Fall through to package.json
    }

    // 2. Try package.json
    try {
      const pkgPath = join(import.meta.dir, "..", "..", "package.json");
      if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
        if (pkg.version) return pkg.version;
      }
    } catch {
      // Fallback
    }

    return "0.3.0";
  }

  /**
   * Compares two semantic versions. Returns:
   * > 0 if v1 > v2
   * < 0 if v1 < v2
   * 0 if v1 == v2
   */
  public static compareSemver(v1: string, v2: string): number {
    const clean1 = v1.trim().replace(/^[vV]/, "");
    const clean2 = v2.trim().replace(/^[vV]/, "");

    const p1 = clean1.split(/[-+]/)[0].split(".").map((n) => parseInt(n, 10) || 0);
    const p2 = clean2.split(/[-+]/)[0].split(".").map((n) => parseInt(n, 10) || 0);

    const length = Math.max(p1.length, p2.length);
    for (let i = 0; i < length; i++) {
      const num1 = p1[i] || 0;
      const num2 = p2[i] || 0;
      if (num1 > num2) return 1;
      if (num1 < num2) return -1;
    }
    return 0;
  }

  /**
   * Helper to clean up updates folder or pending metadata
   */
  public getPendingUpdateMeta(): PendingUpdateMeta | null {
    try {
      const metaPath = join(this.updatesDir, "pending-update.json");
      if (existsSync(metaPath)) {
        const content = JSON.parse(readFileSync(metaPath, "utf8"));
        return content as PendingUpdateMeta;
      }
    } catch (err) {
      console.warn("[AutoUpdater] Failed to read pending-update.json:", err);
    }
    return null;
  }

  public savePendingUpdateMeta(meta: PendingUpdateMeta): void {
    try {
      if (!existsSync(this.updatesDir)) {
        mkdirSync(this.updatesDir, { recursive: true });
      }
      const metaPath = join(this.updatesDir, "pending-update.json");
      writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf8");
    } catch (err) {
      console.error("[AutoUpdater] Failed to write pending-update.json:", err);
    }
  }

  public clearPendingUpdate(): void {
    try {
      const metaPath = join(this.updatesDir, "pending-update.json");
      if (existsSync(metaPath)) {
        unlinkSync(metaPath);
      }
      const stagingDir = join(this.updatesDir, "staged");
      if (existsSync(stagingDir)) {
        rmSync(stagingDir, { recursive: true, force: true });
      }
    } catch (err) {
      console.warn("[AutoUpdater] Cleanup error:", err);
    }
  }

  public dismissUpdate(): void {
    const meta = this.getPendingUpdateMeta();
    if (meta?.version) {
      this.dismissedVersion = meta.version;
    }
  }

  /**
   * Starts periodic hourly check
   */
  public startPeriodicCheck(): void {
    if (this.isDevMode()) {
      console.log("[AutoUpdater] Running in local development mode. Periodic auto-update check is skipped.");
      return;
    }

    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
    }

    // Check once immediately upon launch after a short delay
    setTimeout(() => {
      void this.checkForUpdates({ silent: true });
    }, 4000);

    // Run every 1 hour
    this.intervalTimer = setInterval(() => {
      console.log("[AutoUpdater] Running 1-hour periodic update check...");
      void this.checkForUpdates({ silent: true });
    }, this.checkIntervalMs);
  }

  public stopPeriodicCheck(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = undefined;
    }
  }

  /**
   * Check GitHub Releases for new update
   */
  public async checkForUpdates(options?: { forceCheck?: boolean; silent?: boolean }): Promise<UpdateCheckResult> {
    if (this.isDevMode() && !options?.forceCheck) {
      console.log("[AutoUpdater] Skipping automatic update check in local dev environment.");
      return {
        updateAvailable: false,
        currentVersion: this.currentVersion,
      };
    }

    if (this.isChecking) {
      const existing = this.getPendingUpdateMeta();
      return {
        updateAvailable: Boolean(existing && AutoUpdater.compareSemver(existing.version, this.currentVersion) > 0),
        currentVersion: this.currentVersion,
        latestVersion: existing?.version,
        updateInfo: existing
          ? {
              version: existing.version,
              releaseName: existing.releaseName,
              releaseNotes: existing.releaseNotes,
              publishedAt: existing.publishedAt,
              htmlUrl: existing.htmlUrl,
              status: existing.status,
            }
          : null,
      };
    }

    this.isChecking = true;

    try {
      const apiUrl = `https://api.github.com/repos/${this.repo}/releases/latest`;
      console.log(`[AutoUpdater] Checking for updates from ${apiUrl}...`);

      const response = await fetch(apiUrl, {
        headers: {
          "User-Agent": "Synctable-Desktop",
          Accept: "application/vnd.github.v3+json",
        },
      });

      if (!response.ok) {
        throw new Error(`GitHub API request failed with status ${response.status}: ${response.statusText}`);
      }

      const release: GitHubReleaseResponse = await response.json();
      const latestTag = release.tag_name || release.name || "";
      const latestVersion = latestTag.replace(/^[vV]/, "").trim();

      console.log(`[AutoUpdater] Current version: ${this.currentVersion}, Latest version: ${latestVersion}`);

      const hasUpdate = AutoUpdater.compareSemver(latestVersion, this.currentVersion) > 0;

      if (!hasUpdate) {
        // If we previously had a pending update that's no longer newer, clear it
        const pending = this.getPendingUpdateMeta();
        if (pending && AutoUpdater.compareSemver(pending.version, this.currentVersion) <= 0) {
          this.clearPendingUpdate();
        }
        return {
          updateAvailable: false,
          currentVersion: this.currentVersion,
          latestVersion,
        };
      }

      // We have a new version available!
      const updateInfo: UpdateInfo = {
        version: latestVersion,
        releaseName: release.name || `Synctable v${latestVersion}`,
        releaseNotes: release.body || "A new version of Synctable is available.",
        publishedAt: release.published_at,
        htmlUrl: release.html_url,
        status: "available",
      };

      // In dev mode with manual check, don't download/replace the dev workspace files
      if (this.isDevMode()) {
        return {
          updateAvailable: true,
          currentVersion: this.currentVersion,
          latestVersion,
          updateInfo,
        };
      }

      // Check if this version is already downloaded and staged
      const pendingMeta = this.getPendingUpdateMeta();
      if (pendingMeta && pendingMeta.version === latestVersion && pendingMeta.status === "ready_to_install") {
        updateInfo.status = "ready_to_install";
        if (this.dismissedVersion !== latestVersion || options?.forceCheck) {
          this.notifyUpdateAvailable(updateInfo);
        }
        return {
          updateAvailable: true,
          currentVersion: this.currentVersion,
          latestVersion,
          updateInfo,
        };
      }

      // If already downloading, report downloading status
      if (this.isDownloading || this.activeDownloadPromise) {
        updateInfo.status = "downloading";
        return {
          updateAvailable: true,
          currentVersion: this.currentVersion,
          latestVersion,
          updateInfo,
        };
      }

      // Download and stage the new update in background
      this.activeDownloadPromise = this.downloadAndStageRelease(release, latestVersion, updateInfo)
        .then((res) => {
          this.activeDownloadPromise = null;
          return res;
        })
        .catch(() => {
          this.activeDownloadPromise = null;
          return false;
        });

      return {
        updateAvailable: true,
        currentVersion: this.currentVersion,
        latestVersion,
        updateInfo,
      };
    } catch (err: any) {
      console.error("[AutoUpdater] Check failed:", err);
      return {
        updateAvailable: false,
        currentVersion: this.currentVersion,
        error: err?.message || String(err),
      };
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Find matching release asset for the current OS and architecture
   */
  public selectAssetForPlatform(assets: GitHubReleaseAsset[]): GitHubReleaseAsset | null {
    const os = process.platform; // 'darwin', 'win32', 'linux'
    const arch = process.arch; // 'arm64', 'x64'

    if (os === "darwin") {
      // Prioritize DMG for native macOS mounting & extraction without external dependencies, then ZIP, then tar.zst
      const dmgArm = assets.find((a) => a.name.includes("arm64") && a.name.endsWith(".dmg"));
      const dmgAny = assets.find((a) => a.name.endsWith(".dmg"));
      const zipArm = assets.find((a) => (a.name.includes("arm64") || a.name.includes("mac")) && a.name.endsWith(".zip"));
      const zipAny = assets.find((a) => a.name.endsWith(".zip"));
      const tarZstArm = assets.find((a) => a.name.includes("arm64") && a.name.endsWith(".tar.zst"));
      const tarZstAny = assets.find((a) => a.name.endsWith(".tar.zst"));

      if (arch === "arm64" && dmgArm) return dmgArm;
      if (dmgAny) return dmgAny;
      if (arch === "arm64" && zipArm) return zipArm;
      if (zipAny) return zipAny;
      if (arch === "arm64" && tarZstArm) return tarZstArm;
      return tarZstAny || null;
    } else if (os === "win32") {
      const setupZip = assets.find((a) => a.name.includes("win") && a.name.endsWith(".zip"));
      const setupExe = assets.find((a) => a.name.endsWith(".exe"));
      const tarZst = assets.find((a) => a.name.includes("win") && a.name.endsWith(".tar.zst"));
      return setupZip || setupExe || tarZst || null;
    } else {
      const appImage = assets.find((a) => a.name.endsWith(".AppImage"));
      const tarGz = assets.find((a) => a.name.endsWith(".tar.gz"));
      const tarZst = assets.find((a) => a.name.includes("linux") && a.name.endsWith(".tar.zst"));
      return appImage || tarGz || tarZst || null;
    }
  }

  /**
   * Triggers download of the latest release (or awaits in-flight download)
   * and returns the final status.
   */
  public async downloadUpdate(): Promise<{ success: boolean; message?: string; updateInfo?: UpdateInfo }> {
    // If a download is already in progress, await it
    if (this.activeDownloadPromise) {
      await this.activeDownloadPromise;
      const meta = this.getPendingUpdateMeta();
      if (meta?.status === "ready_to_install") {
        return {
          success: true,
          updateInfo: {
            version: meta.version,
            releaseName: meta.releaseName,
            releaseNotes: meta.releaseNotes,
            publishedAt: meta.publishedAt,
            htmlUrl: meta.htmlUrl,
            status: "ready_to_install",
          },
        };
      }
      return {
        success: false,
        message: meta?.errorMessage || "Update download failed. Please try again.",
      };
    }

    // Check if latest update is already downloaded and staged
    const pendingMeta = this.getPendingUpdateMeta();
    if (
      pendingMeta &&
      pendingMeta.status === "ready_to_install" &&
      pendingMeta.stagedAppPath &&
      existsSync(pendingMeta.stagedAppPath) &&
      AutoUpdater.compareSemver(pendingMeta.version, this.currentVersion) > 0
    ) {
      return {
        success: true,
        updateInfo: {
          version: pendingMeta.version,
          releaseName: pendingMeta.releaseName,
          releaseNotes: pendingMeta.releaseNotes,
          publishedAt: pendingMeta.publishedAt,
          htmlUrl: pendingMeta.htmlUrl,
          status: "ready_to_install",
        },
      };
    }

    try {
      const apiUrl = `https://api.github.com/repos/${this.repo}/releases/latest`;
      console.log(`[AutoUpdater] Fetching release metadata from ${apiUrl}...`);

      const response = await fetch(apiUrl, {
        headers: {
          "User-Agent": "Synctable-Desktop",
          Accept: "application/vnd.github.v3+json",
        },
      });

      if (!response.ok) {
        throw new Error(`GitHub API request failed with status ${response.status}: ${response.statusText}`);
      }

      const release: GitHubReleaseResponse = await response.json();
      const latestTag = release.tag_name || release.name || "";
      const latestVersion = latestTag.replace(/^[vV]/, "").trim();

      if (AutoUpdater.compareSemver(latestVersion, this.currentVersion) <= 0) {
        return {
          success: false,
          message: "You are already using the latest version of Synctable.",
        };
      }

      const updateInfo: UpdateInfo = {
        version: latestVersion,
        releaseName: release.name || `Synctable v${latestVersion}`,
        releaseNotes: release.body || "A new version of Synctable is available.",
        publishedAt: release.published_at,
        htmlUrl: release.html_url,
        status: "downloading",
      };

      this.activeDownloadPromise = this.downloadAndStageRelease(release, latestVersion, updateInfo);
      const success = await this.activeDownloadPromise;
      this.activeDownloadPromise = null;

      const finalMeta = this.getPendingUpdateMeta();
      if (success && finalMeta?.status === "ready_to_install") {
        return {
          success: true,
          updateInfo: {
            version: finalMeta.version,
            releaseName: finalMeta.releaseName,
            releaseNotes: finalMeta.releaseNotes,
            publishedAt: finalMeta.publishedAt,
            htmlUrl: finalMeta.htmlUrl,
            status: "ready_to_install",
          },
        };
      } else {
        return {
          success: false,
          message: finalMeta?.errorMessage || "Failed to download and stage update. Please try again.",
        };
      }
    } catch (err: any) {
      console.error("[AutoUpdater] downloadUpdate error:", err);
      return {
        success: false,
        message: err?.message || String(err),
      };
    }
  }

  /**
   * Download and stage the update package
   */
  public async downloadAndStageRelease(
    release: GitHubReleaseResponse,
    version: string,
    info: UpdateInfo
  ): Promise<boolean> {
    if (this.isDownloading) return false;
    this.isDownloading = true;

    info.status = "downloading";
    this.notifyStatusChanged(info);

    try {
      if (!existsSync(this.updatesDir)) {
        mkdirSync(this.updatesDir, { recursive: true });
      }

      // Find matching release asset
      const asset = this.selectAssetForPlatform(release.assets || []);
      if (!asset) {
        throw new Error(`No compatible release asset found for platform ${process.platform}-${process.arch}`);
      }

      console.log(`[AutoUpdater] Downloading update asset ${asset.name} from ${asset.browser_download_url}...`);
      const targetFilePath = join(this.updatesDir, asset.name);

      const downloadRes = await fetch(asset.browser_download_url);
      if (!downloadRes.ok || !downloadRes.body) {
        throw new Error(`Failed to download update asset: ${downloadRes.status} ${downloadRes.statusText}`);
      }

      const fileBuffer = await downloadRes.arrayBuffer();
      await Bun.write(targetFilePath, fileBuffer);

      console.log(`[AutoUpdater] Asset saved to ${targetFilePath} (${fileBuffer.byteLength} bytes). Staging...`);

      // Stage the update for instant installation
      const stagedDir = join(this.updatesDir, "staged");
      if (existsSync(stagedDir)) {
        rmSync(stagedDir, { recursive: true, force: true });
      }
      mkdirSync(stagedDir, { recursive: true });

      const stagedAppPath = this.stageDownloadedAsset(asset.name, targetFilePath, stagedDir);

      if (!stagedAppPath || !existsSync(stagedAppPath)) {
        throw new Error(`Failed to extract a valid application from ${asset.name}`);
      }

      const pendingMeta: PendingUpdateMeta = {
        status: "ready_to_install",
        version,
        releaseName: info.releaseName,
        releaseNotes: info.releaseNotes,
        publishedAt: info.publishedAt,
        htmlUrl: info.htmlUrl,
        assetName: asset.name,
        downloadedAssetPath: targetFilePath,
        stagedAppPath,
        downloadedAt: new Date().toISOString(),
      };

      this.savePendingUpdateMeta(pendingMeta);

      info.status = "ready_to_install";
      this.notifyStatusChanged(info);

      if (this.dismissedVersion !== version) {
        this.notifyUpdateAvailable(info);
      }

      console.log(`[AutoUpdater] Update v${version} successfully downloaded and staged at ${stagedAppPath}.`);
      return true;
    } catch (err: any) {
      console.error("[AutoUpdater] Download/stage error:", err);
      info.status = "error";
      info.errorMessage = err?.message || String(err);
      this.savePendingUpdateMeta({
        status: "error",
        version,
        releaseName: info.releaseName,
        releaseNotes: info.releaseNotes,
        publishedAt: info.publishedAt,
        htmlUrl: info.htmlUrl,
        errorMessage: info.errorMessage,
      });
      this.notifyStatusChanged(info);
      return false;
    } finally {
      this.isDownloading = false;
    }
  }

  /**
   * Decompress/mount and stage downloaded archive (.dmg, .zip, .tar.zst) into stagedDir.
   * Returns the path to the extracted application bundle.
   */
  public stageDownloadedAsset(assetName: string, targetFilePath: string, stagedDir: string): string | null {
    if (process.platform === "darwin") {
      // 1. DMG Package
      if (assetName.endsWith(".dmg")) {
        const mountDir = join(this.updatesDir, "dmg-mount");
        try {
          if (existsSync(mountDir)) {
            Bun.spawnSync(["hdiutil", "detach", mountDir, "-force"]);
            rmSync(mountDir, { recursive: true, force: true });
          }
          mkdirSync(mountDir, { recursive: true });

          const attachRes = Bun.spawnSync([
            "hdiutil",
            "attach",
            targetFilePath,
            "-nobrowse",
            "-readonly",
            "-mountpoint",
            mountDir,
          ]);

          if (attachRes.exitCode === 0) {
            const entries = readdirSync(mountDir);
            const appBundle = entries.find((e) => e.endsWith(".app"));
            if (appBundle) {
              Bun.spawnSync(["cp", "-R", join(mountDir, appBundle), join(stagedDir, appBundle)]);
            }
          }
        } catch (err) {
          console.warn("[AutoUpdater] Error extracting from DMG:", err);
        } finally {
          try {
            Bun.spawnSync(["hdiutil", "detach", mountDir, "-force"]);
            if (existsSync(mountDir)) {
              rmSync(mountDir, { recursive: true, force: true });
            }
          } catch {
            // Ignore unmount cleanup errors
          }
        }
      }

      // 2. ZIP Archive
      else if (assetName.endsWith(".zip")) {
        try {
          Bun.spawnSync(["unzip", "-q", "-o", targetFilePath, "-d", stagedDir]);
        } catch (err) {
          console.warn("[AutoUpdater] Error extracting ZIP:", err);
        }
      }

      // 3. TAR.ZST Archive
      else if (assetName.endsWith(".tar.zst")) {
        const decompressedTar = join(this.updatesDir, "latest.tar");
        const zstdBin = this.findZstdBinary();
        if (zstdBin && existsSync(zstdBin)) {
          const decompress = Bun.spawnSync([zstdBin, "decompress", "-i", targetFilePath, "-o", decompressedTar, "--no-timing"]);
          if (decompress.success) {
            Bun.spawnSync(["tar", "-xf", decompressedTar, "-C", stagedDir]);
            if (existsSync(decompressedTar)) {
              unlinkSync(decompressedTar);
            }
          }
        } else {
          // Fallback to system tar / zstd if available
          try {
            Bun.spawnSync(["tar", "--zstd", "-xf", targetFilePath, "-C", stagedDir]);
          } catch {
            // Fallback
          }
        }
      }

      // Find .app folder inside stagedDir
      if (existsSync(stagedDir)) {
        const entries = readdirSync(stagedDir);
        const appBundle = entries.find((e) => e.endsWith(".app"));
        if (appBundle) {
          const fullAppPath = join(stagedDir, appBundle);
          // Verify bundle integrity
          if (existsSync(join(fullAppPath, "Contents", "MacOS")) || existsSync(join(fullAppPath, "Contents", "Info.plist"))) {
            return fullAppPath;
          }
        }
      }

      return null;
    } else if (process.platform === "win32") {
      if (assetName.endsWith(".zip") || assetName.endsWith(".tar.zst")) {
        // Extract zip to stagedDir
        try {
          Bun.spawnSync(["tar", "-xf", targetFilePath, "-C", stagedDir]);
          return stagedDir;
        } catch {
          return targetFilePath;
        }
      }
      return targetFilePath;
    } else {
      // Linux
      if (assetName.endsWith(".tar.gz") || assetName.endsWith(".tar.zst")) {
        try {
          Bun.spawnSync(["tar", "-xf", targetFilePath, "-C", stagedDir]);
          return stagedDir;
        } catch {
          return targetFilePath;
        }
      }
      if (assetName.endsWith(".AppImage")) {
        try {
          Bun.spawnSync(["chmod", "+x", targetFilePath]);
        } catch {
          // Ignore
        }
        return targetFilePath;
      }
      return targetFilePath;
    }
  }

  private findZstdBinary(): string | null {
    const candidates = [
      join(dirname(process.execPath), "zig-zstd"),
      join(process.cwd(), "bin", "zig-zstd"),
      join(import.meta.dir, "..", "native", "bin", "zig-zstd"),
    ];
    return candidates.find(existsSync) || null;
  }

  private notifyUpdateAvailable(info: UpdateInfo) {
    if (this.onUpdateAvailableCallback) {
      this.onUpdateAvailableCallback(info);
    }
  }

  private notifyStatusChanged(info: UpdateInfo) {
    if (this.onStatusChangedCallback) {
      this.onStatusChangedCallback(info);
    }
  }

  /**
   * Safely quit the running Electrobun or Bun application.
   */
  public quitApp(exitCode = 0): void {
    try {
      if (typeof Utils !== "undefined" && Utils?.quit) {
        Utils.quit();
        return;
      }
    } catch {
      // Fallback if electrobun Utils is not available
    }
    process.exit(exitCode);
  }

  /**
   * Quit and relaunch to apply the update.
   */
  public installUpdateAndRelaunch(): { success: boolean; message?: string } {
    if (this.isDevMode()) {
      return { success: false, message: "Auto-update installation is disabled in local dev mode." };
    }

    const meta = this.getPendingUpdateMeta();
    if (!meta || meta.status !== "ready_to_install" || !meta.stagedAppPath || !existsSync(meta.stagedAppPath)) {
      return { success: false, message: "No update is ready to install." };
    }

    console.log(`[AutoUpdater] Initiating restart to install v${meta.version}...`);

    const pid = process.pid;
    const stagedApp = meta.stagedAppPath;
    const stagedDir = join(this.updatesDir, "staged");
    const metaPath = join(this.updatesDir, "pending-update.json");

    if (process.platform === "darwin") {
      const runningAppBundlePath = resolve(dirname(process.execPath), "..", "..");
      if (!runningAppBundlePath.endsWith(".app")) {
        return { success: false, message: "Cannot replace application when not running from .app bundle." };
      }

      const updateScriptPath = join(this.updatesDir, "apply-update.sh");
      const scriptContent = `#!/bin/sh
# Wait for the current running process and helpers to exit
while kill -0 ${pid} 2>/dev/null; do
  sleep 0.2
done
sleep 0.3

# Atomically replace old application bundle with staged app bundle
rm -rf "${runningAppBundlePath}"
cp -R "${stagedApp}" "${runningAppBundlePath}"

# Fix permissions and remove macOS quarantine flag
chmod -R +x "${runningAppBundlePath}/Contents/MacOS" 2>/dev/null || true
xattr -r -d com.apple.quarantine "${runningAppBundlePath}" 2>/dev/null || true

# Clean up staging directory and metadata
rm -rf "${stagedDir}" "${metaPath}" "${updateScriptPath}" 2>/dev/null || true

# Launch the updated app
open "${runningAppBundlePath}"
`;

      try {
        writeFileSync(updateScriptPath, scriptContent, { mode: 0o755 });
        Bun.spawn(["sh", updateScriptPath], {
          detached: true,
          stdio: ["ignore", "ignore", "ignore"],
        });
      } catch (err: any) {
        console.error("[AutoUpdater] Failed to write/launch update script:", err);
        return { success: false, message: err?.message || String(err) };
      }
    } else if (process.platform === "win32") {
      const parentDir = dirname(dirname(process.execPath));
      const launcherPath = join(dirname(process.execPath), "launcher.exe");
      const updateScriptPath = join(this.updatesDir, "apply-update.bat");

      const scriptContent = `@echo off
:waitloop
tasklist /FI "PID eq ${pid}" 2>NUL | find /I "${pid}">NUL && (timeout /t 1 /nobreak >nul & goto waitloop)
timeout /t 1 /nobreak >nul
if exist "${meta.downloadedAssetPath}" (
  start "" "${meta.downloadedAssetPath}"
) else (
  start "" "${launcherPath}"
)
del "%~f0" 2>nul
`;
      try {
        writeFileSync(updateScriptPath, scriptContent, "utf8");
        Bun.spawn(["cmd", "/c", updateScriptPath], {
          detached: true,
          stdio: ["ignore", "ignore", "ignore"],
        });
      } catch (err: any) {
        return { success: false, message: err?.message || String(err) };
      }
    } else {
      // Linux
      const launcherPath = join(dirname(process.execPath), "launcher");
      const updateScriptPath = join(this.updatesDir, "apply-update.sh");
      const scriptContent = `#!/bin/sh
while kill -0 ${pid} 2>/dev/null; do
  sleep 0.2
done
sleep 0.5
rm -rf "${stagedDir}" "${metaPath}" "${updateScriptPath}" 2>/dev/null || true
"${launcherPath}" &
`;
      try {
        writeFileSync(updateScriptPath, scriptContent, { mode: 0o755 });
        Bun.spawn(["sh", updateScriptPath], {
          detached: true,
          stdio: ["ignore", "ignore", "ignore"],
        });
      } catch (err: any) {
        return { success: false, message: err?.message || String(err) };
      }
    }

    // Gracefully exit current process
    setTimeout(() => {
      this.quitApp(0);
    }, 100);

    return { success: true };
  }

  /**
   * Check if there is a pending update to install upon startup.
   * If yes, install it first, then relaunch the new version.
   */
  public checkAndApplyPendingUpdate(): boolean {
    if (this.isDevMode()) {
      return false;
    }

    const meta = this.getPendingUpdateMeta();
    if (!meta || meta.status !== "ready_to_install") {
      return false;
    }

    // Verify version is newer than current
    if (AutoUpdater.compareSemver(meta.version, this.currentVersion) <= 0) {
      console.log(`[AutoUpdater] Staged update version ${meta.version} <= current version ${this.currentVersion}. Clearing.`);
      this.clearPendingUpdate();
      return false;
    }

    console.log(`[AutoUpdater] Found pending update v${meta.version} ready for installation.`);

    if (process.platform === "darwin") {
      const runningAppBundlePath = resolve(dirname(process.execPath), "..", "..");
      const stagedApp = meta.stagedAppPath;

      if (stagedApp && existsSync(stagedApp) && runningAppBundlePath.endsWith(".app") && existsSync(runningAppBundlePath)) {
        try {
          console.log(`[AutoUpdater] Replacing ${runningAppBundlePath} with ${stagedApp}...`);
          const backupPath = `${runningAppBundlePath}.old`;

          // Atomic rename swap
          if (existsSync(backupPath)) {
            rmSync(backupPath, { recursive: true, force: true });
          }

          Bun.spawnSync(["mv", runningAppBundlePath, backupPath]);
          Bun.spawnSync(["cp", "-R", stagedApp, runningAppBundlePath]);

          // Fix executable permissions and clear quarantine
          Bun.spawnSync(["chmod", "-R", "+x", join(runningAppBundlePath, "Contents", "MacOS")]);
          try {
            Bun.spawnSync(["xattr", "-r", "-d", "com.apple.quarantine", runningAppBundlePath]);
          } catch {
            // Ignore quarantine errors
          }

          // Clean up backup and update metadata
          rmSync(backupPath, { recursive: true, force: true });
          this.clearPendingUpdate();

          console.log(`[AutoUpdater] Installation of v${meta.version} complete. Launching new version...`);

          // Spawn new app and exit immediately
          Bun.spawn(["open", runningAppBundlePath], {
            detached: true,
            stdio: ["ignore", "ignore", "ignore"],
          });

          this.quitApp(0);
          return true;
        } catch (err) {
          console.error("[AutoUpdater] Failed to apply update:", err);
        }
      }
    }

    return false;
  }
}

export const defaultAutoUpdater = new AutoUpdater();

