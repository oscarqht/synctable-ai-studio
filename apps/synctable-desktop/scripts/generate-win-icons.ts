import { existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import pngToIco from "png-to-ico";
import { spawnSync } from "node:child_process";

const projectRoot = resolve(import.meta.dir, "..");
const repoRoot = resolve(projectRoot, "../..");
const iconIcoPath = join(projectRoot, "icon.ico");
const iconsetDir = join(projectRoot, "icon.iconset");

export async function generateWinIcon(): Promise<string> {
  const iconFiles = [
    join(iconsetDir, "icon_16x16.png"),
    join(iconsetDir, "icon_16x16@2x.png"), // 32x32
    join(iconsetDir, "icon_32x32@2x.png"), // 64x64
    join(iconsetDir, "icon_128x128.png"), // 128x128
    join(iconsetDir, "icon_128x128@2x.png"), // 256x256
  ].filter(existsSync);

  if (iconFiles.length === 0) {
    throw new Error("No icon files found in icon.iconset");
  }

  const icoBuffer = await pngToIco(iconFiles);
  writeFileSync(iconIcoPath, icoBuffer);
  console.log(`[Icon Generator] Generated ${iconIcoPath} (${icoBuffer.length} bytes)`);
  return iconIcoPath;
}

export function stampExecutable(exePath: string, icoPath: string = iconIcoPath): boolean {
  if (!existsSync(exePath)) {
    console.warn(`[Icon Stamper] Executable not found at ${exePath}`);
    return false;
  }

  const rceditPath = [
    join(repoRoot, "node_modules", "rcedit", "bin", "rcedit-x64.exe"),
    join(projectRoot, "node_modules", "rcedit", "bin", "rcedit-x64.exe"),
    join(repoRoot, "node_modules", "rcedit", "bin", "rcedit.exe"),
  ].find(existsSync);

  if (!rceditPath) {
    console.warn(`[Icon Stamper] rcedit executable not found in node_modules`);
    return false;
  }

  const result = spawnSync(rceditPath, [exePath, "--set-icon", icoPath], {
    stdio: "inherit",
  });

  if (result.status === 0) {
    console.log(`[Icon Stamper] Successfully stamped icon onto ${exePath}`);
    return true;
  } else {
    console.error(`[Icon Stamper] Failed to stamp icon onto ${exePath} (exit code ${result.status})`);
    return false;
  }
}

export async function prepareWindowsBinaries() {
  await generateWinIcon();

  // Stamp electrobun's dist template binaries so any builds automatically get the icon
  const distWinDir = [
    join(repoRoot, "node_modules", "electrobun", "dist-win-x64"),
    join(projectRoot, "node_modules", "electrobun", "dist-win-x64"),
  ].find(existsSync);

  if (distWinDir) {
    console.log(`[Icon Stamper] Pre-stamping Electrobun dist templates in ${distWinDir}...`);
    for (const exe of ["launcher.exe", "bun.exe", "extractor.exe"]) {
      const exePath = join(distWinDir, exe);
      if (existsSync(exePath)) {
        stampExecutable(exePath);
      }
    }
  }
}

if (import.meta.main) {
  prepareWindowsBinaries().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
