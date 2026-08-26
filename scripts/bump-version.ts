import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";

const isDryRun = process.argv.includes("--dry-run");
const rootDir = resolve(import.meta.dir, "..");

const rootPkgPath = resolve(rootDir, "package.json");
const rootPkg = JSON.parse(readFileSync(rootPkgPath, "utf-8"));
const currentVersion = rootPkg.version || "0.1.0";

const parts = currentVersion.split(".").map((n: string) => parseInt(n, 10));
if (parts.length !== 3 || parts.some(isNaN)) {
  throw new Error(`Invalid semver version format: "${currentVersion}"`);
}

const newVersion = `${parts[0]}.${parts[1] + 1}.0`;
const newTag = `v${newVersion}`;

console.log(`Bumping minor version: ${currentVersion} -> ${newVersion} (Tag: ${newTag})`);

if (!isDryRun) {
  // 1. Update root package.json
  rootPkg.version = newVersion;
  writeFileSync(rootPkgPath, JSON.stringify(rootPkg, null, 2) + "\n");
  console.log(`Updated package.json to ${newVersion}`);

  // 2. Update workspace packages
  const workspacePkgPaths = [
    "apps/synctable-desktop/package.json",
    "apps/synctable-web/package.json",
    "packages/ui/package.json",
  ];

  for (const relPath of workspacePkgPaths) {
    const fullPath = resolve(rootDir, relPath);
    try {
      const pkg = JSON.parse(readFileSync(fullPath, "utf-8"));
      pkg.version = newVersion;
      writeFileSync(fullPath, JSON.stringify(pkg, null, 2) + "\n");
      console.log(`Updated ${relPath} to ${newVersion}`);
    } catch (err) {
      console.warn(`Warning: Could not update ${relPath}:`, err);
    }
  }

  // 3. Update electrobun.config.ts if present
  const electrobunConfigPath = resolve(rootDir, "apps/synctable-desktop/electrobun.config.ts");
  try {
    const content = readFileSync(electrobunConfigPath, "utf-8");
    const updatedContent = content.replace(/version:\s*"[^"]+"/, `version: "${newVersion}"`);
    if (content !== updatedContent) {
      writeFileSync(electrobunConfigPath, updatedContent);
      console.log(`Updated apps/synctable-desktop/electrobun.config.ts to ${newVersion}`);
    }
  } catch (err) {
    console.warn(`Warning: Could not update electrobun.config.ts:`, err);
  }

  // 4. Output to GITHUB_OUTPUT if running in GitHub Actions
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `old_version=${currentVersion}\nnew_version=${newVersion}\ntag_name=${newTag}\n`
    );
  }
} else {
  console.log("[Dry Run] Files were not modified.");
}
