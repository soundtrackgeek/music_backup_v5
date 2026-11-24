import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { savePlaylist } from "../../backend";
import { describeSound } from "../../backend/sonic";
import { SoundSearch } from "./SoundSearch";
import { emptySoundSearch } from "./useSearchStore";

vi.mock("../../backend", () => ({ savePlaylist: vi.fn() }));
vi.mock("../../backend/sonic", () => ({ describeSound: vi.fn() }));
vi.mock("../../components/AlbumCover", () => ({
  AlbumCover: ({ row }: { row: { coverPath: string | null } }) => (
    <img src={row.coverPath ?? undefined} alt="Result artwork" />
  ),
}));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it("filters before ranking, opens result details, and saves the displayed matches", async () => {
  const track = {
    trackId: 1, trackKey: "k1", title: "Blue in Green", artist: "Miles Davis",
    album: "Kind of Blue", albumId: "a", albumArtist: "Miles Davis",
    filePath: "D:", filename: "1.mp3", genre: "Jazz", rating: 90, seconds: 300,
    loved: false, distance: 0.46,
  };
  vi.mocked(describeSound).mockResolvedValue({
    query: "rainy Sunday jazz",
    searched: 3,
    tracks: [{ track, year: 1959, coverPath: "/kind-of-blue.webp" }],
  });
  vi.mocked(savePlaylist).mockImplementation(async input => ({ name: input.name } as Awaited<ReturnType<typeof savePlaylist>>));
  const openAlbum = vi.fn();
  const openArtist = vi.fn();
  function Harness() {
    const [draft, setDraft] = useState(emptySoundSearch);
    return <SoundSearch draft={draft} setDraft={setDraft} onOpenAlbum={openAlbum} onOpenArtist={openArtist} />;
  }
  render(<Harness />);
  fireEvent.change(screen.getByRole("searchbox", { name: "Sound description" }), { target: { value: "rainy Sunday jazz" } });
  fireEvent.change(screen.getByLabelText("Year from"), { target: { value: "1950" } });
  fireEvent.change(screen.getByLabelText("Year to"), { target: { value: "1959" } });
  fireEvent.change(screen.getByLabelText("Track rating"), { target: { value: "4" } });
  fireEvent.click(screen.getByRole("button", { name: "Find tracks" }));
  expect(await screen.findByText("54% match")).toBeInTheDocument();
  expect(screen.getByText("1959")).toBeInTheDocument();
  expect(screen.getByText("4.5 ★")).toBeInTheDocument();
  expect(screen.getByRole("img", { name: "Result artwork" })).toHaveAttribute("src", "/kind-of-blue.webp");
  expect(describeSound).toHaveBeenCalledWith("rainy Sunday jazz", expect.objectContaining({
    view: "tracks",
    filters: expect.objectContaining({ yearFrom: 1950, yearTo: 1959, trackRatingMin: 4 }),
  }));

  fireEvent.click(screen.getByRole("button", { name: "Open album Kind of Blue for Blue in Green" }));
  fireEvent.click(screen.getByRole("button", { name: "Open artist Miles Davis" }));
  expect(openAlbum).toHaveBeenCalledWith("a");
  expect(openArtist).toHaveBeenCalledWith("miles davis", "Miles Davis");

  fireEvent.click(screen.getByRole("button", { name: "Save as playlist" }));
  expect(await screen.findByText("Saved “Sounds like rainy Sunday jazz” in Playlists.")).toBeInTheDocument();
  expect(savePlaylist).toHaveBeenCalledWith(expect.objectContaining({
    playlist: expect.objectContaining({
      request: expect.objectContaining({ filters: expect.objectContaining({ trackIds: [1] }) }),
      tracks: [expect.objectContaining({ trackId: 1, year: 1959 })],
    }),
  }));

  vi.mocked(describeSound).mockResolvedValueOnce({ query: "rainy Sunday jazz", searched: 0, tracks: [] });
  fireEvent.change(screen.getByLabelText("Track rating"), { target: { value: "unrated" } });
  expect(screen.queryByRole("button", { name: "Save as playlist" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Find tracks" }));
  expect(await screen.findByText(/No analyzed tracks match/)).toBeInTheDocument();
  await waitFor(() => expect(describeSound).toHaveBeenLastCalledWith("rainy Sunday jazz", expect.objectContaining({
    filters: expect.objectContaining({ missingFields: ["rating"], trackRatingMin: null }),
  })));
});
