import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  CheckCircle2,
  CircleHelp,
  Database,
  ExternalLink,
  Heart,
  ListChecks,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";

import {
  confirmLibraryCompletionArtistMatch,
  getDiscogsCredentialStatus,
  getLibraryCompletionArtists,
  getLibraryCompletionArtistVerificationStatus,
  openExternalUrl,
  retryLibraryCompletionArtistVerificationFailures,
  searchWishListMusicBrainz,
  setLibraryCompletionArtistDecision,
  setLibraryCompletionArtistVerificationState,
  startLibraryCompletionArtistVerification,
} from "../backend";
import type {
  DiscogsCredentialStatus,
  LibraryCompletionArtistCandidate,
  LibraryCompletionArtistChartSource,
  LibraryCompletionArtistEvidence,
  LibraryCompletionArtistRequest,
  LibraryCompletionArtistVerificationStatus,
  LibraryCompletionStatus,
  WishListMusicBrainzCandidate,
} from "../types";

type ArtistFilter =
  | "all"
  | "candidate"
  | "unverified"
  | "albums"
  | "singles"
  | "verified"
  | "wanted"
  | "needsReview"
  | "notForMe";

const artistChartOptions = [
  {
    value: "billboardAlbums",
    source: "billboard",
    chartKind: "albums",
    label: "Billboard Charts Albums",
  },
  {
    value: "billboardSingles",
    source: "billboard",
    chartKind: "singles",
    label: "Billboard Charts Singles",
  },
  {
    value: "officialUkAlbums",
    source: "officialUk",
    chartKind: "albums",
    label: "Official UK Charts Albums",
  },
  {
    value: "officialUkSingles",
    source: "officialUk",
    chartKind: "singles",
    label: "Official UK Charts Singles",
  },
  {
    value: "vgListaAlbums",
    source: "vgLista",
    chartKind: "albums",
    label: "VG Lista Charts Albums",
  },
  {
    value: "vgListaSingles",
    source: "vgLista",
    chartKind: "singles",
    label: "VG Lista Charts Singles",
  },
  {
    value: "tiISkuddetSingles",
    source: "tiISkuddet",
    chartKind: "singles",
    label: "Ti i Skuddet Singles",
  },
  {
    value: "norsktoppenSingles",
    source: "norsktoppen",
    chartKind: "singles",
    label: "Norsktoppen Singles",
  },
] as const satisfies ReadonlyArray<{
  value: string;
  source: LibraryCompletionArtistChartSource;
  chartKind: LibraryCompletionArtistEvidence["chartKind"];
  label: string;
}>;

type ArtistChartFilter = "all" | (typeof artistChartOptions)[number]["value"];

function artistVerificationLabel(candidate: LibraryCompletionArtistCandidate) {
  if (candidate.status === "wanted") return "In Wish List";
  if (candidate.status === "needsReview") return "Needs review";
  if (candidate.status === "notForMe") return "Not for me";
  switch (candidate.verificationStatus) {
    case "queued": return "Queued";
    case "checking": return "Checking";
    case "verified": return "Studio albums found";
    case "noMatch": return "No official albums";
    case "ambiguous": return "Manual review";
    case "failed": return "Failed";
    default: return "Unverified";
  }
}

function ProviderBadge({
  status,
  activity,
}: {
  status: LibraryCompletionArtistCandidate["musicbrainzVerificationStatus"];
  activity?: "queued" | "checking" | null;
}) {
  const key = activity ?? status ?? "notChecked";
  const label = activity === "checking"
    ? "Checking…"
    : activity === "queued"
      ? "Queued"
      : status === "verified"
        ? "Checked · verified"
        : status === "noMatch"
          ? "Checked · no match"
          : status === "ambiguous"
            ? "Checked · multiple matches"
            : status === "failed"
              ? "Failed"
              : "Not checked";
  return <span className={`completion-provider-status ${key}`}>{label}</span>;
}

