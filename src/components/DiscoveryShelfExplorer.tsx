import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react";

import type {
  DiscoveryChartStory,
  DiscoveryShelfExplorerRequest,
  DiscoveryShelfExplorerResponse,
} from "../types";
import { AlbumCover } from "./AlbumCover";
import { ArtistPortrait } from "./ArtistPortrait";

type DiscoveryShelfExplorerProps = {
  initialRequest: DiscoveryShelfExplorerRequest;
  onLoad: (
    request: DiscoveryShelfExplorerRequest,
  ) => Promise<DiscoveryShelfExplorerResponse>;
  onBack: () => void;
  onOpenAlbum: (albumId: string) => void;
  onOpenArtist: (artistId: string, artistName: string) => void;
  onOpenTrack: (trackId: number) => void;
};

const pageSize = 24;

const shelfSorts: Record<DiscoveryShelfExplorerRequest["shelf"], Array<[string, string]>> = {
  anniversaries: [
    ["chart", "Best chart evidence"],
    ["artist", "Artist A–Z"],
    ["album", "Album A–Z"],
  ],
  "life-events": [
    ["albums", "Most library albums"],
    ["loved", "Most loved tracks"],
    ["name", "Artist A–Z"],
    ["year", "Most recent year"],
  ],
  charts: [
    ["rank", "Chart rank"],
    ["artist", "Artist A–Z"],
    ["album", "Album A–Z"],
  ],
  "deep-cuts": [
    ["rating", "Highest album rating"],
    ["newest", "Newest release"],
    ["artist", "Artist A–Z"],
    ["track", "Track A–Z"],
  ],
  completion: [
    ["most-missing", "Most missing"],
    ["least-complete", "Least complete"],
    ["artist", "Artist A–Z"],
    ["missing-year", "Newest missing release"],
  ],
  recommendations: [
    ["relevance", "Recommendation relevance"],
    ["least-rated", "Least rated"],
    ["artist", "Artist A–Z"],
    ["album", "Album A–Z"],
  ],
};

function periodValue(response: DiscoveryShelfExplorerResponse | null) {
  if (response?.year != null) return `year:${response.year}`;
  if (response?.decade != null) return `decade:${response.decade}`;
  return "all";
}

