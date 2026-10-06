import { useMemo, useEffect, type ReactNode } from "react";
import {
  searchExportColumnOptions,
  formatMissingFieldLabels,
} from "../../app/config";
import {
  searchLibrary,
  saveSearch,
  deleteSavedSearch,
  exportSearch,
} from "../../backend";
import {
  type BrowseFilters,
  type TextFilter,
  type BrowseView,
} from "../../types";
import { textFilterLabel } from "../../app/display";
import {
  createTextFilter,
  defaultSort,
  createRequest,
  nextSort,
} from "../../app/requests";
import { CountryListDisplay } from "../../components/catalog/CatalogValues";
import { addRangeChip } from "../../components/catalog/filterChips";
import {
  countAdvancedSearchFilters,
  countSearchChartFilters,
} from "../../app/searchProgressive";
import { searchRequestCohort } from "../../app/insightCohorts";
import { createLocalSearchPlaylist } from "../../app/searchPlaylist";
import type { WorkspaceStores } from "../../app/WorkspaceStoresProvider";
import type { useSettingsWorkspace } from "../settings/useSettingsWorkspace";
type Inputs = Pick<
  WorkspaceStores,
  | "request"
  | "activeSection"
  | "setIsSearching"
  | "setBrowseError"
  | "setResponse"
  | "catalogRefreshKey"
  | "setRequest"
  | "settings"
  | "setExportResult"
  | "setSearchExportColumns"
  | "setSearchTableColumns"
  | "saveName"
  | "setSavedSearches"
  | "setSaveName"
  | "isCreatingSearchPlaylist"
  | "setIsCreatingSearchPlaylist"
  | "setSearchPlaylistError"
  | "setPlaylistLaunch"
  | "setActiveSection"
  | "includeCalculated"
  | "searchExportColumns"
  | "response"
> &
  Pick<ReturnType<typeof useSettingsWorkspace>, "originCountryOptions">;

