import { existsSync, readdirSync, rmSync, mkdirSync, cpSync, symlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { execSync } from "node:child_process";
import { platform, tmpdir } from "node:os";

const projectRoot = resolve(import.meta.dir, "..");
const buildDir = join(projectRoot, "build");
const artifactsDir = join(projectRoot, "artifacts");

function findAppBundles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const results: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.endsWith(".app")) {
        results.push(fullPath);
      } else {
        results.push(...findAppBundles(fullPath));
      }
    }
  }
  return results;
}

export function postPackageMac() {
  if (platform() !== "darwin") {
    console.log("[Post Package Mac] Not running on macOS (darwin). Skipping macOS signing and DMG packaging.");
    return;
  }

  console.log("[Post Package Mac] Searching for macOS .app bundles to sign...");
  const apps = findAppBundles(buildDir);

  if (apps.length === 0) {
    console.warn("[Post Package Mac] No .app bundles found in build directory.");
    return;
  }

  for (const appPath of apps) {
    console.log(`[Post Package Mac] Signing application bundle: ${appPath}`);
    try {
      execSync(`codesign --force --deep --sign - "${appPath}"`, { stdio: "inherit" });
      execSync(`codesign -vvv --deep --strict "${appPath}"`, { stdio: "inherit" });
      console.log(`[Post Package Mac] Successfully signed and verified: ${appPath}`);
    } catch (err) {
      console.error(`[Post Package Mac] Failed to sign ${appPath}:`, err);
    }
  }

  // Re-generate DMGs in artifacts folder with the signed .app
  if (existsSync(artifactsDir)) {
    const artifactEntries = readdirSync(artifactsDir);
    for (const file of artifactEntries) {
      if (file.endsWith(".dmg")) {
        const dmgPath = join(artifactsDir, file);
        console.log(`[Post Package Mac] Re-creating valid DMG for ${file}...`);

        // Find the matching app bundle (e.g., stable-macos-arm64 -> Synctable.app)
        const matchedApp = apps.find(a => a.includes("stable-macos") && a.endsWith("Synctable.app")) || apps[0];
        if (!matchedApp) continue;

        const stagingDir = join(tmpdir(), `synctable-dmg-${Date.now()}`);
        try {
          if (existsSync(stagingDir)) rmSync(stagingDir, { recursive: true, force: true });
          mkdirSync(stagingDir, { recursive: true });

          const targetAppInStaging = join(stagingDir, "Synctable.app");
          cpSync(matchedApp, targetAppInStaging, { recursive: true });
          symlinkSync("/Applications", join(stagingDir, "Applications"));

          // Create DMG
          execSync(
            `hdiutil create -volname "Synctable" -srcfolder "${stagingDir}" -ov -format UDZO "${dmgPath}"`,
            { stdio: "inherit" }
          );

          // Sign DMG
          execSync(`codesign --force --sign - "${dmgPath}"`, { stdio: "inherit" });
          console.log(`[Post Package Mac] Successfully created and signed DMG: ${dmgPath}`);
        } catch (err) {
          console.error(`[Post Package Mac] Failed to create DMG for ${dmgPath}:`, err);
        } finally {
          if (existsSync(stagingDir)) {
            rmSync(stagingDir, { recursive: true, force: true });
          }
        }
      }
    }
  }

  console.log("[Post Package Mac] Done.");
}

if (import.meta.main) {
  postPackageMac();
}
