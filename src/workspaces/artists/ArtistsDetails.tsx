import { ArtistDetailPanel } from "./ArtistDetails";
import type { AppModel } from "../../app/useAppController";
export function ArtistsDetails({
  model,
}: {
  model: Pick<
    AppModel,
    | "selectedArtist"
    | "artistIncludeCalculated"
    | "setArtistIncludeCalculated"
    | "artistExportResult"
    | "runArtistExport"
  >;
}) {
  const {
    selectedArtist,
    artistIncludeCalculated,
    setArtistIncludeCalculated,
    artistExportResult,
    runArtistExport,
  } = model;
  return (
    <ArtistDetailPanel
      artist={selectedArtist}
      includeCalculated={artistIncludeCalculated}
      onIncludeCalculatedChange={(value) => setArtistIncludeCalculated(value)}
      exportResult={artistExportResult}
      onExport={runArtistExport}
    />
  );
}
