import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import App from "./App";
import { mockArtists } from "./backend/webPreview";

const originals = structuredClone(mockArtists);
beforeEach(() => {
  mockArtists.splice(0, mockArtists.length, ...structuredClone(originals));
  const artist = mockArtists.find((row) => row.id === "pet shop boys")!;
  artist.originCountryCode = null;
  artist.originCountryName = null;
});
afterEach(() => mockArtists.splice(0, mockArtists.length, ...structuredClone(originals)));

async function openUnresolved() {
  render(<App />);
  const nav = within(screen.getByRole("complementary", { name: "Main navigation" }));
  fireEvent.click(nav.getByRole("button", { name: "Artists" }));
  fireEvent.click(await screen.findByRole("button", { name: "Unresolved artists" }));
  expect(screen.getByRole("tab", { name: "Artist info" })).toHaveAttribute("aria-selected", "true");
  return nav;
}

describe("Unresolved artists", () => {
  it("auto-resolves missing MBIDs and keeps a direct review link after the artist leaves the list", async () => {
    const nav = await openUnresolved();
    expect(screen.getByLabelText("Artists to try")).toHaveValue(10);
    fireEvent.change(screen.getByLabelText("Missing information"), { target: { value: "mbid" } });
    fireEvent.change(screen.getByLabelText("Artists to try"), { target: { value: "1" } });
    await screen.findByRole("button", { name: "Complete info for Head East" });
    fireEvent.click(screen.getByRole("button", { name: "Auto-resolve & update" }));
    const batch = within(screen.getByRole("region", { name: "Auto-resolve artists" }));
    expect(await batch.findByText(/Finished checking 1 artist/)).toBeVisible();
    expect(batch.getByRole("link", { name: "MusicBrainz (US)" })).toHaveAttribute("href", "https://musicbrainz.org/artist/1f6fdb90-95a2-419e-9994-b406d562caac");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Complete info for Head East" })).not.toBeInTheDocument());
    expect(mockArtists.find((row) => row.id === "head east")?.musicBrainzArtistType).toBe("Group");
    fireEvent.click(nav.getByRole("button", { name: "Search" }));
    fireEvent.click(nav.getByRole("button", { name: "Artists" }));
    expect(await screen.findByLabelText("Artists to try")).toHaveValue(1);
    expect(screen.getByRole("link", { name: "MusicBrainz (US)" })).toBeVisible();
  });

  it("returns to an available page after resolving the last result on a page", async () => {
    const template = mockArtists.find((row) => row.id === "pet shop boys")!;
    for (let index = 0; index < 10; index++) {
      mockArtists.push({ ...template, id: `a${index}`, name: `A ${index}` });
    }
    await openUnresolved();
    fireEvent.change(screen.getByLabelText("Missing information"), { target: { value: "originCountry" } });
    fireEvent.click(screen.getByLabelText("Only this field missing"));
    fireEvent.change(screen.getByLabelText("Rows"), { target: { value: "10" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Next artist page" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Next artist page" }));
    fireEvent.click(await screen.findByRole("button", { name: "Complete info for Pet Shop Boys" }));
    await waitFor(() => expect(screen.getByLabelText("Origin Country")).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Origin Country"), { target: { value: "GB" } });
    fireEvent.click(screen.getByRole("button", { name: "Save manual origin country" }));
    expect(await screen.findByRole("button", { name: "Complete info for A 0" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Previous artist page" })).toBeDisabled();
    expect(screen.getByRole("tab", { name: "Artist info" })).toHaveAttribute("aria-selected", "true");
  });

  it("filters exact missing country and removes a corrected artist from the results", async () => {
    await openUnresolved();
    fireEvent.change(screen.getByLabelText("Missing information"), { target: { value: "originCountry" } });
    fireEvent.click(screen.getByLabelText("Only this field missing"));
    const results = within(screen.getByRole("region", { name: "Unresolved artists" }));
    const artist = await results.findByRole("button", { name: "Complete info for Pet Shop Boys" });
    fireEvent.click(artist);
    await waitFor(() => expect(screen.getByLabelText("Origin Country")).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Origin Country"), { target: { value: "GB" } });
    fireEvent.click(screen.getByRole("button", { name: "Save manual origin country" }));
    expect(await results.findByText("No unresolved artists match these filters.")).toBeVisible();
    expect(screen.getByLabelText("Missing information")).toHaveValue("originCountry");
    expect(screen.getByLabelText("Only this field missing")).toBeChecked();
    expect(mockArtists.find((row) => row.id === "pet shop boys")?.originCountryCode).toBe("GB");
  });

  it("sorts, filters Year, preserves the page across navigation, and clears within unresolved", async () => {
    const nav = await openUnresolved();
    const results = within(screen.getByRole("region", { name: "Unresolved artists" }));
    await results.findByRole("button", { name: "Complete info for Head East" });
    fireEvent.change(screen.getByLabelText("Artist order"), { target: { value: "desc" } });
    await waitFor(() => expect(results.getAllByRole("button", { name: /^Complete info/ })[0]).toHaveAccessibleName("Complete info for Pet Shop Boys"));
    fireEvent.change(screen.getByLabelText("Artist order"), { target: { value: "recent" } });
    await waitFor(() => expect(results.getAllByRole("button", { name: /^Complete info/ })[0]).toHaveAccessibleName("Complete info for Pet Shop Boys"));
    fireEvent.change(screen.getByLabelText("Year from"), { target: { value: "1987" } });
    fireEvent.change(screen.getByLabelText("Year to"), { target: { value: "1987" } });
    await waitFor(() => expect(results.queryByRole("button", { name: "Complete info for Head East" })).not.toBeInTheDocument());
    expect(results.getByRole("button", { name: "Complete info for Pet Shop Boys" })).toBeVisible();
    fireEvent.click(nav.getByRole("button", { name: "Search" }));
    fireEvent.click(nav.getByRole("button", { name: "Artists" }));
    expect(await screen.findByLabelText("Year from")).toHaveValue(1987);
    fireEvent.click(screen.getByRole("button", { name: "Clear artist filters" }));
    expect(screen.getByRole("button", { name: "Unresolved artists" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByLabelText("Year from")).toHaveValue(null);
    expect(await screen.findByRole("button", { name: "Complete info for Head East" })).toBeVisible();
  });
});
