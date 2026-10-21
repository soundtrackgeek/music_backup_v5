import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RatedAlbums } from "./RatedAlbums";
import { StatisticsStoreProvider } from "./useStatisticsStore";
import { getRatedAlbums, type RatedAlbum } from "../../backend/ratedAlbums";
import { emptyRatedAlbumFilters as defaults, filterRatedAlbums, ratedFilterError } from "./ratedAlbumFilters";

vi.mock("../../backend/ratedAlbums", () => ({ getRatedAlbums: vi.fn() }));
vi.mock("../../components/AlbumCover", () => ({ AlbumCover: () => <span>Cover</span> }));
const album: RatedAlbum = {
  albumId: "a", album: "First album", artist: "Artist A", year: 1984, genre: "Pop", country: "Norway",
  coverPath: null, tracks: 10, seconds: 2400, albumRating: 90, score: 101.5,
  ratedAt: new Date(2026, 9, 21, 23, 59, 59).getTime() / 1000,
  dateKind: "completed", inLibrary: true, currentlyComplete: true,
};
const legacy: RatedAlbum = { ...album, albumId: "b", album: "Second album", artist: "Artist B", year: 2000,
  genre: "Rock", country: "Sweden", score: null, ratedAt: null, dateKind: "unknown" };
const props = { onOpenAlbum: vi.fn() };
afterEach(() => { cleanup(); vi.resetAllMocks(); });

it("combines search, exact genre/country, album year and inclusive local dates", () => {
  const nextDay = { ...album, albumId: "c", ratedAt: new Date(2026, 9, 22, 0, 0, 0).getTime() / 1000 };
  const filters = { ...defaults, query: "ARTIST A", genre: "Pop", country: "Norway", yearFrom: "1984", yearTo: "1984", dateFrom: "2026-10-21", dateTo: "2026-10-21" };
  expect(filterRatedAlbums([album, legacy, nextDay], filters).map(row => row.albumId)).toEqual(["a"]);
  expect(filterRatedAlbums([album], { ...filters, genre: "Rock" })).toEqual([]);
  expect(filterRatedAlbums([album], { ...filters, dateKind: "firstSeen" })).toEqual([]);
  expect(filterRatedAlbums([album], { ...filters, yearFrom: "1985" })).toEqual([]);
  expect(filterRatedAlbums([{ ...album, genre: "", country: "" }], { ...defaults, genre: "Unknown genre", country: "Unknown country" })).toHaveLength(1);
  expect(ratedFilterError({ ...defaults, dateFrom: "2026-10-22", dateTo: "2026-10-21" })).toContain("Rated from");
});

it("sorts numeric scores and dates with missing values last and stable ties", () => {
  const low = { ...album, albumId: "c", score: 9.5, ratedAt: album.ratedAt! - 86400 };
  expect(filterRatedAlbums([legacy, low, album], { ...defaults, sort: "score" }).map(row => row.albumId)).toEqual(["a", "c", "b"]);
  expect(filterRatedAlbums([legacy, album, low], { ...defaults, sort: "scoreAsc" }).map(row => row.albumId)).toEqual(["c", "a", "b"]);
  expect(filterRatedAlbums([legacy, album, low], { ...defaults, sort: "oldest" }).map(row => row.albumId)).toEqual(["c", "a", "b"]);
});

it("loads rows, opens the album, filters and preserves criteria through refresh", async () => {
  vi.mocked(getRatedAlbums).mockResolvedValue([album, legacy]);
  const view = render(<RatedAlbums {...props} refreshToken={1} />, { wrapper: StatisticsStoreProvider });
  await screen.findByText("First album");
  expect(screen.getAllByText(/10 tracks/)[0]).toHaveTextContent("40:00");
  fireEvent.click(screen.getByRole("button", { name: "Open First album by Artist A" }));
  expect(props.onOpenAlbum).toHaveBeenCalledWith("a");
  fireEvent.change(screen.getByLabelText("Genre"), { target: { value: "Rock" } });
  expect(screen.queryByText("First album")).not.toBeInTheDocument();
  expect(screen.getByText("Second album")).toBeInTheDocument();
  view.rerender(<RatedAlbums {...props} refreshToken={2} />);
  await waitFor(() => expect(getRatedAlbums).toHaveBeenCalledTimes(2));
  expect(screen.getByLabelText("Genre")).toHaveValue("Rock");
  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(screen.getByText("First album")).toBeInTheDocument();
});

it("ignores late requests, retains rows on failure and recovers on retry", async () => {
  let resolveOld!: (rows: RatedAlbum[]) => void;
  vi.mocked(getRatedAlbums).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
    .mockResolvedValueOnce([legacy]).mockRejectedValueOnce(new Error("Database busy")).mockResolvedValueOnce([album]);
  const view = render(<RatedAlbums {...props} refreshToken={1} />, { wrapper: StatisticsStoreProvider });
  view.rerender(<RatedAlbums {...props} refreshToken={2} />);
  await screen.findByText("Second album");
  await act(async () => resolveOld([album]));
  expect(screen.queryByText("First album")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Refresh history" }));
  await screen.findByText(/Database busy/);
  expect(screen.getByText("Second album")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByText("First album");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("paginates a large history and disables navigation for removed albums", async () => {
  vi.mocked(getRatedAlbums).mockResolvedValue(Array.from({ length: 41 }, (_, i) => ({ ...album, albumId: `${i}`, album: `Album ${i}`, inLibrary: i !== 0 })));
  render(<RatedAlbums {...props} />, { wrapper: StatisticsStoreProvider });
  await screen.findByText("Album 0");
  expect(within(screen.getByRole("list", { name: "Rated album history" })).getAllByRole("listitem")).toHaveLength(40);
  expect(screen.getByRole("button", { name: "Open Album 0 by Artist A" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Next history page" }));
  expect(within(screen.getByRole("list", { name: "Rated album history" })).getAllByRole("listitem")).toHaveLength(1);
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Album 0" } });
  expect(screen.getByText("Album 0")).toBeInTheDocument();
});

it("explains an empty library and exposes a recoverable initial failure", async () => {
  vi.mocked(getRatedAlbums).mockRejectedValueOnce(new Error("Unavailable")).mockResolvedValueOnce([]);
  render(<RatedAlbums {...props} />, { wrapper: StatisticsStoreProvider });
  await screen.findByRole("alert");
  expect(screen.queryByText("Your next finished album starts here")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByText("Your next finished album starts here");
});
