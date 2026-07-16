import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PlaylistBuilderWorkspace } from "./PlaylistBuilderWorkspace";

describe("playlist builder workspace", () => {
  it("builds a reviewable draft and explicitly stores its exact track order", async () => {
    render(<PlaylistBuilderWorkspace isAvailable />);

    fireEvent.change(screen.getByLabelText("Playlist request"), {
      target: { value: "A varied loved synthpop playlist" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Build playlist" }));

    expect(
      await screen.findByText("What Have I Done to Deserve This?"),
    ).toBeInTheDocument();
    expect(screen.getByText("2 tracks")).toBeInTheDocument();

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
