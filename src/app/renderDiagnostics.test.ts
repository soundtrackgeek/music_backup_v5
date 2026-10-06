import { describe, expect, it } from "vitest";
import {
  formatRenderFailure,
  getRenderFailures,
  recordRenderFailure,
} from "./renderDiagnostics";

describe("render diagnostics", () => {
  it("bounds session history and protects recorded evidence from caller mutations", () => {
    for (let index = 0; index < 25; index++)
      recordRenderFailure(
        `View ${index}`,
        new Error(`Failure ${index}`),
        "Panel stack",
      );
    const failures = getRenderFailures();
    expect(failures).toHaveLength(20);
    expect(failures[0].workspace).toBe("View 5");
    expect(formatRenderFailure(failures[19])).toContain("Failure 24");
    expect(formatRenderFailure(failures[19])).toContain("Panel stack");
    failures[0].message = "changed outside the recorder";
    expect(getRenderFailures()[0].message).toBe("Failure 5");
  });
});
