#!/usr/bin/env node

import { spawn, execSync } from "node:child_process";
import { existsSync, chmodSync, readFileSync, readdirSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = resolve(__dirname, "..");

// Read package.json version
let version = "0.9.0";
try {
  const pkgJsonPath = join(packageRoot, "package.json");
  if (existsSync(pkgJsonPath)) {
    const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
    version = pkg.version || version;
  }
} catch {
  // Ignore
}

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
Synctable Desktop App Launcher (v${version})

Usage:
  npx synctable [options]
  npx synctable-desktop [options]

Options:
  -v, --version    Show version number
  -h, --help       Show help information
  -d, --detach     Launch desktop app in background and return immediately
  --dev            Launch local dev build (Synctable-dev) if available
  --build          Build desktop app if no binary is found
`);
  process.exit(0);
}

if (args.includes("--version") || args.includes("-v")) {
  console.log(`synctable v${version}`);
  process.exit(0);
}

const isDetach = args.includes("--detach") || args.includes("-d");
const preferDev = args.includes("--dev");
const shouldBuildIfMissing = args.includes("--build");
const forwardedArgs = args.filter((a) => !["--detach", "-d", "--dev", "--build"].includes(a));

const platform = os.platform();
const arch = os.arch();

function getElectrobunTarget(p, a) {
  const plat = p === "darwin" ? "macos" : p === "win32" ? "win" : "linux";
  return `${plat}-${a}`;
}

function resolveBinary() {
  const target = getElectrobunTarget(platform, arch);

  const searchPaths = [];

  // 1. Packaged distribution (dist folder)
  if (platform === "darwin") {
    searchPaths.push(
      join(packageRoot, "dist", "Synctable.app"),
      join(packageRoot, "dist", `Synctable-${target}.app`),
      join(packageRoot, "dist", "Synctable-dev.app")
    );
  } else if (platform === "win32") {
    searchPaths.push(
      join(packageRoot, "dist", "Synctable.exe"),
      join(packageRoot, "dist", `Synctable-${target}.exe`),
      join(packageRoot, "dist", "Synctable-dev.exe")
    );
  } else {
    searchPaths.push(
      join(packageRoot, "dist", "Synctable"),
      join(packageRoot, "dist", `Synctable-${target}`)
    );
  }

  // 2. Monorepo / Local Build folders
  if (preferDev) {
    if (platform === "darwin") {
      searchPaths.push(
        join(packageRoot, "build", `dev-${target}`, "Synctable-dev.app"),
        join(packageRoot, "build", "dev-macos-arm64", "Synctable-dev.app"),
        join(packageRoot, "build", "dev-macos-x64", "Synctable-dev.app")
      );
    } else if (platform === "win32") {
      searchPaths.push(
        join(packageRoot, "build", `dev-${target}`, "Synctable-dev.exe"),
        join(packageRoot, "build", "dev-win-x64", "Synctable-dev.exe")
      );
    }
  }

  // Stable build directories
  if (platform === "darwin") {
    searchPaths.push(
      join(packageRoot, "build", `stable-${target}`, "Synctable.app"),
      join(packageRoot, "build", "stable-macos-arm64", "Synctable.app"),
      join(packageRoot, "build", "stable-macos-x64", "Synctable.app"),
      join(packageRoot, "build", `dev-${target}`, "Synctable-dev.app")
    );
  } else if (platform === "win32") {
    searchPaths.push(
      join(packageRoot, "build", `stable-${target}`, "Synctable.exe"),
      join(packageRoot, "build", "stable-win-x64", "Synctable.exe"),
      join(packageRoot, "build", `dev-${target}`, "Synctable-dev.exe")
    );
  } else {
    searchPaths.push(
      join(packageRoot, "build", `stable-${target}`, "Synctable"),
      join(packageRoot, "build", `dev-${target}`, "Synctable-dev")
    );
  }

  for (const candidate of searchPaths) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function ensureExecutablePermissions(appPath) {
  if (platform === "darwin") {
    const launcherBin = join(appPath, "Contents", "MacOS", "launcher");
    if (existsSync(launcherBin)) {
      try {
        chmodSync(launcherBin, 0o755);
      } catch {
        // Ignore permission errors if not owned
      }
    }
    // Also check helper binaries inside Resources/bin
    const resourcesBin = join(appPath, "Contents", "Resources", "bin");
    if (existsSync(resourcesBin)) {
      try {
        for (const file of readdirSync(resourcesBin)) {
          chmodSync(join(resourcesBin, file), 0o755);
        }
      } catch {
        // Ignore
      }
    }
  } else if (platform !== "win32") {
    try {
      chmodSync(appPath, 0o755);
    } catch {
      // Ignore
    }
  }
}

let binaryPath = resolveBinary();

if (!binaryPath) {
  if (shouldBuildIfMissing) {
    console.log("[Synctable] No prebuilt binary found. Running build...");
    try {
      execSync("bun run package", { cwd: packageRoot, stdio: "inherit" });
      binaryPath = resolveBinary();
    } catch (err) {
      console.error("[Synctable] Build failed:", err.message);
      process.exit(1);
    }
  }

  if (!binaryPath) {
    console.error(`
[Synctable] Error: Could not find Synctable desktop binary for ${platform}-${arch}.
If you are working in the repository, please run:
  bun run build:desktop
or run:
  npx synctable --build
`);
    process.exit(1);
  }
}

ensureExecutablePermissions(binaryPath);

console.log(`[Synctable] Starting Synctable Desktop (${binaryPath})...`);

if (platform === "darwin") {
  // macOS launch
  const openArgs = isDetach ? [binaryPath] : ["-W", binaryPath];
  if (forwardedArgs.length > 0) {
    openArgs.push("--args", ...forwardedArgs);
  }

  const child = spawn("open", openArgs, {
    stdio: isDetach ? "ignore" : "inherit",
    detached: isDetach,
  });

  if (isDetach) {
    child.unref();
    process.exit(0);
  } else {
    child.on("exit", (code) => {
      process.exit(code ?? 0);
    });
    child.on("error", (err) => {
      console.error("[Synctable] Failed to open app:", err);
      process.exit(1);
    });
  }
} else {
  // Windows / Linux launch
  const child = spawn(binaryPath, forwardedArgs, {
    stdio: isDetach ? "ignore" : "inherit",
    detached: isDetach,
  });

  if (isDetach) {
    child.unref();
    process.exit(0);
  } else {
    child.on("exit", (code) => {
      process.exit(code ?? 0);
    });
    child.on("error", (err) => {
      console.error("[Synctable] Failed to launch binary:", err);
      process.exit(1);
    });
  }
}
