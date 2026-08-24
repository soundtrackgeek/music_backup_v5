import { describe, expect, it, vi } from "vitest";

import { createCatalogRevisionChecker } from "./catalogRevisionWatcher";

function checkerHarness(initialRevision?: string) {
  let observed = initialRevision ?? "";
  let initialized = initialRevision !== undefined;
  let visible = true;
  const getRevision = vi.fn<() => Promise<string>>();
  const onRevision = vi.fn<
    (
      _revision: string,
      _reason: "baseline" | "change" | "retry",
    ) => Promise<void>
  >();
  const check = createCatalogRevisionChecker({
    isVisible: () => visible,
    getRevision,
    hasObservedRevision: () => initialized,
    getObservedRevision: () => observed,
    setObservedRevision: (revision) => {
      observed = revision;
      initialized = true;
    },
    onRevision,
  });

  return {
    check,
    getRevision,
    onRevision,
    observed: () => observed,
    setVisible: (next: boolean) => {
      visible = next;
    },
  };
}

describe("catalog revision checker", () => {
  it("refreshes while establishing a baseline so startup cannot retain a stale snapshot", async () => {
    const harness = checkerHarness();
    harness.getRevision.mockResolvedValue("catalog:17");
    harness.onRevision.mockResolvedValue();

    await harness.check();

    expect(harness.observed()).toBe("catalog:17");
    expect(harness.onRevision).toHaveBeenCalledWith(
      "catalog:17",
      "baseline",
    );
  });

  it("acknowledges a changed revision only after refresh succeeds", async () => {
    const harness = checkerHarness("catalog:17");
    harness.getRevision.mockResolvedValue("catalog:18");
    harness.onRevision
      .mockRejectedValueOnce(new Error("database temporarily locked"))
      .mockResolvedValueOnce();

    await expect(harness.check()).rejects.toThrow("temporarily locked");
    expect(harness.observed()).toBe("catalog:17");

    await harness.check();
    expect(harness.onRevision).toHaveBeenCalledTimes(2);
    expect(harness.onRevision).toHaveBeenLastCalledWith(
      "catalog:18",
      "change",
    );
    expect(harness.observed()).toBe("catalog:18");
  });

  it("retries view invalidation after acknowledging a revision", async () => {
    const harness = checkerHarness("catalog:17");
    harness.getRevision.mockResolvedValue("catalog:18");
    harness.onRevision.mockResolvedValue();

    await harness.check();
    await harness.check();
    await harness.check();

    expect(harness.onRevision.mock.calls).toEqual([
      ["catalog:18", "change"],
      ["catalog:18", "retry"],
    ]);
    expect(harness.observed()).toBe("catalog:18");
  });

  it("keeps an unsuccessful view retry pending for the next visible check", async () => {
    const harness = checkerHarness("catalog:17");
    harness.getRevision.mockResolvedValue("catalog:18");
    harness.onRevision
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(new Error("view query temporarily locked"))
      .mockResolvedValueOnce();

    await harness.check();
    await expect(harness.check()).rejects.toThrow("temporarily locked");
    await harness.check();

    expect(harness.onRevision.mock.calls).toEqual([
      ["catalog:18", "change"],
      ["catalog:18", "retry"],
      ["catalog:18", "retry"],
    ]);
  });

  it("skips hidden and overlapping checks", async () => {
    const harness = checkerHarness("catalog:17");
    harness.setVisible(false);
    await harness.check();
    expect(harness.getRevision).not.toHaveBeenCalled();

    harness.setVisible(true);
    let finishRevision: ((revision: string) => void) | undefined;
    harness.getRevision.mockReturnValue(
      new Promise((resolve) => {
        finishRevision = resolve;
      }),
    );
    const first = harness.check();
    const overlapping = harness.check();
    expect(harness.getRevision).toHaveBeenCalledTimes(1);

    finishRevision?.("catalog:17");
    await Promise.all([first, overlapping]);
  });
});
