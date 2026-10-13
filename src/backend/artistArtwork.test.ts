import { beforeEach, expect, it, vi } from "vitest";
import { getArtistPortraitCredit, syncArtistArtwork } from "./artistArtwork";

const api = vi.hoisted(() => ({ syncArtistArtwork: vi.fn(), getArtistPortraitCredit: vi.fn(), invalidateArtwork: vi.fn() }));
vi.mock("../bindings", () => ({ commands: api }));
vi.mock("./artwork", () => ({ invalidateArtwork: api.invalidateArtwork }));
vi.mock("./tauriClient", () => ({ isTauriRuntime: () => true }));
beforeEach(() => vi.clearAllMocks());

it("refreshes completed artwork even when the remaining batch is cancelled", async () => {
  api.syncArtistArtwork.mockRejectedValue(new Error("Cancelled"));
  await expect(syncArtistArtwork(50)).rejects.toThrow("Cancelled");
  expect(api.invalidateArtwork).toHaveBeenCalledOnce();
});

it("shares portrait credit requests across components until artwork changes", async () => {
  api.getArtistPortraitCredit.mockResolvedValue(null);
  const first = getArtistPortraitCredit("coldplay", 123);
  expect(getArtistPortraitCredit("coldplay", 123)).toBe(first);
  await first;
  expect(api.getArtistPortraitCredit).toHaveBeenCalledOnce();
  await getArtistPortraitCredit("coldplay", 124);
  expect(api.getArtistPortraitCredit).toHaveBeenCalledTimes(2);
});
