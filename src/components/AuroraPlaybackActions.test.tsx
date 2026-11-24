import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { albumIdFromLink } from "../app/useMusicLibraryLinks";
import { auroraPlaybackUrl } from "../backend/auroraPlayback";
import { openUrl } from "../backend/tauriClient";
import { AuroraPlaybackActions } from "./AuroraPlaybackActions";

vi.mock("../backend/tauriClient", () => ({ isTauriRuntime: () => true, openUrl: vi.fn() }));

it("sends distinct Play and Queue links for the selected catalog track", async () => {
  vi.mocked(openUrl).mockResolvedValue(undefined);
  const target = { kind: "track", trackId: 42, albumId: "mb:album/ø" } as const;
  render(<AuroraPlaybackActions target={target} />);
  fireEvent.click(screen.getByRole("button", { name: "Play in Aurora" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Queue in Aurora" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Queue in Aurora" }));
  await waitFor(() => expect(openUrl).toHaveBeenCalledTimes(2));
  const sent = vi.mocked(openUrl).mock.calls.map(([value]) => new URL(value));
  expect(sent.map(url => [url.hostname, url.pathname, url.searchParams.get("album")])).toEqual([
    ["play", "/track/42", "mb:album/ø"], ["queue", "/track/42", "mb:album/ø"],
  ]);
  expect(sent[0].searchParams.get("request")).not.toBe(sent[1].searchParams.get("request"));
});

it("encodes album links and parses return links with the original catalog identity", () => {
  expect(auroraPlaybackUrl("play", { kind: "album", albumId: "mb:album/ø" }, "click")).toBe("aurora://play/album/mb%3Aalbum%2F%C3%B8?request=click");
  expect(albumIdFromLink("musiclibrary://album/mb%3Aalbum%2F%C3%B8")).toBe("mb:album/ø");
  expect(albumIdFromLink("musiclibrary://album/a/b")).toBeNull();
  expect(albumIdFromLink("https://album/example")).toBeNull();
});
