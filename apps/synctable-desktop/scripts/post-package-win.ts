import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { stampExecutable } from "./generate-win-icons";

const projectRoot = resolve(import.meta.dir, "..");
const iconIcoPath = join(projectRoot, "icon.ico");
const buildDir = join(projectRoot, "build");
const artifactsDir = join(projectRoot, "artifacts");

function findExes(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const results: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findExes(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".exe")) {
      results.push(fullPath);
    }
  }
  return results;
}

export function postPackageWin() {
  console.log("[Post Package Win] Stamping built executables with icon.ico...");
  const targetDirs = [buildDir, artifactsDir];
  for (const dir of targetDirs) {
    const exes = findExes(dir);
    for (const exe of exes) {
      stampExecutable(exe, iconIcoPath);
    }
  }
  console.log("[Post Package Win] Done.");
}

if (import.meta.main) {
  postPackageWin();
}
