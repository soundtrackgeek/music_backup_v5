import { describe, expect, it } from "vitest";
import { createRequest } from "./app/requests";
import { candidateScore, defaultMixtapeConfig, mixtapePlaylist, sequenceMixtape, swapMixtapeTrack, validateMixtape, type JevAssessment, type MixtapeDraft } from "./mixtape";
import type { AiPlaylistTrack } from "./types";

export function fixtureTape(count = 40): MixtapeDraft {
  const pool: AiPlaylistTrack[] = Array.from({ length: count }, (_, i) => ({ trackId: i + 1, albumId: `album-${i}`, album: `Album ${i + 1}`, albumArtist: `Artist ${i + 1}`, displayArtist: `Artist ${i + 1}`, title: `Track ${i + 1}`, genre: "Synthpop", year: 1984, seconds: 180 + (i % 5) * 25, rating: 90 - i, loved: false, filePath: "C:/music", filename: `${i}.mp3` }));
  return { version: 1, config: structuredClone(defaultMixtapeConfig), pool, notes: {}, assessments: [], scoredBriefs: null, sides: [[], []] };
}

describe("two-sided mixtape constraints", () => {
  it("fits two duration limits, excludes unknown lengths, and never repeats a track", () => {
    const tape = fixtureTape(); tape.config.minutes = [17, 23]; tape.pool[0].seconds = 0;
    const result = sequenceMixtape(tape);
    expect(result.sides.every((side) => side.length > 0)).toBe(true);
    result.sides.forEach((side, i) => expect(side.reduce((sum, slot) => sum + tape.pool.find((track) => track.trackId === slot.trackId)!.seconds, 0)).toBeLessThanOrEqual(tape.config.minutes[i] * 60));
    const ids = result.sides.flat().map((slot) => slot.trackId);
    expect(new Set(ids).size).toBe(ids.length); expect(ids).not.toContain(1);
  });

  it("enforces album and case-insensitive artist caps across both sides", () => {
    const tape = fixtureTape(); tape.config.maxArtist = 1; tape.config.maxAlbum = 1;
    tape.pool[0].displayArtist = "Same artist"; tape.pool[1].displayArtist = " SAME ARTIST ";
    tape.pool[2].albumId = tape.pool[3].albumId;
    const result = sequenceMixtape(tape); const ids = result.sides.flat().map((slot) => slot.trackId);
    expect(ids.filter((id) => [1, 2].includes(id))).toHaveLength(1);
    expect(ids.filter((id) => [3, 4].includes(id))).toHaveLength(1);
  });

  it("keeps exact locked positions and transition pairs through changed weights", () => {
    const tape = sequenceMixtape(fixtureTape());
    tape.sides[0][2].transitionToNext = true; tape.sides[1][4].locked = true;
    const before = structuredClone(tape.sides);
    tape.pool.reverse(); tape.config.weights = { atmosphere: 10, role: 90, rating: 0 };
    const after = sequenceMixtape(tape);
    expect(after.sides[0].slice(2, 4)).toEqual(before[0].slice(2, 4));
    expect(after.sides[1][4]).toEqual(before[1][4]);
    expect(() => swapMixtapeTrack(after, 0, 2)).toThrow(/Unlock/);
    expect(() => swapMixtapeTrack(after, 0, 3)).toThrow(/Unlock/);
  });

  it("fails without changing a draft when a tightened cap conflicts with a lock", () => {
    const tape = sequenceMixtape(fixtureTape()); tape.sides[0][0].locked = true;
    tape.config.minutes[0] = 1; const before = structuredClone(tape);
    expect(() => sequenceMixtape(tape)).toThrow(/exceeds/); expect(tape).toEqual(before);
  });

  it("swaps only with an unused fitting candidate and preserves roles and all other slots", () => {
    const tape = sequenceMixtape(fixtureTape()); const before = structuredClone(tape);
    tape.sides[0][0].role = "breather";
    const swapped = swapMixtapeTrack(tape, 0, 0);
    expect(swapped.sides[0][0].trackId).not.toBe(tape.sides[0][0].trackId);
    expect(swapped.sides[0][0].role).toBe("breather");
    expect(swapped.sides[0].slice(1)).toEqual(before.sides[0].slice(1));
    expect(swapped.sides[1]).toEqual(before.sides[1]); validateMixtape(swapped);
  });

  it("combines independent scores under user weights without new judgments", () => {
    const tape = fixtureTape();
    const score = (n: number) => ({ score: n, confidence: .4 });
    tape.assessments = [{ trackId: 1, sideA: score(.9), sideB: score(.1), opener: score(.2), builder: score(.8), breather: score(.5), closer: score(.7) } satisfies JevAssessment];
    tape.config.weights = { atmosphere: 80, role: 20, rating: 0 };
    expect(candidateScore(tape, tape.pool[0], 0, "opener")).toBeCloseTo(.76);
    tape.config.weights = { atmosphere: 20, role: 80, rating: 0 };
    expect(candidateScore(tape, tape.pool[0], 0, "opener")).toBeCloseTo(.34);
  });

  it("saves a compatible flat A-then-B order alongside the complete editable draft", () => {
    const tape = sequenceMixtape(fixtureTape()); tape.sides[0][0].transitionToNext = true; tape.notes["1"] = "Bright synths";
    const playlist = mixtapePlaylist(tape, createRequest("tracks"), "Local mixtape", { inputTokens: null, outputTokens: null, cachedInputTokens: null });
    expect(playlist.tracks.map((track) => track.trackId)).toEqual(tape.sides.flat().map((slot) => slot.trackId));
    expect(JSON.parse(JSON.stringify(playlist)).mixtape).toEqual(tape);
  });

  it("handles many duration budgets without overfilling or losing locked identities", () => {
    for (let minutes = 6; minutes <= 60; minutes += 3) {
      const tape = fixtureTape(60); tape.config.minutes = [minutes, minutes + 2];
      const built = sequenceMixtape(tape); built.sides[0][0].locked = true;
      const rebuilt = sequenceMixtape(built); validateMixtape(rebuilt);
      expect(rebuilt.sides[0][0]).toEqual(built.sides[0][0]);
    }
  });

  it("rejects zero weights, invalid limits, duplicates and dangling transitions", () => {
    const tape = sequenceMixtape(fixtureTape()); tape.config.weights = { atmosphere: 0, role: 0, rating: 0 };
    expect(() => validateMixtape(tape)).toThrow(/weight/);
    tape.config.weights.rating = 1; tape.sides[1][0].trackId = tape.sides[0][0].trackId;
    expect(() => validateMixtape(tape)).toThrow(/once/);
    const other = sequenceMixtape(fixtureTape()); other.sides[0][other.sides[0].length - 1].transitionToNext = true;
    expect(() => validateMixtape(other)).toThrow(/following/);
  });
});
