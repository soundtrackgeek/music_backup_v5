import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OutsideLibraryDiscovery } from "./OutsideLibraryDiscovery";

describe("outside-library discovery", () => {
  it("discovers artists, albums, and songs and reopens an exact saved result", async () => {
    const { unmount } = render(<OutsideLibraryDiscovery isAvailable />);

    let prompt = screen.getByLabelText("Discovery request");
    fireEvent.change(prompt, {
      target: { value: "Find me 5 artists from 1992 that I don't have" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Discover" }));

    expect(await screen.findByText("Porcupine Tree")).toBeInTheDocument();
    expect(screen.getByText("5 artists · releases from 1992")).toBeInTheDocument();
    expect(screen.getByText("3 owned excluded")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save list" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Update saved" })).toBeInTheDocument();
    });

    unmount();
    render(<OutsideLibraryDiscovery isAvailable />);
    expect(await screen.findByText("Artists outside my library")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Artists outside my library").closest("button")!);
    expect(screen.getByText("Porcupine Tree")).toBeInTheDocument();

    prompt = screen.getByLabelText("Discovery request");

    fireEvent.change(prompt, {
      target: { value: "Show me 8 albums from 1992 I don't own" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Discover" }));
    expect(await screen.findByText("Images and Words")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Artists outside my library").closest("button")!);
    expect(screen.getByText("Porcupine Tree")).toBeInTheDocument();
    expect(screen.queryByText("Images and Words")).not.toBeInTheDocument();

    fireEvent.change(prompt, {
      target: { value: "Find 10 songs from 1992 I don't own" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Discover" }));
    expect(await screen.findByText("Friday I'm in Love")).toBeInTheDocument();
  });
});
