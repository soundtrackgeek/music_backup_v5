import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type {
  DiscoveryMixerResponse,
  DiscoveryMixerSeedOption,
} from "../types";
import { DiscoveryMixer } from "./DiscoveryMixer";

const seeds: DiscoveryMixerSeedOption[] = [
  {
    kind: "artist",
    id: "depeche mode",
    title: "Depeche Mode",
    subtitle: "14 albums · Synthpop",
    artist: null,
    coverPath: null,
  },
  {
    kind: "album",
    id: "hysteria",
    title: "Hysteria",
    subtitle: "Def Leppard · 1987 · Hard Rock",
    artist: "Def Leppard",
    coverPath: null,
  },
];

const response: DiscoveryMixerResponse = {
  seeds,
  explorePercent: 80,
  matchingCount: 12,
  lastfmLinkedCount: 9,
  evidence:
    "9 cached Last.fm matches · 12 local candidates · duplicate albums and seed artists excluded",
  recommendations: [
    {
      albumId: "songs-from-the-big-chair",
      album: "Songs from the Big Chair",
      artist: "Tears for Fears",
      releaseYear: 1985,
      genre: "New Wave",
      coverPath: null,
      ratingCompleteness: 0.2,
      reason: "Similar artist",
      seedLabels: ["Depeche Mode", "Hysteria"],
      evidence: [
        "Last.fm links Tears for Fears to Depeche Mode · 88% match",
        "Also connects to Hysteria",
        "Explore balance signal · 20% of tracks rated · 0 loved tracks",
      ],
      rankingScore: 0.812,
    },
  ],
};

describe("DiscoveryMixer", () => {
  it("selects mixed seeds with the keyboard, generates, explains, and opens a result", async () => {
    const user = userEvent.setup();
    const onSearchSeeds = vi.fn().mockResolvedValue(seeds);
    const onGenerate = vi.fn().mockResolvedValue(response);
    const onOpenAlbum = vi.fn();
    render(
      <DiscoveryMixer
        onSearchSeeds={onSearchSeeds}
        onGenerate={onGenerate}
        onOpenAlbum={onOpenAlbum}
      />,
    );

    await waitFor(() => expect(onSearchSeeds).toHaveBeenCalled());
    const artistSeed = await screen.findByRole("button", {
      name: "Add Depeche Mode artist as a seed",
    });
    artistSeed.focus();
    await user.keyboard("{Enter}");
    expect(
      screen.getByRole("button", { name: "Depeche Mode is already selected" }),
    ).toBeDisabled();

    const albumSeed = screen.getByRole("button", {
      name: "Add Hysteria album as a seed",
    });
    albumSeed.focus();
    await user.keyboard(" ");
    expect(screen.getByLabelText("2 of 8 seeds selected")).toBeInTheDocument();

    fireEvent.change(
      screen.getByRole("slider", { name: "Familiar versus explore balance" }),
      { target: { value: "80" } },
    );
    await user.click(screen.getByRole("button", { name: "Generate local mix" }));

    await waitFor(() =>
      expect(onGenerate).toHaveBeenCalledWith({
        seeds: [
          { kind: "artist", id: "depeche mode" },
          { kind: "album", id: "hysteria" },
        ],
        explorePercent: 80,
        limit: 12,
      }),
    );
    expect(
      screen.getByText("Last.fm links Tears for Fears to Depeche Mode · 88% match"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "9 cached Last.fm matches · 12 local candidates · duplicate albums and seed artists excluded",
      ),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "Open Songs from the Big Chair by Tears for Fears in Albums",
      }),
    );
    expect(onOpenAlbum).toHaveBeenCalledWith("songs-from-the-big-chair");
  });

  it("keeps stale results visible and announces when a seed is removed", async () => {
    const user = userEvent.setup();
    render(
      <DiscoveryMixer
        onSearchSeeds={vi.fn().mockResolvedValue(seeds)}
        onGenerate={vi.fn().mockResolvedValue(response)}
        onOpenAlbum={() => undefined}
      />,
    );

    await user.click(
      await screen.findByRole("button", {
        name: "Add Depeche Mode artist as a seed",
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Add Hysteria album as a seed" }),
    );
    await user.click(screen.getByRole("button", { name: "Generate local mix" }));
    await screen.findByText("Songs from the Big Chair");

    await user.click(screen.getByRole("button", { name: "Remove Hysteria seed" }));
    expect(screen.getByText("Songs from the Big Chair")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Settings changed · generate again to update these results.",
      ),
    ).toHaveAttribute("role", "status");
    expect(screen.getByRole("button", { name: "Generate local mix" })).toBeDisabled();
  });
});
