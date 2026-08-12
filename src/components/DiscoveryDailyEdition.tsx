import { useEffect, useState } from "react";
import {
  CalendarDays,
  ChartLine,
  ChevronRight,
  CircleDot,
  Heart,
  Info,
  Play,
  RefreshCw,
  Shuffle,
  Sparkles,
} from "lucide-react";

import type {
  DiscoveryChartSnapshotRequest,
  DiscoveryChartStory,
  DiscoveryCompletionSnapshotRequest,
  DiscoveryDailyEdition,
  DiscoveryDeepCutSnapshotRequest,
  DiscoveryRecommendationSnapshotRequest,
} from "../types";
import { AlbumCover } from "./AlbumCover";
import { ArtistPortrait } from "./ArtistPortrait";

type DiscoveryDailyEditionProps = {
  edition: DiscoveryDailyEdition | null;
  isLoading: boolean;
  isAnniversaryLoading: boolean;
  isChartLoading: boolean;
  isDeepCutLoading: boolean;
  isCompletionLoading: boolean;
  isRecommendationLoading: boolean;
  onAnniversaryYearsChange: (years: number) => void;
  onChartSnapshotChange: (request: DiscoveryChartSnapshotRequest) => void;
  onDeepCutSnapshotChange: (request: DiscoveryDeepCutSnapshotRequest) => void;
  onCompletionSnapshotChange: (request: DiscoveryCompletionSnapshotRequest) => void;
  onRecommendationSnapshotChange: (
    request: DiscoveryRecommendationSnapshotRequest,
  ) => void;
  onOpenAlbum: (albumId: string) => void;
  onOpenArtist: (artistId: string, artistName: string) => void;
  onOpenCompletion: () => void;
  onOpenTrack: (trackId: number) => void;
};

const anniversaryYearOptions = Array.from(
  { length: 19 },
  (_, index) => (index + 2) * 5,
);

const longDateFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
});

const shortDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function localDate(value: string) {
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatLongDate(value: string) {
  const parsed = localDate(value);
  return parsed ? longDateFormatter.format(parsed) : value;
}

function formatEventDate(value: string, eventType: string, years: number) {
  const parsed = localDate(value);
  if (!parsed) return value;
  if (eventType === "memorial") {
    return `Died ${shortDateFormatter.format(parsed)} · ${years} years ago`;
  }
  return `Born ${shortDateFormatter.format(parsed)} · ${years}`;
}

function formatDuration(seconds: number | null) {
  if (!seconds || seconds < 1) return null;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function openChartStory(
  story: DiscoveryChartStory,
  onOpenAlbum: (albumId: string) => void,
  onOpenTrack: (trackId: number) => void,
) {
  if (story.trackId !== null) {
    onOpenTrack(story.trackId);
    return;
  }
  onOpenAlbum(story.albumId);
}

function EditionEmpty({ children }: { children: string }) {
  return <p className="daily-edition-empty">{children}</p>;
}

type LifeEventsPanelProps = {
  edition: DiscoveryDailyEdition;
  onOpenArtist: (artistId: string, artistName: string) => void;
};

function LifeEventsPanel({ edition, onOpenArtist }: LifeEventsPanelProps) {
  const [activeEventType, setActiveEventType] = useState<"birthday" | "memorial">(
    "birthday",
  );
  const events = edition.lifeEvents
    .filter((story) => story.eventType === activeEventType)
    .slice(0, 5);

  useEffect(() => {
    setActiveEventType("birthday");
  }, [edition.date]);

  return (
    <div
      className="daily-edition-life"
      id="discovery-life-events"
      aria-labelledby="life-events-heading"
      tabIndex={-1}
    >
      <div className="daily-edition-life-heading">
        <div className="daily-edition-section-heading">
          <CalendarDays aria-hidden="true" />
          <div>
            <h3 id="life-events-heading">Today</h3>
            <p>
              {activeEventType === "birthday"
                ? "Artists born on this date"
                : "Artists who died on this date"}
            </p>
          </div>
        </div>
        <div className="daily-edition-life-tabs" role="tablist" aria-label="Life events">
          <button
            id="daily-edition-birthdays-tab"
            type="button"
            role="tab"
            aria-selected={activeEventType === "birthday"}
            aria-controls="daily-edition-life-panel"
            onClick={() => setActiveEventType("birthday")}
          >
            Birthdays
          </button>
          <button
            id="daily-edition-memorials-tab"
            type="button"
            role="tab"
            aria-selected={activeEventType === "memorial"}
            aria-controls="daily-edition-life-panel"
            onClick={() => setActiveEventType("memorial")}
          >
            Memorials
          </button>
        </div>
      </div>

      <div
        className="daily-edition-life-list"
        id="daily-edition-life-panel"
        role="tabpanel"
        aria-labelledby={
          activeEventType === "birthday"
            ? "daily-edition-birthdays-tab"
            : "daily-edition-memorials-tab"
        }
      >
        {events.length ? (
          events.map((story) => (
            <button
              className="daily-edition-life-row"
              key={`${story.artistId}:${story.eventType}:${story.eventDate}`}
              type="button"
              onClick={() => onOpenArtist(story.artistId, story.artist)}
            >
              <ArtistPortrait
                artistId={story.artistId}
                artistName={story.artist}
                portraitAvailable={story.portraitAvailable}
                representativeAlbumId={story.representativeAlbumId}
                representativeAlbum={story.representativeAlbum}
                representativeCoverPath={story.representativeCoverPath}
              />
              <span className="daily-edition-row-copy">
                <strong>{story.artist}</strong>
                <small>
                  {formatEventDate(story.eventDate, story.eventType, story.years)}
                </small>
                <small>{story.evidence.split(" · ").slice(-1)[0]}</small>
              </span>
              <ChevronRight aria-hidden="true" />
            </button>
          ))
        ) : (
          <EditionEmpty>
            {activeEventType === "birthday"
              ? "No library artists were born on this date."
              : "No library artist memorials fall on this date."}
          </EditionEmpty>
        )}
      </div>
    </div>
  );
}

type AnniversaryCarouselProps = {
  edition: DiscoveryDailyEdition;
  isLoading: boolean;
  onAnniversaryYearsChange: (years: number) => void;
  onOpenAlbum: (albumId: string) => void;
};

function AnniversaryCarousel({
  edition,
  isLoading,
  onAnniversaryYearsChange,
  onOpenAlbum,
}: AnniversaryCarouselProps) {
  const anniversaries = edition.anniversaries.slice(0, 5);
  const anniversaryKey = anniversaries.map((story) => story.albumId).join("|");
  const [activeIndex, setActiveIndex] = useState(0);
  const [rotationCycle, setRotationCycle] = useState(0);
  const anniversary = anniversaries[activeIndex] ?? anniversaries[0] ?? null;

  useEffect(() => {
    setActiveIndex(0);
    setRotationCycle((current) => current + 1);
  }, [anniversaryKey, edition.anniversaryYears]);

  useEffect(() => {
    if (
      anniversaries.length < 2 ||
      isLoading ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      setActiveIndex((current) => (current + 1) % anniversaries.length);
      setRotationCycle((current) => current + 1);
    }, 10_000);
    return () => window.clearTimeout(timer);
  }, [
    activeIndex,
    anniversaries.length,
    anniversaryKey,
    edition.anniversaryYears,
    isLoading,
    rotationCycle,
  ]);

  function selectAnniversary(index: number) {
    setActiveIndex(index);
    setRotationCycle((current) => current + 1);
  }

  return (
    <div
      className={`daily-edition-anniversary-stage${isLoading ? " is-loading" : ""}`}
      role="region"
      aria-roledescription="carousel"
      aria-label={`${edition.anniversaryYears}-year album anniversaries`}
      aria-busy={isLoading}
    >
      {anniversary ? (
        <div
          className="daily-edition-anniversary-slide"
          key={anniversary.albumId}
          role="group"
          aria-roledescription="slide"
          aria-label={`${activeIndex + 1} of ${anniversaries.length}: ${anniversary.album} by ${anniversary.artist}`}
        >
          <button
            className="daily-edition-lead-cover"
            type="button"
            onClick={() => onOpenAlbum(anniversary.albumId)}
            aria-label={`Open ${anniversary.album} by ${anniversary.artist}`}
          >
            <AlbumCover
              row={{
                albumId: anniversary.albumId,
                album: anniversary.album,
                coverPath: anniversary.coverPath,
              }}
              decorative={false}
            />
          </button>
          <div className="daily-edition-lead-copy">
            <div className="daily-edition-anniversary-toolbar">
              <p className="daily-edition-kicker">
                {edition.anniversaryYears} years ago
              </p>
              <label className="daily-edition-anniversary-picker">
                <span>Anniversary</span>
                <select
                  aria-label="Choose anniversary milestone"
                  value={edition.anniversaryYears}
                  disabled={isLoading}
                  onChange={(event) =>
                    onAnniversaryYearsChange(Number(event.target.value))
                  }
                >
                  {anniversaryYearOptions.map((years) => (
                    <option key={years} value={years}>
                      {years} years
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <h3 id="anniversary-heading">
              <span>{anniversary.artist}</span>
              <em>{anniversary.album}</em>
            </h3>
            <p className="daily-edition-release">
              Released in {anniversary.releaseYear}
            </p>
            <p className="daily-edition-evidence">
              <span className="daily-edition-evidence-marker" aria-hidden="true" />
              <strong>Evidence</strong>
              <span className="daily-edition-evidence-copy">
                {anniversary.evidence}
              </span>
            </p>
            <details className="daily-edition-why">
              <summary>Why this?</summary>
              <p>{anniversary.selectionReason}</p>
            </details>
            <button
              className="daily-edition-primary-action"
              type="button"
              onClick={() => onOpenAlbum(anniversary.albumId)}
            >
              Read the story
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : (
        <div className="daily-edition-lead-empty">
          <div className="daily-edition-anniversary-toolbar">
            <p className="daily-edition-kicker">
              {edition.anniversaryYears} years ago
            </p>
            <label className="daily-edition-anniversary-picker">
              <span>Anniversary</span>
              <select
                aria-label="Choose anniversary milestone"
                value={edition.anniversaryYears}
                disabled={isLoading}
                onChange={(event) =>
                  onAnniversaryYearsChange(Number(event.target.value))
                }
              >
                {anniversaryYearOptions.map((years) => (
                  <option key={years} value={years}>
                    {years} years
                  </option>
                ))}
              </select>
            </label>
          </div>
          <h3 id="anniversary-heading">No anniversary match today</h3>
          <p>
            No owned album from {Number(edition.date.slice(0, 4)) - edition.anniversaryYears}
            matched this milestone. Choose another anniversary to keep looking.
          </p>
        </div>
      )}

      {anniversaries.length > 1 ? (
        <div className="daily-edition-carousel-rail" aria-label="Anniversary albums">
          {anniversaries.map((story, index) => (
            <button
              className={index === activeIndex ? "active" : ""}
              key={story.albumId}
              type="button"
              aria-label={`Show ${story.album} by ${story.artist}`}
              aria-current={index === activeIndex ? "true" : undefined}
              onClick={() => selectAnniversary(index)}
              title={`${story.artist} — ${story.album}`}
            >
              <AlbumCover
                row={{
                  albumId: story.albumId,
                  album: story.album,
                  coverPath: story.coverPath,
                }}
                decorative
              />
              <span
                className="daily-edition-carousel-progress"
                key={index === activeIndex ? rotationCycle : "idle"}
                aria-hidden="true"
              />
            </button>
          ))}
          <span className="daily-edition-carousel-timing">Changes every 10 seconds</span>
        </div>
      ) : null}
    </div>
  );
}

export function DiscoveryDailyEdition({
  edition,
  isLoading,
  isAnniversaryLoading,
  isChartLoading,
  isDeepCutLoading,
  isCompletionLoading,
  isRecommendationLoading,
  onAnniversaryYearsChange,
  onChartSnapshotChange,
  onDeepCutSnapshotChange,
  onCompletionSnapshotChange,
  onRecommendationSnapshotChange,
  onOpenAlbum,
  onOpenArtist,
  onOpenCompletion,
  onOpenTrack,
}: DiscoveryDailyEditionProps) {
  const [activeStoryId, setActiveStoryId] = useState("discovery-anniversary");

  if (isLoading && !edition) {
    return (
      <section className="daily-edition daily-edition-loading" aria-busy="true">
        <div className="daily-edition-loading-line" />
        <div className="daily-edition-loading-grid">
          <div />
          <div />
          <div />
        </div>
      </section>
    );
  }

  if (!edition) {
    return (
      <section className="daily-edition daily-edition-unavailable">
        <Info aria-hidden="true" />
        <div>
          <h2>Your Daily Edition</h2>
          <p>Import your library to build evidence-backed discovery stories.</p>
        </div>
      </section>
    );
  }

  const chartSnapshot = edition.chartSnapshot;
  const deepCutSnapshot = edition.deepCutSnapshot;
  const deepCutDecades = Array.from(
    new Set(deepCutSnapshot.availableYears.map((year) => Math.floor(year / 10) * 10)),
  ).sort((left, right) => right - left);
  const completionSnapshot = edition.completionSnapshot;
  const completionDecades = Array.from(
    new Set(completionSnapshot.availableYears.map((year) => Math.floor(year / 10) * 10)),
  ).sort((left, right) => right - left);
  const recommendationSnapshot = edition.recommendationSnapshot;

  function navigateToStory(storyId: string) {
    const target = document.getElementById(storyId);
    if (!target) return;

    setActiveStoryId(storyId);
    target.scrollIntoView?.({
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "start",
    });
    target.focus({ preventScroll: true });
    target.classList.remove("daily-edition-story-flash");
    void target.getBoundingClientRect();
    target.classList.add("daily-edition-story-flash");
    window.setTimeout(() => {
      target.classList.remove("daily-edition-story-flash");
    }, 1_100);
  }

  return (
    <section className="daily-edition" aria-label="Your Daily Edition">
      <header className="daily-edition-masthead">
        <div>
          <h2>Your Daily Edition</h2>
          <p className="daily-edition-date">{formatLongDate(edition.date)}</p>
        </div>
        <p className="daily-edition-listening-note">
          {edition.listeningEvidenceNote}
        </p>
      </header>

      <div className="daily-edition-layout">
        <div className="daily-edition-content">
          <section
            className="daily-edition-lead"
            id="discovery-anniversary"
            aria-labelledby="anniversary-heading"
            tabIndex={-1}
          >
            <AnniversaryCarousel
              edition={edition}
              isLoading={isAnniversaryLoading}
              onAnniversaryYearsChange={onAnniversaryYearsChange}
              onOpenAlbum={onOpenAlbum}
            />

            <LifeEventsPanel edition={edition} onOpenArtist={onOpenArtist} />
          </section>

          <div className="daily-edition-shelves">
            <section
              className="daily-edition-shelf daily-edition-chart"
              id="discovery-charts"
              aria-labelledby="chart-heading"
              tabIndex={-1}
            >
              <div className="daily-edition-section-heading">
                <ChartLine aria-hidden="true" />
                <div>
                  <h3 id="chart-heading">Chart Toppers From…</h3>
                  <p>Imported charts matched to your library</p>
                </div>
              </div>
              <div className="daily-edition-chart-controls" aria-label="Chart snapshot controls">
                <label>
                  <span>Chart</span>
                  <select
                    aria-label="Choose album chart"
                    value={chartSnapshot.source}
                    disabled={isChartLoading}
                    onChange={(event) =>
                      onChartSnapshotChange({
                        source: event.target.value as DiscoveryChartSnapshotRequest["source"],
                      })
                    }
                  >
                    <option value="billboard">Billboard</option>
                    <option value="official-uk">Official UK</option>
                    <option value="vg-lista">VG-lista</option>
                  </select>
                </label>
                <label>
                  <span>Year</span>
                  <select
                    aria-label="Choose chart year"
                    value={chartSnapshot.year ?? ""}
                    disabled={isChartLoading || !chartSnapshot.availableYears.length}
                    onChange={(event) =>
                      onChartSnapshotChange({
                        source: chartSnapshot.source,
                        year: Number(event.target.value),
                      })
                    }
                  >
                    {chartSnapshot.availableYears.map((year) => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </label>
                {chartSnapshot.source !== "billboard" ? (
                  <label>
                    <span>Week</span>
                    <select
                      aria-label="Choose chart week"
                      value={chartSnapshot.week ?? ""}
                      disabled={isChartLoading || !chartSnapshot.availableWeeks.length}
                      onChange={(event) =>
                        onChartSnapshotChange({
                          source: chartSnapshot.source,
                          year: chartSnapshot.year ?? undefined,
                          week: Number(event.target.value),
                        })
                      }
                    >
                      {chartSnapshot.availableWeeks.map((week) => (
                        <option key={week} value={week}>Week {week}</option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <button
                  type="button"
                  className="daily-edition-chart-random"
                  disabled={isChartLoading}
                  onClick={() => onChartSnapshotChange({ random: true })}
                >
                  <Shuffle aria-hidden="true" />
                  Random
                </button>
              </div>
              {chartSnapshot.year ? (
                <p className="daily-edition-shelf-period">
                  {chartSnapshot.sourceLabel} · {chartSnapshot.week ? `Week ${chartSnapshot.week}, ` : ""}{chartSnapshot.year}
                </p>
              ) : null}
              {chartSnapshot.stories.length ? (
                <ol className="daily-edition-chart-list">
                  {chartSnapshot.stories.slice(0, 5).map((story) => (
                    <li key={`${story.entity}:${story.trackId ?? story.albumId}:${story.chart}`}>
                      <button
                        type="button"
                        onClick={() =>
                          openChartStory(story, onOpenAlbum, onOpenTrack)
                        }
                      >
                        <span className="daily-edition-rank">{story.rank}</span>
                        <AlbumCover
                          row={{
                            albumId: story.albumId,
                            album: story.album ?? story.title,
                            coverPath: story.coverPath,
                          }}
                        />
                        <span className="daily-edition-row-copy">
                          <strong>{story.title}</strong>
                          <small>{story.artist}</small>
                          <small>{story.chart}</small>
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              ) : (
                <EditionEmpty>
                  No owned albums match this imported chart period.
                </EditionEmpty>
              )}
              <p className="daily-edition-shelf-footer">
                {chartSnapshot.stories.length
                  ? `${chartSnapshot.stories.length} matched chart entries`
                  : "Import charts to unlock this story"}
              </p>
            </section>

            <section
              className="daily-edition-shelf daily-edition-deep-cuts"
              id="discovery-deep-cuts"
              aria-labelledby="deep-cuts-heading"
              tabIndex={-1}
            >
              <div className="daily-edition-deep-cuts-header">
                <div className="daily-edition-section-heading">
                  <Heart aria-hidden="true" />
                  <div>
                    <h3 id="deep-cuts-heading">Deep Cuts</h3>
                    <p>One unrated track per highly rated album</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="daily-edition-deep-cut-refresh"
                  disabled={isDeepCutLoading}
                  onClick={() => onDeepCutSnapshotChange({
                    year: deepCutSnapshot.year ?? undefined,
                    decade: deepCutSnapshot.decade ?? undefined,
                    genre: deepCutSnapshot.genre ?? undefined,
                  })}
                >
                  <RefreshCw aria-hidden="true" />
                  Refresh
                </button>
              </div>
              <div className="daily-edition-deep-cut-controls" aria-label="Deep Cuts filters">
                <label>
                  <span>Period</span>
                  <select
                    aria-label="Filter Deep Cuts by period"
                    disabled={isDeepCutLoading}
                    value={
                      deepCutSnapshot.year != null
                        ? `year:${deepCutSnapshot.year}`
                        : deepCutSnapshot.decade != null
                          ? `decade:${deepCutSnapshot.decade}`
                          : "all"
                    }
                    onChange={(event) => {
                      const [kind, rawValue] = event.target.value.split(":");
                      const value = Number(rawValue);
                      onDeepCutSnapshotChange({
                        year: kind === "year" ? value : undefined,
                        decade: kind === "decade" ? value : undefined,
                        genre: deepCutSnapshot.genre ?? undefined,
                      });
                    }}
                  >
                    <option value="all">All years</option>
                    <optgroup label="Decades">
                      {deepCutDecades.map((decade) => (
                        <option key={decade} value={`decade:${decade}`}>
                          {decade}s
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Years">
                      {deepCutSnapshot.availableYears.map((year) => (
                        <option key={year} value={`year:${year}`}>{year}</option>
                      ))}
                    </optgroup>
                  </select>
                </label>
                <label>
                  <span>Genre</span>
                  <select
                    aria-label="Filter Deep Cuts by genre"
                    disabled={isDeepCutLoading}
                    value={deepCutSnapshot.genre ?? ""}
                    onChange={(event) => onDeepCutSnapshotChange({
                      year: deepCutSnapshot.year ?? undefined,
                      decade: deepCutSnapshot.decade ?? undefined,
                      genre: event.target.value || undefined,
                    })}
                  >
                    <option value="">All genres</option>
                    {deepCutSnapshot.availableGenres.map((genre) => (
                      <option key={genre.id} value={genre.id}>{genre.label}</option>
                    ))}
                  </select>
                </label>
              </div>
              {deepCutSnapshot.stories.length ? (
                <div className="daily-edition-stack-list">
                  {deepCutSnapshot.stories.slice(0, 4).map((story) => (
                    <button
                      className="daily-edition-media-row"
                      key={story.trackId}
                      type="button"
                      onClick={() => onOpenTrack(story.trackId)}
                      title={story.evidence}
                    >
                      <AlbumCover
                        row={{
                          albumId: story.albumId,
                          album: story.album,
                          coverPath: story.coverPath,
                        }}
                      />
                      <span className="daily-edition-row-copy">
                        <strong>{story.title}</strong>
                        <small>
                          {story.artist} · <em>{story.album}</em>
                        </small>
                        <small>
                          {story.releaseYear ?? "Year unknown"} · {story.genre}
                        </small>
                        <small>
                          Album rated {story.albumRating}
                          {formatDuration(story.timeSeconds)
                            ? ` · ${formatDuration(story.timeSeconds)}`
                            : ""}
                        </small>
                      </span>
                      <span className="daily-edition-play" aria-hidden="true">
                        <Play />
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <EditionEmpty>
                  No unrated, non-charting tracks match these filters.
                </EditionEmpty>
              )}
              <p className="daily-edition-shelf-footer">
                Showing {Math.min(4, deepCutSnapshot.stories.length)} randomized cuts from {deepCutSnapshot.matchingAlbumCount} matching albums
              </p>
            </section>

            <section
              className="daily-edition-shelf daily-edition-completion"
              id="discovery-completion"
              aria-labelledby="completion-heading"
              tabIndex={-1}
            >
              <div className="daily-edition-completion-header">
                <div className="daily-edition-section-heading">
                  <CircleDot aria-hidden="true" />
                  <div>
                    <h3 id="completion-heading">Complete the Collection</h3>
                    <p>
                      {completionSnapshot.mode === "artist"
                        ? "Official MusicBrainz album gaps"
                        : "Owned albums with unrated tracks"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="daily-edition-completion-refresh"
                  aria-label="Refresh completion suggestions"
                  disabled={isCompletionLoading}
                  onClick={() => onCompletionSnapshotChange({
                    mode: completionSnapshot.mode,
                    year: completionSnapshot.year ?? undefined,
                    decade: completionSnapshot.decade ?? undefined,
                    genre: completionSnapshot.genre ?? undefined,
                  })}
                >
                  <RefreshCw aria-hidden="true" />
                  Refresh
                </button>
              </div>
              <div className="daily-edition-completion-tabs" role="tablist" aria-label="Completion type">
                <button
                  type="button"
                  role="tab"
                  aria-selected={completionSnapshot.mode === "artist"}
                  disabled={isCompletionLoading}
                  onClick={() => onCompletionSnapshotChange({ mode: "artist" })}
                >
                  Artists
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={completionSnapshot.mode === "album"}
                  disabled={isCompletionLoading}
                  onClick={() => onCompletionSnapshotChange({ mode: "album" })}
                >
                  Albums
                </button>
              </div>
              <div className="daily-edition-completion-controls" aria-label="Completion filters">
                <label>
                  <span>Period</span>
                  <select
                    aria-label="Filter completion by period"
                    disabled={isCompletionLoading}
                    value={
                      completionSnapshot.year != null
                        ? `year:${completionSnapshot.year}`
                        : completionSnapshot.decade != null
                          ? `decade:${completionSnapshot.decade}`
                          : "all"
                    }
                    onChange={(event) => {
                      const [kind, rawValue] = event.target.value.split(":");
                      const value = Number(rawValue);
                      onCompletionSnapshotChange({
                        mode: completionSnapshot.mode,
                        year: kind === "year" ? value : undefined,
                        decade: kind === "decade" ? value : undefined,
                        genre: completionSnapshot.genre ?? undefined,
                      });
                    }}
                  >
                    <option value="all">All years</option>
                    <optgroup label="Decades">
                      {completionDecades.map((decade) => (
                        <option key={decade} value={`decade:${decade}`}>
                          {decade}s
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Years">
                      {completionSnapshot.availableYears.map((year) => (
                        <option key={year} value={`year:${year}`}>{year}</option>
                      ))}
                    </optgroup>
                  </select>
                </label>
                <label>
                  <span>Genre</span>
                  <select
                    aria-label="Filter completion by genre"
                    disabled={isCompletionLoading}
                    value={completionSnapshot.genre ?? ""}
                    onChange={(event) => onCompletionSnapshotChange({
                      mode: completionSnapshot.mode,
                      year: completionSnapshot.year ?? undefined,
                      decade: completionSnapshot.decade ?? undefined,
                      genre: event.target.value || undefined,
                    })}
                  >
                    <option value="">All genres</option>
                    {completionSnapshot.availableGenres.map((genre) => (
                      <option key={genre.id} value={genre.id}>{genre.label}</option>
                    ))}
                  </select>
                </label>
              </div>
              {completionSnapshot.mode === "artist" && completionSnapshot.artistStories.length ? (
                <div className="daily-edition-stack-list">
                  {completionSnapshot.artistStories.slice(0, 5).map((story) => (
                    <button
                      className="daily-edition-completion-row"
                      key={story.artistId}
                      type="button"
                      onClick={() => onOpenArtist(story.artistId, story.artist)}
                      title={story.evidence}
                    >
                      <ArtistPortrait
                        artistId={story.artistId}
                        artistName={story.artist}
                        portraitAvailable={story.portraitAvailable}
                        representativeAlbumId={story.representativeAlbumId}
                        representativeAlbum={story.representativeAlbum}
                        representativeCoverPath={story.representativeCoverPath}
                      />
                      <span className="daily-edition-completion-copy">
                        <span className="daily-edition-row-copy">
                          <strong>{story.artist}</strong>
                          <small>
                            Missing {story.missingAlbumCount} of{" "}
                            {story.officialAlbumCount} official albums
                          </small>
                        </span>
                        <span className="daily-edition-progress-line">
                          <span
                            style={{
                              width: `${Math.round(story.completionPercent * 100)}%`,
                            }}
                          />
                        </span>
                        <small className="daily-edition-next-gap">
                          Next gap: {story.missingReleaseTitle}
                          {story.missingReleaseYear ? ` · ${story.missingReleaseYear}` : ""}
                          {` · ${story.genre}`}
                        </small>
                      </span>
                      <span className="daily-edition-percent">
                        {Math.round(story.completionPercent * 100)}%
                      </span>
                      <ChevronRight aria-hidden="true" />
                    </button>
                  ))}
                </div>
              ) : completionSnapshot.mode === "album" && completionSnapshot.albumStories.length ? (
                <div className="daily-edition-stack-list">
                  {completionSnapshot.albumStories.slice(0, 5).map((story) => (
                    <button
                      className="daily-edition-completion-row daily-edition-album-completion-row"
                      key={story.albumId}
                      type="button"
                      onClick={() => onOpenAlbum(story.albumId)}
                      title={story.evidence}
                    >
                      <AlbumCover
                        row={{
                          albumId: story.albumId,
                          album: story.album,
                          coverPath: story.coverPath,
                        }}
                      />
                      <span className="daily-edition-completion-copy">
                        <span className="daily-edition-row-copy">
                          <strong>{story.album}</strong>
                          <small>{story.artist} · {story.releaseYear ?? "Year unknown"} · {story.genre}</small>
                        </span>
                        <span className="daily-edition-progress-line">
                          <span style={{ width: `${Math.round(story.completionPercent * 100)}%` }} />
                        </span>
                        <small className="daily-edition-next-gap">
                          {story.unratedTracks} {story.unratedTracks === 1 ? "track" : "tracks"} left to rate
                        </small>
                      </span>
                      <span className="daily-edition-percent">
                        {Math.round(story.completionPercent * 100)}%
                      </span>
                      <ChevronRight aria-hidden="true" />
                    </button>
                  ))}
                </div>
              ) : (
                <EditionEmpty>
                  {completionSnapshot.mode === "artist"
                    ? "No incomplete MusicBrainz artist collections match these filters."
                    : "No albums with unrated tracks match these filters."}
                </EditionEmpty>
              )}
              {completionSnapshot.mode === "artist" ? (
                <button
                  className="daily-edition-shelf-footer daily-edition-footer-button"
                  type="button"
                  onClick={onOpenCompletion}
                >
                  View all artist gaps
                  <ChevronRight aria-hidden="true" />
                </button>
              ) : (
                <p className="daily-edition-shelf-footer">
                  Showing {completionSnapshot.albumStories.length} randomized albums from {completionSnapshot.matchingCount} matching albums
                </p>
              )}
            </section>

            <section
              className="daily-edition-shelf daily-edition-because"
              id="discovery-because"
              aria-labelledby="because-heading"
              tabIndex={-1}
            >
              <div className="daily-edition-because-header">
                <div className="daily-edition-section-heading">
                  <Sparkles aria-hidden="true" />
                  <div>
                    <h3 id="because-heading">
                      Because You {recommendationSnapshot.mode === "played" ? "Played" : "Loved"}…
                    </h3>
                    <p>
                      {recommendationSnapshot.anchors.length
                        ? `${recommendationSnapshot.anchors.length} ${recommendationSnapshot.mode === "played" ? "recent" : "high-score"} albums · mixed artists`
                        : "Connected through ratings and loved tracks"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="daily-edition-completion-refresh"
                  aria-label="Refresh recommendation suggestions"
                  disabled={isRecommendationLoading}
                  onClick={() => onRecommendationSnapshotChange({
                    mode: recommendationSnapshot.mode,
                  })}
                >
                  <RefreshCw aria-hidden="true" />
                  Refresh
                </button>
              </div>
              <div className="daily-edition-because-tabs" role="tablist" aria-label="Recommendation signal">
                <button
                  type="button"
                  role="tab"
                  aria-selected={recommendationSnapshot.mode === "played"}
                  disabled={isRecommendationLoading}
                  onClick={() => onRecommendationSnapshotChange({ mode: "played" })}
                >
                  Played
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={recommendationSnapshot.mode === "loved"}
                  disabled={isRecommendationLoading}
                  onClick={() => onRecommendationSnapshotChange({ mode: "loved" })}
                >
                  Loved
                </button>
              </div>
              {recommendationSnapshot.stories.length ? (
                <div className="daily-edition-stack-list">
                  {recommendationSnapshot.stories.slice(0, 6).map((story) => (
                    <button
                      className="daily-edition-media-row daily-edition-because-row"
                      key={story.albumId}
                      type="button"
                      onClick={() => onOpenAlbum(story.albumId)}
                      title={story.evidence}
                    >
                      <AlbumCover
                        row={{
                          albumId: story.albumId,
                          album: story.album,
                          coverPath: story.coverPath,
                        }}
                      />
                      <span className="daily-edition-row-copy">
                        <strong>{story.artist}</strong>
                        <small>{story.album}</small>
                        <small>{story.evidence}</small>
                      </span>
                      <ChevronRight aria-hidden="true" />
                    </button>
                  ))}
                </div>
              ) : (
                <EditionEmpty>
                  {recommendationSnapshot.mode === "played"
                    ? "Rate tracks on a few albums to start recommendation threads."
                    : "Love tracks or highly rate albums to start recommendation threads."}
                </EditionEmpty>
              )}
              <p className="daily-edition-shelf-footer">
                {recommendationSnapshot.evidence}
                {recommendationSnapshot.lastfmLinkedCount > 0
                  ? ` · ${recommendationSnapshot.lastfmLinkedCount} Last.fm-linked matches`
                  : ""}
              </p>
            </section>
          </div>
        </div>

        <nav className="daily-edition-index" aria-label="Edition stories">
          <button
            className={activeStoryId === "discovery-anniversary" ? "active" : ""}
            type="button"
            onClick={() => navigateToStory("discovery-anniversary")}
          >
            {edition.anniversaryYears} Years Ago
          </button>
          {[
            ["discovery-life-events", "Birthdays & Memorials"],
            ["discovery-charts", "Chart Toppers"],
            ["discovery-deep-cuts", "Deep Cuts"],
            ["discovery-completion", "Complete the Collection"],
            ["discovery-because", "Because You Played / Loved"],
          ].map(([storyId, label]) => (
            <button
              className={activeStoryId === storyId ? "active" : ""}
              key={storyId}
              type="button"
              onClick={() => navigateToStory(storyId)}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      <footer className="daily-edition-method-note">
        <Info aria-hidden="true" />
        <span>{edition.listeningEvidenceNote}</span>
      </footer>
    </section>
  );
}
