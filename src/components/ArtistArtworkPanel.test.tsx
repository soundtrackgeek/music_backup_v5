import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ArtistArtwork } from "../bindings";
import { ArtistArtworkPanel } from "./ArtistArtworkPanel";

const api = vi.hoisted(() => ({ getArtistArtwork: vi.fn(), openUrl: vi.fn() }));
vi.mock("../backend/artistArtwork", () => ({ getArtistArtwork: api.getArtistArtwork }));
vi.mock("../backend/tauriClient", () => ({ openUrl: api.openUrl }));
vi.mock("../backend/artwork", () => ({ useArtworkRevision: () => 0, artworkUrl: (kind: string, id: string) => `http://cover.localhost/${kind}/${id}` }));
function artwork(id: string): ArtistArtwork {
  return { artistId: id, artistName: id, musicbrainzMbid: null, fetchedAt: null, cached: true, stale: false, message: "Cached",
    portrait: { provider: "Wikimedia Commons", author: "Jane", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", sourceUrl: "https://commons.wikimedia.org/wiki/File:Portrait.jpg" },
    logo: null, background: null };
}
describe("ArtistArtworkPanel", () => {
  beforeEach(() => vi.clearAllMocks());
  it("shows per-image source and license and opens their links", async () => {
    api.getArtistArtwork.mockResolvedValue(artwork("a"));
    render(<ArtistArtworkPanel artistId="a" artistName="Artist A" />);
    expect(await screen.findByRole("img", { name: "Artist A portrait" })).toHaveAttribute("src", "http://cover.localhost/artist/a");
    fireEvent.click(screen.getByRole("button", { name: "Jane · CC BY-SA 4.0 · Wikimedia Commons" }));
    expect(api.openUrl).toHaveBeenCalledWith("https://commons.wikimedia.org/wiki/File:Portrait.jpg");
    fireEvent.click(screen.getByRole("button", { name: "License" }));
    expect(api.openUrl).toHaveBeenCalledWith("https://creativecommons.org/licenses/by-sa/4.0/");
  });
  it("ignores a late request after the user selects another artist", async () => {
    let resolveA!: (value: ArtistArtwork) => void;
    api.getArtistArtwork.mockImplementation((id: string) => id === "a" ? new Promise<ArtistArtwork>(resolve => { resolveA = resolve; }) : Promise.resolve(artwork("b")));
    const view = render(<ArtistArtworkPanel artistId="a" artistName="Artist A" />);
    view.rerender(<ArtistArtworkPanel artistId="b" artistName="Artist B" />);
    await screen.findByRole("img", { name: "Artist B portrait" });
    resolveA(artwork("a"));
    await waitFor(() => expect(screen.queryByRole("img", { name: "Artist A portrait" })).not.toBeInTheDocument());
    expect(screen.getByRole("img", { name: "Artist B portrait" })).toBeInTheDocument();
  });
  it("keeps cached artwork and explains a refresh failure", async () => {
    api.getArtistArtwork.mockResolvedValueOnce(artwork("a")).mockRejectedValueOnce(new Error("Provider unavailable"));
    render(<ArtistArtworkPanel artistId="a" artistName="Artist A" />);
    await screen.findByRole("img", { name: "Artist A portrait" });
    fireEvent.click(screen.getByRole("button", { name: "Refresh artwork" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Provider unavailable");
    expect(screen.getByRole("img", { name: "Artist A portrait" })).toBeInTheDocument();
    expect(api.getArtistArtwork).toHaveBeenLastCalledWith("a", "Artist A", true);
  });
});
