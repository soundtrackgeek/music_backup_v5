import {
  type TimelinesView,
  TimelinesWorkspace,
} from "../../components/TimelinesWorkspace";
import { AlbumTimeRibbon } from "../../components/AlbumTimeRibbon";
import { GenreTimeline } from "../../components/GenreTimeline";
import { ArtistTimeline } from "../../components/ArtistTimeline";
import type { AppModel } from "../../app/useAppController";
export function TimelinesView({
  model,
}: {
  model: Pick<
    AppModel,
    | "timelinesView"
    | "setTimelinesView"
    | "timelineMode"
    | "trackTimelineResponse"
    | "albumTimelineResponse"
    | "timelineChartSource"
    | "albumTimelineError"
    | "isAlbumTimelineLoading"
    | "openTimelinePlaylist"
    | "setTimelineMode"
    | "setTimelineChartSource"
    | "openTimelineAlbum"
    | "openTimelineTrack"
    | "setActiveSection"
    | "setAlbumTimelineRefreshKey"
    | "setTrackTimelineYear"
    | "setAlbumTimelineYear"
    | "genreSuggestionOptions"
    | "requestGenreSuggestionRefresh"
    | "openArtistFromMusicMap"
  >;
}) {
  const {
    timelinesView,
    setTimelinesView,
    timelineMode,
    trackTimelineResponse,
    albumTimelineResponse,
    timelineChartSource,
    albumTimelineError,
    isAlbumTimelineLoading,
    openTimelinePlaylist,
    setTimelineMode,
    setTimelineChartSource,
    openTimelineAlbum,
    openTimelineTrack,
    setActiveSection,
    setAlbumTimelineRefreshKey,
    setTrackTimelineYear,
    setAlbumTimelineYear,
    genreSuggestionOptions,
    requestGenreSuggestionRefresh,
    openArtistFromMusicMap,
  } = model;
  return (
    <TimelinesWorkspace
      activeView={timelinesView}
      onViewChange={setTimelinesView}
    >
      {timelinesView === "charts" ? (
        <AlbumTimeRibbon
          embedded
          data={
            timelineMode === "tracks"
              ? trackTimelineResponse
              : albumTimelineResponse
          }
          mode={timelineMode}
          chartSource={timelineChartSource}
          error={albumTimelineError}
          isLoading={isAlbumTimelineLoading}
          onCreatePlaylist={openTimelinePlaylist}
          onModeChange={setTimelineMode}
          onChartSourceChange={setTimelineChartSource}
          onOpenAlbum={openTimelineAlbum}
          onOpenTrack={openTimelineTrack}
          onOpenSearch={() => setActiveSection("Search")}
          onRetry={() => setAlbumTimelineRefreshKey((previous) => previous + 1)}
          onSelectYear={
            timelineMode === "tracks"
              ? setTrackTimelineYear
              : setAlbumTimelineYear
          }
        />
      ) : timelinesView === "genres" ? (
        <GenreTimeline
          genreOptions={genreSuggestionOptions}
          onRequestGenreOptions={requestGenreSuggestionRefresh}
          onOpenAlbum={openTimelineAlbum}
        />
      ) : (
        <ArtistTimeline
          genreOptions={genreSuggestionOptions}
          onRequestGenreOptions={requestGenreSuggestionRefresh}
          onOpenAlbum={openTimelineAlbum}
          onOpenArtist={openArtistFromMusicMap}
        />
      )}
    </TimelinesWorkspace>
  );
}
