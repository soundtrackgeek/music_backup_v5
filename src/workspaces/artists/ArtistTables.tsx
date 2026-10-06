import {
  type ArtistSummary,
  type ArtistListResponse,
  type CountryFlagDisplay,
  type BrowseResponse,
} from "../../types";
import { formatMusicBrainzReviewState } from "../../components/MusicBrainzReviewState";
import { UsersRound, FileSearch, Album } from "lucide-react";
import {
  ResizableTable,
  ResizableColumnHeader,
} from "../../components/ResizableTable";
import { ArtistPortrait } from "../../components/ArtistPortrait";
import { formatNumber, formatPercent, formatAverage } from "../../app/display";
import { CountryDisplay } from "../../components/catalog/CatalogValues";
import { AlbumTitleContents } from "../albums/AlbumPanels";

export function artistInitial(artist: ArtistSummary | null) {
  return artist?.name.trim().slice(0, 1).toUpperCase() || "A";
}

export function formatYearSpan(
  firstYear: number | null | undefined,
  lastYear: number | null | undefined,
) {
  if (firstYear == null && lastYear == null) return "";
  if (firstYear != null && lastYear != null && firstYear !== lastYear) {
    return `${firstYear}-${lastYear}`;
  }
  return `${firstYear ?? lastYear}`;
}

export function hasMusicBrainzArtistInfo(artist: ArtistSummary | null) {
  if (!artist) {
    return false;
  }
  return Boolean(
    artist.musicBrainzArtistType ||
    artist.musicBrainzGender ||
    artist.musicBrainzBeginDate ||
    artist.musicBrainzBeginYear != null ||
    artist.musicBrainzEndDate ||
    artist.musicBrainzEndYear != null ||
    artist.musicBrainzBeginAreaName ||
    artist.musicBrainzEndAreaName ||
    artist.musicBrainzInfoReviewState,
  );
}

export function isMusicBrainzGroupArtist(artist: ArtistSummary | null) {
  return artist?.musicBrainzArtistType?.trim().toLowerCase() === "group";
}

export function formatMusicBrainzArtistLifeDate(
  date: string | null | undefined,
  year: number | null | undefined,
) {
  return date?.trim() || (year == null ? "" : String(year));
}

export function formatMusicBrainzArtistEndValue(artist: ArtistSummary | null) {
  if (!artist) {
    return "";
  }
  const explicitDate = formatMusicBrainzArtistLifeDate(
    artist.musicBrainzEndDate,
    artist.musicBrainzEndYear,
  );
  if (explicitDate) {
    return explicitDate;
  }
  if (artist.musicBrainzEnded === false) {
    return isMusicBrainzGroupArtist(artist) ? "Active" : "Living";
  }
  return "";
}

export function formatMusicBrainzArtistLifeSummary(
  artist: ArtistSummary | null,
) {
  if (!artist) {
    return "";
  }
  const start = formatMusicBrainzArtistLifeDate(
    artist.musicBrainzBeginDate,
    artist.musicBrainzBeginYear,
  );
  const end = formatMusicBrainzArtistEndValue(artist);
  return [start, end].filter(Boolean).join("-");
}

export function formatMusicBrainzArtistInfoState(artist: ArtistSummary | null) {
  return formatMusicBrainzReviewState(artist?.musicBrainzInfoReviewState);
}