export function useSearchWorkspace({
  request,
  activeSection,
  setIsSearching,
  setBrowseError,
  setResponse,
  catalogRefreshKey,
  setRequest,
  settings,
  setExportResult,
  setSearchExportColumns,
  setSearchTableColumns,
  saveName,
  setSavedSearches,
  setSaveName,
  isCreatingSearchPlaylist,
  setIsCreatingSearchPlaylist,
  setSearchPlaylistError,
  setPlaylistLaunch,
  setActiveSection,
  includeCalculated,
  searchExportColumns,
  response,
  originCountryOptions,
}: Inputs) {
  const currentFilters = request.filters;

  const availableSearchExportColumns = useMemo(
    () =>
      searchExportColumnOptions.filter(
        (option) => !option.views || option.views.includes(request.view),
      ),
    [request.view],
  );

  useEffect(() => {
    if (activeSection !== "Search") {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setIsSearching(true);
      setBrowseError(null);
      void searchLibrary(request)
        .then((nextResponse) => {
          if (!cancelled) {
            setResponse(nextResponse);
          }
        })
        .catch((searchError) => {
          if (!cancelled) {
            setBrowseError(
              searchError instanceof Error
                ? searchError.message
                : String(searchError),
            );
            setResponse(null);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsSearching(false);
          }
        });
    }, 160);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeSection, catalogRefreshKey, request]);

  const chips = useMemo(() => {
    const nextChips: { key: string; label: ReactNode; remove: () => void }[] =
      [];
    const addTextChip = (
      key: keyof BrowseFilters,
      label: string,
      filter: TextFilter,
    ) => {
      const chipLabel = textFilterLabel(label, filter);
      if (chipLabel) {
        nextChips.push({
          key,
          label: chipLabel,
          remove: () => updateFilter(key, createTextFilter()),
        });
      }
    };

    if (request.searchText.trim()) {
      nextChips.push({
        key: "searchText",
        label: `Search "${request.searchText.trim()}"`,
        remove: () =>
          setRequest((previous) => ({
            ...previous,
            searchText: "",
            offset: 0,
          })),
      });
    }

    addTextChip("albumTitle", "Album", currentFilters.albumTitle);
    addTextChip("trackTitle", "Track", currentFilters.trackTitle);
    addTextChip("albumArtist", "Album artist", currentFilters.albumArtist);
    addTextChip(
      "displayArtist",
      "Display artist",
      currentFilters.displayArtist,
    );
    addTextChip("publisher", "Publisher", currentFilters.publisher);
    addTextChip("filePath", "Path", currentFilters.filePath);
    addTextChip("filename", "Filename", currentFilters.filename);

    if (currentFilters.hasTrackText.trim()) {
      nextChips.push({
        key: "hasTrackText",
        label: `Track text "${currentFilters.hasTrackText.trim()}"`,
        remove: () => updateFilter("hasTrackText", ""),
      });
    }
    if (currentFilters.genres.length) {
      nextChips.push({
        key: "genres",
        label: `Genres: ${currentFilters.genres.join(", ")}`,
        remove: () => updateFilter("genres", []),
      });
    }
    if (currentFilters.excludedGenres.length) {
      nextChips.push({
        key: "excludedGenres",
        label: `Excluding: ${currentFilters.excludedGenres.join(", ")}`,
        remove: () => updateFilter("excludedGenres", []),
      });
    }
    if (currentFilters.originCountryCodes.length) {
      nextChips.push({
        key: "originCountryCodes",
        label: (
          <>
            Origin:{" "}
            <CountryListDisplay
              values={currentFilters.originCountryCodes}
              countryOptions={originCountryOptions}
              mode={settings.countryFlagDisplay}
            />
          </>
        ),
        remove: () => updateFilter("originCountryCodes", []),
      });
    }
    if (currentFilters.excludedOriginCountryCodes.length) {
      nextChips.push({
        key: "excludedOriginCountryCodes",
        label: (
          <>
            Origin excluding:{" "}
            <CountryListDisplay
              values={currentFilters.excludedOriginCountryCodes}
              countryOptions={originCountryOptions}
              mode={settings.countryFlagDisplay}
            />
          </>
        ),
        remove: () => updateFilter("excludedOriginCountryCodes", []),
      });
    }
    if (currentFilters.missingOriginCountry) {
      nextChips.push({
        key: "missingOriginCountry",
        label: "Missing origin country",
        remove: () => updateFilter("missingOriginCountry", false),
      });
    }
    if (currentFilters.artistType.trim()) {
      nextChips.push({
        key: "artistType",
        label: `Type: ${currentFilters.artistType.trim()}`,
        remove: () => updateFilter("artistType", ""),
      });
    }
    if (currentFilters.artistGender.trim()) {
      nextChips.push({
        key: "artistGender",
        label: `Gender: ${currentFilters.artistGender.trim()}`,
        remove: () => updateFilter("artistGender", ""),
      });
    }

    addRangeChip(
      nextChips,
      "year",
      "Year",
      currentFilters.yearFrom,
      currentFilters.yearTo,
      () => {
        updateFilters({ yearFrom: null, yearTo: null });
      },
    );
    if (
      currentFilters.billboardDebutWeekFrom ||
      currentFilters.billboardDebutWeekTo
    ) {
      const from = currentFilters.billboardDebutWeekFrom;
      const to = currentFilters.billboardDebutWeekTo;
      nextChips.push({
        key: "billboardDebutWeek",
        label:
          from && to
            ? `Chart debut ${from}–${to}`
            : from
              ? `Chart debut from ${from}`
              : `Chart debut through ${to}`,
        remove: () =>
          updateFilters({
            billboardDebutWeekFrom: null,
            billboardDebutWeekTo: null,
          }),
      });
    }
    if (
      currentFilters.billboardSingleDebutDateFrom ||
      currentFilters.billboardSingleDebutDateTo
    ) {
      const from = currentFilters.billboardSingleDebutDateFrom;
      const to = currentFilters.billboardSingleDebutDateTo;
      nextChips.push({
        key: "billboardSingleDebutDate",
        label:
          from && to
            ? `Billboard single debut ${from}–${to}`
            : from
              ? `Billboard single debut from ${from}`
              : `Billboard single debut through ${to}`,
        remove: () =>
          updateFilters({
            billboardSingleDebutDateFrom: null,
            billboardSingleDebutDateTo: null,
          }),
      });
    }
    if (
      currentFilters.vgListaDebutWeekFrom ||
      currentFilters.vgListaDebutWeekTo
    ) {
      const from = currentFilters.vgListaDebutWeekFrom;
      const to = currentFilters.vgListaDebutWeekTo;
      nextChips.push({
        key: "vgListaDebutWeek",
        label:
          from && to
            ? `VG Lista debut ${from}–${to}`
            : from
              ? `VG Lista debut from ${from}`
              : `VG Lista debut through ${to}`,
        remove: () =>
          updateFilters({
            vgListaDebutWeekFrom: null,
            vgListaDebutWeekTo: null,
          }),
      });
    }
    if (
      currentFilters.officialUkDebutWeekFrom ||
      currentFilters.officialUkDebutWeekTo
    ) {
      const from = currentFilters.officialUkDebutWeekFrom;
      const to = currentFilters.officialUkDebutWeekTo;
      nextChips.push({
        key: "officialUkDebutWeek",
        label:
          from && to
            ? `Official UK debut ${from}–${to}`
            : from
              ? `Official UK debut from ${from}`
              : `Official UK debut through ${to}`,
        remove: () =>
          updateFilters({
            officialUkDebutWeekFrom: null,
            officialUkDebutWeekTo: null,
          }),
      });
    }
    if (
      request.view === "tracks" &&
      (currentFilters.tiISkuddetDebutWeekFrom ||
        currentFilters.tiISkuddetDebutWeekTo)
    ) {
      const from = currentFilters.tiISkuddetDebutWeekFrom;
      const to = currentFilters.tiISkuddetDebutWeekTo;
      nextChips.push({
        key: "tiISkuddetDebutWeek",
        label:
          from && to
            ? `Ti i Skuddet debut ${from}–${to}`
            : from
              ? `Ti i Skuddet debut from ${from}`
              : `Ti i Skuddet debut through ${to}`,
        remove: () =>
          updateFilters({
            tiISkuddetDebutWeekFrom: null,
            tiISkuddetDebutWeekTo: null,
          }),
      });
    }
    if (
      request.view === "tracks" &&
      (currentFilters.norsktoppenDebutWeekFrom ||
        currentFilters.norsktoppenDebutWeekTo)
    ) {
      const from = currentFilters.norsktoppenDebutWeekFrom;
      const to = currentFilters.norsktoppenDebutWeekTo;
      nextChips.push({
        key: "norsktoppenDebutWeek",
        label:
          from && to
            ? `Norsktoppen debut ${from}–${to}`
            : from
              ? `Norsktoppen debut from ${from}`
              : `Norsktoppen debut through ${to}`,
        remove: () =>
          updateFilters({
            norsktoppenDebutWeekFrom: null,
            norsktoppenDebutWeekTo: null,
          }),
      });
    }
    addRangeChip(
      nextChips,
      "billboard",
      request.view === "tracks" ? "Album Billboard" : "Billboard",
      currentFilters.billboardRankMin,
      currentFilters.billboardRankMax,
      () => updateFilters({ billboardRankMin: null, billboardRankMax: null }),
    );
    if (request.view === "tracks") {
      addRangeChip(
        nextChips,
        "billboardSingle",
        "Billboard single",
        currentFilters.billboardSingleRankMin,
        currentFilters.billboardSingleRankMax,
        () =>
          updateFilters({
            billboardSingleRankMin: null,
            billboardSingleRankMax: null,
          }),
      );
      addRangeChip(
        nextChips,
        "norsktoppen",
        "Norsktoppen",
        currentFilters.norsktoppenRankMin,
        currentFilters.norsktoppenRankMax,
        () =>
          updateFilters({
            norsktoppenRankMin: null,
            norsktoppenRankMax: null,
          }),
      );
    }
    addRangeChip(
      nextChips,
      "vgLista",
      "VG Lista",
      currentFilters.vgListaRankMin,
      currentFilters.vgListaRankMax,
      () => updateFilters({ vgListaRankMin: null, vgListaRankMax: null }),
    );
    addRangeChip(
      nextChips,
      "officialUk",
      "Official UK",
      currentFilters.officialUkRankMin,
      currentFilters.officialUkRankMax,
      () => updateFilters({ officialUkRankMin: null, officialUkRankMax: null }),
    );
    if (request.view === "tracks") {
      addRangeChip(
        nextChips,
        "tiISkuddet",
        "Ti i Skuddet",
        currentFilters.tiISkuddetRankMin,
        currentFilters.tiISkuddetRankMax,
        () =>
          updateFilters({
            tiISkuddetRankMin: null,
            tiISkuddetRankMax: null,
          }),
      );
    }
    addRangeChip(
      nextChips,
      "releaseYear",
      "Release",
      currentFilters.releaseYearFrom,
      currentFilters.releaseYearTo,
      () => updateFilters({ releaseYearFrom: null, releaseYearTo: null }),
    );
    addRangeChip(
      nextChips,
      "artistBorn",
      "Born",
      currentFilters.artistBornYearFrom,
      currentFilters.artistBornYearTo,
      () =>
        updateFilters({
          artistBornYearFrom: null,
          artistBornYearTo: null,
        }),
    );
    if (
      currentFilters.artistDiedYearFrom != null ||
      currentFilters.artistDiedYearTo != null
    ) {
      addRangeChip(
        nextChips,
        "artistDiedYears",
        "Died",
        currentFilters.artistDiedYearFrom,
        currentFilters.artistDiedYearTo,
        () =>
          updateFilters({
            artistDiedYearFrom: null,
            artistDiedYearTo: null,
          }),
      );
    } else if (currentFilters.artistDied) {
      nextChips.push({
        key: "artistDied",
        label: "Dead artists",
        remove: () => updateFilter("artistDied", false),
      });
    }
    addRangeChip(
      nextChips,
      "artistFounded",
      "Founded",
      currentFilters.artistFoundedYearFrom,
      currentFilters.artistFoundedYearTo,
      () =>
        updateFilters({
          artistFoundedYearFrom: null,
          artistFoundedYearTo: null,
        }),
    );
    if (
      currentFilters.artistDissolvedYearFrom != null ||
      currentFilters.artistDissolvedYearTo != null
    ) {
      addRangeChip(
        nextChips,
        "artistDissolvedYears",
        "Dissolved",
        currentFilters.artistDissolvedYearFrom,
        currentFilters.artistDissolvedYearTo,
        () =>
          updateFilters({
            artistDissolvedYearFrom: null,
            artistDissolvedYearTo: null,
          }),
      );
    } else if (currentFilters.artistDissolved) {
      nextChips.push({
        key: "artistDissolved",
        label: "Dissolved groups",
        remove: () => updateFilter("artistDissolved", false),
      });
    }
    addRangeChip(
      nextChips,
      "minutes",
      "Minutes",
      currentFilters.totalMinutesMin,
      currentFilters.totalMinutesMax,
      () => updateFilters({ totalMinutesMin: null, totalMinutesMax: null }),
    );
    addRangeChip(
      nextChips,
      "ratedTracks",
      "Tracks rated",
      currentFilters.ratedTracksMin,
      currentFilters.ratedTracksMax,
      () => updateFilters({ ratedTracksMin: null, ratedTracksMax: null }),
    );
    addRangeChip(
      nextChips,
      "albumRating",
      "Album rating",
      currentFilters.albumRatingMin,
      currentFilters.albumRatingMax,
      () => updateFilters({ albumRatingMin: null, albumRatingMax: null }),
    );
    addRangeChip(
      nextChips,
      "trackRating",
      "Track rating",
      currentFilters.trackRatingMin,
      currentFilters.trackRatingMax,
      () => updateFilters({ trackRatingMin: null, trackRatingMax: null }),
    );

    addRangeChip(
      nextChips,
      "ratingCompleteness",
      "Complete",
      currentFilters.ratingCompletenessMin,
      currentFilters.ratingCompletenessMax,
      () =>
        updateFilters({
          ratingCompletenessMin: null,
          ratingCompletenessMax: null,
        }),
      "%",
    );
    if (currentFilters.notFullyRated) {
      nextChips.push({
        key: "notFullyRated",
        label: "Not fully rated",
        remove: () => updateFilter("notFullyRated", false),
      });
    }
    if (
      currentFilters.lovedTracksMin != null ||
      currentFilters.lovedTracksMax != null
    ) {
      addRangeChip(
        nextChips,
        "lovedTracks",
        "Loved",
        currentFilters.lovedTracksMin,
        currentFilters.lovedTracksMax,
        () => updateFilters({ lovedTracksMin: null, lovedTracksMax: null }),
      );
    }
    addRangeChip(
      nextChips,
      "bitrate",
      "Bitrate",
      currentFilters.bitrateKbpsMin,
      currentFilters.bitrateKbpsMax,
      () => updateFilters({ bitrateKbpsMin: null, bitrateKbpsMax: null }),
      " kbps",
    );
    if (currentFilters.mixedAudioQuality) {
      nextChips.push({
        key: "mixedAudioQuality",
        label: "Mixed audio quality",
        remove: () => updateFilter("mixedAudioQuality", false),
      });
    }
    if (currentFilters.missingFields.length) {
      nextChips.push({
        key: "missingFields",
        label: `Missing: ${formatMissingFieldLabels(currentFilters.missingFields, request.view)}`,
        remove: () => updateFilter("missingFields", []),
      });
    }

    return nextChips;
  }, [
    currentFilters,
    originCountryOptions,
    request.searchText,
    request.view,
    settings.countryFlagDisplay,
  ]);

  const advancedSearchFilterCount = countAdvancedSearchFilters(
    currentFilters,
    request.view,
  );

  const searchChartFilterCount = countSearchChartFilters(
    currentFilters,
    request.view,
  );

  function updateFilter<K extends keyof BrowseFilters>(
    key: K,
    value: BrowseFilters[K],
  ) {
    setRequest((previous) => ({
      ...previous,
      filters: { ...previous.filters, [key]: value },
      offset: 0,
    }));
  }

  function updateFilters(values: Partial<BrowseFilters>) {
    setRequest((previous) => ({
      ...previous,
      filters: { ...previous.filters, ...values },
      offset: 0,
    }));
  }

  function setView(view: BrowseView) {
    setRequest((previous) => ({
      ...previous,
      view,
      sort: defaultSort(view),
      offset: 0,
    }));
  }

  function clearQuery() {
    setRequest((previous) => ({
      ...createRequest(previous.view),
      limit: previous.limit,
    }));
    setExportResult(null);
  }

  function sortSearchBy(field: string) {
    setRequest((previous) => ({
      ...previous,
      sort: nextSort(previous.sort, field),
      offset: 0,
    }));
    setExportResult(null);
  }

  function toggleSearchExportColumn(value: string) {
    setSearchExportColumns((previous) =>
      previous.includes(value)
        ? previous.filter((column) => column !== value)
        : [...previous, value],
    );
    setExportResult(null);
  }

  function toggleSearchTableColumn(value: string) {
    setSearchTableColumns((previous) =>
      previous.includes(value)
        ? previous.filter((column) => column !== value)
        : [...previous, value],
    );
  }

  async function saveCurrentSearch() {
    const fallbackName =
      request.searchText.trim() ||
      `${request.view === "albums" ? "Album" : "Track"} search`;
    const saved = await saveSearch(saveName.trim() || fallbackName, request);
    setSavedSearches((previous) => [
      saved,
      ...previous.filter((search) => search.id !== saved.id),
    ]);
    setSaveName("");
  }

  async function createPlaylistFromCurrentSearch() {
    if (isCreatingSearchPlaylist || total === 0) return;
    const cohort = searchRequestCohort(request, total);
    setIsCreatingSearchPlaylist(true);
    setSearchPlaylistError(null);
    try {
      const draft = await createLocalSearchPlaylist(cohort.title, request);
      setPlaylistLaunch({
        id: Date.now(),
        cohortTitle: cohort.title,
        prompt: draft.prompt,
        request: draft.request,
        draft,
      });
      setActiveSection("Playlists");
    } catch (playlistError) {
      setSearchPlaylistError(
        playlistError instanceof Error
          ? playlistError.message
          : String(playlistError),
      );
    } finally {
      setIsCreatingSearchPlaylist(false);
    }
  }

  async function removeSavedSearch(id: number) {
    await deleteSavedSearch(id);
    setSavedSearches((previous) =>
      previous.filter((search) => search.id !== id),
    );
  }

  async function runExport(format: string) {
    const result = await exportSearch(
      request,
      format,
      includeCalculated,
      searchExportColumns,
    );
    setExportResult(result);
  }

  const total = response?.total ?? 0;

  const pageStart = total === 0 ? 0 : request.offset + 1;

  const pageEnd = Math.min(total, request.offset + request.limit);
  return {
    currentFilters,
    availableSearchExportColumns,
    chips,
    advancedSearchFilterCount,
    searchChartFilterCount,
    updateFilter,
    updateFilters,
    setView,
    clearQuery,
    sortSearchBy,
    toggleSearchExportColumn,
    toggleSearchTableColumn,
    saveCurrentSearch,
    createPlaylistFromCurrentSearch,
    removeSavedSearch,
    runExport,
    total,
    pageStart,
    pageEnd,
  };
}
