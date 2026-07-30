import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

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
});
