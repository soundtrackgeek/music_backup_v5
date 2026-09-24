import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as backend from "../backend";
import { PlaylistBuilderWorkspace } from "../workspaces/PlaylistBuilderWorkspace";
import { createRequest } from "../app/requests";
import { defaultMixtapeConfig, mixtapePlaylist, sequenceMixtape, type MixtapeDraft } from "../mixtape";

function draft() {
  const tape: MixtapeDraft = { version: 1, config: structuredClone(defaultMixtapeConfig), notes: {}, assessments: [], scoredBriefs: null, sides: [[], []], pool: Array.from({ length: 36 }, (_, i) => ({ trackId: i + 101, albumId: `mixtape-${i}`, album: `Album ${i}`, albumArtist: `Artist ${i}`, displayArtist: `Artist ${i}`, title: `Tape track ${i}`, genre: "Rock", year: 1985, seconds: 240, rating: 100 - i, loved: false, filePath: "C:/music", filename: `${i}.mp3` })) };
  return mixtapePlaylist(sequenceMixtape(tape), createRequest("tracks"), "Local mixtape", { inputTokens: null, outputTokens: null, cachedInputTokens: null });
}

describe("mixtape editing workflow", () => {
  it("locks a transition, preserves it on rebuild, swaps another track and reopens the saved sides", async () => {
    const initial = draft();
    render(<PlaylistBuilderWorkspace isAvailable launch={{ id: 501, cohortTitle: "Tape candidates", prompt: initial.prompt, request: initial.request, draft: initial }} />);
    expect(screen.getByLabelText("Side A preview")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Lock transition after Tape track 0" }));
    expect(screen.getByRole("button", { name: "Swap Tape track 0" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Swap Tape track 2" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Build locally" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Unlock transition after Tape track 0" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Swap Tape track 4" }));
    expect(within(screen.getByLabelText("Side A preview")).queryByText("Tape track 4")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Playlist name"), { target: { value: "Mixtape regression" } });
    fireEvent.click(screen.getByRole("button", { name: "Save playlist" }));
    await screen.findByRole("button", { name: "Update saved" });
    expect(screen.queryByRole("checkbox", { name: /Smart playlist/ })).not.toBeInTheDocument();
    fireEvent.click(within(screen.getByLabelText("Saved playlists")).getByRole("button", { name: /^Mixtape regression/ }));
    expect(screen.getByRole("button", { name: "Unlock transition after Tape track 0" })).toBeEnabled();
    expect(screen.getByLabelText("Side B preview")).toBeVisible();
  });

  it("keeps the current draft on provider failure and offers an explicit local build", async () => {
    vi.spyOn(backend, "scoreMixtapeCandidates").mockRejectedValueOnce(new Error("OpenRouter unavailable"));
    const initial = draft();
    render(<PlaylistBuilderWorkspace isAvailable launch={{ id: 502, cohortTitle: "Tape", prompt: initial.prompt, request: initial.request, draft: initial }} />);
    fireEvent.click(screen.getByRole("button", { name: "Score with Jev & build" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("OpenRouter unavailable");
    expect(within(screen.getByLabelText("Side A preview")).getByText("Tape track 0", { selector: "strong" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Build locally" })).toBeEnabled();
  });

  it("reuses scores for weight changes but invalidates them when a brief changes", async () => {
    const initial = draft();
    const score = { score: .7, confidence: .4 };
    const scoring = vi.spyOn(backend, "scoreMixtapeCandidates").mockResolvedValue({ model: "typesafe/jev-1.13-test", usage: initial.usage, assessments: initial.mixtape!.pool.map((track) => ({ trackId: track.trackId, sideA: score, sideB: score, opener: score, builder: score, breather: score, closer: score })) });
    render(<PlaylistBuilderWorkspace isAvailable launch={{ id: 503, cohortTitle: "Tape", prompt: initial.prompt, request: initial.request, draft: initial }} />);
    fireEvent.click(screen.getByRole("button", { name: "Score with Jev & build" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Rebuild from saved scores" })).toBeEnabled());
    fireEvent.change(screen.getByLabelText("atmosphere weight"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "Lock transition after Tape track 0" }));
    expect(screen.getByLabelText("atmosphere weight")).toHaveValue("20");
    fireEvent.click(screen.getByRole("button", { name: "Rebuild from saved scores" }));
    expect(scoring).toHaveBeenCalledOnce();
    fireEvent.change(screen.getByLabelText("Side B brief"), { target: { value: "A different evening" } });
    expect(screen.getByRole("button", { name: "Rebuild from saved scores" })).toBeDisabled();
  });
});
