import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BrowseRow } from "../types";
import { AlbumCover, AlbumCoverPreviewProvider } from "./AlbumCover";
import { invalidateArtwork } from "../backend/artwork";

const backend = vi.hoisted(() => ({
  getAlbumCoverUrl: vi.fn(),
}));

vi.mock("../backend", () => ({
  getAlbumCoverUrl: backend.getAlbumCoverUrl,
}));

function albumRow(
  albumId: string,
  album: string,
  coverPath: string | null = null,
) {
  return {
    albumId,
    album,
    coverPath,
  } as BrowseRow;
}

describe("album cover hover preview", () => {
  beforeEach(() => {
    backend.getAlbumCoverUrl.mockReset();
  });

  afterEach(() => {
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
    vi.useRealTimers();
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: null,
    });
  });

  it("resolves a native Mac archive path through the protocol and uses 600px for large details", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    backend.getAlbumCoverUrl.mockResolvedValue("cover://localhost/album/id?size=600");
    render(<AlbumCover row={albumRow("mac-album", "Actually", "/Volumes/Music/AlbumCovers/art.jpg")} className="album-cover-large" decorative={false} />);
    await screen.findByRole("img", { name: "Actually cover" });
    expect(backend.getAlbumCoverUrl).toHaveBeenCalledWith("mac-album", 600);
  });

  it("loads a 300px hover image after a 96px thumbnail and retries failed mounted covers on refresh", async () => {
    backend.getAlbumCoverUrl.mockImplementation((_id: string, size: number) => Promise.resolve(`http://cover.localhost/art?size=${size}`));
    render(<AlbumCoverPreviewProvider><AlbumCover row={albumRow("album-1", "Actually", "C:\\covers\\art.jpg")} className="cover-mini" decorative={false} previewOnHover /></AlbumCoverPreviewProvider>);
    const image = await screen.findByRole("img", { name: "Actually cover" });
    expect(image).toHaveAttribute("src", "http://cover.localhost/art?size=96");
    expect(image).toHaveAttribute("loading", "lazy");
    expect(image).toHaveAttribute("decoding", "async");
    fireEvent.mouseEnter(image.parentElement!);
    await waitFor(() => expect(document.querySelector(".album-cover-preview img")).toHaveAttribute("src", "http://cover.localhost/art?size=300"));
    fireEvent.error(image);
    expect(screen.queryByRole("img", { name: "Actually cover" })).toBeNull();
    backend.getAlbumCoverUrl.mockResolvedValue("http://cover.localhost/refreshed");
    act(() => invalidateArtwork());
    await waitFor(() => expect(screen.getByRole("img", { name: "Actually cover" })).toHaveAttribute("src", "http://cover.localhost/refreshed"));
  });

  it("shows the loaded artwork in a 300px floating preview", async () => {
    backend.getAlbumCoverUrl.mockResolvedValue(
      "data:image/png;base64,Y292ZXI=",
    );
    render(
      <AlbumCoverPreviewProvider>
        <AlbumCover
          row={albumRow("album-1", "Actually", "C:\\covers\\actually.jpg")}
          className="cover-mini"
          decorative={false}
          previewOnHover
        />
      </AlbumCoverPreviewProvider>,
    );

    await waitFor(() => {
      expect(backend.getAlbumCoverUrl).toHaveBeenCalledWith("album-1", 96);
      expect(screen.getByRole("img", { name: "Actually cover" })).toBeVisible();
    });

    fireEvent.mouseEnter(
      screen.getByRole("img", { name: "Actually cover" }).parentElement!,
    );

    const preview = document.body.querySelector(".album-cover-preview");
    expect(preview).toHaveClass("is-visible");
    expect(preview).toHaveStyle({ height: "300px", width: "300px" });
    expect(preview?.querySelector("img")).toHaveAttribute(
      "src",
      "data:image/png;base64,Y292ZXI=",
    );
  });

  it("adds an album-and-year caption without shrinking the 300px artwork", () => {
    render(
      <AlbumCoverPreviewProvider>
        <AlbumCover
          row={albumRow("album-1", "Actually")}
          className="cover-mini"
          previewOnHover
          previewCaption="Actually (1987)"
        />
      </AlbumCoverPreviewProvider>,
    );

    fireEvent.mouseEnter(document.body.querySelector(".cover-mini")!);

    const preview = document.body.querySelector(".album-cover-preview");
    expect(preview).toHaveClass("with-caption", "is-visible");
    expect(preview).toHaveStyle({ height: "344px", width: "300px" });
    expect(document.body.querySelector(".album-cover-preview-art")).toHaveStyle({
      height: "300px",
    });
    expect(document.body.querySelector(".album-cover-preview-caption")).toHaveTextContent(
      "Actually (1987)",
    );
  });

  it("keeps one preview visible while the pointer moves between list covers", () => {
    vi.useFakeTimers();
    render(
      <AlbumCoverPreviewProvider>
        <AlbumCover
          row={albumRow("album-1", "Actually")}
          className="cover-mini"
          previewOnHover
        />
        <AlbumCover
          row={albumRow("album-2", "Behaviour")}
          className="cover-mini"
          previewOnHover
        />
      </AlbumCoverPreviewProvider>,
    );

    const covers = document.body.querySelectorAll(".cover-mini");
    fireEvent.mouseEnter(covers[0]);
    expect(
      document.body.querySelector(".album-cover-preview-art"),
    ).toHaveTextContent("A");

    fireEvent.mouseLeave(covers[0]);
    fireEvent.mouseEnter(covers[1]);
    act(() => vi.advanceTimersByTime(300));

    expect(document.body.querySelector(".album-cover-preview")).toHaveClass(
      "is-visible",
    );
    expect(
      document.body.querySelector(".album-cover-preview-art"),
    ).toHaveTextContent("B");
  });

  it("renders the hover preview inside the active fullscreen surface", async () => {
    const fullscreenSurface = document.createElement("section");
    document.body.append(fullscreenSurface);
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: fullscreenSurface,
    });
    backend.getAlbumCoverUrl.mockResolvedValue(
      "data:image/png;base64,Y292ZXI=",
    );
    render(
      <AlbumCoverPreviewProvider>
        <AlbumCover
          row={albumRow("album-fullscreen", "Fullscreen", "C:\\covers\\fullscreen.jpg")}
          decorative={false}
          previewOnHover
        />
      </AlbumCoverPreviewProvider>,
    );

    const cover = await screen.findByRole("img", {
      name: "Fullscreen cover",
    });
    fireEvent.mouseEnter(cover.parentElement!);

    expect(fullscreenSurface.querySelector(".album-cover-preview")).toHaveClass(
      "is-visible",
    );
    fullscreenSurface.remove();
  });

  it("fades and removes the preview after leaving the thumbnail", () => {
    vi.useFakeTimers();
    render(
      <AlbumCoverPreviewProvider>
        <AlbumCover
          row={albumRow("album-1", "Actually")}
          className="cover-mini"
          previewOnHover
        />
      </AlbumCoverPreviewProvider>,
    );

    const cover = document.body.querySelector(".cover-mini")!;
    fireEvent.mouseEnter(cover);
    fireEvent.mouseLeave(cover);

    act(() => vi.advanceTimersByTime(55));
    expect(
      document.body.querySelector(".album-cover-preview"),
    ).not.toHaveClass("is-visible");

    act(() => vi.advanceTimersByTime(180));
    expect(document.body.querySelector(".album-cover-preview")).toBeNull();
  });
});
