import { describe, expect, it, afterAll } from "bun:test";
import { KeychainService } from "./keychain";
import { platform } from "node:os";

describe("KeychainService", () => {
  const isMac = platform() === "darwin";
  const testService = new KeychainService("Synctable-UnitTest");
  const testAccount = "unit_test_token";

  afterAll(() => {
    if (isMac) {
      testService.deleteSecret(testAccount);
    }
  });

  it("stores, retrieves, updates, and deletes secret in keychain", () => {
    if (!isMac) return;

    // Clean initial state
    testService.deleteSecret(testAccount);
    expect(testService.getSecret(testAccount)).toBe("");

    // Set secret
    testService.setSecret(testAccount, "test-secret-value-123");
    expect(testService.getSecret(testAccount)).toBe("test-secret-value-123");

    // Update secret
    testService.setSecret(testAccount, "updated-secret-value-456");
    expect(testService.getSecret(testAccount)).toBe("updated-secret-value-456");

    // Clear secret by passing empty string
    testService.setSecret(testAccount, "");
    expect(testService.getSecret(testAccount)).toBe("");

    // Set and delete explicitly
    testService.setSecret(testAccount, "to-delete");
    expect(testService.getSecret(testAccount)).toBe("to-delete");
    testService.deleteSecret(testAccount);
    expect(testService.getSecret(testAccount)).toBe("");
  });

  it("falls back to RAINDROP_TOKEN env var when keychain token is not set", () => {
    const origEnv = process.env.RAINDROP_TOKEN;
    const testService2 = new KeychainService("Synctable-UnitTest-Env");

    try {
      process.env.RAINDROP_TOKEN = "env-token-fallback-test";
      // Mock getSecret to return empty string
      testService2.getSecret = () => "";
      expect(testService2.getRaindropToken()).toBe("env-token-fallback-test");

      // When keychain has value, it takes precedence
      testService2.getSecret = () => "keychain-token-priority";
      expect(testService2.getRaindropToken()).toBe("keychain-token-priority");
    } finally {
      if (origEnv !== undefined) {
        process.env.RAINDROP_TOKEN = origEnv;
      } else {
        delete process.env.RAINDROP_TOKEN;
      }
    }
  });
});
