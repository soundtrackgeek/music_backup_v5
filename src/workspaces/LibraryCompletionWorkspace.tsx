import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Album,
  BarChart3,
  Check,
  CheckCircle2,
  CircleHelp,
  Database,
  Download,
  Heart,
  LayoutList,
  ListChecks,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";

import {
  addWishListMusicBrainzCandidate,
  getLibraryCompletion,
  getLibraryCompletionVerificationStatus,
  retryLibraryCompletionVerificationFailures,
  searchDeemixAlbums,
  searchWishListMusicBrainz,
  setLibraryCompletionVerificationState,
  setLibraryCompletionDecision,
  startLibraryCompletionVerification,
} from "../backend";
import type {
  DeemixAlbumSearchResponse,
  LibraryCompletionAtlasCell,
  LibraryCompletionCandidate,
  LibraryCompletionStatus,
  LibraryCompletionVerificationStatus,
  StartLibraryCompletionVerificationRequest,
  WishListMusicBrainzCandidate,
} from "../types";

type CompletionView = "workbench" | "atlas";
type CompletionFilter =
  | "all"
  | "candidate"
  | "billboard"
  | "officialUk"
  | "vgLista"
  | "verified"
  | "wanted"
  | "needsReview"
  | "notForMe";

type Campaign = {
  source: LibraryCompletionAtlasCell["source"];
  decade: number;
  label: string;
};

type MusicBrainzNotice = {
  kind: "empty" | "error" | "verified";
  title: string;
  detail: string;
};

const statusLabels: Record<LibraryCompletionStatus, string> = {
  candidate: "Unverified",
  wanted: "Wanted",
  notForMe: "Not for me",
  needsReview: "Needs review",
};

