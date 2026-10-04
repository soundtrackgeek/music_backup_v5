import { afterEach, describe, expect, it, vi } from "vitest";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { artworkUrl, invalidateArtwork } from "./artwork";
import { getAlbumCoverUrl, getArtistImageUrl, getLibraryCompletionCoverUrl } from "../backend";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: vi.fn((path: string, protocol: string) => `http://${protocol}.localhost/${encodeURIComponent(path)}`),
  invoke: vi.fn(),
}));

afterEach(() => {
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  vi.clearAllMocks();
});

describe("artwork protocol URLs", () => {
  it("returns protocol URLs for every artwork kind without invoking Rust", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    expect(await getAlbumCoverUrl("Björk / #?", 96)).toMatch(/^http:\/\/cover.localhost\/album%2FBj%C3%B6rk%20%2F%20%23%3F\?size=96&r=\d+$/);
    expect(await getArtistImageUrl("artist", 600)).toContain("artist%2Fartist?size=600");
    expect(await getLibraryCompletionCoverUrl("candidate:1")).toContain("completion%2Fcandidate%3A1?size=300");
    expect(convertFileSrc).toHaveBeenCalledWith("album/Björk / #?", "cover");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("changes the alias after refresh and stays safe in browser preview", () => {
    expect(artworkUrl("album", "a")).toBeNull();
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    const before = artworkUrl("album", "a");
    invalidateArtwork();
    expect(artworkUrl("album", "a")).not.toBe(before);
  });
});
