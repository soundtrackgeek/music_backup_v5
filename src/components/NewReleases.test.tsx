import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NewReleases, ReleaseRadarProvider, radarReleases } from "./NewReleases";
import type { ReleaseRadar } from "../backend/releaseRadar";

const api = vi.hoisted(() => ({ get: vi.fn(), add: vi.fn(), open: vi.fn() }));
vi.mock("../backend/releaseRadar", () => ({ getReleaseRadar: api.get }));
vi.mock("../backend", () => ({ addWishListItem: api.add, openExternalUrl: api.open, isTauriRuntime: () => true }));
const artist = { id: "radiohead", name: "Radiohead", musicbrainzId: "artist-id" };
const sample: ReleaseRadar = {
  today: "2026-10-10", upcomingUntil: "2026-11-10", recentSince: "2026-09-10", checkedAt: "2026-10-10T08:00:00Z",
  stale: false, warning: null, artistCount: 1234, identifiedArtistCount: 1230, unresolvedArtistIds: [],
  releases: [
    { releaseGroupId: "new", title: "Next week", artist: "Radiohead", artists: [artist], releaseDate: "2026-10-15", releaseType: "Album", secondaryType: null, musicbrainzUrl: "https://musicbrainz.org/release-group/new", owned: false, onWishList: false },
    { releaseGroupId: "later", title: "Later EP", artist: "M83", artists: [{ ...artist, id: "m83", name: "M83" }], releaseDate: "2026-11-01", releaseType: "EP", secondaryType: null, musicbrainzUrl: "https://musicbrainz.org/release-group/later", owned: false, onWishList: true },
    { releaseGroupId: "past", title: "Last week", artist: "Radiohead", artists: [artist], releaseDate: "2026-10-05", releaseType: "Single", secondaryType: null, musicbrainzUrl: "https://musicbrainz.org/release-group/past", owned: false, onWishList: false },
  ],
};
beforeEach(() => { vi.clearAllMocks(); api.get.mockResolvedValue(sample); api.add.mockResolvedValue({}); api.open.mockResolvedValue(undefined); });
describe("new-release radar", () => {
  it("shows upcoming releases, recent music, weekly digest and exact artist scope", async () => {
    render(<NewReleases artistId="radiohead" artistName="Radiohead" />);
    expect(await screen.findByText("Next week")).toBeInTheDocument();
    expect(screen.queryByText("Later EP")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Recently released" }));
    expect(screen.getByText("Last week")).toBeInTheDocument();expect(screen.queryByText("Next week")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Weekly digest" }));
    expect(screen.getByText("Next week")).toBeInTheDocument();
    expect(radarReleases(sample, "weekly").map((r) => r.title)).toEqual(["Next week"]);
    expect(screen.getByText(/1,230 of 1,234 watched artists/)).toBeInTheDocument();
  });
  it("filters release type and text and hides owned releases", async () => {
    api.get.mockResolvedValue({ ...sample, releases: [...sample.releases, { ...sample.releases[0], releaseGroupId: "owned", title: "Owned record", owned: true }] });
    render(<NewReleases />);await screen.findByText("Next week");
    expect(screen.queryByText("Owned record")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Hide owned releases" }));expect(screen.getByText("Owned record")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Release type" }), { target: { value: "EP" } });
    expect(screen.getByText("Later EP")).toBeInTheDocument();expect(screen.queryByText("Next week")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search releases" }), { target: { value: "missing" } });
    expect(screen.getByText("No releases match these filters.")).toBeInTheDocument();
  });
  it("adds to Wish List by release-group identity and shares shelf state", async () => {
    render(<ReleaseRadarProvider available><NewReleases compact /><NewReleases /></ReleaseRadarProvider>);
    const full = screen.getByRole("region", { name: "New Releases" });
    await within(full).findByText("Next week");
    expect(api.get).toHaveBeenCalledTimes(1);
    fireEvent.click(within(full).getByRole("button", { name: "Add to Wish List" }));
    await waitFor(() => expect(api.add).toHaveBeenCalledWith(expect.objectContaining({ entity: "album", musicbrainzId: "new", year: 2026, source: "New-release radar" })));
    await waitFor(() => expect(within(full).getAllByRole("button", { name: "On Wish List" })).toHaveLength(2));
    expect(within(screen.getByRole("region", { name: "New & upcoming" })).getAllByRole("button", { name: "On Wish List" })).toHaveLength(2);
  });
  it("keeps cached releases visible when refresh fails and reports stale provider coverage", async () => {
    api.get.mockResolvedValue({ ...sample, stale: true, warning: "Provider unavailable" });
    render(<NewReleases />);await screen.findByText("Next week");
    expect(screen.getByRole("alert")).toHaveTextContent("Provider unavailable");
    api.get.mockRejectedValueOnce(new Error("Network unavailable"));
    fireEvent.click(screen.getByRole("button", { name: "Refresh new releases" }));
    await screen.findByText("Error: Network unavailable");expect(screen.getByText("Next week")).toBeInTheDocument();
  });
  it("does not let a departed artist request replace the next artist", async () => {
    let finish: ((value: ReleaseRadar) => void) | undefined;
    api.get.mockImplementationOnce(() => new Promise<ReleaseRadar>((resolve) => { finish = resolve; }));
    const { rerender } = render(<NewReleases key="radiohead" artistId="radiohead" artistName="Radiohead" />);
    rerender(<NewReleases key="m83" artistId="m83" artistName="M83" />);
    await screen.findByText("Later EP");
    await act(async () => { finish?.({ ...sample, releases: [] }); });
    expect(screen.getByText("Later EP")).toBeInTheDocument();
  });
  it("does not request releases without a catalog", () => {
    render(<NewReleases available={false} />);expect(api.get).not.toHaveBeenCalled();
    expect(screen.getByText("Import a library to check your artists.")).toBeInTheDocument();
  });
  it("distinguishes an unresolved artist from an artist with no announcements", async () => {
    api.get.mockResolvedValue({ ...sample, releases: [], unresolvedArtistIds: ["radiohead"] });
    render(<NewReleases artistId="radiohead" artistName="Radiohead" />);
    expect(await screen.findByText(/This artist needs a MusicBrainz identity/)).toBeInTheDocument();
    expect(screen.queryByText("No announced releases found in this window.")).not.toBeInTheDocument();
  });
});
