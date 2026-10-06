import type { LibraryCompletionCandidate, LibraryCompletionVerificationStatus } from "../types";

export function patchCompletionCandidates(
  candidates: LibraryCompletionCandidate[],
  recentItems: LibraryCompletionVerificationStatus["recentItems"],
) {
  const recentById = new Map(recentItems.map((item) => [item.candidateId, item]));
  let changed = false;
  const next = candidates.map((candidate) => {
    const item = recentById.get(candidate.id);
    if (!item) return candidate;
    const patch = {
      verificationStatus: item.state,
      verificationProvider: item.provider,
      verificationMessage: item.message,
      verificationCheckedAt: item.updatedAt,
      musicbrainzId: item.musicbrainzId ?? candidate.musicbrainzId,
      musicbrainzUrl: item.musicbrainzUrl ?? candidate.musicbrainzUrl,
      musicbrainzVerificationStatus: item.musicbrainzVerificationStatus,
      musicbrainzVerificationMessage: item.musicbrainzVerificationMessage,
      discogsVerificationStatus: item.discogsVerificationStatus,
      discogsVerificationMessage: item.discogsVerificationMessage,
      discogsMasterId: item.discogsMasterId,
      discogsUrl: item.discogsUrl,
    };
    if (Object.keys(patch).every((field) => {
      const key = field as keyof typeof patch;
      return patch[key] === candidate[key];
    })) return candidate;
    changed = true;
    return { ...candidate, ...patch };
  });
  return changed ? next : candidates;
}
