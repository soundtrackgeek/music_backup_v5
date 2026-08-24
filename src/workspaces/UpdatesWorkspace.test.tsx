import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import * as backend from "../backend";
import { UpdatesWorkspace } from "./UpdatesWorkspace";

describe("UpdatesWorkspace", () => {
  it("shows semantic change labels and filters the durable activity ledger", async () => {
    const user = userEvent.setup();
    const onSelectUpdate = vi.fn();
    const onOpenArtist = vi.fn();
    render(
      <UpdatesWorkspace
        selectedUpdateId={null}
        onSelectUpdate={onSelectUpdate}
        onOpenArtist={onOpenArtist}
      />,
    );

    expect(
      await screen.findByText("Michael Stanley Band"),
    ).toBeInTheDocument();
    expect(screen.getByText("5 track ratings added")).toBeInTheDocument();
    expect(screen.getAllByText("New").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Changed").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Removed").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Ratings").length).toBeGreaterThan(0);

    await user.click(
      screen.getByRole("button", {
        name: "Open Michael Stanley Band in Artists",
      }),
    );
    expect(onOpenArtist).toHaveBeenCalledWith("Michael Stanley Band");

    await user.type(screen.getByRole("searchbox", { name: "Search updates" }), "Django");

    await waitFor(() => {
      expect(screen.getByText("Django Reinhardt")).toBeInTheDocument();
      expect(screen.queryByText("Pepsi & Shirlie")).not.toBeInTheDocument();
    });
  });

  it("summarizes artist impact and lists newly added artists separately", async () => {
    const user = userEvent.setup();
    const onSelectUpdate = vi.fn();
    const onOpenArtist = vi.fn();
    render(
      <UpdatesWorkspace
        selectedUpdateId={null}
        onSelectUpdate={onSelectUpdate}
        onOpenArtist={onOpenArtist}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Artists" }));

    expect(await screen.findByText("Hans Zimmer")).toBeInTheDocument();
    expect(screen.getByText("34 tracks removed")).toBeInTheDocument();
    expect(screen.getByText("3 albums removed")).toBeInTheDocument();
    expect(screen.getByText("12 tracks added")).toBeInTheDocument();
    expect(screen.getAllByText("1 album added").length).toBeGreaterThan(0);
    expect(screen.getByText("27 changes")).toBeInTheDocument();
    expect(screen.getAllByText("1 album removed")).toHaveLength(1);

    expect(screen.getByRole("heading", { name: "New artists" })).toBeInTheDocument();
    expect(screen.getAllByText("Thorleifs").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(
        (_content, element) =>
          element?.getAttribute("datetime") === "2026-07-31T10:03:00.000Z",
      ).length,
    ).toBeGreaterThan(0);

    await user.click(
      screen.getByRole("button", { name: "Open Hans Zimmer in Artists" }),
    );
    expect(onOpenArtist).toHaveBeenCalledWith("Hans Zimmer");
  });

  it("reloads when an external catalog revision arrives", async () => {
    const listUpdates = vi.spyOn(backend, "listLibraryUpdates");
    const props = {
      selectedUpdateId: null,
      onSelectUpdate: vi.fn(),
      onOpenArtist: vi.fn(),
    };
    const { rerender } = render(
      <UpdatesWorkspace {...props} catalogRefreshKey={1} />,
    );

    await waitFor(() => expect(listUpdates).toHaveBeenCalled());
    const callsBeforeRevision = listUpdates.mock.calls.length;

    rerender(<UpdatesWorkspace {...props} catalogRefreshKey={2} />);

    await waitFor(() =>
      expect(listUpdates.mock.calls.length).toBeGreaterThan(callsBeforeRevision),
    );
    listUpdates.mockRestore();
  });
});
