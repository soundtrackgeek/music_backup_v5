import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { autoResolveArtist, listArtists } from "../../backend";
import { createArtistListRequest } from "../../app/requests";
import type { ArtistListRequest, ArtistSummary } from "../../types";
import type { ArtistAutoResolveResult } from "../../bindings";
import { useArtistAutoResolve } from "./useArtistAutoResolve";

vi.mock("../../backend", () => ({ autoResolveArtist: vi.fn(), listArtists: vi.fn() }));
const artists = Array.from({ length: 12 }, (_, index) => ({ id: `artist-${index}`, name: `Artist ${index}`, musicBrainzMbid: null } as ArtistSummary));
const updated = (id: string): ArtistAutoResolveResult => ({ artistId: id, artistName: id, status: "updated", candidates: [], message: "Updated" });
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listArtists).mockImplementation(async (request) => ({ rows: artists.slice(request.offset, request.offset + request.limit), total: artists.length, limit: request.limit, offset: request.offset }));
  vi.mocked(autoResolveArtist).mockImplementation(async (id) => updated(id));
});

describe("artist auto-resolve batches", () => {
  it("defaults to ten attempts, intersects the current filters, and starts at the first match", async () => {
    const request: ArtistListRequest = { ...createArtistListRequest(), missingInfo: "originCountry", yearFrom: 1980, yearTo: 1985, offset: 50, sort: { field: "name", direction: "desc" } };
    const onUpdated = vi.fn();
    const { result } = renderHook(() => useArtistAutoResolve(request, onUpdated));
    expect(result.current.count).toBe("10");
    await act(async () => { await result.current.start(); });
    expect(listArtists).toHaveBeenCalledWith({ ...request, missingMbidOnly: true, limit: 10, offset: 0 });
    expect(autoResolveArtist).toHaveBeenCalledTimes(10);
    expect(onUpdated).toHaveBeenCalledTimes(10);
    expect(result.current.results).toHaveLength(10);
    expect(result.current.running).toBe(false);
  });

  it("freezes pages before updating, honors a custom count, and continues after a failed artist", async () => {
    vi.mocked(listArtists).mockImplementation(async (request) => ({ rows: artists.slice(request.offset, request.offset + Math.min(2, request.limit)), total: 12, offset: request.offset, limit: 2 }));
    vi.mocked(autoResolveArtist).mockImplementation(async (id) => {
      expect(listArtists).toHaveBeenCalledTimes(2);
      if (id === "artist-1") throw new Error("MusicBrainz unavailable");
      return updated(id);
    });
    const { result } = renderHook(() => useArtistAutoResolve(createArtistListRequest(), vi.fn()));
    act(() => result.current.setCount("3"));
    await act(async () => { await result.current.start(); });
    expect(autoResolveArtist).toHaveBeenCalledTimes(3);
    expect(result.current.results.map((row) => row.status)).toEqual(["updated", "failed", "updated"]);
    expect(result.current.results[1].message).toBe("MusicBrainz unavailable");
  });

  it("stops after the current artist and retains saved results across navigation", async () => {
    let finish!: (result: ArtistAutoResolveResult) => void;
    vi.mocked(autoResolveArtist).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const firstUpdate = vi.fn();
    const latestUpdate = vi.fn();
    const { result, rerender } = renderHook(({ onUpdated, request }) => useArtistAutoResolve(request, onUpdated), {
      initialProps: { onUpdated: firstUpdate, request: createArtistListRequest() },
    });
    let run!: Promise<void>;
    act(() => { run = result.current.start(); });
    await waitFor(() => expect(autoResolveArtist).toHaveBeenCalledTimes(1));
    rerender({ onUpdated: latestUpdate, request: { ...createArtistListRequest(), searchText: "different" } });
    act(() => { result.current.stop(); void result.current.start(); });
    expect(result.current.stopping).toBe(true);
    await act(async () => { finish(updated("artist-0")); await run; });
    expect(autoResolveArtist).toHaveBeenCalledTimes(1);
    expect(firstUpdate).not.toHaveBeenCalled();
    expect(latestUpdate).toHaveBeenCalledWith("artist-0");
    expect(result.current.results).toHaveLength(1);
    expect(result.current.message).toContain("Stopped after 1 of 10");
  });

  it("rejects invalid counts and handles an empty filtered queue without searches", async () => {
    const { result } = renderHook(() => useArtistAutoResolve(createArtistListRequest(), vi.fn()));
    for (const count of ["", "0", "-1", "1.5", "1001"]) {
      act(() => result.current.setCount(count));
      await act(async () => { await result.current.start(); });
    }
    expect(listArtists).not.toHaveBeenCalled();
    vi.mocked(listArtists).mockResolvedValue({ rows: [], total: 0, offset: 0, limit: 10 });
    act(() => result.current.setCount("10"));
    await act(async () => { await result.current.start(); });
    expect(result.current.message).toContain("No artists without an MBID");
    expect(autoResolveArtist).not.toHaveBeenCalled();
  });
});
