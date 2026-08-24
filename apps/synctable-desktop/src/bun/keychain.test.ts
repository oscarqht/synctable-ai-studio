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
});
