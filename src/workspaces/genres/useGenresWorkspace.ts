import { useEffect, useMemo, useCallback } from "react";
import { loadGenreSuggestionNames } from "../../app/defaults";
import { uniqueGenreSuggestionOptions } from "../../app/genreSuggestions";
import { genreSuggestionAliases } from "../../app/config";
import {
  createGenreAlbumsRequest,
  createGenreListRequest,
} from "../../app/requests";
import { listGenres, searchLibrary, exportSearch } from "../../backend";
import type { WorkspaceStores } from "../../app/WorkspaceStoresProvider";
import type { useCatalogWorkspace } from "../../app/useCatalogWorkspace";
type Inputs = Pick<
  WorkspaceStores,
  | "setGenreSuggestionNames"
  | "genreSuggestionNames"
  | "genreResponse"
  | "selectedGenreId"
  | "activeSection"
  | "setIsGenreLoading"
  | "setGenreError"
  | "genreRequest"
  | "setGenreResponse"
  | "catalogRefreshKey"
  | "setSelectedGenreId"
  | "setGenreAlbumsResponse"
  | "setIsGenreAlbumsLoading"
  | "setGenreAlbumsError"
  | "setGenreRequest"
  | "setGenreExportResult"
  | "genreIncludeCalculated"
  | "genreAlbumsResponse"
> &
  Pick<ReturnType<typeof useCatalogWorkspace>, "refreshGenreSuggestions">;

export function useGenresWorkspace({
  setGenreSuggestionNames,
  genreSuggestionNames,
  genreResponse,
  selectedGenreId,
  activeSection,
  setIsGenreLoading,
  setGenreError,
  genreRequest,
  setGenreResponse,
  catalogRefreshKey,
  setSelectedGenreId,
  setGenreAlbumsResponse,
  setIsGenreAlbumsLoading,
  setGenreAlbumsError,
  setGenreRequest,
  setGenreExportResult,
  genreIncludeCalculated,
  genreAlbumsResponse,
  refreshGenreSuggestions,
}: Inputs) {
  useEffect(() => {
    let cancelled = false;

    void loadGenreSuggestionNames()
      .then((nextGenreNames) => {
        if (!cancelled) {
          setGenreSuggestionNames(nextGenreNames);
        }
      })
      .catch(() => {
        // The genre fields can retry on focus, and the Genres page can still seed suggestions.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const genreSuggestionOptions = useMemo(
    () =>
      uniqueGenreSuggestionOptions([
        ...genreSuggestionAliases,
        ...genreSuggestionNames,
      ]),
    [genreSuggestionNames],
  );

  const requestGenreSuggestionRefresh = useCallback(() => {
    void refreshGenreSuggestions().catch(() => {
      // Field focus can retry again; keep the existing option list.
    });
  }, [refreshGenreSuggestions]);

  const selectedGenre =
    genreResponse?.rows.find((genre) => genre.id === selectedGenreId) ?? null;

  const genreAlbumsRequest = useMemo(
    () => (selectedGenre ? createGenreAlbumsRequest(selectedGenre) : null),
    [selectedGenre],
  );

  useEffect(() => {
    if (activeSection !== "Genres") {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setIsGenreLoading(true);
      setGenreError(null);
      void listGenres(genreRequest)
        .then((nextResponse) => {
          if (!cancelled) {
            setGenreResponse(nextResponse);
          }
        })
        .catch((searchError) => {
          if (!cancelled) {
            setGenreError(
              searchError instanceof Error
                ? searchError.message
                : String(searchError),
            );
            setGenreResponse(null);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsGenreLoading(false);
          }
        });
    }, 160);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeSection, catalogRefreshKey, genreRequest]);

  useEffect(() => {
    const visibleGenreNames =
      genreResponse?.rows.map((genre) => genre.name) ?? [];
    if (visibleGenreNames.length === 0) {
      return;
    }

    setGenreSuggestionNames((previous) =>
      uniqueGenreSuggestionOptions([...previous, ...visibleGenreNames]),
    );
  }, [genreResponse]);

  useEffect(() => {
    if (activeSection !== "Genres") {
      return;
    }

    const rows = genreResponse?.rows ?? [];
    setSelectedGenreId((previous) =>
      previous && rows.some((genre) => genre.id === previous)
        ? previous
        : (rows[0]?.id ?? null),
    );
  }, [activeSection, genreResponse]);

  useEffect(() => {
    if (activeSection !== "Genres" || !genreAlbumsRequest) {
      setGenreAlbumsResponse(null);
      return;
    }

    let cancelled = false;
    setIsGenreAlbumsLoading(true);
    setGenreAlbumsError(null);
    void searchLibrary(genreAlbumsRequest)
      .then((nextResponse) => {
        if (!cancelled) {
          setGenreAlbumsResponse(nextResponse);
        }
      })
      .catch((searchError) => {
        if (!cancelled) {
          setGenreAlbumsError(
            searchError instanceof Error
              ? searchError.message
              : String(searchError),
          );
          setGenreAlbumsResponse(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsGenreAlbumsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeSection, catalogRefreshKey, genreAlbumsRequest]);

  function clearGenreQuery() {
    setGenreRequest((previous) => ({
      ...createGenreListRequest(),
      limit: previous.limit,
    }));
    setGenreExportResult(null);
  }

  function selectGenre(genreId: string) {
    setSelectedGenreId(genreId);
    setGenreExportResult(null);
  }

  async function runGenreExport(format: string) {
    if (!genreAlbumsRequest) {
      return;
    }
    const result = await exportSearch(
      genreAlbumsRequest,
      format,
      genreIncludeCalculated,
    );
    setGenreExportResult(result);
  }

  const genreTotal = genreResponse?.total ?? 0;

  const genrePageStart = genreTotal === 0 ? 0 : genreRequest.offset + 1;

  const genrePageEnd = Math.min(
    genreTotal,
    genreRequest.offset + genreRequest.limit,
  );

  const selectedGenreAlbumCount =
    selectedGenre?.albumCount ?? genreAlbumsResponse?.total ?? 0;
  return {
    genreSuggestionOptions,
    requestGenreSuggestionRefresh,
    selectedGenre,
    genreAlbumsRequest,
    clearGenreQuery,
    selectGenre,
    runGenreExport,
    genreTotal,
    genrePageStart,
    genrePageEnd,
    selectedGenreAlbumCount,
  };
}