export function ArtistIndexTable({
  response,
  selectedArtistId,
  onSelect,
  countryFlagDisplay,
}: {
  response: ArtistListResponse | null;
  selectedArtistId: string | null;
  onSelect: (artistId: string) => void;
  countryFlagDisplay: CountryFlagDisplay;
}) {
  if (!response) {
    return (
      <div className="empty-state large">
        <UsersRound size={20} />
        <span>No artists loaded.</span>
      </div>
    );
  }

  if (response.rows.length === 0) {
    return (
      <div className="empty-state large">
        <FileSearch size={20} />
        <span>No artists match.</span>
      </div>
    );
  }

  return (
    <ResizableTable
      tableId="artist-index-results"
      className="result-table artist-index-results"
      columns={{
        Artist: "minmax(240px, 2.2fr)",
        Origin: "minmax(96px, 0.9fr)",
        Albums: "72px",
        Years: "88px",
        "Top genre": "minmax(112px, 1fr)",
        Complete: "88px",
        "Avg score": "88px",
        Loved: "72px",
      }}
      items={response.rows}
      getRowKey={(artist) => artist.id}
      renderRow={(artist) => {
        const isSelected = artist.id === selectedArtistId;
        return (
          <div
            className={`result-table-row selectable${isSelected ? " selected" : ""}`}
            role="row"
            aria-selected={isSelected}
            tabIndex={0}
            key={artist.id}
            onClick={() => onSelect(artist.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(artist.id);
              }
            }}
          >
            <span className="album-index-title" role="cell">
              <ArtistPortrait
                artistId={artist.id}
                artistName={artist.name}
                portraitAvailable={artist.portraitAvailable}
                representativeAlbumId={artist.representativeAlbumId}
                representativeAlbum={artist.representativeAlbum}
                representativeCoverPath={artist.representativeCoverPath}
                className="cover-mini artist-mini"
              />
              <span>
                <strong>{artist.name}</strong>
                <small>{formatNumber(artist.trackCount)} tracks</small>
              </span>
            </span>
            <span role="cell">
              <CountryDisplay value={artist} mode={countryFlagDisplay} />
            </span>
            <span role="cell">{formatNumber(artist.albumCount)}</span>
            <span role="cell">
              {formatYearSpan(artist.firstYear, artist.lastYear)}
            </span>
            <span role="cell">{artist.topGenre ?? ""}</span>
            <span role="cell">
              {formatPercent(artist.averageRatingCompleteness)}
            </span>
            <span role="cell">
              {formatAverage(artist.averageAlbumScore, 2)}
            </span>
            <span role="cell">{formatNumber(artist.lovedTracks)}</span>
          </div>
        );
      }}
    >
      <div className="result-table-head" role="row">
        <ResizableColumnHeader columnId="Artist" label="Artist" />
        <ResizableColumnHeader columnId="Origin" label="Origin" />
        <ResizableColumnHeader columnId="Albums" label="Albums" />
        <ResizableColumnHeader columnId="Years" label="Years" />
        <ResizableColumnHeader columnId="Top genre" label="Top genre" />
        <ResizableColumnHeader columnId="Complete" label="Complete" />
        <ResizableColumnHeader columnId="Avg score" label="Avg score" />
        <ResizableColumnHeader columnId="Loved" label="Loved" />
      </div>
    </ResizableTable>
  );
}

export function ArtistAlbumTable({
  response,
  selectedAlbumId,
  onSelect,
}: {
  response: BrowseResponse | null;
  selectedAlbumId: string | null;
  onSelect: (albumId: string) => void;
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
        <span>No albums found.</span>
      </div>
    );
  }

  return (
    <ResizableTable
      tableId="artist-album-results"
      className="result-table artist-album-results"
      columns={{
        Album: "minmax(260px, 2.2fr)",
        Year: "72px",
        Genre: "minmax(116px, 1fr)",
        Tracks: "72px",
        Complete: "88px",
        Rating: "72px",
        Score: "80px",
      }}
      items={response.rows}
      getRowKey={(row) => row.id}
      renderRow={(row) => {
        const isSelected = row.albumId === selectedAlbumId;
        return (
          <div
            className={`result-table-row selectable${isSelected ? " selected" : ""}`}
            role="row"
            aria-selected={isSelected}
            tabIndex={0}
            key={row.id}
            onClick={() => onSelect(row.albumId)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(row.albumId);
              }
            }}
          >
            <span className="album-title-cell" role="cell">
              <AlbumTitleContents row={row} />
            </span>
            <span role="cell">{row.year ?? ""}</span>
            <span role="cell">{row.canonicalGenre ?? ""}</span>
            <span role="cell">{formatNumber(row.totalTracks)}</span>
            <span role="cell">{formatPercent(row.ratingCompleteness)}</span>
            <span role="cell">{row.effectiveAlbumRating ?? ""}</span>
            <span role="cell">{row.albumScore?.toFixed(3) ?? ""}</span>
          </div>
        );
      }}
    >
      <div className="result-table-head" role="row">
        <ResizableColumnHeader columnId="Album" label="Album" />
        <ResizableColumnHeader columnId="Year" label="Year" />
        <ResizableColumnHeader columnId="Genre" label="Genre" />
        <ResizableColumnHeader columnId="Tracks" label="Tracks" />
        <ResizableColumnHeader columnId="Complete" label="Complete" />
        <ResizableColumnHeader columnId="Rating" label="Rating" />
        <ResizableColumnHeader columnId="Score" label="Score" />
      </div>
    </ResizableTable>
  );
}
