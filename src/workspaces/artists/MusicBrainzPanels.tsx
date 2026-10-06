import {
  type ArtistSummary,
  type MusicBrainzArtistDiscographyResponse,
  type MusicBrainzArtistRefreshResult,
  type MusicBrainzArtistOriginCountryUpdate,
  type MusicBrainzOriginCountryOption,
  type CountryFlagDisplay,
  type MusicBrainzArtistReleaseRow,
  type ExportResult,
  type MusicBrainzArtistCandidateRow,
} from "../../types";
import {
  useState,
  useId,
  useEffect,
  type FormEvent,
  type MouseEvent,
} from "react";
import {
  musicBrainzArtistUrl,
  musicBrainzStateLabel,
} from "../settings/settingsDisplay";
import {
  hasMusicBrainzArtistInfo,
  formatMusicBrainzArtistInfoState,
  isMusicBrainzGroupArtist,
  formatMusicBrainzArtistLifeDate,
  formatMusicBrainzArtistEndValue,
  formatMusicBrainzArtistLifeSummary,
} from "./ArtistTables";
import { canonicalCountryCode } from "../../app/countryNames";
import {
  countryOptionNameForCode,
  countryOptionCode,
  countryOptionLabel,
} from "../../app/countryCriteria";
import { MusicBrainzReviewState } from "../../components/MusicBrainzReviewState";
import {
  CloudDownload,
  UsersRound,
  ExternalLink,
  Check,
  Ban,
  Unlink,
  Save,
  RotateCcw,
  ShieldCheck,
  Download,
  FileSearch,
  Heart,
} from "lucide-react";
import {
  CountryDisplay,
  RunStatus,
} from "../../components/catalog/CatalogValues";
import { formatDate, formatNumber, formatPercent } from "../../app/display";
import { ExportResultStatus } from "../../components/ExportResultStatus";
import { listWishList, addWishListItem } from "../../backend";

