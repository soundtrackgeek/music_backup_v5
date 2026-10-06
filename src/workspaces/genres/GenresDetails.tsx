import { GenreDetailPanel } from "./GenrePanels";
import type { AppModel } from "../../app/useAppController";
export function GenresDetails({
  model,
}: {
  model: Pick<
    AppModel,
    | "selectedGenre"
    | "genreIncludeCalculated"
    | "setGenreIncludeCalculated"
    | "genreExportResult"
    | "runGenreExport"
  >;
}) {
  const {
    selectedGenre,
    genreIncludeCalculated,
    setGenreIncludeCalculated,
    genreExportResult,
    runGenreExport,
  } = model;
  return (
    <GenreDetailPanel
      genre={selectedGenre}
      includeCalculated={genreIncludeCalculated}
      onIncludeCalculatedChange={(value) => setGenreIncludeCalculated(value)}
      exportResult={genreExportResult}
      onExport={runGenreExport}
    />
  );
}
