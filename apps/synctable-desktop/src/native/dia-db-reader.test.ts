import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Dia database encryption constants", () => {
  test("uses Dia's complete database-key derivation constant", () => {
    const source = readFileSync(join(import.meta.dir, "dia-db-reader.c"), "utf8");
    const block = source.match(/derivation_key\[32\] = \{([\s\S]*?)\};/)?.[1];
    expect(block).toBeDefined();

    const bytes = [...block!.matchAll(/0x([0-9a-f]{2})/gi)].map((match) => Number.parseInt(match[1], 16));
    expect(Buffer.from(bytes).toString("base64")).toBe("iOe1Ue/XtonbieE/5m1nAgewvWQlePHRcKnoU10EyOM=");
  });
});
