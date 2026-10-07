import { SonicAnalysisPanel } from "../../components/SonicAnalysisPanel";
import { TransitionRegion } from "../../components/TransitionRegion";
import { AlbumDetailPanel } from "./AlbumPanels";
import type { AppModel } from "../../app/useAppController";
export function AlbumsDetails({
  model,
}: {
  model: Pick<
    AppModel,
    | "selectedAlbum"
    | "albumTracksResponse"
    | "isAlbumTracksLoading"
    | "albumIncludeCalculated"
    | "setAlbumIncludeCalculated"
    | "albumExportResult"
    | "runAlbumExport"
    | "settings"
  >;
}) {
  const {
    selectedAlbum,
    albumTracksResponse,
    isAlbumTracksLoading,
    albumIncludeCalculated,
    setAlbumIncludeCalculated,
    albumExportResult,
    runAlbumExport,
    settings,
  } = model;
  return (
    <TransitionRegion>
      {selectedAlbum && <SonicAnalysisPanel key={selectedAlbum.albumId} albumId={selectedAlbum.albumId} />}
      <AlbumDetailPanel
        album={selectedAlbum}
        tracks={albumTracksResponse}
        isLoading={isAlbumTracksLoading}
        includeCalculated={albumIncludeCalculated}
        onIncludeCalculatedChange={(value) => setAlbumIncludeCalculated(value)}
        exportResult={albumExportResult}
        onExport={runAlbumExport}
        countryFlagDisplay={settings.countryFlagDisplay}
      />
    </TransitionRegion>
  );
}
