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
  onOpenAlbum: (albumId: string) => void;
  onOpenArtist: (artistId: string, artistName: string) => void;
  onOpenCompletion: () => void;
  onOpenTrack: (trackId: number) => void;
};

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
    return `Memorial ${shortDateFormatter.format(parsed)}`;
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

export function DiscoveryDailyEdition({
  edition,
  isLoading,
  onOpenAlbum,
  onOpenArtist,
  onOpenCompletion,
  onOpenTrack,
}: DiscoveryDailyEditionProps) {
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

  const anniversary = edition.anniversaries[0] ?? null;
  const chartYear = edition.chartToppers[0]?.chartYear ?? null;
  const anchor = edition.ratingAnchor;

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
          >
            {anniversary ? (
              <>
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
                  <p className="daily-edition-kicker">
                    {edition.anniversaryYears} years ago
                  </p>
                  <h3 id="anniversary-heading">
                    <span>{anniversary.artist}</span>
                    <em>{anniversary.album}</em>
                  </h3>
                  <p className="daily-edition-release">
                    Released in {anniversary.releaseYear}
                  </p>
                  <p className="daily-edition-evidence">
                    <span aria-hidden="true" />
                    <strong>Evidence</strong> {anniversary.evidence}
                  </p>
                  <details className="daily-edition-why">
                    <summary>Why this?</summary>
                    <p>
                      This owned release lands exactly {anniversary.yearsAgo} years
                      before today. Release dates come from your local album metadata.
                    </p>
                  </details>
                  <button
                    className="daily-edition-primary-action"
                    type="button"
                    onClick={() => onOpenAlbum(anniversary.albumId)}
                  >
                    Read the story
                    <ChevronRight aria-hidden="true" />
                  </button>
                  {edition.anniversaries.length > 1 ? (
                    <p className="daily-edition-more-count">
                      +{edition.anniversaries.length - 1} more anniversary
                      {edition.anniversaries.length === 2 ? "" : " stories"}
                    </p>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="daily-edition-lead-empty">
                <p className="daily-edition-kicker">
                  {edition.anniversaryYears} years ago
                </p>
                <h3 id="anniversary-heading">No anniversary match today</h3>
                <p>
                  The edition will feature an owned album when its release year
                  reaches this milestone.
                </p>
              </div>
            )}

            <div
              className="daily-edition-life"
              id="discovery-life-events"
              aria-labelledby="life-events-heading"
            >
              <div className="daily-edition-section-heading">
                <CalendarDays aria-hidden="true" />
                <div>
                  <h3 id="life-events-heading">Today</h3>
                  <p>Artist birthdays &amp; memorials</p>
                </div>
              </div>
              {edition.lifeEvents.length ? (
                <div className="daily-edition-life-list">
                  {edition.lifeEvents.slice(0, 3).map((story) => (
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
                          {formatEventDate(
                            story.eventDate,
                            story.eventType,
                            story.years,
                          )}
                        </small>
                        <small>
                          {story.evidence.split(" · ").slice(-1)[0]}
                        </small>
                      </span>
                      <ChevronRight aria-hidden="true" />
                    </button>
                  ))}
                </div>
              ) : (
                <EditionEmpty>
                  No exact artist birthday or memorial matches today.
                </EditionEmpty>
              )}
              {edition.lifeEvents.length > 3 ? (
                <a className="daily-edition-text-link" href="#discovery-life-events">
                  View all birthdays &amp; memorials ({edition.lifeEvents.length})
                  <ChevronRight aria-hidden="true" />
                </a>
              ) : null}
            </div>
          </section>

          <div className="daily-edition-shelves">
            <section
              className="daily-edition-shelf daily-edition-chart"
              id="discovery-charts"
              aria-labelledby="chart-heading"
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
          <a className="active" href="#discovery-anniversary">
            {edition.anniversaryYears} Years Ago
          </a>
          <a href="#discovery-life-events">Birthdays &amp; Memorials</a>
          <a href="#discovery-charts">Chart Toppers</a>
          <a href="#discovery-deep-cuts">Deep Cuts</a>
          <a href="#discovery-completion">Complete the Artist</a>
          <a href="#discovery-because">Because You Played</a>
        </nav>
      </div>

      <footer className="daily-edition-method-note">
        <Info aria-hidden="true" />
        <span>{edition.listeningEvidenceNote}</span>
      </footer>
    </section>
  );
}
