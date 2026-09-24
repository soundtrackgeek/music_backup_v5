import type { AiPlaylist, AiPlaylistTrack, AiUsage, BrowseRequest } from "./types";

export const mixtapeRoles = ["opener", "builder", "breather", "closer"] as const;
export type MixtapeRole = typeof mixtapeRoles[number];
export type JevScore = { score: number; confidence: number };
export type JevAssessment = { trackId: number } & Record<MixtapeRole | "sideA" | "sideB", JevScore>;
export type JevResult = { assessments: JevAssessment[]; model: string; usage: AiUsage };
export type MixtapeConfig = {
  briefs: [string, string];
  minutes: [number, number];
  maxArtist: number;
  maxAlbum: number;
  weights: { atmosphere: number; role: number; rating: number };
};
export type MixtapeSlot = { trackId: number; role: MixtapeRole; locked: boolean; transitionToNext: boolean };
export type MixtapeDraft = {
  version: 1;
  config: MixtapeConfig;
  pool: AiPlaylistTrack[];
  notes: Record<string, string>;
  assessments: JevAssessment[];
  scoredBriefs: [string, string] | null;
  sides: [MixtapeSlot[], MixtapeSlot[]];
};

export const defaultMixtapeConfig: MixtapeConfig = {
  briefs: ["Friday night: bright, inviting, gathering momentum", "The drive home: reflective, spacious, a gentle landing"],
  minutes: [45, 45], maxArtist: 2, maxAlbum: 1,
  weights: { atmosphere: 60, role: 30, rating: 10 },
};

