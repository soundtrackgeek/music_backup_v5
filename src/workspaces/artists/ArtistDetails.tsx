import {
  type BrowseRow,
  type BrowseResponse,
  type LastFmAlbumPopularity,
  type ArtistSummary,
  type ExportResult,
} from "../../types";
import {
  formatBillboardRank,
  formatNumber,
  formatClockTime,
  formatMinutes,
  formatHours,
  formatPercent,
  formatAverage,
} from "../../app/display";
import { AlbumCover } from "../../components/AlbumCover";
import { RatingStars } from "../../components/catalog/CatalogValues";
import {
  Heart,
  ListMusic,
  FileSearch,
  Play,
  X,
  Album,
  UsersRound,
  Download,
} from "lucide-react";
import { useMemo, Fragment } from "react";
import { formatTrackPosition } from "../albums/AlbumPanels";
import {
  TrackPopularityFire,
  TrackPopularityAttribution,
} from "../../components/TrackPopularityFire";
import { formatYearSpan, artistInitial } from "./ArtistTables";
import { ExportResultStatus } from "../../components/ExportResultStatus";

export function ArtistAlbumCoverCard({
  row,
  isSelected,
  onSelect,
}: {
  row: BrowseRow;
  isSelected: boolean;
  onSelect: (albumId: string) => void;
}) {
  const title = `${row.album ?? "Untitled"}${row.year ? ` [${row.year}]` : ""}`;
  const billboardLabel = formatBillboardRank(row);

  return (
    <button
      className={`artist-album-cover-card${isSelected ? " selected" : ""}`}
      type="button"
      aria-pressed={isSelected}
      title={title}
      onClick={() => onSelect(row.albumId)}
    >
      <AlbumCover row={row} className="artist-album-cover-art" />
      <span className="artist-album-cover-overlay">
        <strong>
          <span>{title}</span>
          {billboardLabel ? (
            <span className="billboard-badge">{billboardLabel}</span>
          ) : null}
        </strong>
        <span>{row.albumArtistDisplay ?? ""}</span>
        <span>{row.canonicalGenre ?? ""}</span>
        <span className="artist-album-card-meta">
          <RatingStars
            value={row.effectiveAlbumRating}
            label="Album rating"
            showValue={false}
          />
          {row.lovedTracks ? (
            <span
              className="artist-album-love-count"
              aria-label={`${formatNumber(row.lovedTracks)} loved tracks`}
            >
              <Heart size={13} fill="currentColor" aria-hidden="true" />
              {formatNumber(row.lovedTracks)}
            </span>
          ) : null}
        </span>
      </span>
    </button>
  );
}

export function ArtistAlbumTrackList({
  response,
  isLoading,
  popularity,
}: {
  response: BrowseResponse | null;
  isLoading: boolean;
  popularity: LastFmAlbumPopularity | null;
}) {
  const popularityByTrackId = useMemo(
    () =>
      new Map(popularity?.tracks.map((track) => [track.trackId, track]) ?? []),
    [popularity],
  );

  if (!response) {
    return (
      <div className="artist-album-tracks-empty">
        <ListMusic size={18} />
        <span>{isLoading ? "Loading tracks." : "Select an album cover."}</span>
      </div>
    );
  }

  if (response.rows.length === 0) {
    return (
      <div className="artist-album-tracks-empty">
        <FileSearch size={18} />
        <span>No tracks found.</span>
      </div>
    );
  }

  return (
    <div
      className="artist-album-track-list"
      role="table"
      aria-label="Selected artist album tracks"
    >
      {response.rows.map((row) => {
        const isLoved = row.love === "L";
        const trackPopularity =
          row.trackId == null ? null : popularityByTrackId.get(row.trackId);
        return (
          <div className="artist-album-track-row" role="row" key={row.id}>
            <span className="artist-track-position" role="cell">
              {formatTrackPosition(row)}
            </span>
            <strong
              className="track-title-with-popularity"
              role="cell"
              title={row.title ?? "Untitled"}
            >
              <TrackPopularityFire rank={trackPopularity?.albumRank ?? null} />
              <span>{row.title ?? "Untitled"}</span>
            </strong>
            <RatingStars value={row.normalizedRating} label="Track rating" />
            <span
              className={`artist-track-love${isLoved ? " active" : ""}`}
              role="cell"
              aria-label={isLoved ? "Loved" : "Not loved"}
            >
              {isLoved ? (
                <Heart size={15} fill="currentColor" aria-hidden="true" />
              ) : null}
            </span>
            <time role="cell">{formatClockTime(row.trackSeconds)}</time>
          </div>
        );
      })}
    </div>
  );
}

