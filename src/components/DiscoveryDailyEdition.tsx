import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChartLine,
  ChevronRight,
  CircleDot,
  Heart,
  Info,
  Play,
  Sparkles,
} from "lucide-react";

import type {
  DiscoveryChartStory,
  DiscoveryDailyEdition,
} from "../types";
import { AlbumCover } from "./AlbumCover";
import { ArtistPortrait } from "./ArtistPortrait";

type DiscoveryDailyEditionProps = {
  edition: DiscoveryDailyEdition | null;
  isLoading: boolean;
  isAnniversaryLoading: boolean;
  onAnniversaryYearsChange: (years: number) => void;
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
  const anniversaryKey = useMemo(
    () => anniversaries.map((story) => story.albumId).join("|"),
    [anniversaries],
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPointerPaused, setIsPointerPaused] = useState(false);
  const [isFocusPaused, setIsFocusPaused] = useState(false);
  const anniversary = anniversaries[activeIndex] ?? anniversaries[0] ?? null;

  useEffect(() => {
    setActiveIndex(0);
  }, [anniversaryKey, edition.anniversaryYears]);

  useEffect(() => {
    if (
      anniversaries.length < 2 ||
      isPointerPaused ||
      isFocusPaused ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      setActiveIndex((current) => (current + 1) % anniversaries.length);
    }, 10_000);
    return () => window.clearTimeout(timer);
  }, [activeIndex, anniversaries.length, isFocusPaused, isPointerPaused]);

  return (
    <div
      className={`daily-edition-anniversary-stage${isLoading ? " is-loading" : ""}`}
      role="region"
      aria-roledescription="carousel"
      aria-label={`${edition.anniversaryYears}-year album anniversaries`}
      aria-busy={isLoading}
      onPointerEnter={() => setIsPointerPaused(true)}
      onPointerLeave={() => setIsPointerPaused(false)}
      onFocusCapture={() => setIsFocusPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsFocusPaused(false);
        }
      }}
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
              onClick={() => setActiveIndex(index)}
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
              <span className="daily-edition-carousel-progress" aria-hidden="true" />
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
  onAnniversaryYearsChange,
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

  const chartYear = edition.chartToppers[0]?.chartYear ?? null;
  const anchor = edition.ratingAnchor;

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
              {chartYear ? (
                <p className="daily-edition-shelf-period">This week in {chartYear}</p>
              ) : null}
              {edition.chartToppers.length ? (
                <ol className="daily-edition-chart-list">
                  {edition.chartToppers.slice(0, 5).map((story) => (
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
                          <small>{story.album}</small>
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              ) : (
                <EditionEmpty>
                  No owned releases match an imported chart for this week.
                </EditionEmpty>
              )}
              <p className="daily-edition-shelf-footer">
                {edition.chartToppers.length
                  ? `${edition.chartToppers.length} matched chart entries`
                  : "Import charts to unlock this story"}
              </p>
            </section>

            <section
              className="daily-edition-shelf daily-edition-deep-cuts"
              id="discovery-deep-cuts"
              aria-labelledby="deep-cuts-heading"
              tabIndex={-1}
            >
              <div className="daily-edition-section-heading">
                <Heart aria-hidden="true" />
                <div>
                  <h3 id="deep-cuts-heading">Deep Cuts</h3>
                  <p>Unrated tracks on highly rated albums</p>
                </div>
              </div>
              {edition.deepCuts.length ? (
                <div className="daily-edition-stack-list">
                  {edition.deepCuts.slice(0, 4).map((story) => (
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
                  Rate an album highly to reveal unrated, non-charting tracks.
                </EditionEmpty>
              )}
              <p className="daily-edition-shelf-footer">
                Explore {edition.deepCuts.length} evidence-backed deep cuts
              </p>
            </section>

            <section
              className="daily-edition-shelf daily-edition-completion"
              id="discovery-completion"
              aria-labelledby="completion-heading"
              tabIndex={-1}
            >
              <div className="daily-edition-section-heading">
                <CircleDot aria-hidden="true" />
                <div>
                  <h3 id="completion-heading">Complete the Artist</h3>
                  <p>Official MusicBrainz album gaps</p>
                </div>
              </div>
              {edition.artistCompletions.length ? (
                <div className="daily-edition-stack-list">
                  {edition.artistCompletions.slice(0, 3).map((story) => (
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
                  Sync MusicBrainz artist data to compare your deep collections.
                </EditionEmpty>
              )}
              <button
                className="daily-edition-shelf-footer daily-edition-footer-button"
                type="button"
                onClick={onOpenCompletion}
              >
                View all artist gaps
                <ChevronRight aria-hidden="true" />
              </button>
            </section>

            <section
              className="daily-edition-shelf daily-edition-because"
              id="discovery-because"
              aria-labelledby="because-heading"
              tabIndex={-1}
            >
              <div className="daily-edition-section-heading">
                <Sparkles aria-hidden="true" />
                <div>
                  <h3 id="because-heading">Because You Played…</h3>
                  <p>
                    {anchor
                      ? `${anchor.artist} · ${anchor.album}`
                      : "Connected through ratings and loved tracks"}
                  </p>
                </div>
              </div>
              {edition.becauseYouPlayed.length ? (
                <div className="daily-edition-stack-list">
                  {edition.becauseYouPlayed.slice(0, 3).map((story) => (
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
                  Rate an album to start a new recommendation thread.
                </EditionEmpty>
              )}
              <p className="daily-edition-shelf-footer">
                {anchor?.evidence ?? "Waiting for your first rating signal"}
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
            ["discovery-completion", "Complete the Artist"],
            ["discovery-because", "Because You Played"],
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