function percentage(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

function sourceLabel(source: LibraryCompletionAtlasCell["source"]) {
  if (source === "billboard") return "Billboard 200";
  if (source === "officialUk") return "Official UK Albums";
  return "VG Lista";
}

function verificationLabel(candidate: LibraryCompletionCandidate) {
  if (candidate.status !== "candidate") return statusLabels[candidate.status];
  switch (candidate.verificationStatus) {
    case "queued": return "Queued";
    case "checking": return "Checking";
    case "verified": return "Verified";
    case "noMatch": return "No match";
    case "ambiguous": return "Review";
    case "failed": return "Failed";
    default: return "Unverified";
  }
}

function verificationEta(seconds: number) {
  if (seconds <= 0) return "Finishing now";
  if (seconds < 60) return "Less than a minute remaining";
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `About ${minutes} minutes remaining`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `About ${hours}h${remainder ? ` ${remainder}m` : ""} remaining`;
}

export function LibraryCompletionWorkspace({
  onOpenWishList,
}: {
  onOpenWishList: () => void;
}) {
  const [data, setData] = useState<Awaited<ReturnType<typeof getLibraryCompletion>> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<CompletionView>("workbench");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CompletionFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [selectedAtlasId, setSelectedAtlasId] = useState<string | null>(null);
  const [pendingDecision, setPendingDecision] = useState<LibraryCompletionStatus | null>(null);
  const [musicBrainzCandidates, setMusicBrainzCandidates] = useState<WishListMusicBrainzCandidate[]>([]);
  const [musicBrainzNotice, setMusicBrainzNotice] = useState<MusicBrainzNotice | null>(null);
  const [isCheckingMusicBrainz, setIsCheckingMusicBrainz] = useState(false);
  const [deemixResult, setDeemixResult] = useState<DeemixAlbumSearchResponse | null>(null);
  const [isCheckingDeemix, setIsCheckingDeemix] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<LibraryCompletionVerificationStatus | null>(null);
  const [selectedForVerification, setSelectedForVerification] = useState<Set<string>>(() => new Set());
  const [pendingQueueAction, setPendingQueueAction] = useState(false);
  const completedBatchReloadRef = useRef<number | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const candidateRowsRef = useRef(new Map<string, HTMLDivElement>());

  const load = useCallback(async (scope: Campaign | null = null) => {
    setError(null);
    setIsLoading(true);
    try {
      const [response, queueStatus] = await Promise.all([
        getLibraryCompletion(scope ? { source: scope.source, decade: scope.decade } : null),
        getLibraryCompletionVerificationStatus(),
      ]);
      setData(response);
      setVerificationStatus(queueStatus);
      setSelectedForVerification((current) => {
        const available = new Set(response.candidates.map((candidate) => candidate.id));
        return new Set([...current].filter((candidateId) => available.has(candidateId)));
      });
      setSelectedId((current) =>
        current && response.candidates.some((candidate) => candidate.id === current)
          ? current
          : response.candidates[0]?.id ?? null,
      );
      setSelectedAtlasId((current) => {
        if (current) return current;
        const preferred = response.atlas.find(
          (cell) => cell.source === "officialUk" && cell.decade === 1990,
        );
        const fallback = response.atlas[0];
        const cell = preferred ?? fallback;
        return cell ? `${cell.source}-${cell.decade}` : null;
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  const candidates = useMemo(() => {
    if (!data) return [];
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return data.candidates.filter((candidate) => {
      if (filter === "verified") {
        if (candidate.verificationStatus !== "verified") return false;
      } else if (
        filter === "billboard" ||
        filter === "officialUk" ||
        filter === "vgLista"
      ) {
        if (!candidate.evidence.some((evidence) => evidence.source === filter)) return false;
      } else if (filter !== "all" && candidate.status !== filter) {
        return false;
      } else if (filter === "all" && candidate.status === "notForMe") {
        return false;
      }
      return (
        !normalizedQuery ||
        candidate.artist.toLocaleLowerCase().includes(normalizedQuery) ||
        candidate.title.toLocaleLowerCase().includes(normalizedQuery)
      );
    });
  }, [data, filter, query]);

  useEffect(() => {
    if (!candidates.length) return;
    if (!candidates.some((candidate) => candidate.id === selectedId)) {
      setSelectedId(candidates[0].id);
    }
  }, [candidates, selectedId]);

  const selected =
    candidates.find((candidate) => candidate.id === selectedId) ?? candidates[0] ?? null;
  const selectedAtlas =
    data?.atlas.find((cell) => `${cell.source}-${cell.decade}` === selectedAtlasId) ??
    data?.atlas[0] ??
    null;
  const decades = useMemo(
    () => [...new Set(data?.atlas.map((cell) => cell.decade) ?? [])].sort((a, b) => a - b),
    [data],
  );
  const atlasSources = useMemo(
    () => [...new Set(data?.atlas.map((cell) => cell.source) ?? [])],
    [data],
  );
  const wantedCount = data?.candidates.filter((candidate) => candidate.status === "wanted").length ?? 0;
  const verificationBatch = verificationStatus?.batch ?? null;
  const hasActiveVerification = verificationBatch?.state === "running" || verificationBatch?.state === "paused";
  const currentVerificationItem = verificationStatus?.recentItems.find(
    (item) => item.state === "checking",
  ) ?? null;
  const eligibleCandidateIds = useMemo(
    () => new Set(
      candidates
        .filter((candidate) =>
          candidate.status !== "notForMe" &&
          (candidate.verificationStatus === "unverified" || candidate.verificationStatus === "failed"),
        )
        .map((candidate) => candidate.id),
    ),
    [candidates],
  );
  const selectedVerificationCount = useMemo(
    () => [...selectedForVerification].filter((candidateId) => eligibleCandidateIds.has(candidateId)).length,
    [eligibleCandidateIds, selectedForVerification],
  );
  const verifiedOpenCandidates = useMemo(
    () => data?.candidates.filter((candidate) =>
      candidate.status === "candidate" && candidate.verificationStatus === "verified",
    ) ?? [],
    [data],
  );
  const unverifiedOpenCount = useMemo(
    () => data?.candidates.filter((candidate) =>
      candidate.status === "candidate" &&
      (candidate.verificationStatus === "unverified" || candidate.verificationStatus === "failed"),
    ).length ?? 0,
    [data],
  );

  const applyVerificationStatus = useCallback((status: LibraryCompletionVerificationStatus) => {
    setVerificationStatus(status);
    if (status.recentItems.length === 0) return;
    const recentById = new Map(status.recentItems.map((item) => [item.candidateId, item]));
    setData((current) => current ? {
      ...current,
      candidates: current.candidates.map((candidate) => {
        const item = recentById.get(candidate.id);
        if (!item) return candidate;
        return {
          ...candidate,
          verificationStatus: item.state,
          verificationMessage: item.message,
          verificationCheckedAt: item.updatedAt,
          musicbrainzId: item.musicbrainzId ?? candidate.musicbrainzId,
          musicbrainzUrl: item.musicbrainzUrl ?? candidate.musicbrainzUrl,
        };
      }),
    } : current);
  }, []);

  useEffect(() => {
    if (
      verificationBatch?.state !== "running" &&
      !(verificationBatch?.state === "paused" && verificationBatch.checkingCount > 0)
    ) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const status = await getLibraryCompletionVerificationStatus();
        if (cancelled) return;
        applyVerificationStatus(status);
        if (
          status.batch?.state === "completed" &&
          completedBatchReloadRef.current !== status.batch.id
        ) {
          completedBatchReloadRef.current = status.batch.id;
          await load(campaign);
        }
      } catch (statusError) {
        if (!cancelled) {
          setError(statusError instanceof Error ? statusError.message : String(statusError));
        }
      }
    };
    const timer = window.setInterval(() => void refresh(), 1_500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [
    applyVerificationStatus,
    campaign,
    load,
    verificationBatch?.checkingCount,
    verificationBatch?.id,
    verificationBatch?.state,
  ]);

  useEffect(() => {
    setMusicBrainzCandidates([]);
    setMusicBrainzNotice(null);
    setDeemixResult(null);
  }, [selected?.id]);

  function toggleVerificationCandidate(candidateId: string) {
    setSelectedForVerification((current) => {
      const next = new Set(current);
      if (next.has(candidateId)) next.delete(candidateId);
      else next.add(candidateId);
      return next;
    });
  }

  function toggleAllVisibleCandidates() {
    setSelectedForVerification((current) => {
      const next = new Set(current);
      const visibleIds = [...eligibleCandidateIds];
      const allSelected = visibleIds.length > 0 && visibleIds.every((candidateId) => next.has(candidateId));
      visibleIds.forEach((candidateId) => {
        if (allSelected) next.delete(candidateId);
        else next.add(candidateId);
      });
      return next;
    });
  }

  function reviewVerifiedCandidates() {
    const firstVerified = selected?.status === "candidate" && selected.verificationStatus === "verified"
      ? selected
      : verifiedOpenCandidates[0];
    setError(null);
    setQuery("");
    setFilter("verified");
    if (!firstVerified) return;
    setSelectedId(firstVerified.id);
    window.requestAnimationFrame(() => {
      candidateRowsRef.current.get(firstVerified.id)?.scrollIntoView({ block: "nearest" });
    });
  }

  async function startVerification(input: StartLibraryCompletionVerificationRequest) {
    setPendingQueueAction(true);
    setError(null);
    try {
      const status = await startLibraryCompletionVerification(input);
      completedBatchReloadRef.current = null;
      applyVerificationStatus(status);
      setSelectedForVerification(new Set());
    } catch (queueError) {
      setError(queueError instanceof Error ? queueError.message : String(queueError));
    } finally {
      setPendingQueueAction(false);
    }
  }

  async function controlVerification(state: "running" | "paused") {
    if (!verificationBatch) return;
    setPendingQueueAction(true);
    setError(null);
    try {
      applyVerificationStatus(await setLibraryCompletionVerificationState({
        batchId: verificationBatch.id,
        state,
      }));
    } catch (queueError) {
      setError(queueError instanceof Error ? queueError.message : String(queueError));
    } finally {
      setPendingQueueAction(false);
    }
  }

  async function retryVerificationFailures() {
    if (!verificationBatch) return;
    setPendingQueueAction(true);
    setError(null);
    try {
      completedBatchReloadRef.current = null;
      applyVerificationStatus(
        await retryLibraryCompletionVerificationFailures(verificationBatch.id),
      );
    } catch (queueError) {
      setError(queueError instanceof Error ? queueError.message : String(queueError));
    } finally {
      setPendingQueueAction(false);
    }
  }

  function verifySelectedCandidates() {
    const candidateIds = [...selectedForVerification].filter((candidateId) =>
      eligibleCandidateIds.has(candidateId),
    );
    if (candidateIds.length === 0) return;
    void startVerification({
      scope: candidateIds.length === 1 ? "candidate" : "selection",
      candidateIds,
      source: null,
      decade: null,
      label: candidateIds.length === 1 ? null : `Selected albums (${candidateIds.length})`,
    });
  }

  function verifyCandidate(candidate: LibraryCompletionCandidate) {
    void startVerification({
      scope: "candidate",
      candidateIds: [candidate.id],
      source: null,
      decade: null,
      label: `${candidate.artist} — ${candidate.title}`,
    });
  }

  function verifyAtlasCampaign(
    cell: Pick<LibraryCompletionAtlasCell, "source" | "decade" | "label">,
  ) {
    void startVerification({
      scope: "campaign",
      candidateIds: [],
      source: cell.source,
      decade: cell.decade,
      label: `${cell.label} · ${cell.decade}s`,
    });
  }

  async function decide(status: LibraryCompletionStatus) {
    if (!selected) return;
    setPendingDecision(status);
    setError(null);
    try {
      const result = await setLibraryCompletionDecision({
        candidateId: selected.id,
        artist: selected.artist,
        title: selected.title,
        chartYear: selected.chartYear,
        source: selected.evidence.map((evidence) => evidence.label).join(", "),
        status,
        wishListItemId: selected.wishListItemId,
        musicbrainzId: selected.musicbrainzId,
        musicbrainzUrl: selected.musicbrainzUrl,
      });
      setData((current) =>
        current
          ? {
              ...current,
              candidates: current.candidates.map((candidate) =>
                candidate.id === selected.id
                  ? {
                      ...candidate,
                      status: result.status,
                      wishListItemId: result.wishListItemId,
                      musicbrainzId: result.musicbrainzId,
                      musicbrainzUrl: result.musicbrainzUrl,
                    }
                  : candidate,
              ),
            }
          : current,
      );
      if (status === "wanted" && selected.verificationStatus === "verified") {
        setMusicBrainzNotice({
          kind: "verified",
          title: "Added to Wanted",
          detail: "This verified studio album is now in the Wish List and ready for download searches.",
        });
      }
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : String(decisionError));
    } finally {
      setPendingDecision(null);
    }
  }

  async function checkMusicBrainz() {
    if (!selected) return;
    setIsCheckingMusicBrainz(true);
    setError(null);
    setMusicBrainzCandidates([]);
    setMusicBrainzNotice(null);
    try {
      const response = await searchWishListMusicBrainz({
        entity: "album",
        query: selected.title,
        artist: selected.artist,
        year: selected.chartYear,
      });
      setMusicBrainzCandidates(response.candidates);
      if (response.candidates.length === 0) {
        setMusicBrainzNotice({
          kind: "empty",
          title: "No studio-album match found",
          detail: "MusicBrainz returned no primary Album release group without live or compilation classifications. This candidate remains unverified.",
        });
      }
    } catch (searchError) {
      setMusicBrainzNotice({
        kind: "error",
        title: "MusicBrainz check failed",
        detail: searchError instanceof Error ? searchError.message : String(searchError),
      });
    } finally {
      setIsCheckingMusicBrainz(false);
    }
  }

  async function chooseMusicBrainz(candidate: WishListMusicBrainzCandidate) {
    if (!selected) return;
    setIsCheckingMusicBrainz(true);
    setError(null);
    setMusicBrainzNotice(null);
    try {
      const added = await addWishListMusicBrainzCandidate(candidate);
      const decision = await setLibraryCompletionDecision({
        candidateId: selected.id,
        artist: selected.artist,
        title: selected.title,
        chartYear: selected.chartYear,
        source: selected.evidence.map((evidence) => evidence.label).join(", "),
        status: "wanted",
        wishListItemId: added.item?.id ?? selected.wishListItemId,
        musicbrainzId: candidate.musicbrainzId,
        musicbrainzUrl: candidate.musicbrainzUrl,
      });
      setData((current) =>
        current
          ? {
              ...current,
              candidates: current.candidates.map((entry) =>
                entry.id === selected.id
                  ? {
                      ...entry,
                      status: decision.status,
                      wishListItemId: decision.wishListItemId,
                      musicbrainzId: decision.musicbrainzId,
                      musicbrainzUrl: decision.musicbrainzUrl,
                      verificationStatus: "verified",
                      verificationMessage: "MusicBrainz confirmed an official studio-album release group.",
                      verificationCheckedAt: decision.updatedAt,
                    }
                  : entry,
              ),
            }
          : current,
      );
      setMusicBrainzCandidates([]);
      setMusicBrainzNotice({
        kind: "verified",
        title: "Official studio album verified",
        detail: "MusicBrainz confirmed a primary Album release group with no live or compilation type and at least one official release.",
      });
    } catch (candidateError) {
      setMusicBrainzNotice({
        kind: "error",
        title: "MusicBrainz could not verify this album",
        detail: candidateError instanceof Error ? candidateError.message : String(candidateError),
      });
    } finally {
      setIsCheckingMusicBrainz(false);
    }
  }

  async function checkDeemix() {
    if (!selected) return;
    setIsCheckingDeemix(true);
    setError(null);
    try {
      setDeemixResult(
        await searchDeemixAlbums({
          title: selected.title,
          artist: selected.artist,
          year: selected.chartYear,
          limit: 5,
        }),
      );
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : String(searchError));
    } finally {
      setIsCheckingDeemix(false);
    }
  }

  async function reviewAtlasCell(cell: LibraryCompletionAtlasCell) {
    const nextCampaign = { source: cell.source, decade: cell.decade, label: cell.label };
    setCampaign(nextCampaign);
    setFilter("candidate");
    setQuery("");
    setView("workbench");
    await load(nextCampaign);
  }

  async function clearCampaign() {
    setCampaign(null);
    setFilter("all");
    setQuery("");
    await load(null);
  }

  return (
    <section className="workspace completion-workspace">
      <header className="topbar completion-topbar">
        <div>
          <span className="completion-eyebrow">Library intelligence</span>
          <h1>Library Completion</h1>
          <p>Turn chart gaps into a verified, searchable acquisition queue.</p>
        </div>
        <div className="completion-topbar-actions">
          <div className="completion-view-switch" aria-label="Completion view">
            <button
              type="button"
              className={view === "workbench" ? "active" : ""}
              aria-pressed={view === "workbench"}
              onClick={() => setView("workbench")}
            >
              <LayoutList size={15} /> Workbench
            </button>
            <button
              type="button"
              className={view === "atlas" ? "active" : ""}
              aria-pressed={view === "atlas"}
              onClick={() => setView("atlas")}
            >
              <BarChart3 size={15} /> Coverage Atlas
            </button>
          </div>
          <button className="secondary-button" type="button" onClick={onOpenWishList}>
            <Heart size={15} />
            <span>Wanted {wantedCount > 0 ? wantedCount : ""}</span>
          </button>
          <button className="primary-button" type="button" disabled={isLoading} onClick={() => void load(campaign)}>
            <RefreshCw size={15} className={isLoading ? "spin" : ""} />
            <span>{isLoading ? "Scanning" : "Scan local charts"}</span>
          </button>
        </div>
      </header>

      <section className="completion-command-bar" aria-label="Candidate controls">
        <label className="completion-search">
          <Search size={16} aria-hidden="true" />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search candidates by artist or album"
            aria-label="Search completion candidates"
          />
          <kbd>Ctrl K</kbd>
        </label>
        <label className="completion-filter">
          <span>Show</span>
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value as CompletionFilter)}
            aria-label="Filter completion candidates"
          >
            <option value="all">All active candidates</option>
            <option value="candidate">Open candidates</option>
            <option value="billboard">Billboard 200</option>
            <option value="officialUk">Official UK Albums</option>
            <option value="vgLista">VG Lista</option>
            <option value="verified">Verified studio albums</option>
            <option value="wanted">Wanted</option>
            <option value="needsReview">Needs review</option>
            <option value="notForMe">Not for me</option>
          </select>
        </label>
        <div className="completion-scan-summary">
          <strong>{data?.totalCandidates.toLocaleString() ?? "—"}</strong>
          <span>missing chart albums</span>
        </div>
      </section>

      <section className="completion-verification-panel" aria-label="MusicBrainz verification queue">
        <span className="completion-verification-icon"><ListChecks size={18} /></span>
        <div className="completion-verification-copy">
          <div className="completion-verification-heading">
            <span className="completion-kicker">Verification queue</span>
            <strong>{verificationBatch?.label ?? "Ready for a verification run"}</strong>
            {verificationBatch ? (
              <span className={`completion-queue-state ${verificationBatch.state}`}>
                {verificationBatch.state}
              </span>
            ) : null}
          </div>
          {verificationBatch ? (
            <>
              <div className="completion-verification-progress" aria-label={`${verificationBatch.completedCount} of ${verificationBatch.totalCount} checked`}>
                <i style={{ width: `${percentage(verificationBatch.completedCount, verificationBatch.totalCount)}%` }} />
              </div>
              <p>
                <strong>{verificationBatch.completedCount.toLocaleString()} / {verificationBatch.totalCount.toLocaleString()}</strong>
                {` checked · ${verificationBatch.verifiedCount.toLocaleString()} verified · ${(verificationBatch.noMatchCount + verificationBatch.ambiguousCount).toLocaleString()} review · ${verificationBatch.failedCount.toLocaleString()} failed`}
              </p>
              <small className={verificationBatch.state === "completed" ? "completion-verification-guidance" : undefined}>
                {currentVerificationItem
                  ? `Checking ${currentVerificationItem.artist} — ${currentVerificationItem.title}`
                  : verificationBatch.state === "paused"
                    ? "Paused safely. Progress is stored locally."
                    : verificationBatch.state === "completed"
                      ? verificationBatch.verifiedCount > 0
                        ? `${verificationBatch.verifiedCount.toLocaleString()} official studio ${verificationBatch.verifiedCount === 1 ? "album was" : "albums were"} confirmed. Review ${verificationBatch.verifiedCount === 1 ? "it" : "them"} and add the albums you want to Wanted.`
                        : "Run complete. Review any unmatched or ambiguous albums manually."
                      : verificationEta(verificationBatch.estimatedSecondsRemaining)}
              </small>
            </>
          ) : (
            <p>Select albums below or start directly from a Coverage Atlas cohort.</p>
          )}
        </div>
        <div className="completion-verification-actions">
          {verificationBatch?.state === "running" ? (
            <button className="secondary-button" type="button" disabled={pendingQueueAction} onClick={() => void controlVerification("paused")}>
              <Pause size={14} /> Pause
            </button>
          ) : verificationBatch?.state === "paused" ? (
            <button className="primary-button" type="button" disabled={pendingQueueAction} onClick={() => void controlVerification("running")}>
              <Play size={14} /> Resume
            </button>
          ) : null}
          {verificationBatch && verificationBatch.failedCount > 0 ? (
            <button className="secondary-button" type="button" disabled={pendingQueueAction || hasActiveVerification} onClick={() => void retryVerificationFailures()}>
              <RotateCcw size={14} /> Retry failed
            </button>
          ) : null}
          {verificationBatch?.state === "completed" && verifiedOpenCandidates.length > 0 ? (
            <button className="secondary-button" type="button" onClick={reviewVerifiedCandidates}>
              <CheckCircle2 size={14} /> Review verified ({verifiedOpenCandidates.length})
            </button>
          ) : null}
          {selectedVerificationCount > 0 ? (
            <button
              className="primary-button"
              type="button"
              disabled={pendingQueueAction || hasActiveVerification}
              onClick={verifySelectedCandidates}
            >
              <ShieldCheck size={14} /> Verify selected ({selectedVerificationCount})
            </button>
          ) : null}
        </div>
      </section>

      {campaign ? (
        <div className="completion-campaign" role="status">
          <span>Campaign</span>
          <strong>{campaign.label} · {campaign.decade}s</strong>
          <span>
            {data?.candidates.length.toLocaleString() ?? "0"} {data?.candidates.length === 1 ? "album" : "albums"} loaded · {unverifiedOpenCount.toLocaleString()} to verify · {verifiedOpenCandidates.length.toLocaleString()} verified
          </span>
          <button
            className="completion-campaign-verify"
            type="button"
            disabled={pendingQueueAction || hasActiveVerification}
            onClick={() => verifyAtlasCampaign(campaign)}
          >
            <ShieldCheck size={14} /> Verify cohort
          </button>
          <button type="button" aria-label="Clear Coverage Atlas campaign" onClick={() => void clearCampaign()}>
            <X size={15} />
          </button>
        </div>
      ) : null}

      {error ? <p className="error-message" role="alert">{error}</p> : null}

      {view === "workbench" ? (
        <div className="completion-workbench">
          <section className="completion-candidate-panel" aria-label="Missing album candidates">
            <header>
              <div>
                <span>Candidate queue</span>
                <strong>{candidates.length.toLocaleString()} shown</strong>
              </div>
              <div className="completion-candidate-batch-actions">
                <button type="button" disabled={eligibleCandidateIds.size === 0} onClick={toggleAllVisibleCandidates}>
                  {eligibleCandidateIds.size > 0 && [...eligibleCandidateIds].every((candidateId) => selectedForVerification.has(candidateId))
                    ? "Clear selection"
                    : "Select shown"}
                </button>
                <span>{data?.truncated ? `Top ${data.returnedCandidates.toLocaleString()} loaded` : "All loaded"}</span>
              </div>
            </header>
            <div className="completion-candidate-list" aria-label="Completion candidates">
              {candidates.map((candidate) => (
                <div
                  className="completion-candidate-row"
                  key={candidate.id}
                  ref={(node) => {
                    if (node) candidateRowsRef.current.set(candidate.id, node);
                    else candidateRowsRef.current.delete(candidate.id);
                  }}
                >
                  <label className="completion-candidate-select">
                    <input
                      type="checkbox"
                      checked={selectedForVerification.has(candidate.id)}
                      disabled={!eligibleCandidateIds.has(candidate.id) || hasActiveVerification}
                      onChange={() => toggleVerificationCandidate(candidate.id)}
                      aria-label={`Select ${candidate.artist} — ${candidate.title} for verification`}
                    />
                  </label>
                  <button
                    className={candidate.id === selected?.id ? "completion-candidate active" : "completion-candidate"}
                    type="button"
                    onClick={() => setSelectedId(candidate.id)}
                  >
                    {candidate.coverUrl ? (
                      <img src={candidate.coverUrl} alt="" />
                    ) : (
                      <span className="completion-cover-fallback"><Album size={19} /></span>
                    )}
                    <span className="completion-candidate-copy">
                      <strong>{candidate.title}</strong>
                      <span>{candidate.artist} · {candidate.chartYear}</span>
                      <small>{candidate.evidence.map((evidence) => evidence.label).join(" + ")}</small>
                    </span>
                    <span className={`completion-status completion-status-${candidate.status === "candidate" ? candidate.verificationStatus : candidate.status}`}>
                      {verificationLabel(candidate)}
                    </span>
                  </button>
                </div>
              ))}
              {!isLoading && candidates.length === 0 ? (
                <div className="completion-empty">
                  <CheckCircle2 size={22} />
                  <strong>No candidates in this view</strong>
                  <span>Clear the filters or choose another Atlas campaign.</span>
                </div>
              ) : null}
            </div>
          </section>

          <section className="completion-dossier" aria-label="Candidate dossier">
            {selected ? (
              <>
                <div className="completion-dossier-heading">
                  {selected.coverUrl ? (
                    <img src={selected.coverUrl} alt={`${selected.title} cover artwork`} />
                  ) : (
                    <span className="completion-dossier-cover-fallback"><Album size={28} /></span>
                  )}
                  <div>
                    <span className="completion-kicker">Candidate dossier</span>
                    <h2>{selected.title}</h2>
                    <p>{selected.artist}</p>
                    <div className="completion-facts">
                      <span>First charted {selected.chartYear}</span>
                      <span>{selected.verificationStatus === "verified" ? "Official studio album verified" : "Album type unverified"}</span>
                    </div>
                  </div>
                </div>

                <div className="completion-absence-proof">
                  <span><Database size={17} /></span>
                  <div>
                    <strong>Confirmed absent locally</strong>
                    <p>No normalized artist + album match exists in your imported library.</p>
                  </div>
                  <Check size={17} />
                </div>

                <section className="completion-ledger">
                  <header>
                    <div>
                      <span className="completion-kicker">Provenance ledger</span>
                      <h3>Why this is here</h3>
                    </div>
                    <span className={`completion-confidence completion-confidence-${selected.confidence}`}>
                      {selected.confidence === "best" ? "Strong chart match" : selected.confidence === "good" ? "Good chart match" : "Review suggested"}
                    </span>
                  </header>
                  {selected.evidence.map((evidence) => (
                    <div className="completion-ledger-row" key={`${selected.id}-${evidence.source}`}>
                      <span className="completion-ledger-icon"><BarChart3 size={15} /></span>
                      <div>
                        <strong>{evidence.label}</strong>
                        <p>Peak #{evidence.bestRank} · {evidence.appearances} appearances · {evidence.firstYear}{evidence.lastYear !== evidence.firstYear ? `–${evidence.lastYear}` : ""}</p>
                      </div>
                      <span>Chart evidence</span>
                    </div>
                  ))}
                  <div className="completion-ledger-row">
                    <span className="completion-ledger-icon"><ShieldCheck size={15} /></span>
                    <div>
                      <strong>MusicBrainz</strong>
                      <p>{selected.verificationMessage ?? (selected.verificationStatus === "verified" ? "Official studio-album identity linked to this candidate." : "Check whether this is an official studio album, live album, or compilation.")}</p>
                    </div>
                    {selected.verificationStatus === "verified" ? (
                      <div className="completion-ledger-actions">
                        <span className="completion-verified">Verified studio album</span>
                        {selected.status === "wanted" ? (
                          <span>In Wanted</span>
                        ) : (
                          <button
                            type="button"
                            disabled={pendingDecision !== null}
                            onClick={() => void decide("wanted")}
                          >
                            <Heart size={13} /> Add to Wanted
                          </button>
                        )}
                      </div>
                    ) : selected.verificationStatus === "queued" ? (
                      <span>Queued</span>
                    ) : selected.verificationStatus === "checking" ? (
                      <span>Checking…</span>
                    ) : selected.verificationStatus === "ambiguous" || selected.verificationStatus === "noMatch" ? (
                      <button type="button" disabled={isCheckingMusicBrainz} onClick={() => void checkMusicBrainz()}>
                        {isCheckingMusicBrainz
                          ? "Searching…"
                          : musicBrainzCandidates.length > 0
                            ? `${musicBrainzCandidates.length} found`
                            : "Review matches"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={pendingQueueAction || hasActiveVerification}
                        onClick={() => verifyCandidate(selected)}
                      >
                        {selected.verificationStatus === "failed" ? "Retry in queue" : "Verify album"}
                      </button>
                    )}
                  </div>
                  <div className="completion-ledger-row muted">
                    <span className="completion-ledger-icon"><CircleHelp size={15} /></span>
                    <div>
                      <strong>Discogs</strong>
                      <p>Cross-catalog verification will join this ledger in the next phase.</p>
                    </div>
                    <span>Next phase</span>
                  </div>
                </section>

                {musicBrainzCandidates.length > 0 ? (
                  <section className="completion-provider-results" aria-live="polite">
                    <header>
                      <strong>MusicBrainz candidates</strong>
                      <span>Choose the primary album match; MusicBrainz will recheck its type and official release status.</span>
                    </header>
                    {musicBrainzCandidates.map((candidate) => (
                      <button
                        type="button"
                        key={candidate.musicbrainzId}
                        disabled={isCheckingMusicBrainz}
                        onClick={() => void chooseMusicBrainz(candidate)}
                      >
                        <span>
                          <strong>{candidate.title}</strong>
                          <small>{candidate.artist || selected.artist}{candidate.year ? ` · ${candidate.year}` : ""}</small>
                        </span>
                        <span>Verify + want</span>
                      </button>
                    ))}
                  </section>
                ) : null}

                {musicBrainzNotice ? (
                  <div
                    className={`completion-provider-notice ${musicBrainzNotice.kind}`}
                    role={musicBrainzNotice.kind === "error" ? "alert" : "status"}
                  >
                    {musicBrainzNotice.kind === "verified" ? <CheckCircle2 size={17} /> : <CircleHelp size={17} />}
                    <div>
                      <strong>{musicBrainzNotice.title}</strong>
                      <span>{musicBrainzNotice.detail}</span>
                    </div>
                  </div>
                ) : null}

                <div className="completion-decisions">
                  <button
                    className={selected.status === "wanted" ? "primary-button active" : "primary-button"}
                    type="button"
                    disabled={pendingDecision !== null}
                    onClick={() => void decide("wanted")}
                  >
                    <Heart size={15} />
                    <span>{pendingDecision === "wanted"
                      ? "Saving"
                      : selected.status === "wanted"
                        ? "Wanted"
                        : selected.verificationStatus === "verified"
                          ? "Add to Wanted"
                          : "Mark wanted"}</span>
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={pendingDecision !== null}
                    onClick={() => void decide("needsReview")}
                  >
                    <CircleHelp size={15} /> <span>Needs review</span>
                  </button>
                  <button
                    className="completion-text-button"
                    type="button"
                    disabled={pendingDecision !== null}
                    onClick={() => void decide("notForMe")}
                  >
                    Not for me
                  </button>
                </div>

                <section className="completion-download-panel">
                  <div>
                    <span className="completion-ledger-icon"><Download size={15} /></span>
                    <div>
                      <strong>Find a download</strong>
                      <p>Search Deemix now, then use the Wish List for download controls.</p>
                    </div>
                  </div>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={selected.status !== "wanted" || isCheckingDeemix}
                    onClick={() => void checkDeemix()}
                  >
                    <Search size={15} />
                    <span>{isCheckingDeemix ? "Searching" : "Check Deemix"}</span>
                  </button>
                  {deemixResult ? (
                    <div className="completion-deemix-result" aria-live="polite">
                      <span>{deemixResult.total} {deemixResult.total === 1 ? "match" : "matches"}</span>
                      <strong>{deemixResult.matches[0]?.title ?? "No album match found"}</strong>
                      <button type="button" onClick={onOpenWishList}>Open Wish List</button>
                    </div>
                  ) : null}
                </section>

                <footer className="completion-provider-strip">
                  <span><i className="on" /> MusicBrainz <small>{verificationBatch?.state === "running" ? "Background queue active" : "On demand"}</small></span>
                  <span><i /> Discogs <small>Next phase</small></span>
                  <span><i className={deemixResult ? "on" : ""} /> Deemix <small>{deemixResult ? "Ready" : "Idle"}</small></span>
                </footer>
              </>
            ) : (
              <div className="completion-empty completion-empty-dossier">
                <Album size={28} />
                <strong>Select a missing album</strong>
                <span>Its evidence and provider checks will appear here.</span>
              </div>
            )}
          </section>
        </div>
      ) : (
        <div className="completion-atlas-layout">
          <section className="completion-atlas">
            <header>
              <div>
                <span className="completion-kicker">Coverage Atlas</span>
                <h2>Where the collection is thin</h2>
                <p>Owned albums and unverified chart gaps, organized by source and decade.</p>
              </div>
              <div className="completion-atlas-legend" aria-label="Atlas legend">
                <span><i className="owned" />Owned</span>
                <span><i className="verified" />Verified missing</span>
                <span><i className="open" />Open unverified</span>
                <span><i className="review" />Review</span>
              </div>
            </header>
            <div className="completion-atlas-grid" style={{ "--atlas-columns": decades.length } as React.CSSProperties}>
              <span />
              {decades.map((decade) => <strong key={decade}>{decade}s</strong>)}
              {atlasSources.map((source) => (
                <div className="completion-atlas-row" key={source}>
                  <span className="completion-atlas-source">{sourceLabel(source)}</span>
                  {decades.map((decade) => {
                    const cell = data?.atlas.find((entry) => entry.source === source && entry.decade === decade);
                    if (!cell) return <span key={decade} />;
                    const id = `${cell.source}-${cell.decade}`;
                    return (
                      <button
                        type="button"
                        className={id === selectedAtlasId ? "completion-atlas-cell active" : "completion-atlas-cell"}
                        key={id}
                        aria-label={`${cell.label}, ${cell.decade}s: ${percentage(cell.owned, cell.total)}% owned`}
                        onClick={() => setSelectedAtlasId(id)}
                      >
                        <strong>{percentage(cell.owned, cell.total)}%</strong>
                        <span>{cell.owned.toLocaleString()} owned</span>
                        <i className="completion-atlas-bar">
                          <i className="owned" style={{ width: `${percentage(cell.owned, cell.total)}%` }} />
                          <i className="verified" style={{ width: `${percentage(cell.verified, cell.total)}%` }} />
                          <i className="review" style={{ width: `${percentage(cell.needsReview, cell.total)}%` }} />
                        </i>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </section>

          <aside className="completion-atlas-inspector">
            {selectedAtlas ? (
              <>
                <span className="completion-kicker">Selected cohort</span>
                <h2>{selectedAtlas.label}</h2>
                <p>{selectedAtlas.decade}s</p>
                <div className="completion-atlas-score">
                  <strong>{percentage(selectedAtlas.owned, selectedAtlas.total)}%</strong>
                  <span>of charted albums owned</span>
                </div>
                <dl>
                  <div><dt>Owned</dt><dd>{selectedAtlas.owned.toLocaleString()}</dd></div>
                  <div><dt>Verified missing</dt><dd>{selectedAtlas.verified.toLocaleString()}</dd></div>
                  <div><dt>Open unverified</dt><dd>{selectedAtlas.candidates.toLocaleString()}</dd></div>
                  <div><dt>Wanted</dt><dd>{selectedAtlas.wanted.toLocaleString()}</dd></div>
                  <div><dt>Needs review</dt><dd>{selectedAtlas.needsReview.toLocaleString()}</dd></div>
                  <div><dt>Not for me</dt><dd>{selectedAtlas.excluded.toLocaleString()}</dd></div>
                </dl>
                <div className="completion-atlas-actions">
                  <button className="primary-button" type="button" disabled={isLoading} onClick={() => void reviewAtlasCell(selectedAtlas)}>
                    <LayoutList size={15} /> <span>Review candidates</span>
                  </button>
                  <button className="secondary-button" type="button" disabled={pendingQueueAction || hasActiveVerification || selectedAtlas.candidates === 0} onClick={() => verifyAtlasCampaign(selectedAtlas)}>
                    <ShieldCheck size={15} /> <span>Verify this cohort</span>
                  </button>
                </div>
              </>
            ) : null}
          </aside>
        </div>
      )}
    </section>
  );
}