export function ArtistAlbumExpandedPanel({
  album,
  tracks,
  isLoading,
  popularity,
  popularityError,
  isPopularityLoading,
  onOpenSource,
  onClose,
}: {
  album: BrowseRow;
  tracks: BrowseResponse | null;
  isLoading: boolean;
  popularity: LastFmAlbumPopularity | null;
  popularityError: string | null;
  isPopularityLoading: boolean;
  onOpenSource: (url: string) => void;
  onClose: () => void;
}) {
  const billboardLabel = formatBillboardRank(album);
  return (
    <section
      className="artist-album-expanded"
      aria-label={`${album.album ?? "Selected album"} tracks`}
    >
      <div className="artist-album-expanded-cover">
        <AlbumCover
          row={album}
          className="artist-album-expanded-art"
          decorative={false}
        />
      </div>
      <div className="artist-album-expanded-content">
        <div className="artist-album-expanded-header">
          <div>
            <div className="artist-album-expanded-title">
              <h3>
                <span>{album.album ?? "Untitled"}</span>
                {billboardLabel ? (
                  <span className="billboard-badge">{billboardLabel}</span>
                ) : null}
              </h3>
              <Play size={17} aria-hidden="true" />
            </div>
            <p>
              {[album.albumArtistDisplay, album.year, album.canonicalGenre]
                .filter(Boolean)
                .join(" / ")}
            </p>
            <span className="artist-album-expanded-meta">
              <RatingStars
                value={album.effectiveAlbumRating}
                label="Album rating"
              />
              <span>{formatNumber(album.totalTracks)} tracks</span>
              <span>{formatMinutes(album.totalSeconds)}</span>
            </span>
          </div>
          <button
            className="artist-album-close"
            type="button"
            aria-label="Close album tracks"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </div>

        <ArtistAlbumTrackList
          response={tracks}
          isLoading={isLoading}
          popularity={popularity}
        />
        <TrackPopularityAttribution
          popularity={popularity}
          isLoading={isPopularityLoading}
          error={popularityError}
          onOpenSource={onOpenSource}
        />
      </div>
    </section>
  );
}

