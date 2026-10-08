import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SonicAlbumPanel } from "./SonicAlbumPanel";
import { findSonicAlbums, type SonicAlbumMatches } from "../backend/sonic";
vi.mock("../backend/sonic", () => ({ findSonicAlbums: vi.fn() }));
afterEach(() => vi.resetAllMocks());
const response: SonicAlbumMatches = { seed: { albumId: "seed", title: "Seed", albumArtist: "Singer", genre: "Pop", totalTracks: 6, analyzedTracks: 3, distance: null }, seedReady: true, analyzedAlbums: 2,
  albums: [{ albumId: "other", title: "Other album", albumArtist: "Various Artists", genre: "Pop", totalTracks: 8, analyzedTracks: 4, distance: 0.2 }] };
it("shows partial coverage and opens the exact matching album", async () => {
  vi.mocked(findSonicAlbums).mockResolvedValue(response);
  const open = vi.fn(); render(<SonicAlbumPanel albumId="seed" onOpenAlbum={open} />);
  fireEvent.click(screen.getByText("Find similar albums"));
  expect(await screen.findByText("4/8 tracks analyzed · Partial analysis")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Open Other album by Various Artists" }));
  expect(open).toHaveBeenCalledWith("other");
  fireEvent.change(screen.getByLabelText("Minimum analysis coverage"), { target: { value: "100" } });
  expect(screen.queryByText("Other album")).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("Find similar albums"));
  await waitFor(() => expect(findSonicAlbums).toHaveBeenLastCalledWith("seed", 100));
});
it("discards a late result after the selected album changes", async () => {
  let finish!: (r: SonicAlbumMatches) => void;
  vi.mocked(findSonicAlbums).mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const panel = render(<SonicAlbumPanel albumId="seed" onOpenAlbum={vi.fn()} />);
  fireEvent.click(screen.getByText("Find similar albums"));
  panel.rerender(<SonicAlbumPanel albumId="next" onOpenAlbum={vi.fn()} />);
  await act(async () => finish(response));
  expect(screen.queryByText("Other album")).not.toBeInTheDocument();
  expect(screen.getByText("Find similar albums")).toBeEnabled();
});
it("explains insufficient seed analysis and reports query failures", async () => {
  vi.mocked(findSonicAlbums).mockResolvedValueOnce({ ...response, seedReady: false, albums: [] }).mockRejectedValueOnce(new Error("Analysis database unavailable"));
  render(<SonicAlbumPanel albumId="seed" onOpenAlbum={vi.fn()} />);
  fireEvent.click(screen.getByText("Find similar albums"));
  expect(await screen.findByRole("status")).toHaveTextContent("Analyze this album above");
  fireEvent.click(screen.getByText("Find similar albums"));
  expect(await screen.findByRole("alert")).toHaveTextContent("Analysis database unavailable");
});
