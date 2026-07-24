import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PlaylistBuilderWorkspace } from "./PlaylistBuilderWorkspace";
import { createRequest } from "../app/requests";

describe("playlist builder workspace", () => {
  it("opens with a reviewable cohort prompt without calling Luna", () => {
    const onLaunchConsumed = vi.fn();
    render(
      <PlaylistBuilderWorkspace
        isAvailable
        launch={{
          id: 7,
          cohortTitle: "1980s albums",
          prompt: "Build only from albums released from 1980 through 1989.",
          request: createRequest("albums"),
        }}
        onLaunchConsumed={onLaunchConsumed}
      />,
    );

    expect(screen.getByLabelText("Playlist request")).toHaveValue(
      "Build only from albums released from 1980 through 1989.",
    );
    expect(screen.getByText("1980s albums")).toBeInTheDocument();
    expect(screen.queryByText("What Have I Done to Deserve This?")).toBeNull();
    expect(onLaunchConsumed).toHaveBeenCalledOnce();
  });

  it("builds a reviewable draft and explicitly stores its exact track order", async () => {
    const { container } = render(<PlaylistBuilderWorkspace isAvailable />);

    fireEvent.change(screen.getByLabelText("Playlist request"), {
      target: { value: "A varied loved synthpop playlist" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Build playlist" }));

    expect(
      await screen.findByText("What Have I Done to Deserve This?"),
    ).toBeInTheDocument();
    expect(screen.getByText("2 tracks")).toBeInTheDocument();
    const lovedTrack = screen
      .getByText("What Have I Done to Deserve This?")
      .closest("article");
    const unlovedTrack = screen.getByText("Nascence").closest("article");
    expect(
      lovedTrack?.querySelector(".playlist-track-year"),
    ).toHaveTextContent("1987");
    expect(
      lovedTrack?.querySelector('[aria-label="Track rating 100 out of 100"]'),
    ).toBeInTheDocument();
    expect(
      lovedTrack?.querySelector('[aria-label="Loved track"]'),
    ).toBeInTheDocument();
    expect(
      unlovedTrack?.querySelector(".playlist-track-year"),
    ).toHaveTextContent("2012");
    expect(
      unlovedTrack?.querySelector('[aria-label="Loved track"]'),
    ).not.toBeInTheDocument();
    expect(container.querySelectorAll(".playlist-track-actions")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Save playlist" }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Update saved" }),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("Luna preview mix")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove What Have I Done to Deserve This?",
      }),
    );
    expect(
      screen.queryByText("What Have I Done to Deserve This?"),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /^Luna preview mix/i }),
    );
    expect(
      screen.getByText("What Have I Done to Deserve This?"),
    ).toBeInTheDocument();
  });
});