export function mixtapeDuration(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function artistKey(track: AiPlaylistTrack) {
  return (track.displayArtist?.trim() || track.albumArtist?.trim() || "Unknown artist").toLowerCase();
}

export function slotProtected(slots: MixtapeSlot[], index: number) {
  return slots[index]?.locked || slots[index]?.transitionToNext || (index > 0 && slots[index - 1]?.transitionToNext);
}

export function validateMixtape(tape: MixtapeDraft) {
  const { config, pool, sides } = tape;
  if (config.briefs.some((brief) => !brief.trim() || brief.length > 600)) throw new Error("Describe each side in 1–600 characters.");
  if (config.minutes.some((minutes) => !Number.isInteger(minutes) || minutes < 1 || minutes > 90)) throw new Error("Each side must be between 1 and 90 whole minutes.");
  if ([config.maxArtist, config.maxAlbum].some((cap) => !Number.isInteger(cap) || cap < 1 || cap > 10)) throw new Error("Repeat caps must be between 1 and 10 across the whole tape.");
  const weights = Object.values(config.weights);
  if (weights.some((weight) => !Number.isFinite(weight) || weight < 0 || weight > 100) || weights.every((weight) => weight === 0)) throw new Error("Set at least one scoring weight above zero.");
  const tracks = new Map(pool.map((track) => [track.trackId, track]));
  const seen = new Set<number>();
  const artists = new Map<string, number>();
  const albums = new Map<string, number>();
  sides.forEach((slots, side) => {
    let seconds = 0;
    slots.forEach((slot, index) => {
      const track = tracks.get(slot.trackId);
      if (!track || !Number.isSafeInteger(track.seconds) || track.seconds <= 0) throw new Error("Every selected track needs a known, positive duration.");
      if (seen.has(track.trackId)) throw new Error("A track can appear only once on the tape.");
      if (!mixtapeRoles.includes(slot.role)) throw new Error("Choose one of the four supported roles.");
      if (slot.transitionToNext && index === slots.length - 1) throw new Error("A transition lock needs a following track on the same side.");
      seen.add(track.trackId);
      seconds += track.seconds;
      const artist = artistKey(track);
      artists.set(artist, (artists.get(artist) ?? 0) + 1);
      albums.set(track.albumId, (albums.get(track.albumId) ?? 0) + 1);
    });
    if (seconds > config.minutes[side] * 60) throw new Error(`Side ${side === 0 ? "A" : "B"} exceeds its duration limit. Increase the limit or unlock/remove a track.`);
  });
  if ([...artists.values()].some((count) => count > config.maxArtist)) throw new Error("The tape exceeds the artist repeat cap. Raise the cap or unlock/remove a track.");
  if ([...albums.values()].some((count) => count > config.maxAlbum)) throw new Error("The tape exceeds the album repeat cap. Raise the cap or unlock/remove a track.");
}

export function candidateScore(tape: MixtapeDraft, track: AiPlaylistTrack, side: number, role: MixtapeRole) {
  const assessment = tape.assessments.find((entry) => entry.trackId === track.trackId);
  const { atmosphere, role: roleWeight, rating } = tape.config.weights;
  if (!assessment) return (track.rating ?? 0) / 100;
  const total = atmosphere + roleWeight + rating;
  return (atmosphere * assessment[side === 0 ? "sideA" : "sideB"].score + roleWeight * assessment[role].score + rating * (track.rating ?? 0) / 100) / total;
}

/** Locked slots retain their exact side, position, role and adjacent transition. */
export function sequenceMixtape(tape: MixtapeDraft): MixtapeDraft {
  const sides: [MixtapeSlot[], MixtapeSlot[]] = [[], []];
  const skeleton = tape.sides.map((slots) => slots.map((slot, index) => slotProtected(slots, index) ? { ...slot } : null));
  const used = new Set(skeleton.flat().flatMap((slot) => slot ? [slot.trackId] : []));
  const tracks = new Map(tape.pool.map((track) => [track.trackId, track]));
  const protectedTape = { ...tape, sides: skeleton.map((side) => side.filter((slot): slot is MixtapeSlot => slot !== null).map((slot) => ({ ...slot, transitionToNext: false }))) as MixtapeDraft["sides"] };
  validateMixtape(protectedTape);
  const counts = (key: (track: AiPlaylistTrack) => string) => {
    const result = new Map<string, number>();
    used.forEach((id) => { const track = tracks.get(id)!; const value = key(track); result.set(value, (result.get(value) ?? 0) + 1); });
    return result;
  };
  const artists = counts(artistKey);
  const albums = counts((track) => track.albumId);
  const reservedSeconds = skeleton.map((side) => side.reduce((sum, slot) => sum + (slot ? tracks.get(slot.trackId)!.seconds : 0), 0));
  // Alternate sides so one side cannot exhaust all candidates before the other begins.
  for (let index = 0; index < 60; index++) {
    for (const side of [0, 1] as const) {
      const existing = skeleton[side][index];
      if (existing) { sides[side].push(existing); continue; }
      const allocated = sides[side].reduce((sum, slot) => sum + (used.has(slot.trackId) && skeleton[side].some((locked) => locked?.trackId === slot.trackId) ? 0 : tracks.get(slot.trackId)!.seconds), 0);
      const remaining = tape.config.minutes[side] * 60 - reservedSeconds[side] - allocated;
      const role: MixtapeRole = tape.sides[side][index]?.role ?? (index === 0 ? "opener" : remaining < 420 ? "closer" : index % 4 === 3 ? "breather" : "builder");
      const candidates = tape.pool.filter((track) => !used.has(track.trackId) && track.seconds > 0 && track.seconds <= remaining && (artists.get(artistKey(track)) ?? 0) < tape.config.maxArtist && (albums.get(track.albumId) ?? 0) < tape.config.maxAlbum)
        .sort((a, b) => candidateScore(tape, b, side, role) - candidateScore(tape, a, side, role) || a.trackId - b.trackId);
      const selected = candidates[0];
      if (!selected) {
        if (skeleton[side].slice(index + 1).some(Boolean)) throw new Error("Cannot fill a position before a locked selection within these limits. Add candidates, raise the limits, or unlock it.");
        continue;
      }
      // Once this side stops, never create a gap that could move a locked slot.
      if (sides[side].length !== index) continue;
      sides[side].push({ trackId: selected.trackId, role, locked: false, transitionToNext: false });
      used.add(selected.trackId);
      artists.set(artistKey(selected), (artists.get(artistKey(selected)) ?? 0) + 1);
      albums.set(selected.albumId, (albums.get(selected.albumId) ?? 0) + 1);
    }
  }
  const result = { ...tape, sides };
  validateMixtape(result);
  if (sides.some((side) => side.length === 0)) throw new Error("Not enough eligible tracks to fill both sides under these duration and repeat limits.");
  return result;
}

export function swapMixtapeTrack(tape: MixtapeDraft, side: 0 | 1, index: number): MixtapeDraft {
  if (slotProtected(tape.sides[side], index)) throw new Error("Unlock this selection or transition before swapping it.");
  const used = new Set(tape.sides.flat().map((slot) => slot.trackId));
  const slot = tape.sides[side][index];
  const candidates = tape.pool.filter((track) => !used.has(track.trackId)).sort((a, b) => candidateScore(tape, b, side, slot.role) - candidateScore(tape, a, side, slot.role) || a.trackId - b.trackId);
  for (const track of candidates) {
    const sides = tape.sides.map((slots, s) => slots.map((entry, i) => s === side && i === index ? { ...entry, trackId: track.trackId } : entry)) as MixtapeDraft["sides"];
    const result = { ...tape, sides };
    try { validateMixtape(result); return result; } catch { /* Try the next candidate that fits all limits. */ }
  }
  throw new Error("No unused candidate fits this slot within the duration and repeat limits.");
}

export function mixtapePlaylist(tape: MixtapeDraft, request: BrowseRequest, model: string, usage: AiUsage): AiPlaylist {
  validateMixtape(tape);
  const byId = new Map(tape.pool.map((track) => [track.trackId, track]));
  const tracks = tape.sides.flat().map((slot) => byId.get(slot.trackId)!);
  return {
    name: `${tape.config.briefs[0].split(":")[0].slice(0, 40)} / ${tape.config.briefs[1].split(":")[0].slice(0, 40)}`, prompt: `Side A: ${tape.config.briefs[0]}\nSide B: ${tape.config.briefs[1]}`,
    description: `Two-sided mixtape · A ${mixtapeDuration(tape.sides[0].reduce((sum, slot) => sum + byId.get(slot.trackId)!.seconds, 0))} / B ${mixtapeDuration(tape.sides[1].reduce((sum, slot) => sum + byId.get(slot.trackId)!.seconds, 0))}. Thematic sequencing from metadata and notes.`,
    request: { ...request, view: "tracks" }, strategy: "variety", targetTrackCount: tracks.length,
    targetMinutes: tape.config.minutes[0] + tape.config.minutes[1], maxTracksPerArtist: tape.config.maxArtist,
    maxTracksPerAlbum: tape.config.maxAlbum, matchingTrackCount: tape.pool.length, candidateCount: tape.pool.length,
    totalSeconds: tracks.reduce((sum, track) => sum + track.seconds, 0), tracks, model, usage, mixtape: tape,
  };
}