export function MusicBrainzArtistInfoPanel({
  artist,
  response,
  isLoading,
  isUpdating,
  error,
  onUpdateInfo,
  onOpenExternalUrl,
  onSetArtistLink,
  onSetOriginCountry,
  refreshResult,
  originResult,
  countryOptions,
  countryFlagDisplay,
}: {
  artist: ArtistSummary | null;
  response: MusicBrainzArtistDiscographyResponse | null;
  isLoading: boolean;
  isUpdating: boolean;
  error: string | null;
  onUpdateInfo: () => void;
  onOpenExternalUrl: (url: string) => void;
  onSetArtistLink: (
    action: "verify" | "ignore" | "unlink" | "set",
    musicbrainzMbid?: string | null,
    canonicalName?: string | null,
  ) => void;
  onSetOriginCountry: (
    countryCode: string,
    countryName?: string | null,
  ) => void;
  refreshResult: MusicBrainzArtistRefreshResult | null;
  originResult: MusicBrainzArtistOriginCountryUpdate | null;
  countryOptions: MusicBrainzOriginCountryOption[];
  countryFlagDisplay: CountryFlagDisplay;
}) {
  const [manualMbid, setManualMbid] = useState("");
  const [manualOriginCode, setManualOriginCode] = useState("");
  const [manualOriginName, setManualOriginName] = useState("");
  const originInputId = useId();
  const originNameInputId = useId();
  const originOptionsId = `${originInputId}-options`;
  const musicBrainzMbid = response
    ? response.musicbrainzMbid
    : (artist?.musicBrainzMbid ?? null);
  const musicBrainzArtistLink = musicBrainzMbid
    ? musicBrainzArtistUrl(musicBrainzMbid)
    : null;
  const hasArtistInfo = hasMusicBrainzArtistInfo(artist);
  const infoStatusLabel = formatMusicBrainzArtistInfoState(artist);
  const isGroup = isMusicBrainzGroupArtist(artist);
  const lifeStartLabel = isGroup ? "Founded" : "Born";
  const lifeEndLabel = isGroup ? "Dissolved" : "Died";
  const lifeStartValue = formatMusicBrainzArtistLifeDate(
    artist?.musicBrainzBeginDate,
    artist?.musicBrainzBeginYear,
  );
  const lifeEndValue = formatMusicBrainzArtistEndValue(artist);
  const artistLinkLabel =
    response?.artistLinkState === "verified"
      ? "Verified"
      : response?.artistLinkState === "ignored"
        ? "Ignored"
        : response?.artistLinkState === "unverified"
          ? "Unverified"
          : "No review";
  const artistLinkIgnored = response?.artistLinkIgnored ?? false;
  const canVerify = Boolean(
    artist &&
    musicBrainzMbid &&
    response?.artistLinkState !== "verified" &&
    !isLoading,
  );
  const canIgnore = Boolean(
    artist && musicBrainzMbid && !artistLinkIgnored && !isLoading,
  );
  const canUnlink = Boolean(
    artist && response && musicBrainzMbid && !isLoading,
  );
  const manualMbidValue = manualMbid.trim();
  const manualOriginCodeValue = canonicalCountryCode(manualOriginCode);
  const selectedOriginName = countryOptionNameForCode(
    countryOptions,
    manualOriginCodeValue,
  );
  const manualOriginNameValue =
    manualOriginName.trim() || selectedOriginName || null;
  const canSetManualMbid = Boolean(artist && manualMbidValue && !isLoading);
  const canSetManualOrigin = Boolean(
    artist && /^[A-Z]{2}$/.test(manualOriginCodeValue) && !isLoading,
  );
  const canUpdateInfo = Boolean(
    artist && musicBrainzMbid && !artistLinkIgnored && !isLoading,
  );
  const refreshedOrigin = refreshResult?.origin ?? null;

  useEffect(() => {
    setManualMbid(musicBrainzMbid ?? "");
  }, [artist?.id, musicBrainzMbid]);

  useEffect(() => {
    setManualOriginCode(artist?.originCountryCode ?? "");
    setManualOriginName(artist?.originCountryName ?? "");
  }, [artist?.id, artist?.originCountryCode, artist?.originCountryName]);

  function handleManualMbidSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (manualMbidValue) {
      onSetArtistLink("set", manualMbidValue);
    }
  }

  function handleManualOriginSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canSetManualOrigin) {
      onSetOriginCountry(manualOriginCodeValue, manualOriginNameValue);
    }
  }

  function handleManualOriginCodeChange(value: string) {
    const nextCode = value.toUpperCase();
    const currentName = manualOriginName.trim();
    const previousName = countryOptionNameForCode(
      countryOptions,
      manualOriginCode,
    );
    const nextName = countryOptionNameForCode(countryOptions, nextCode);
    const artistOriginName = artist?.originCountryName?.trim() ?? "";
    setManualOriginCode(nextCode);
    if (
      /^[A-Z]{2}$/.test(nextCode) &&
      nextName &&
      (!currentName ||
        currentName === previousName ||
        currentName === artistOriginName)
    ) {
      setManualOriginName(nextName);
    }
  }

  function handleMusicBrainzArtistLinkClick(
    event: MouseEvent<HTMLAnchorElement>,
  ) {
    if (!musicBrainzArtistLink) {
      return;
    }
    event.preventDefault();
    onOpenExternalUrl(musicBrainzArtistLink);
  }

  return (
    <section
      className="table-panel musicbrainz-artist-info-panel"
      aria-label="MusicBrainz artist information"
    >
      <div className="panel-heading compact">
        <div>
          <h2>MusicBrainz Artist Info</h2>
          <p>
            {isLoading
              ? isUpdating
                ? "Updating artist information"
                : "Checking local cache"
              : artist
                ? hasArtistInfo
                  ? [
                      artist.musicBrainzArtistType,
                      formatMusicBrainzArtistLifeSummary(artist),
                    ]
                      .filter(Boolean)
                      .join(" / ")
                  : "Artist info not imported"
                : "Select an artist"}
          </p>
        </div>
        <div className="panel-actions">
          <MusicBrainzReviewState state={artist?.musicBrainzInfoReviewState} />
          <button
            className="musicbrainz-update-button"
            type="button"
            title="Update MusicBrainz info for this artist"
            aria-label="Update MusicBrainz info for this artist"
            disabled={!canUpdateInfo}
            onClick={onUpdateInfo}
          >
            <CloudDownload size={16} />
            <span>{isUpdating ? "Updating" : "Update"}</span>
          </button>
        </div>
      </div>

      {error ? <p className="error-message">{error}</p> : null}

      {!artist ? (
        <div className="empty-state large">
          <UsersRound size={20} />
          <span>Select an artist.</span>
        </div>
      ) : (
        <>
          <dl className="performance-summary musicbrainz-artist-info-summary">
            <div>
              <dt>Type</dt>
              <dd>{artist.musicBrainzArtistType ?? "Missing"}</dd>
            </div>
            <div>
              <dt>Gender</dt>
              <dd>{artist.musicBrainzGender ?? "n/a"}</dd>
            </div>
            <div>
              <dt>Sort name</dt>
              <dd>{artist.musicBrainzSortName ?? "Missing"}</dd>
            </div>
            <div>
              <dt>{lifeStartLabel}</dt>
              <dd>{lifeStartValue || "Missing"}</dd>
            </div>
            <div>
              <dt>{lifeEndLabel}</dt>
              <dd>{lifeEndValue || "Missing"}</dd>
            </div>
            <div>
              <dt>Begin area</dt>
              <dd>{artist.musicBrainzBeginAreaName ?? "Missing"}</dd>
            </div>
            <div>
              <dt>End area</dt>
              <dd>{artist.musicBrainzEndAreaName ?? "n/a"}</dd>
            </div>
            <div>
              <dt>Origin</dt>
              <dd>
                <CountryDisplay
                  value={artist}
                  mode={countryFlagDisplay}
                  fallback="Not imported"
                />
              </dd>
            </div>
          </dl>

          <div className="musicbrainz-artist-meta">
            {musicBrainzArtistLink ? (
              <a
                href={musicBrainzArtistLink}
                target="_blank"
                rel="noreferrer"
                onClick={handleMusicBrainzArtistLinkClick}
              >
                {`MBID: ${musicBrainzMbid}`}
                <ExternalLink size={13} aria-hidden="true" />
              </a>
            ) : (
              <span>No MBID</span>
            )}
            <span>{`Match: ${response?.matchMethod ?? "none"}`}</span>
            <span>{`Trust: ${artistLinkLabel}`}</span>
            <span>{`Info: ${infoStatusLabel}`}</span>
            {artist.musicBrainzInfoFetchedAt ? (
              <span>{`Fetched: ${formatDate(artist.musicBrainzInfoFetchedAt)}`}</span>
            ) : null}
          </div>

          <div
            className="musicbrainz-link-review"
            aria-label="MusicBrainz artist match review"
          >
            <div className="musicbrainz-link-actions">
              <button
                className="primary-button"
                type="button"
                disabled={!canVerify}
                onClick={() => onSetArtistLink("verify", musicBrainzMbid)}
              >
                <Check size={16} />
                <span>Verify</span>
              </button>
              <button
                className="icon-button"
                type="button"
                title="Ignore MusicBrainz for this artist"
                aria-label="Ignore MusicBrainz for this artist"
                disabled={!canIgnore}
                onClick={() => onSetArtistLink("ignore", musicBrainzMbid)}
              >
                <Ban size={16} />
              </button>
              <button
                className="icon-button"
                type="button"
                title="Unlink MusicBrainz artist match"
                aria-label="Unlink MusicBrainz artist match"
                disabled={!canUnlink}
                onClick={() => onSetArtistLink("unlink")}
              >
                <Unlink size={16} />
              </button>
            </div>
            <form
              className="musicbrainz-manual-link"
              onSubmit={handleManualMbidSubmit}
            >
              <input
                aria-label="Manual MusicBrainz artist MBID"
                value={manualMbid}
                placeholder="Artist MBID"
                disabled={!artist || isLoading}
                onChange={(event) => setManualMbid(event.target.value)}
              />
              <button
                className="icon-button"
                type="submit"
                title="Set MusicBrainz artist MBID"
                aria-label="Set MusicBrainz artist MBID"
                disabled={!canSetManualMbid}
              >
                <Save size={16} />
              </button>
            </form>
          </div>
          <form
            className="musicbrainz-origin-editor"
            onSubmit={handleManualOriginSubmit}
          >
            <label htmlFor={originInputId}>
              <span>Origin Country</span>
              <input
                id={originInputId}
                list={originOptionsId}
                value={manualOriginCode}
                placeholder="US"
                maxLength={2}
                disabled={!artist || isLoading}
                onChange={(event) =>
                  handleManualOriginCodeChange(event.target.value)
                }
                onBlur={(event) =>
                  setManualOriginCode(
                    canonicalCountryCode(event.currentTarget.value),
                  )
                }
              />
            </label>
            <label htmlFor={originNameInputId}>
              <span>Country name</span>
              <input
                id={originNameInputId}
                value={manualOriginName}
                placeholder={selectedOriginName ?? "United States"}
                disabled={!artist || isLoading}
                onChange={(event) => setManualOriginName(event.target.value)}
                onBlur={(event) =>
                  setManualOriginName(event.currentTarget.value.trim())
                }
              />
            </label>
            <datalist id={originOptionsId}>
              {countryOptions.map((country) => (
                <option
                  key={country.code}
                  value={countryOptionCode(country)}
                  label={countryOptionLabel(country)}
                >
                  {countryOptionLabel(country)}
                </option>
              ))}
            </datalist>
            <button
              className="icon-button"
              type="submit"
              title="Save manual origin country"
              aria-label="Save manual origin country"
              disabled={!canSetManualOrigin}
            >
              <Save size={16} />
            </button>
          </form>

          {refreshResult || originResult ? (
            <div
              className="musicbrainz-info-results"
              aria-label="MusicBrainz artist info updates"
            >
              {refreshResult ? (
                <div className="export-result musicbrainz-export-result">
                  <CloudDownload size={16} />
                  <span>
                    Artist info and {formatNumber(refreshResult.storedCount)}{" "}
                    release groups refreshed at{" "}
                    {formatDate(refreshResult.fetchedAt)}
                    {refreshedOrigin ? (
                      <>
                        {" / Origin "}
                        <CountryDisplay
                          value={refreshedOrigin}
                          mode={countryFlagDisplay}
                        />
                      </>
                    ) : null}
                  </span>
                </div>
              ) : null}
              {originResult ? (
                <div className="export-result musicbrainz-export-result">
                  <Save size={16} />
                  <span>
                    Origin saved as{" "}
                    <CountryDisplay
                      value={originResult}
                      mode={countryFlagDisplay}
                      fallback="manual"
                    />
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

export function MusicBrainzArtistDiscographyPanel({
  artist,
  response,
  isLoading,
  isUpdating,
  onRefresh,
  onOpenExternalUrl,
  onSetArtistLink,
  onSetReleaseDecision,
  onExport,
  exportResult,
}: {
  artist: ArtistSummary | null;
  response: MusicBrainzArtistDiscographyResponse | null;
  isLoading: boolean;
  isUpdating: boolean;
  onRefresh: () => void;
  onOpenExternalUrl: (url: string) => void;
  onSetArtistLink: (
    action: "verify" | "ignore" | "unlink" | "set",
    musicbrainzMbid?: string | null,
    canonicalName?: string | null,
  ) => void;
  onSetReleaseDecision: (
    row: MusicBrainzArtistReleaseRow,
    decision: "not-in-scope" | "include",
  ) => void;
  onExport: (format: "csv" | "xlsx") => void;
  exportResult: ExportResult | null;
}) {
  const rows = response?.releases ?? [];
  const visibleRows = rows.filter((row) => row.status !== "excluded");
  const candidates = response?.candidates ?? [];
  const statusLabel = musicBrainzStateLabel(response?.state);
  const artistLinkLabel =
    response?.artistLinkState === "verified"
      ? "Verified"
      : response?.artistLinkState === "ignored"
        ? "Ignored"
        : response?.artistLinkState === "unverified"
          ? "Unverified"
          : "No review";
  const canExport = Boolean(
    response &&
    !response.artistLinkIgnored &&
    visibleRows.length > 0 &&
    !isLoading,
  );

  return (
    <section
      className="table-panel musicbrainz-artist-panel"
      aria-label="MusicBrainz artist discography"
    >
      <div className="panel-heading compact">
        <div>
          <h2>MusicBrainz Discography</h2>
          <p>
            {isLoading
              ? isUpdating
                ? "Updating MusicBrainz"
                : "Checking local cache"
              : response
                ? `${formatNumber(response.ownedCount)} owned / ${formatNumber(response.missingCount)} missing scoped albums`
                : artist
                  ? "Not checked"
                  : "Select an artist"}
          </p>
        </div>
        <div className="panel-actions">
          <span
            className={`run-status run-status-${(response?.state ?? "unavailable").toLowerCase()}`}
          >
            {statusLabel}
          </span>
          <button
            className="icon-button"
            type="button"
            aria-label="Refresh MusicBrainz discography"
            disabled={!artist || isLoading}
            onClick={onRefresh}
          >
            <RotateCcw size={18} />
          </button>
        </div>
      </div>

      {!artist ? (
        <div className="empty-state large">
          <UsersRound size={20} />
          <span>Select an artist.</span>
        </div>
      ) : !response ? (
        <div className="empty-state large">
          <ShieldCheck size={20} />
          <span>
            {isLoading
              ? "Checking MusicBrainz cache."
              : "No MusicBrainz result yet."}
          </span>
        </div>
      ) : (
        <>
          <div
            className={`musicbrainz-status-strip musicbrainz-status-${response.state}`}
          >
            <span
              className={`run-status run-status-${response.state.toLowerCase()}`}
            >
              {statusLabel}
            </span>
            <span>{response.message}</span>
          </div>

          <dl className="performance-summary musicbrainz-artist-summary">
            <div>
              <dt>Completion</dt>
              <dd>
                {response.completion == null
                  ? "n/a"
                  : formatPercent(response.completion, 0)}
              </dd>
            </div>
            <div>
              <dt>Owned</dt>
              <dd>{formatNumber(response.ownedCount)}</dd>
            </div>
            <div>
              <dt>Missing</dt>
              <dd>{formatNumber(response.missingCount)}</dd>
            </div>
            <div>
              <dt>Filtered</dt>
              <dd>{formatNumber(response.excludedCount)}</dd>
            </div>
            <div>
              <dt>Scoped albums</dt>
              <dd>{formatNumber(response.pureAlbumCount)}</dd>
            </div>
            <div>
              <dt>Local albums</dt>
              <dd>{formatNumber(response.localAlbumCount)}</dd>
            </div>
            <div>
              <dt>Match</dt>
              <dd>{response.matchMethod}</dd>
            </div>
          </dl>

          <div className="musicbrainz-artist-meta">
            <span>{`Cache: ${response.matchedCacheName ?? "No cache artist"}`}</span>
            <span>{`Method: ${response.matchMethod}`}</span>
            <span>{`Trust: ${artistLinkLabel}`}</span>
            <span>
              {response.releaseGroupSource === "refreshed"
                ? `Source: refreshed${response.releaseGroupUpdatedAt ? ` ${formatDate(response.releaseGroupUpdatedAt)}` : ""}`
                : "Source: cache"}
            </span>
            {response.suspectMapping ? (
              <span>{`${formatNumber(response.cachedNameCount)} cache names / ${formatNumber(response.totalReleaseGroupCount)} release groups`}</span>
            ) : null}
          </div>

          {response.artistLinkIgnored ? null : (
            <>
              <div
                className="musicbrainz-export-controls"
                aria-label="Export selected artist MusicBrainz albums"
              >
                <div className="export-strip">
                  <button
                    type="button"
                    disabled={!canExport}
                    onClick={() => onExport("csv")}
                  >
                    <Download size={15} />
                    <span>CSV</span>
                  </button>
                  <button
                    type="button"
                    disabled={!canExport}
                    onClick={() => onExport("xlsx")}
                  >
                    <Download size={15} />
                    <span>XLSX</span>
                  </button>
                </div>
                {exportResult ? (
                  <ExportResultStatus result={exportResult} itemLabel="album" />
                ) : null}
              </div>
              <MusicBrainzArtistCandidateTable
                candidates={candidates}
                isLoading={isLoading}
                onOpenExternalUrl={onOpenExternalUrl}
                onVerifyCandidate={(candidate) =>
                  onSetArtistLink("verify", candidate.mbid, candidate.name)
                }
              />
              <MusicBrainzReleaseTable
                rows={rows}
                artistName={artist.name}
                onSetReleaseDecision={onSetReleaseDecision}
              />
            </>
          )}
          <small className="performance-database-path">
            {response.resolvedPath}
          </small>
        </>
      )}
    </section>
  );
}

export function MusicBrainzArtistCandidateTable({
  candidates,
  isLoading,
  onOpenExternalUrl,
  onVerifyCandidate,
}: {
  candidates: MusicBrainzArtistCandidateRow[];
  isLoading: boolean;
  onOpenExternalUrl: (url: string) => void;
  onVerifyCandidate: (candidate: MusicBrainzArtistCandidateRow) => void;
}) {
  if (candidates.length === 0) {
    return null;
  }

  return (
    <div
      className="result-table musicbrainz-candidate-results"
      role="table"
      aria-label="MusicBrainz artist candidates"
    >
      <div className="result-table-head" role="row">
        <span role="columnheader">Candidate</span>
        <span role="columnheader">MBID</span>
        <span role="columnheader">Match</span>
        <span role="columnheader">Score</span>
        <span role="columnheader">Cache</span>
        <span role="columnheader">Review</span>
      </div>
      {candidates.map((candidate) => {
        const candidateUrl = `https://musicbrainz.org/artist/${encodeURIComponent(candidate.mbid)}`;
        return (
          <div
            className={`result-table-row musicbrainz-candidate-row${candidate.suspectMapping ? " suspect" : ""}`}
            role="row"
            key={`${candidate.mbid}:${candidate.name}`}
          >
            <span role="cell" title={candidate.name}>
              {candidate.name}
            </span>
            <span role="cell">
              <a
                href={candidateUrl}
                target="_blank"
                rel="noreferrer"
                onClick={(event) => {
                  event.preventDefault();
                  onOpenExternalUrl(candidateUrl);
                }}
              >
                {candidate.mbid}
                <ExternalLink size={13} aria-hidden="true" />
              </a>
            </span>
            <span role="cell">{candidate.matchMethod}</span>
            <span role="cell">{formatPercent(candidate.score, 0)}</span>
            <span role="cell">{`${formatNumber(candidate.cachedNameCount)} names / ${formatNumber(candidate.totalReleaseGroupCount)} groups`}</span>
            <span role="cell" className="musicbrainz-candidate-action">
              <button
                className="icon-button"
                type="button"
                title={`Verify ${candidate.name}`}
                aria-label={`Verify ${candidate.name} as the MusicBrainz artist match`}
                disabled={isLoading}
                onClick={() => onVerifyCandidate(candidate)}
              >
                <Check size={16} />
              </button>
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function MusicBrainzReleaseTable({
  rows,
  artistName,
  onSetReleaseDecision,
}: {
  rows: MusicBrainzArtistReleaseRow[];
  artistName: string;
  onSetReleaseDecision: (
    row: MusicBrainzArtistReleaseRow,
    decision: "not-in-scope" | "include",
  ) => void;
}) {
  const visibleRows = rows.filter((row) => row.status !== "excluded");
  const [wishListReleaseIds, setWishListReleaseIds] = useState<Set<string>>(
    new Set(),
  );
  const [addingReleaseId, setAddingReleaseId] = useState<string | null>(null);
  const [wishListError, setWishListError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    void listWishList()
      .then((wishList) => {
        if (!disposed) {
          setWishListReleaseIds(
            new Set(
              wishList.items.flatMap((item) =>
                item.entity === "album" && item.musicbrainzId
                  ? [item.musicbrainzId]
                  : [],
              ),
            ),
          );
        }
      })
      .catch((loadError) => {
        if (!disposed) {
          setWishListError(
            loadError instanceof Error ? loadError.message : String(loadError),
          );
        }
      });
    return () => {
      disposed = true;
    };
  }, []);

  async function addReleaseToWishList(row: MusicBrainzArtistReleaseRow) {
    if (addingReleaseId || wishListReleaseIds.has(row.releaseMbid)) return;
    setAddingReleaseId(row.releaseMbid);
    setWishListError(null);
    try {
      await addWishListItem({
        entity: "album",
        title: row.title,
        artist: artistName,
        year: row.year,
        musicbrainzId: row.releaseMbid,
        musicbrainzUrl: `https://musicbrainz.org/release-group/${encodeURIComponent(row.releaseMbid)}`,
        source: "MusicBrainz discography",
      });
      setWishListReleaseIds((previous) =>
        new Set(previous).add(row.releaseMbid),
      );
    } catch (addError) {
      setWishListError(
        addError instanceof Error ? addError.message : String(addError),
      );
    } finally {
      setAddingReleaseId(null);
    }
  }

  if (visibleRows.length === 0) {
    return (
      <div className="empty-state">
        <FileSearch size={18} />
        <span>No in-scope MusicBrainz albums found.</span>
      </div>
    );
  }

  return (
    <div className="result-table musicbrainz-release-results" role="table">
      <div className="result-table-head" role="row">
        <span role="columnheader">MusicBrainz album</span>
        <span role="columnheader">Year</span>
        <span role="columnheader">Status</span>
        <span role="columnheader">Local match</span>
        <span role="columnheader">Confidence</span>
        <span role="columnheader">Actions</span>
      </div>
      {visibleRows.map((row) => (
        <div
          className={`result-table-row musicbrainz-release-row ${row.status}`}
          role="row"
          key={row.releaseMbid}
        >
          <span role="cell" title={row.title}>
            {row.title}
          </span>
          <span role="cell">{row.year ?? ""}</span>
          <span role="cell">
            <RunStatus status={row.status} />
          </span>
          <span role="cell" title={row.localAlbumTitle ?? ""}>
            {row.localAlbumTitle
              ? `${row.localAlbumTitle}${row.localYear ? ` (${row.localYear})` : ""}`
              : ""}
          </span>
          <span role="cell">
            {row.status === "owned" ? formatPercent(row.confidence, 0) : ""}
          </span>
          <span role="cell" className="musicbrainz-scope-action">
            {row.status === "excluded" ? (
              <button
                className="icon-button"
                type="button"
                title="Include in MusicBrainz album comparison"
                aria-label={`Include ${row.title} in MusicBrainz album comparison`}
                onClick={() => onSetReleaseDecision(row, "include")}
              >
                <RotateCcw size={16} />
              </button>
            ) : row.status === "missing" ? (
              <>
                <button
                  className={`icon-button${wishListReleaseIds.has(row.releaseMbid) ? " active" : ""}`}
                  type="button"
                  title={
                    wishListReleaseIds.has(row.releaseMbid)
                      ? "Already on Wish List"
                      : "Add to Wish List"
                  }
                  aria-label={`${wishListReleaseIds.has(row.releaseMbid) ? "Added" : "Add"} ${row.title} to Wish List`}
                  disabled={
                    wishListReleaseIds.has(row.releaseMbid) ||
                    addingReleaseId === row.releaseMbid
                  }
                  onClick={() => void addReleaseToWishList(row)}
                >
                  {wishListReleaseIds.has(row.releaseMbid) ? (
                    <Check size={16} />
                  ) : (
                    <Heart size={16} />
                  )}
                </button>
                <button
                  className="icon-button"
                  type="button"
                  title="Mark not in scope"
                  aria-label={`Mark ${row.title} as not in scope`}
                  onClick={() => onSetReleaseDecision(row, "not-in-scope")}
                >
                  <Ban size={16} />
                </button>
              </>
            ) : null}
          </span>
        </div>
      ))}
      {wishListError ? (
        <p className="error-message musicbrainz-wish-list-error">
          {wishListError}
        </p>
      ) : null}
    </div>
  );
}
