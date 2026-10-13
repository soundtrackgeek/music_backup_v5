import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ArtistPortrait } from "./ArtistPortrait";

vi.mock("../backend", () => ({ getArtistImageUrl: () => Promise.resolve("http://cover.localhost/artist/coldplay") }));
vi.mock("../backend/artwork", () => ({ useArtworkRevision: () => 0 }));
vi.mock("../backend/artistArtwork", () => ({ getArtistPortraitCredit: () => Promise.resolve({ provider: "Wikimedia Commons", author: "Raph_PH", license: "CC BY 4.0", sourceUrl: "https://commons.wikimedia.org/wiki/File:Coldplay.jpg" }) }));

it("retains Commons attribution on shared portraits outside Artist Overview", async () => {
  render(<ArtistPortrait artistId="coldplay" artistName="Coldplay" portraitAvailable decorative={false} />);
  expect(await screen.findByTitle("Coldplay portrait · Raph_PH · CC BY 4.0 · Wikimedia Commons · https://commons.wikimedia.org/wiki/File:Coldplay.jpg")).toBeInTheDocument();
  expect(screen.getByRole("img", { name: "Coldplay portrait" })).toBeInTheDocument();
});
