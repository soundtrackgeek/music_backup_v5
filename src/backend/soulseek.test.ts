import { describe, expect, it } from "vitest";

import { createSoulseekSearchClientId } from "./soulseek";

describe("Soulseek search session identifiers", () => {
  it("matches the native alphanumeric, hyphen, and underscore contract", () => {
    for (const random of [0, 0.5, 0.999_999_999, Number.NaN]) {
      const clientId = createSoulseekSearchClientId(1_785_278_400_000, random);

      expect(clientId).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
      expect(clientId).not.toContain(":");
    }
  });

  it("varies the identifier entropy for searches started together", () => {
    const now = 1_785_278_400_000;

    expect(createSoulseekSearchClientId(now, 0.25)).not.toBe(
      createSoulseekSearchClientId(now, 0.75),
    );
  });
});
