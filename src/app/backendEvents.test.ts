import { describe, expect, it, vi } from "vitest";
import { subscribeWithSnapshot } from "./backendEvents";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("backend event snapshots", () => {
  it("subscribes before reading and keeps newer events over a stale snapshot", async () => {
    let push!: (value: string) => void;
    const snapshot = deferred<string>();
    const receive = vi.fn();
    const cleanup = vi.fn();
    const read = vi.fn(() => snapshot.promise);
    const stop = subscribeWithSnapshot(async (handler) => {
      push = handler;
      expect(read).not.toHaveBeenCalled();
      return cleanup;
    }, read, receive);
    await Promise.resolve();
    push("new");
    snapshot.resolve("old");
    await Promise.resolve();
    expect(receive.mock.calls).toEqual([["new"]]);
    stop();
    push("after unmount");
    expect(receive).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("cleans up a subscription that completes after unmount without reading", async () => {
    const subscription = deferred<() => void>();
    const cleanup = vi.fn();
    const read = vi.fn(async () => "value");
    const receive = vi.fn();
    const stop = subscribeWithSnapshot(() => subscription.promise, read, receive);
    stop();
    subscription.resolve(cleanup);
    await Promise.resolve();
    expect(cleanup).toHaveBeenCalledOnce();
    expect(read).not.toHaveBeenCalled();
    expect(receive).not.toHaveBeenCalled();
  });

  it("reports a failed snapshot and still receives later progress events", async () => {
    let push!: (value: string) => void;
    const receive = vi.fn();
    const onError = vi.fn();
    const error = new Error("database locked");
    const stop = subscribeWithSnapshot(async (handler) => {
      push = handler;
      return () => undefined;
    }, async () => { throw error; }, receive, onError);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(error));
    push("completed");
    expect(receive).toHaveBeenCalledWith("completed");
    stop();
  });
});