function formatDuration(seconds: number | null) {
  if (!seconds || seconds < 1) return null;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function openChartStory(
  story: DiscoveryChartStory,
  onOpenAlbum: (albumId: string) => void,
  onOpenTrack: (trackId: number) => void,
) {
  if (story.trackId !== null) onOpenTrack(story.trackId);
  else onOpenAlbum(story.albumId);
}

export function DiscoveryShelfExplorer({
  initialRequest,
  onLoad,
  onBack,
  onOpenAlbum,
  onOpenArtist,
  onOpenTrack,
}: DiscoveryShelfExplorerProps) {
  const [request, setRequest] = useState<DiscoveryShelfExplorerRequest>({
    ...initialRequest,
    limit: pageSize,
    offset: 0,
  });
  const [response, setResponse] = useState<DiscoveryShelfExplorerResponse | null>(null);
  const [searchDraft, setSearchDraft] = useState(initialRequest.query ?? "");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    void onLoad(request)
      .then((next) => {
        if (!cancelled) setResponse(next);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [onLoad, request]);

  const currentSorts = useMemo(() => {
    if (request.shelf !== "completion" || (response?.mode ?? request.mode) !== "album") {
      return shelfSorts[request.shelf];
    }
    return [
      ["most-unrated", "Most unrated tracks"],
      ["least-complete", "Least complete"],
      ["newest", "Newest release"],
      ["artist", "Artist A–Z"],
      ["album", "Album A–Z"],
    ];
  }, [request.mode, request.shelf, response?.mode]);

  function update(patch: Partial<DiscoveryShelfExplorerRequest>) {
    setRequest((current) => ({
      ...current,
      ...patch,
      seed: response?.seed ?? current.seed,
      offset: 0,
    }));
  }

  function changePeriod(value: string) {
    const [kind, rawValue] = value.split(":");
    update({
      year: kind === "year" ? Number(rawValue) : undefined,
      decade: kind === "decade" ? Number(rawValue) : undefined,
    });
  }

  const availableDecades = Array.from(
    new Set((response?.availableYears ?? []).map((year) => Math.floor(year / 10) * 10)),
  ).sort((left, right) => right - left);
  const first = response && response.total ? response.offset + 1 : 0;
  const last = response ? Math.min(response.offset + response.limit, response.total) : 0;
  const canPrevious = Boolean(response && response.offset > 0 && !isLoading);
  const canNext = Boolean(response && response.offset + response.limit < response.total && !isLoading);

  return (
    <section className="daily-edition daily-edition-explorer" aria-label="Daily Edition shelf explorer">
      <header className="daily-edition-explorer-header">
        <button type="button" className="daily-edition-explorer-back" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
          Back to Daily Edition
        </button>
        <div>
          <p className="daily-edition-kicker">See all</p>
          <h2>{response?.title ?? "Loading shelf…"}</h2>
          <p>{response?.evidenceNote ?? "Loading the shelf's local evidence…"}</p>
        </div>
      </header>

      <div className="daily-edition-explorer-controls" aria-label="Shelf explorer filters">
        {request.shelf === "anniversaries" ? (
          <>
            <label>
              <span>Anniversary</span>
              <select
                aria-label="Filter explorer by anniversary"
                value={response?.anniversaryYears ?? request.anniversaryYears ?? 50}
                onChange={(event) => update({ anniversaryYears: Number(event.target.value) })}
              >
                {Array.from({ length: 19 }, (_, index) => (index + 2) * 5).map((years) => (
                  <option key={years} value={years}>{years} years</option>
                ))}
              </select>
            </label>
            <label>
              <span>Chart evidence</span>
              <select
                aria-label="Filter anniversary chart evidence"
                value={response?.source ?? request.source ?? "all"}
                onChange={(event) => update({ source: event.target.value })}
              >
                <option value="all">All albums</option>
                <option value="billboard">Billboard</option>
                <option value="official-uk">Official UK</option>
                <option value="vg-lista">VG-lista</option>
                <option value="uncharted">Local fallback</option>
              </select>
            </label>
          </>
        ) : null}

        {request.shelf === "life-events" ? (
          <label>
            <span>Event</span>
            <select
              aria-label="Filter life-event type"
              value={response?.eventType ?? request.eventType ?? "birthday"}
              onChange={(event) => update({ eventType: event.target.value as "birthday" | "memorial" })}
            >
              <option value="birthday">Birthdays</option>
              <option value="memorial">Memorials</option>
            </select>
          </label>
        ) : null}

        {request.shelf === "charts" ? (
          <>
            <label>
              <span>Chart</span>
              <select
                aria-label="Filter explorer by chart"
                value={response?.source ?? request.source ?? "billboard"}
                onChange={(event) => update({ source: event.target.value, year: undefined, week: undefined })}
              >
                <option value="billboard">Billboard</option>
                <option value="official-uk">Official UK</option>
                <option value="vg-lista">VG-lista</option>
              </select>
            </label>
            <label>
              <span>Year</span>
              <select
                aria-label="Filter explorer by chart year"
                value={response?.year ?? request.year ?? ""}
                onChange={(event) => update({ year: Number(event.target.value), week: undefined })}
              >
                {(response?.availableYears ?? []).map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </label>
            {(response?.source ?? request.source) !== "billboard" ? (
              <label>
                <span>Week</span>
                <select
                  aria-label="Filter explorer by chart week"
                  value={response?.week ?? request.week ?? ""}
                  onChange={(event) => update({ week: Number(event.target.value) })}
                >
                  {(response?.availableWeeks ?? []).map((week) => (
                    <option key={week} value={week}>Week {week}</option>
                  ))}
                </select>
              </label>
            ) : null}
          </>
        ) : null}

        {request.shelf === "completion" ? (
          <label>
            <span>Complete</span>
            <select
              aria-label="Filter completion explorer mode"
              value={response?.mode ?? request.mode ?? "artist"}
              onChange={(event) => update({
                mode: event.target.value,
                sort: event.target.value === "artist" ? "most-missing" : "most-unrated",
              })}
            >
              <option value="artist">Artists</option>
              <option value="album">Albums</option>
            </select>
          </label>
        ) : null}

        {request.shelf === "deep-cuts" || request.shelf === "completion" ? (
          <>
            <label>
              <span>Period</span>
              <select
                aria-label="Filter explorer by period"
                value={periodValue(response)}
                onChange={(event) => changePeriod(event.target.value)}
              >
                <option value="all">All years</option>
                <optgroup label="Decades">
                  {availableDecades.map((decade) => (
                    <option key={decade} value={`decade:${decade}`}>{decade}s</option>
                  ))}
                </optgroup>
                <optgroup label="Years">
                  {(response?.availableYears ?? []).map((year) => (
                    <option key={year} value={`year:${year}`}>{year}</option>
                  ))}
                </optgroup>
              </select>
            </label>
            <label>
              <span>Genre</span>
              <select
                aria-label="Filter explorer by genre"
                value={response?.genre ?? request.genre ?? ""}
                onChange={(event) => update({ genre: event.target.value || undefined })}
              >
                <option value="">All genres</option>
                {(response?.availableGenres ?? []).map((genre) => (
                  <option key={genre.id} value={genre.id}>{genre.label}</option>
                ))}
              </select>
            </label>
          </>
        ) : null}

        {request.shelf === "recommendations" ? (
          <>
            <label>
              <span>Signal</span>
              <select
                aria-label="Filter recommendation signal"
                value={response?.mode ?? request.mode ?? "played"}
                onChange={(event) => update({ mode: event.target.value })}
              >
                <option value="played">Played</option>
                <option value="loved">Loved</option>
              </select>
            </label>
            <label>
              <span>Connection</span>
              <select
                aria-label="Filter recommendation connection"
                value={response?.connection ?? request.connection ?? "all"}
                onChange={(event) => update({ connection: event.target.value })}
              >
                <option value="all">All connections</option>
                <option value="lastfm">Any Last.fm link</option>
                <option value="related">Related album</option>
                <option value="similar">Similar artist</option>
                <option value="genre">Genre fallback</option>
              </select>
            </label>
          </>
        ) : null}

        <label>
          <span>Sort</span>
          <select
            aria-label="Sort shelf explorer"
            value={response?.sort || request.sort || currentSorts[0][0]}
            onChange={(event) => update({ sort: event.target.value })}
          >
            {currentSorts.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>

        <form
          className="daily-edition-explorer-search"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            update({ query: searchDraft.trim() || undefined });
          }}
        >
          <label>
            <span>Search this shelf</span>
            <input
              aria-label="Search this shelf"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Artist, album, track, evidence"
            />
          </label>
          <button type="submit" aria-label="Apply shelf search">
            <Search aria-hidden="true" />
          </button>
        </form>
      </div>

      <div className="daily-edition-explorer-summary" aria-live="polite">
        <strong>{isLoading ? "Loading…" : `${first}–${last} of ${response?.total ?? 0}`}</strong>
        {response?.sourceLabel ? <span>{response.sourceLabel}</span> : null}
        {response?.year ? (
          <span>{response.week ? `Week ${response.week}, ` : ""}{response.year}</span>
        ) : null}
      </div>

      {error ? <p className="error-message">{error}</p> : null}
      {!error && !isLoading && response?.total === 0 ? (
        <p className="daily-edition-explorer-empty">No stories match these filters.</p>
      ) : null}

      <div className={`daily-edition-explorer-results${isLoading ? " is-loading" : ""}`} aria-busy={isLoading}>
        {response?.anniversaries.map((story) => (
          <article className="daily-edition-explorer-card" key={story.albumId}>
            <button type="button" onClick={() => onOpenAlbum(story.albumId)}>
              <AlbumCover row={{ albumId: story.albumId, album: story.album, coverPath: story.coverPath }} />
              <span className="daily-edition-explorer-copy">
                <strong>{story.album}</strong>
                <span>{story.artist} · {story.releaseYear}</span>
                <small>{story.evidence}</small>
              </span>
              <ChevronRight aria-hidden="true" />
            </button>
            <details><summary>Why this?</summary><p>{story.selectionReason}</p></details>
          </article>
        ))}

        {response?.lifeEvents.map((story) => (
          <article className="daily-edition-explorer-card" key={`${story.artistId}:${story.eventType}`}>
            <button type="button" onClick={() => onOpenArtist(story.artistId, story.artist)}>
              <ArtistPortrait
                artistId={story.artistId}
                artistName={story.artist}
                portraitAvailable={story.portraitAvailable}
                representativeAlbumId={story.representativeAlbumId}
                representativeAlbum={story.representativeAlbum}
                representativeCoverPath={story.representativeCoverPath}
              />
              <span className="daily-edition-explorer-copy">
                <strong>{story.artist}</strong>
                <span>{story.eventDate} · {story.years} {story.eventType === "birthday" ? "years old" : "years ago"}</span>
                <small>{story.evidence}</small>
              </span>
              <ChevronRight aria-hidden="true" />
            </button>
          </article>
        ))}

        {response?.chartStories.map((story) => (
          <article className="daily-edition-explorer-card" key={`${story.albumId}:${story.rank}`}>
            <button type="button" onClick={() => openChartStory(story, onOpenAlbum, onOpenTrack)}>
              <span className="daily-edition-explorer-rank">{story.rank}</span>
              <AlbumCover row={{ albumId: story.albumId, album: story.album ?? story.title, coverPath: story.coverPath }} />
              <span className="daily-edition-explorer-copy">
                <strong>{story.title}</strong>
                <span>{story.artist}</span>
                <small>{story.evidence}</small>
              </span>
              <ChevronRight aria-hidden="true" />
            </button>
          </article>
        ))}

        {response?.deepCuts.map((story) => (
          <article className="daily-edition-explorer-card" key={story.trackId}>
            <button type="button" onClick={() => onOpenTrack(story.trackId)}>
              <AlbumCover row={{ albumId: story.albumId, album: story.album, coverPath: story.coverPath }} />
              <span className="daily-edition-explorer-copy">
                <strong>{story.title}</strong>
                <span>{story.artist} · {story.album}{formatDuration(story.timeSeconds) ? ` · ${formatDuration(story.timeSeconds)}` : ""}</span>
                <small>{story.evidence}</small>
              </span>
              <ChevronRight aria-hidden="true" />
            </button>
          </article>
        ))}

        {response?.artistCompletions.map((story) => (
          <article className="daily-edition-explorer-card" key={story.artistId}>
            <button type="button" onClick={() => onOpenArtist(story.artistId, story.artist)}>
              <ArtistPortrait
                artistId={story.artistId}
                artistName={story.artist}
                portraitAvailable={story.portraitAvailable}
                representativeAlbumId={story.representativeAlbumId}
                representativeAlbum={story.representativeAlbum}
                representativeCoverPath={story.representativeCoverPath}
              />
              <span className="daily-edition-explorer-copy">
                <strong>{story.artist}</strong>
                <span>Next gap: {story.missingReleaseTitle}{story.missingReleaseYear ? ` · ${story.missingReleaseYear}` : ""}</span>
                <small>{story.evidence}</small>
              </span>
              <span className="daily-edition-explorer-percent">{Math.round(story.completionPercent * 100)}%</span>
              <ChevronRight aria-hidden="true" />
            </button>
          </article>
        ))}

        {response?.albumCompletions.map((story) => (
          <article className="daily-edition-explorer-card" key={story.albumId}>
            <button type="button" onClick={() => onOpenAlbum(story.albumId)}>
              <AlbumCover row={{ albumId: story.albumId, album: story.album, coverPath: story.coverPath }} />
              <span className="daily-edition-explorer-copy">
                <strong>{story.album}</strong>
                <span>{story.artist} · {story.releaseYear ?? "Year unknown"} · {story.genre}</span>
                <small>{story.evidence}</small>
              </span>
              <span className="daily-edition-explorer-percent">{Math.round(story.completionPercent * 100)}%</span>
              <ChevronRight aria-hidden="true" />
            </button>
          </article>
        ))}

        {response?.recommendations.map((story) => (
          <article className="daily-edition-explorer-card" key={story.albumId}>
            <button type="button" onClick={() => onOpenAlbum(story.albumId)}>
              <AlbumCover row={{ albumId: story.albumId, album: story.album, coverPath: story.coverPath }} />
              <span className="daily-edition-explorer-copy">
                <strong>{story.album}</strong>
                <span>{story.artist} · from {story.anchorArtist}, {story.anchorAlbum}</span>
                <small>{story.evidence}</small>
              </span>
              <ChevronRight aria-hidden="true" />
            </button>
          </article>
        ))}
      </div>

      <nav className="daily-edition-explorer-pagination" aria-label="Shelf explorer pages">
        <button
          type="button"
          disabled={!canPrevious}
          onClick={() => setRequest((current) => ({
            ...current,
            seed: response?.seed ?? current.seed,
            offset: Math.max(0, (response?.offset ?? 0) - (response?.limit ?? pageSize)),
          }))}
        >
          <ChevronLeft aria-hidden="true" />
          Previous
        </button>
        <span>{first}–{last} of {response?.total ?? 0}</span>
        <button
          type="button"
          disabled={!canNext}
          onClick={() => setRequest((current) => ({
            ...current,
            seed: response?.seed ?? current.seed,
            offset: (response?.offset ?? 0) + (response?.limit ?? pageSize),
          }))}
        >
          Next
          <ChevronRight aria-hidden="true" />
        </button>
      </nav>
    </section>
  );
}
