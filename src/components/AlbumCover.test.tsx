import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BrowseRow } from "../types";
import { AlbumCover, AlbumCoverPreviewProvider } from "./AlbumCover";

const backend = vi.hoisted(() => ({
  getAlbumCoverDataUrl: vi.fn(),
}));

vi.mock("../backend", () => ({
  getAlbumCoverDataUrl: backend.getAlbumCoverDataUrl,
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
    backend.getAlbumCoverDataUrl.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the loaded artwork in a 300px floating preview", async () => {
    backend.getAlbumCoverDataUrl.mockResolvedValue(
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
      expect(backend.getAlbumCoverDataUrl).toHaveBeenCalledWith("album-1");
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