function percentage(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

function etaLabel(seconds: number) {
  if (seconds <= 0) return "Finishing now";
  if (seconds < 60) return "Less than a minute remaining";
  return `About ${Math.ceil(seconds / 60)} minutes remaining`;
}

export function ArtistCompletionWorkspace({
  refreshToken,
  onOpenWishList,
}: {
  refreshToken: number;
  onOpenWishList: () => void;
}) {
  const [data, setData] = useState<Awaited<ReturnType<typeof getLibraryCompletionArtists>> | null>(null);
  const [verificationStatus, setVerificationStatus] =
    useState<LibraryCompletionArtistVerificationStatus | null>(null);
  const [discogsStatus, setDiscogsStatus] = useState<DiscogsCredentialStatus | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ArtistFilter>("all");
  const [chartFilter, setChartFilter] = useState<ArtistChartFilter>("all");
  const [yearFrom, setYearFrom] = useState<number | null>(null);
  const [yearTo, setYearTo] = useState<number | null>(null);
  const [activeRequest, setActiveRequest] = useState<LibraryCompletionArtistRequest | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedForVerification, setSelectedForVerification] = useState<Set<string>>(
    () => new Set(),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [pendingQueueAction, setPendingQueueAction] = useState(false);
  const [pendingDecision, setPendingDecision] = useState<LibraryCompletionStatus | null>(null);
  const [isSearchingMusicBrainz, setIsSearchingMusicBrainz] = useState(false);
  const [musicBrainzCandidates, setMusicBrainzCandidates] =
    useState<WishListMusicBrainzCandidate[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const completedBatchReloadRef = useRef<number | null>(null);
  const candidateListRef = useRef<HTMLDivElement>(null);
  const candidateRowsRef = useRef(new Map<string, HTMLDivElement>());
  const candidateListScrollTopRef = useRef(0);

  const load = useCallback(async (request: LibraryCompletionArtistRequest | null = null) => {
    setIsLoading(true);
    setError(null);
    try {
      const [response, queue, provider] = await Promise.all([
        getLibraryCompletionArtists(request),
        getLibraryCompletionArtistVerificationStatus(),
        getDiscogsCredentialStatus(),
      ]);
      setData(response);
      setVerificationStatus(queue);
      setDiscogsStatus(provider);
      setSelectedForVerification((current) => {
        const available = new Set(response.candidates.map((candidate) => candidate.id));
        return new Set([...current].filter((id) => available.has(id)));
      });
      setSelectedId((current) =>
        current && response.candidates.some((candidate) => candidate.id === current)
          ? current
          : response.candidates[0]?.id ?? null,
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(activeRequest);
  }, [activeRequest, load, refreshToken]);

  const batch = verificationStatus?.batch ?? null;
  useEffect(() => {
    if (!batch || batch.state !== "running") return;
    const timer = window.setInterval(() => {
      void getLibraryCompletionArtistVerificationStatus()
        .then((status) => setVerificationStatus(status))
        .catch((pollError) => setError(pollError instanceof Error ? pollError.message : String(pollError)));
    }, 1_500);
    return () => window.clearInterval(timer);
  }, [batch?.id, batch?.state]);

  useEffect(() => {
    if (!batch || batch.state !== "completed" || completedBatchReloadRef.current === batch.id) return;
    completedBatchReloadRef.current = batch.id;
    void load(activeRequest);
  }, [activeRequest, batch, load]);

  const candidates = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return (data?.candidates ?? []).filter((candidate) => {
      if (filter === "verified" && candidate.verificationStatus !== "verified") return false;
      if (
        filter === "unverified" &&
        (candidate.status !== "candidate" || candidate.verificationStatus !== "unverified")
      ) return false;
      if ((filter === "albums" || filter === "singles") && !candidate.evidence.some(
        (evidence) => evidence.chartKind === filter,
      )) return false;
      if (
        !["all", "unverified", "verified", "albums", "singles"].includes(filter) &&
        candidate.status !== filter
      ) return false;
      if (filter === "all" && candidate.status === "notForMe") return false;
      return !normalizedQuery || candidate.artist.toLocaleLowerCase().includes(normalizedQuery);
    });
  }, [data, filter, query]);

  useEffect(() => {
    if (!candidates.length) return;
    if (!candidates.some((candidate) => candidate.id === selectedId)) {
      setSelectedId(candidates[0].id);
    }
  }, [candidates, selectedId]);

  const selected = useMemo(
    () => candidates.find((candidate) => candidate.id === selectedId) ?? candidates[0] ?? null,
    [candidates, selectedId],
  );

  useLayoutEffect(() => {
    const list = candidateListRef.current;
    if (!list || !data) return;
    list.scrollTop = candidateListScrollTopRef.current;

    const selectedRow = selectedId ? candidateRowsRef.current.get(selectedId) : null;
    if (!selectedRow) return;
    const listBounds = list.getBoundingClientRect();
    const rowBounds = selectedRow.getBoundingClientRect();
    if (rowBounds.top < listBounds.top || rowBounds.bottom > listBounds.bottom) {
      selectedRow.scrollIntoView({ block: "nearest" });
    }
  }, [data, selectedId]);

  const currentItem = verificationStatus?.recentItems.find((item) => item.state === "checking") ?? null;
  const hasActiveBatch = batch?.state === "running" || batch?.state === "paused";
  const eligibleIds = useMemo(
    () => new Set(candidates.filter((candidate) =>
      candidate.status === "candidate" &&
      (candidate.verificationStatus === "unverified" || candidate.verificationStatus === "failed")
    ).map((candidate) => candidate.id)),
    [candidates],
  );

  function toggleCandidate(candidateId: string) {
    setSelectedForVerification((current) => {
      const next = new Set(current);
      if (next.has(candidateId)) next.delete(candidateId);
      else next.add(candidateId);
      return next;
    });
  }

  function toggleShown() {
    setSelectedForVerification((current) => {
      const allSelected = eligibleIds.size > 0 && [...eligibleIds].every((id) => current.has(id));
      if (allSelected) return new Set([...current].filter((id) => !eligibleIds.has(id)));
      return new Set([...current, ...eligibleIds]);
    });
  }

  async function startVerification(ids: string[], label: string | null) {
    setPendingQueueAction(true);
    setError(null);
    setNotice(null);
    try {
      const status = await startLibraryCompletionArtistVerification({ artistIds: ids, label });
      setVerificationStatus(status);
      setSelectedForVerification(new Set());
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : String(startError));
    } finally {
      setPendingQueueAction(false);
    }
  }

  async function controlVerification(state: "running" | "paused") {
    if (!batch) return;
    setPendingQueueAction(true);
    setError(null);
    try {
      const status = await setLibraryCompletionArtistVerificationState({ batchId: batch.id, state });
      setVerificationStatus(status);
    } catch (controlError) {
      setError(controlError instanceof Error ? controlError.message : String(controlError));
    } finally {
      setPendingQueueAction(false);
    }
  }

  async function retryFailures() {
    if (!batch) return;
    setPendingQueueAction(true);
    setError(null);
    try {
      setVerificationStatus(await retryLibraryCompletionArtistVerificationFailures(batch.id));
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : String(retryError));
    } finally {
      setPendingQueueAction(false);
    }
  }

  async function reviewMusicBrainz() {
    if (!selected) return;
    setIsSearchingMusicBrainz(true);
    setError(null);
    setNotice(null);
    try {
      const response = await searchWishListMusicBrainz({
        entity: "artist",
        query: selected.artist,
      });
      setMusicBrainzCandidates(response.candidates);
      if (response.candidates.length === 0) setNotice("MusicBrainz returned no artist candidates.");
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : String(searchError));
    } finally {
      setIsSearchingMusicBrainz(false);
    }
  }

  async function openMusicBrainz(url: string) {
    setError(null);
    try {
      await openExternalUrl(url);
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : String(openError));
    }
  }

  async function confirmMusicBrainz(candidate: WishListMusicBrainzCandidate) {
    if (!selected) return;
    setIsSearchingMusicBrainz(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await confirmLibraryCompletionArtistMatch({
        artistId: selected.id,
        candidate,
      });
      setData((current) => current ? {
        ...current,
        candidates: current.candidates.map((value) => value.id === updated.id ? updated : value),
      } : current);
      setMusicBrainzCandidates([]);
      setNotice(updated.verificationMessage ?? "The selected artist identity was checked.");
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : String(confirmError));
    } finally {
      setIsSearchingMusicBrainz(false);
    }
  }

  async function decide(status: LibraryCompletionStatus) {
    if (!selected) return;
    setPendingDecision(status);
    setError(null);
    setNotice(null);
    try {
      const decision = await setLibraryCompletionArtistDecision({
        artistId: selected.id,
        artist: selected.artist,
        status,
      });
      setData((current) => current ? {
        ...current,
        candidates: current.candidates.map((candidate) => candidate.id === selected.id
          ? { ...candidate, status: decision.status, wishListItemId: decision.wishListItemId }
          : candidate),
      } : current);
      setNotice(decision.message);
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : String(decisionError));
    } finally {
      setPendingDecision(null);
    }
  }

  function applyChartFilters() {
    if (yearFrom != null && (yearFrom < 1000 || yearFrom > 3000)) {
      setError("Choose a four-digit start year between 1000 and 3000.");
      return;
    }
    if (yearTo != null && (yearTo < 1000 || yearTo > 3000)) {
      setError("Choose a four-digit end year between 1000 and 3000.");
      return;
    }
    if (yearFrom != null && yearTo != null && yearFrom > yearTo) {
      setError("The start year must not be later than the end year.");
      return;
    }
    setError(null);
    candidateListScrollTopRef.current = 0;
    const selectedChart =
      chartFilter === "all"
        ? null
        : artistChartOptions.find((option) => option.value === chartFilter) ?? null;
    setActiveRequest(
      selectedChart == null && yearFrom == null && yearTo == null
        ? null
        : {
            source: selectedChart?.source ?? null,
            chartKind: selectedChart?.chartKind ?? null,
            yearFrom,
            yearTo,
          },
    );
  }

  function clearChartFilters() {
    setChartFilter("all");
    setYearFrom(null);
    setYearTo(null);
    setError(null);
    candidateListScrollTopRef.current = 0;
    setActiveRequest(null);
  }

  return (
    <div className="artist-completion-surface">
      <section className="completion-command-bar artist-completion-command-bar" aria-label="Artist discovery controls">
        <label className="completion-search">
          <Search size={16} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search missing chart artists"
            aria-label="Search missing chart artists"
          />
        </label>
        <label className="completion-filter">
          <span>Show</span>
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value as ArtistFilter)}
            aria-label="Filter missing chart artists"
          >
            <option value="all">All active artists</option>
            <option value="candidate">Open candidates</option>
            <option value="unverified">Unverified</option>
            <option value="albums">Found on album charts</option>
            <option value="singles">Found on singles charts</option>
            <option value="verified">Official albums confirmed</option>
            <option value="wanted">In Wish List</option>
            <option value="needsReview">Needs review</option>
            <option value="notForMe">Not for me</option>
          </select>
        </label>
        <label className="completion-filter completion-chart-filter">
          <span>Charts</span>
          <select
            value={chartFilter}
            onChange={(event) => setChartFilter(event.target.value as ArtistChartFilter)}
            aria-label="Filter artist chart source"
          >
            <option value="all">All album + singles charts</option>
            {artistChartOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="completion-filter completion-year-filter">
          <span>From</span>
          <input
            type="number"
            inputMode="numeric"
            min="1000"
            max="3000"
            value={yearFrom ?? ""}
            placeholder="Any"
            onChange={(event) => setYearFrom(event.target.value ? Number(event.target.value) : null)}
            aria-label="Artist chart year from"
          />
        </label>
        <label className="completion-filter completion-year-filter">
          <span>To</span>
          <input
            type="number"
            inputMode="numeric"
            min="1000"
            max="3000"
            value={yearTo ?? ""}
            placeholder="Any"
            onChange={(event) => setYearTo(event.target.value ? Number(event.target.value) : null)}
            aria-label="Artist chart year to"
          />
        </label>
        <button
          className="secondary-button completion-filter-apply"
          type="button"
          disabled={isLoading}
          onClick={applyChartFilters}
        >
          Apply filters
        </button>
        {activeRequest ? (
          <button
            className="completion-filter-clear"
            type="button"
            disabled={isLoading}
            onClick={clearChartFilters}
            aria-label="Clear artist chart filters"
          >
            <X size={14} />
          </button>
        ) : null}
        <div className="completion-scan-summary">
          <strong>{data?.totalCandidates.toLocaleString() ?? "—"}</strong>
          <span>artists absent locally</span>
        </div>
      </section>

      <section className="completion-verification-panel" aria-label="Artist verification queue">
        <span className="completion-verification-icon"><ListChecks size={18} /></span>
        <div className="completion-verification-copy">
          <div className="completion-verification-heading">
            <span className="completion-kicker">Artist verification queue</span>
            <strong>{batch?.label ?? "Ready for a slow provider run"}</strong>
            {batch ? <span className={`completion-queue-state ${batch.state}`}>{batch.state}</span> : null}
          </div>
          {batch ? (
            <>
              <div className="completion-verification-progress" aria-label={`${batch.completedCount} of ${batch.totalCount} artists checked`}>
                <i style={{ width: `${percentage(batch.completedCount, batch.totalCount)}%` }} />
              </div>
              <p>
                <strong>{batch.completedCount.toLocaleString()} / {batch.totalCount.toLocaleString()}</strong>
                {` checked · ${batch.verifiedCount.toLocaleString()} with official albums · ${(batch.noMatchCount + batch.ambiguousCount).toLocaleString()} review · ${batch.failedCount.toLocaleString()} failed`}
              </p>
              <small>
                {currentItem
                  ? `${currentItem.provider === "discogs" ? "Cross-checking Discogs" : "Checking MusicBrainz"}: ${currentItem.artist}`
                  : batch.state === "paused"
                    ? "Paused safely. Every result is stored locally."
                    : batch.state === "completed"
                      ? "Run complete. Confirmed artists can now be added to the Wish List."
                      : etaLabel(batch.estimatedSecondsRemaining)}
              </small>
            </>
          ) : (
            <p>Select one or more absent chart artists. Checks are rate-limited and continue in the background.</p>
          )}
        </div>
        <div className="completion-verification-actions">
          {batch?.state === "running" ? (
            <button className="secondary-button" type="button" disabled={pendingQueueAction} onClick={() => void controlVerification("paused")}>
              <Pause size={14} /> Pause
            </button>
          ) : batch?.state === "paused" ? (
            <button className="primary-button" type="button" disabled={pendingQueueAction} onClick={() => void controlVerification("running")}>
              <Play size={14} /> Resume
            </button>
          ) : null}
          {batch && batch.failedCount > 0 ? (
            <button className="secondary-button" type="button" disabled={pendingQueueAction || hasActiveBatch} onClick={() => void retryFailures()}>
              <RotateCcw size={14} /> Retry failed
            </button>
          ) : null}
          {selectedForVerification.size > 0 ? (
            <button
              className="primary-button"
              type="button"
              disabled={pendingQueueAction || hasActiveBatch}
              onClick={() => void startVerification([...selectedForVerification], `Selected chart artists (${selectedForVerification.size})`)}
            >
              <ShieldCheck size={14} /> Verify selected ({selectedForVerification.size})
            </button>
          ) : null}
        </div>
      </section>

      {error ? <p className="error-message" role="alert">{error}</p> : null}
      {notice ? <p className="artist-completion-notice" role="status">{notice}</p> : null}

      <div className="completion-workbench artist-completion-workbench">
        <section className="completion-candidate-panel" aria-label="Missing chart artists">
          <header>
            <div>
              <span>Artist queue</span>
              <strong>{candidates.length.toLocaleString()} shown</strong>
            </div>
            <div className="completion-candidate-batch-actions">
              <button type="button" disabled={eligibleIds.size === 0} onClick={toggleShown}>
                {eligibleIds.size > 0 && [...eligibleIds].every((id) => selectedForVerification.has(id))
                  ? "Clear selection"
                  : "Select shown"}
              </button>
              <span>{data?.truncated ? `Top ${data.returnedCandidates.toLocaleString()} loaded` : "All loaded"}</span>
            </div>
          </header>
          <div
            ref={candidateListRef}
            className="completion-candidate-list"
            aria-label="Artist discovery candidates"
            onScroll={(event) => {
              candidateListScrollTopRef.current = event.currentTarget.scrollTop;
            }}
          >
            {candidates.map((candidate) => {
              const eligible = candidate.status === "candidate" &&
                (candidate.verificationStatus === "unverified" || candidate.verificationStatus === "failed");
              return (
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
                      disabled={!eligible}
                      onChange={() => toggleCandidate(candidate.id)}
                      aria-label={`Select ${candidate.artist} for verification`}
                    />
                  </label>
                  <button
                    type="button"
                    className={candidate.id === selectedId ? "completion-candidate active" : "completion-candidate"}
                    onClick={() => {
                      setSelectedId(candidate.id);
                      setMusicBrainzCandidates([]);
                      setNotice(null);
                    }}
                  >
                    <span className="completion-candidate-art artist"><UserRound size={18} /></span>
                    <span className="completion-candidate-copy">
                      <strong>{candidate.artist}</strong>
                      <span>First charted {candidate.firstChartYear}</span>
                      <small>{candidate.evidence.map((evidence) => evidence.label).join(" + ")}</small>
                    </span>
                    <span className={`completion-candidate-status ${candidate.verificationStatus}`}>
                      {artistVerificationLabel(candidate)}
                    </span>
                  </button>
                </div>
              );
            })}
            {!isLoading && candidates.length === 0 ? (
              <div className="completion-empty">
                <UsersRound size={25} />
                <strong>No artists match this view</strong>
                <span>Try another source filter or search.</span>
              </div>
            ) : null}
          </div>
        </section>

        <section className="completion-dossier" aria-label="Artist candidate dossier">
          {selected ? (
            <>
              <header className="completion-dossier-header artist-dossier-header">
                <span className="completion-dossier-art artist"><UserRound size={28} /></span>
                <div>
                  <span className="completion-kicker">Artist dossier</span>
                  <h2>{selected.artist}</h2>
                  <div className="completion-dossier-tags">
                    <span>First charted {selected.firstChartYear}</span>
                    <span>{selected.verificationStatus === "verified"
                      ? `${selected.officialAlbumCount} official studio ${selected.officialAlbumCount === 1 ? "album" : "albums"}`
                      : "Discography unverified"}</span>
                  </div>
                </div>
              </header>

              <div className="completion-local-proof">
                <Database size={18} />
                <div>
                  <strong>Confirmed absent locally</strong>
                  <p>No normalized album artist, track album artist, or track artist match exists in the imported library.</p>
                </div>
                <CheckCircle2 size={17} />
              </div>

              {selected.verificationStatus === "verified" ? (
                <section className="artist-album-proof" aria-label="Official studio album result">
                  <span><BarChart3 size={18} /></span>
                  <div>
                    <strong>{selected.officialAlbumCount} official studio {selected.officialAlbumCount === 1 ? "album" : "albums"} found</strong>
                    <p>MusicBrainz’s official release groups are ready to become the artist’s missing-album list.</p>
                  </div>
                  {selected.status === "wanted" ? <span>In Wish List</span> : (
                    <button className="primary-button" type="button" disabled={pendingDecision !== null} onClick={() => void decide("wanted")}>
                      <Heart size={14} /> Add artist to Wish List
                    </button>
                  )}
                </section>
              ) : null}

              <section className="completion-ledger">
                <header>
                  <div>
                    <span className="completion-kicker">Provenance ledger</span>
                    <h3>Why this artist is here</h3>
                  </div>
                  <span className="completion-confidence">Chart evidence</span>
                </header>
                {selected.evidence.map((evidence) => (
                  <div className="completion-ledger-row" key={`${evidence.source}-${evidence.chartKind}`}>
                    <span className="completion-ledger-icon"><BarChart3 size={15} /></span>
                    <div>
                      <strong>{evidence.label}</strong>
                      <p>Peak #{evidence.bestRank} · {evidence.appearances.toLocaleString()} appearances · {evidence.firstYear}{evidence.lastYear !== evidence.firstYear ? `–${evidence.lastYear}` : ""}</p>
                    </div>
                    <span>{evidence.chartKind === "albums" ? "Album chart" : "Singles chart"}</span>
                  </div>
                ))}
                <div className="completion-ledger-row">
                  <span className="completion-ledger-icon"><ShieldCheck size={15} /></span>
                  <div>
                    <strong>MusicBrainz</strong>
                    <p>{selected.musicbrainzVerificationMessage ?? "Finds the exact artist, then keeps only official primary Album release groups without live, compilation, soundtrack, EP, or other secondary types."}</p>
                  </div>
                  <div className="completion-ledger-actions">
                    <ProviderBadge
                      status={selected.musicbrainzVerificationStatus}
                      activity={selected.verificationStatus === "queued"
                        ? "queued"
                        : selected.verificationStatus === "checking" && currentItem?.artistId === selected.id && currentItem.provider !== "discogs"
                          ? "checking"
                          : null}
                    />
                    {selected.verificationStatus === "unverified" || selected.verificationStatus === "failed" ? (
                      <button type="button" disabled={pendingQueueAction || hasActiveBatch} onClick={() => void startVerification([selected.id], selected.artist)}>
                        Verify artist
                      </button>
                    ) : selected.verificationStatus === "noMatch" || selected.verificationStatus === "ambiguous" ? (
                      <button type="button" disabled={isSearchingMusicBrainz} onClick={() => void reviewMusicBrainz()}>
                        {isSearchingMusicBrainz ? "Searching…" : "Review matches"}
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className={`completion-ledger-row ${discogsStatus?.configured || selected.discogsVerificationStatus ? "" : "muted"}`}>
                  <span className="completion-ledger-icon"><Database size={15} /></span>
                  <div>
                    <strong>Discogs</strong>
                    <p>{selected.discogsVerificationMessage ?? (
                      discogsStatus?.configured
                        ? "Independently checks for an exact accepted master with a studio-album key release."
                        : "Add a Consumer Key and Secret in Settings > Providers to enable this cross-check."
                    )}</p>
                  </div>
                  <div className="completion-ledger-actions">
                    <ProviderBadge
                      status={selected.discogsVerificationStatus}
                      activity={selected.verificationStatus === "checking" && currentItem?.artistId === selected.id && currentItem.provider === "discogs" ? "checking" : null}
                    />
                    {selected.discogsMasterId ? <span>Master #{selected.discogsMasterId}</span> : null}
                  </div>
                </div>
              </section>

              {musicBrainzCandidates.length > 0 ? (
                <section className="completion-provider-results artist-provider-results" aria-label="MusicBrainz artist candidates">
                  <header>
                    <strong>MusicBrainz artist candidates</strong>
                    <span>Choose an identity; its official studio albums and Discogs evidence will be checked before anything is added.</span>
                  </header>
                  {musicBrainzCandidates.map((candidate) => (
                    <div className="artist-provider-result-row" key={candidate.musicbrainzId}>
                      <span className="artist-provider-result-copy">
                        <strong>{candidate.title}</strong>
                        <small>{[candidate.disambiguation, candidate.country].filter(Boolean).join(" · ") || "No disambiguation"}</small>
                      </span>
                      <span className="artist-provider-result-actions">
                        <a
                          href={candidate.musicbrainzUrl}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`View ${candidate.title} on MusicBrainz`}
                          onClick={(event) => {
                            event.preventDefault();
                            void openMusicBrainz(candidate.musicbrainzUrl);
                          }}
                        >
                          <ExternalLink size={13} aria-hidden="true" />
                          MusicBrainz
                        </a>
                        <button
                          type="button"
                          disabled={isSearchingMusicBrainz}
                          aria-label={`Check ${candidate.title} identity`}
                          onClick={() => void confirmMusicBrainz(candidate)}
                        >
                          Check identity
                        </button>
                      </span>
                    </div>
                  ))}
                </section>
              ) : null}

              <div className="completion-decisions artist-completion-decisions">
                <button
                  className={selected.status === "wanted" ? "primary-button active" : "primary-button"}
                  type="button"
                  disabled={pendingDecision !== null || selected.verificationStatus !== "verified"}
                  onClick={() => void decide("wanted")}
                >
                  <Heart size={15} />
                  {selected.status === "wanted" ? "In Wish List" : "Add artist to Wish List"}
                </button>
                <button className="secondary-button" type="button" disabled={pendingDecision !== null} onClick={() => void decide("needsReview")}>
                  <CircleHelp size={15} /> Needs review
                </button>
                <button className="completion-text-button" type="button" disabled={pendingDecision !== null} onClick={() => void decide("notForMe")}>
                  Not for me
                </button>
                {selected.status === "wanted" ? (
                  <button className="secondary-button" type="button" onClick={onOpenWishList}>
                    Open Wish List
                  </button>
                ) : null}
              </div>

              <footer className="completion-provider-strip">
                <span><i className="on" /> MusicBrainz <small>Official album authority</small></span>
                <span><i className={discogsStatus?.configured ? "on" : ""} /> Discogs <small>{discogsStatus?.configured ? "Cross-check ready" : "Configure in Settings"}</small></span>
                <span><i className="on" /> Local charts <small>Albums + singles</small></span>
              </footer>
            </>
          ) : (
            <div className="completion-empty completion-empty-dossier">
              <UsersRound size={28} />
              <strong>Select a missing artist</strong>
              <span>Chart provenance and provider checks will appear here.</span>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
