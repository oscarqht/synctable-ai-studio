import { platform } from "node:os";

export const DEFAULT_KEYCHAIN_SERVICE = "Synctable";
export const RAINDROP_ACCOUNT = "raindrop_api_token";

export class KeychainService {
  private service: string;

  constructor(service: string = DEFAULT_KEYCHAIN_SERVICE) {
    this.service = service;
  }

  public getSecret(account: string): string {
    if (platform() !== "darwin") {
      return "";
    }

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
    if (platform() !== "darwin") {
      return;
    }

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
    if (platform() !== "darwin") {
      return;
    }

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

  public getRaindropToken(): string {
    return this.getSecret(RAINDROP_ACCOUNT);
  }

  public setRaindropToken(token: string): void {
    this.setSecret(RAINDROP_ACCOUNT, token);
  }

  public deleteRaindropToken(): void {
    this.deleteSecret(RAINDROP_ACCOUNT);
  }
}

export const defaultKeychain = new KeychainService();
