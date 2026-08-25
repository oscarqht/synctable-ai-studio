import { describe, expect, it } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  addArcProfiles,
  addFirefoxProfiles,
  addVivaldiProfiles,
  safeCopyBrowserFile,
  type BrowserProfile,
} from "./sync";

describe("Windows browser profile discovery and safe copying", () => {
  it("safeCopyBrowserFile copies files correctly", () => {
    const testDir = join(tmpdir(), `synctable_test_copy_${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    const srcFile = join(testDir, "test.txt");
    const dstFile = join(testDir, "test_copied.txt");
    writeFileSync(srcFile, "hello synctable");

    const result = safeCopyBrowserFile(srcFile, dstFile);
    expect(result).toBe(true);

    rmSync(testDir, { recursive: true, force: true });
  });

  it("addVivaldiProfiles discovers Vivaldi profiles and newest Session file", () => {
    const testDir = join(tmpdir(), `synctable_test_vivaldi_${Date.now()}`);
    const defaultProfileDir = join(testDir, "Default");
    const sessionsDir = join(defaultProfileDir, "Sessions");
    mkdirSync(sessionsDir, { recursive: true });

    writeFileSync(join(defaultProfileDir, "Preferences"), JSON.stringify({ vivaldi: {} }));
    writeFileSync(join(sessionsDir, "Session_100"), "session 100");
    writeFileSync(join(sessionsDir, "Session_200"), "session 200");

    const profiles: BrowserProfile[] = [];
    addVivaldiProfiles(profiles, testDir);

    expect(profiles.length).toBe(1);
    expect(profiles[0].browser).toBe("vivaldi");
    expect(profiles[0].profileName).toBe("Default");
    expect(profiles[0].sessionPath).toBeDefined();

    rmSync(testDir, { recursive: true, force: true });
  });

  it("addFirefoxProfiles discovers Firefox profiles and recovery session", () => {
    const testDir = join(tmpdir(), `synctable_test_firefox_${Date.now()}`);
    const profileDir = join(testDir, "xyz.default-release");
    const backupsDir = join(profileDir, "sessionstore-backups");
    mkdirSync(backupsDir, { recursive: true });

    const recoveryFile = join(backupsDir, "recovery.jsonlz4");
    writeFileSync(recoveryFile, "mozLz40\0fake");

    const profiles: BrowserProfile[] = [];
    addFirefoxProfiles(profiles, testDir);

    expect(profiles.length).toBe(1);
    expect(profiles[0].browser).toBe("firefox");
    expect(profiles[0].profileName).toBe("xyz.default-release");
    expect(profiles[0].sourcePath).toBe(recoveryFile);

    rmSync(testDir, { recursive: true, force: true });
  });

  it("addArcProfiles registers Arc sidebar file", () => {
    const testDir = join(tmpdir(), `synctable_test_arc_${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    const arcSidebar = join(testDir, "StorableSidebar.json");
    writeFileSync(arcSidebar, JSON.stringify({ sidebar: {} }));

    const profiles: BrowserProfile[] = [];
    addArcProfiles(profiles, arcSidebar);

    expect(profiles.length).toBe(1);
    expect(profiles[0].browser).toBe("arc");
    expect(profiles[0].sourcePath).toBe(arcSidebar);

    rmSync(testDir, { recursive: true, force: true });
  });
});
