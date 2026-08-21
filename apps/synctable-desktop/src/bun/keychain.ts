import { existsSync, mkdirSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir, platform } from "node:os";
import { join } from "node:path";

export const DEFAULT_KEYCHAIN_SERVICE = "Synctable";
export const RAINDROP_ACCOUNT = "raindrop_api_token";
const WINDOWS_SECRET_DIR = join(homedir(), ".browser_sync_cache", "secrets");

const WRITE_WINDOWS_SECRET = [
  "Add-Type -AssemblyName System.Security",
  "$value = [Console]::In.ReadToEnd()",
  "$path = $env:SYNCTABLE_SECRET_FILE",
  "if ($value.Length -eq 0) { Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue; exit 0 }",
  "New-Item -ItemType Directory -Force -Path (Split-Path -Parent $path) | Out-Null",
  "$bytes = [Text.Encoding]::UTF8.GetBytes($value)",
  "$encrypted = [Security.Cryptography.ProtectedData]::Protect($bytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)",
  "[IO.File]::WriteAllBytes($path, $encrypted)",
].join("\n");

const READ_WINDOWS_SECRET = [
  "Add-Type -AssemblyName System.Security",
  "$path = $env:SYNCTABLE_SECRET_FILE",
  "if (!(Test-Path -LiteralPath $path)) { exit 0 }",
  "$encrypted = [IO.File]::ReadAllBytes($path)",
  "$bytes = [Security.Cryptography.ProtectedData]::Unprotect($encrypted, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)",
  "[Console]::Out.Write([Text.Encoding]::UTF8.GetString($bytes))",
].join("\n");

export class KeychainService {
  private service: string;

  constructor(service: string = DEFAULT_KEYCHAIN_SERVICE) {
    this.service = service;
  }

  public getSecret(account: string): string {
    if (platform() === "win32") {
      return this.getWindowsSecret(account);
    }
    if (platform() !== "darwin") return "";

    try {
      const proc = Bun.spawnSync([
        "security",
        "find-generic-password",
        "-s",
        this.service,
        "-a",
        account,
        "-w",
      ]);

      if (proc.exitCode === 0) {
        return proc.stdout.toString().trim();
      }
      return "";
    } catch (err) {
      console.error(`[Keychain] Failed to read secret for account '${account}':`, err);
      return "";
    }
  }

  public setSecret(account: string, secret: string): void {
    if (platform() === "win32") {
      this.setWindowsSecret(account, secret);
      return;
    }
    if (platform() !== "darwin") return;

    const trimmed = secret.trim();
    if (!trimmed) {
      this.deleteSecret(account);
      return;
    }

    try {
      const proc = Bun.spawnSync([
        "security",
        "add-generic-password",
        "-U",
        "-s",
        this.service,
        "-a",
        account,
        "-w",
        trimmed,
      ]);

      if (proc.exitCode !== 0) {
        const stderr = proc.stderr.toString().trim();
        throw new Error(`security CLI failed with code ${proc.exitCode}: ${stderr}`);
      }
    } catch (err) {
      console.error(`[Keychain] Failed to save secret for account '${account}':`, err);
      throw err;
    }
  }

  public deleteSecret(account: string): void {
    if (platform() === "win32") {
      const path = this.windowsSecretPath(account);
      try {
        if (existsSync(path)) rmSync(path, { force: true });
      } catch (err) {
        console.error(`[Keychain] Failed to delete secret for account '${account}':`, err);
      }
      return;
    }
    if (platform() !== "darwin") return;

    try {
      Bun.spawnSync([
        "security",
        "delete-generic-password",
        "-s",
        this.service,
        "-a",
        account,
      ]);
    } catch (err) {
      console.error(`[Keychain] Failed to delete secret for account '${account}':`, err);
    }
  }

  private windowsSecretPath(account: string): string {
    const fileName = createHash("sha256")
      .update(`${this.service}\0${account}`)
      .digest("hex");
    return join(WINDOWS_SECRET_DIR, `${fileName}.secret`);
  }

  private getWindowsSecret(account: string): string {
    try {
      const proc = Bun.spawnSync([
        "powershell.exe",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        READ_WINDOWS_SECRET,
      ], {
        env: { ...process.env, SYNCTABLE_SECRET_FILE: this.windowsSecretPath(account) },
      });
      if (proc.exitCode === 0) return proc.stdout.toString();
      throw new Error(`PowerShell failed with code ${proc.exitCode}: ${proc.stderr.toString().trim()}`);
    } catch (err) {
      console.error(`[Keychain] Failed to read Windows secret for account '${account}':`, err);
      return "";
    }
  }

  private setWindowsSecret(account: string, secret: string): void {
    const trimmed = secret.trim();
    if (!trimmed) {
      this.deleteSecret(account);
      return;
    }

    try {
      mkdirSync(WINDOWS_SECRET_DIR, { recursive: true });
      const proc = Bun.spawnSync([
        "powershell.exe",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        WRITE_WINDOWS_SECRET,
      ], {
        env: { ...process.env, SYNCTABLE_SECRET_FILE: this.windowsSecretPath(account) },
        stdin: Buffer.from(trimmed),
      });
      if (proc.exitCode !== 0) {
        throw new Error(`PowerShell failed with code ${proc.exitCode}: ${proc.stderr.toString().trim()}`);
      }
    } catch (err) {
      console.error(`[Keychain] Failed to save Windows secret for account '${account}':`, err);
      throw err;
    }
  }

  public getRaindropToken(): string {
    const keychainSecret = this.getSecret(RAINDROP_ACCOUNT);
    if (keychainSecret && keychainSecret.trim()) {
      return keychainSecret.trim();
    }
    return process.env.RAINDROP_TOKEN?.trim() || "";
  }

  public setRaindropToken(token: string): void {
    this.setSecret(RAINDROP_ACCOUNT, token);
  }

  public deleteRaindropToken(): void {
    this.deleteSecret(RAINDROP_ACCOUNT);
  }
}

export const defaultKeychain = new KeychainService();
