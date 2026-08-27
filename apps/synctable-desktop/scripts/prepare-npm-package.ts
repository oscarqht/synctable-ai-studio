import { existsSync, mkdirSync, cpSync, rmSync, chmodSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { platform, arch } from "node:os";

const projectRoot = resolve(import.meta.dir, "..");
const buildDir = join(projectRoot, "build");
const distDir = join(projectRoot, "dist");

export function prepareNpmPackage() {
  console.log("[Prepare NPM Package] Staging desktop application for npm distribution...");

  if (existsSync(distDir)) {
    rmSync(distDir, { recursive: true, force: true });
  }
  mkdirSync(distDir, { recursive: true });

  const currentPlatform = platform();
  const currentArch = arch();
  const target = currentPlatform === "darwin" ? `macos-${currentArch}` : currentPlatform === "win32" ? `win-${currentArch}` : `linux-${currentArch}`;

  // Find stable build or fallback to dev
  const searchCandidates = [
    join(buildDir, `stable-${target}`),
    join(buildDir, "stable-macos-arm64"),
    join(buildDir, "stable-macos-x64"),
    join(buildDir, `dev-${target}`),
  ];

  let sourceFolder: string | null = null;
  for (const candidate of searchCandidates) {
    if (existsSync(candidate)) {
      sourceFolder = candidate;
      break;
    }
  }

  if (!sourceFolder) {
    console.error(`[Prepare NPM Package] Error: No build output found in ${buildDir}. Please run 'bun run package' first.`);
    process.exit(1);
  }

  console.log(`[Prepare NPM Package] Copying binaries from ${sourceFolder} to ${distDir}...`);

  const entries = readdirSync(sourceFolder, { withFileTypes: true });
  for (const entry of entries) {
    const src = join(sourceFolder, entry.name);
    const dest = join(distDir, entry.name);

    if (entry.isDirectory() && entry.name.endsWith(".app")) {
      console.log(`[Prepare NPM Package] Staging macOS bundle: ${entry.name}`);
      cpSync(src, dest, { recursive: true, dereference: false });

      // Standardize generic name Synctable.app in dist
      const genericApp = join(distDir, "Synctable.app");
      if (dest !== genericApp && !existsSync(genericApp)) {
        cpSync(dest, genericApp, { recursive: true, dereference: false });
      }

      // Ensure execution bits on macOS launcher
      const launcherBin = join(dest, "Contents", "MacOS", "launcher");
      if (existsSync(launcherBin)) {
        chmodSync(launcherBin, 0o755);
      }
    } else if (entry.isFile() && (entry.name.endsWith(".exe") || !entry.name.includes("."))) {
      console.log(`[Prepare NPM Package] Staging executable: ${entry.name}`);
      cpSync(src, dest);
      chmodSync(dest, 0o755);

      const genericExe = join(distDir, "Synctable.exe");
      if (dest !== genericExe && entry.name.endsWith(".exe") && !existsSync(genericExe)) {
        cpSync(dest, genericExe);
      }
    }
  }

  console.log("[Prepare NPM Package] Staging complete. Ready for npm pack / publish.");
}

if (import.meta.main) {
  prepareNpmPackage();
}
