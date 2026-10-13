import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { SplitArtistDialog } from "./SplitArtistDialog";
import { getArtistSplitContext, splitArtist } from "../../backend/artistIdentity";
vi.mock("../../backend/artistIdentity", () => ({ getArtistSplitContext: vi.fn(), splitArtist: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute("open", ""); });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute("open"); });
  vi.mocked(getArtistSplitContext).mockResolvedValue({
    artist: { id: "zoo", name: "Zoo", disambiguation: "Norwegian group", musicbrainzMbid: null },
    albums: [{ id: "no", title: "Norwegian album", year: 1980, tracks: 10 },
      { id: "fr", title: "French album", year: 1970, tracks: 8 }],
    otherArtists: [{ id: "artist:existing", name: "Zoo", disambiguation: "French group", musicbrainzMbid: null }],
  });
});
it("reviews all albums and sends only the selected album with its separate identity", async () => {
  const onSaved = vi.fn();
  vi.mocked(splitArtist).mockResolvedValue({ artistId: "artist:new", movedAlbums: 1 });
  render(<SplitArtistDialog artistId="zoo" onClose={vi.fn()} onSaved={onSaved} />);
  await screen.findByLabelText("New artist description");
  fireEvent.change(screen.getByLabelText("New artist description"), { target: { value: "French group" } });
  fireEvent.click(screen.getByRole("checkbox", { name: /French album/ }));
  expect(screen.getByText(/1 albums will remain/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Move 1 album" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ artistId: "artist:new", movedAlbums: 1 }));
  expect(splitArtist).toHaveBeenCalledWith({ sourceArtistId: "zoo", albumIds: ["fr"],
    targetArtistId: null, disambiguation: "French group", sourceDisambiguation: "Norwegian group", musicbrainzMbid: null });
});
it("keeps selections when filtering and supports moving albums back to an existing profile", async () => {
  vi.mocked(splitArtist).mockRejectedValue(new Error("Refresh and review the selection."));
  render(<SplitArtistDialog artistId="zoo" onClose={vi.fn()} onSaved={vi.fn()} />);
  await screen.findByLabelText("New artist description");
  fireEvent.click(screen.getByRole("checkbox", { name: /French album/ }));
  fireEvent.change(screen.getByLabelText("Find albums"), { target: { value: "Norwegian" } });
  expect(screen.getByText("1 of 2 albums selected")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Move albums to"), { target: { value: "artist:existing" } });
  expect(screen.queryByLabelText("New artist description")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Move 1 album" }));
  await screen.findByRole("alert");
  expect(screen.getByRole("alert")).toHaveTextContent("Refresh and review the selection.");
  expect(splitArtist).toHaveBeenCalledWith(expect.objectContaining({ albumIds: ["fr"], targetArtistId: "artist:existing" }));
  expect(screen.getByRole("button", { name: "Move 1 album" })).toBeEnabled();
});