export function ArtistAlbumCoverBoard({
  response,
  selectedAlbumId,
  selectedAlbum,
  tracks,
  isLoading,
  popularity,
  popularityError,
  isPopularityLoading,
  onOpenSource,
  onSelect,
  onClose,
}: {
  response: BrowseResponse | null;
  selectedAlbumId: string | null;
  selectedAlbum: BrowseRow | null;
  tracks: BrowseResponse | null;
  isLoading: boolean;
  popularity: LastFmAlbumPopularity | null;
  popularityError: string | null;
  isPopularityLoading: boolean;
  onOpenSource: (url: string) => void;
  onSelect: (albumId: string) => void;
  onClose: () => void;
}) {
  if (!response) {
    return (
      <div className="empty-state large">
        <Album size={20} />
        <span>Select an artist.</span>
      </div>
    );
  }

  if (response.rows.length === 0) {
    return (
      <div className="empty-state large">
        <FileSearch size={20} />
        <span>No album covers found.</span>
      </div>
    );
  }

  const selectedIndex = response.rows.findIndex(
    (row) => row.albumId === selectedAlbumId,
  );
  const insertAfterIndex =
    selectedIndex >= 0
      ? Math.min(
          response.rows.length - 1,
          Math.floor(selectedIndex / 3) * 3 + 2,
        )
      : -1;

  return (
    <div className="artist-album-board">
      <div className="artist-album-cover-grid">
        {response.rows.map((row, index) => (
          <Fragment key={row.id}>
            <ArtistAlbumCoverCard
              row={row}
              isSelected={row.albumId === selectedAlbumId}
              onSelect={onSelect}
            />
            {selectedAlbum && index === insertAfterIndex ? (
              <ArtistAlbumExpandedPanel
                album={selectedAlbum}
                tracks={tracks}
                isLoading={isLoading}
                popularity={popularity}
                popularityError={popularityError}
                isPopularityLoading={isPopularityLoading}
                onOpenSource={onOpenSource}
                onClose={onClose}
              />
            ) : null}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

export function ArtistDetailPanel({
  artist,
  includeCalculated,
  onIncludeCalculatedChange,
  exportResult,
  onExport,
}: {
  artist: ArtistSummary | null;
  includeCalculated: boolean;
  onIncludeCalculatedChange: (value: boolean) => void;
  exportResult: ExportResult | null;
  onExport: (format: string) => Promise<void>;
}) {
  if (!artist) {
    return (
      <aside className="detail-panel artist-detail" aria-label="Artist details">
        <div className="detail-header">
          <UsersRound size={20} />
          <div>
            <h2>Artist Detail</h2>
            <p>Select an album artist from the index</p>
          </div>
        </div>
        <div className="empty-state">
          <FileSearch size={20} />
          <span>No artist selected.</span>
        </div>
      </aside>
    );
  }

  return (
    <aside className="detail-panel artist-detail" aria-label="Artist details">
      <div className="detail-header">
        <UsersRound size={20} />
        <div>
          <h2>{artist.name}</h2>
          <p>
            {[
              formatYearSpan(artist.firstYear, artist.lastYear),
              artist.topGenre,
            ]
              .filter(Boolean)
              .join(" / ")}
          </p>
        </div>
      </div>

      <div
        className="cover-placeholder album-cover-large artist-cover-large"
        aria-hidden="true"
      >
        <span>{artistInitial(artist)}</span>
      </div>

      <dl className="run-details artist-detail-stats">
        <div>
          <dt>Albums</dt>
          <dd>{`${formatNumber(artist.ratedAlbumCount)} / ${formatNumber(artist.albumCount)} fully rated`}</dd>
        </div>
        <div>
          <dt>Partial albums</dt>
          <dd>{formatNumber(artist.partialAlbumCount)}</dd>
        </div>
        <div>
          <dt>Unrated albums</dt>
          <dd>{formatNumber(artist.unratedAlbumCount)}</dd>
        </div>
        <div>
          <dt>Tracks</dt>
          <dd>{formatNumber(artist.trackCount)}</dd>
        </div>
        <div>
          <dt>Total time</dt>
          <dd>{formatHours(artist.totalSeconds)}</dd>
        </div>
        <div>
          <dt>Average complete</dt>
          <dd>{formatPercent(artist.averageRatingCompleteness)}</dd>
        </div>
        <div>
          <dt>Average rating</dt>
          <dd>{formatAverage(artist.averageAlbumRating, 1)}</dd>
        </div>
        <div>
          <dt>Average score</dt>
          <dd>{formatAverage(artist.averageAlbumScore, 2)}</dd>
        </div>
        <div>
          <dt>Loved tracks</dt>
          <dd>{formatNumber(artist.lovedTracks)}</dd>
        </div>
        <div>
          <dt>TMOE</dt>
          <dd>{formatMinutes(artist.tmoeSeconds)}</dd>
        </div>
      </dl>

      <section className="export-box">
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={includeCalculated}
            onChange={(event) =>
              onIncludeCalculatedChange(event.target.checked)
            }
          />
          <span>Calculated columns</span>
        </label>
        <div className="export-grid">
          {["csv", "tsv", "xlsx", "json", "txt"].map((format) => (
            <button
              type="button"
              key={format}
              onClick={() => void onExport(format)}
            >
              <Download size={16} />
              <span>{format.toUpperCase()}</span>
            </button>
          ))}
        </div>
        {exportResult ? (
          <ExportResultStatus result={exportResult} itemLabel="album" />
        ) : null}
      </section>
    </aside>
  );
}
