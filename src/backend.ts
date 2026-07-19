import { writeText } from "@tauri-apps/plugin-clipboard-manager";

import {
  invoke,
  isTauriRuntime,
  listen,
  openUrl,
  type UnlistenFn,
} from "./backend/tauriClient";
export { isTauriRuntime } from "./backend/tauriClient";
import {
  defaultBillboardSinglesSourcePath,
  defaultBillboardSourcePath,
  defaultCoverSourcePath,
  defaultImportSourcePath,
  defaultMusicBrainzCachePath,
  defaultMusicBrainzOverlaySyncPath,
  defaultSettings,
  cacheSettings,
  loadCachedSettings,
  normalizeArtistKey,
  normalizeMusicBrainzCachePath,
  normalizeSettings,
  settingsStorageKey,
} from "./backend/normalization";
import {
  createRequest,
  normalizeSavedChartForClient,
  normalizeSavedChartsForClient,
  normalizeSavedSearchForClient,
  normalizeSavedSearchesForClient,
} from "./app/requests";
import { scoreGenreGroup } from "./app/genreGroups";
import {
  applyMockArtistOriginCountry,
  coverDataUrlCache,
  emitMockMusicBrainzArtistInfoProgress,
  emitMockMusicBrainzOriginProgress,
  mockArtistInfoForArtist,
  mockArtistInfoProgress,
  mockArtistInfoProgressHandlers,
  mockArtists,
  mockCountryNameFromCode,
  mockDatabaseBackups,
  mockDiscovery,
  mockGenres,
  mockImportRuns,
  mockMusicBrainzArtistInfoPreviewRows,
  mockMusicBrainzArtistInfoRun,
  mockMusicBrainzArtistInfoStatus,
  mockMusicBrainzCacheStatus,
  mockMusicBrainzDiscographies,
  mockMusicBrainzOriginCountryStatus,
  mockMusicBrainzOriginPreviewRows,
  mockMusicBrainzOriginRun,
  mockMusicBrainzOverlaySyncLog,
  mockMusicToolIssues,
  mockMusicTools,
  mockOriginForArtist,
  mockOriginProgress,
  mockOriginProgressHandlers,
  mockRows,
  mockAiSnapshots,
  mockSavedCharts,
  mockSavedSearches,
  mockSettings,
  mockStatistics,
  mockStatus,
  setMockMusicBrainzOverlaySyncLog,
  setMockMusicToolIssues,
  setMockMusicTools,
  setMockSavedCharts,
  setMockAiSnapshots,
  setMockSavedSearches,
  setMockSettings,
  type MusicBrainzArtistInfoFields,
} from "./backend/webPreview";
export {
  defaultBillboardSinglesSourcePath,
  defaultBillboardSourcePath,
  defaultCoverSourcePath,
  defaultImportSourcePath,
  defaultMusicBrainzCachePath,
  defaultMusicBrainzOverlaySyncPath,
  cacheSettings,
  loadCachedSettings,
  normalizeSettings,
  settingsStorageKey,
} from "./backend/normalization";
import type {
  AppSettings,
  AiCompileRequest,
  AiCompiledQuery,
  AiConnectionTest,
  AiCurrentViewAnswer,
  AiCurrentViewQuestion,
  AiKeyStatus,
  AiLibraryAnalysis,
  AiLibraryAnalysisRequest,
  AiMusicResearchAnswer,
  AiMusicResearchRequest,
  AiMarkdownExportRequest,
  AiSnapshot,
  AiSnapshotKind,
  AiPlaylist,
  AiPlaylistBuildRequest,
  ExternalDiscoveryEntity,
  ExternalDiscoveryItem,
  ExternalDiscoveryResponse,
  ExportPlaylistRequest,
  SaveExternalDiscoveryRequest,
  SavePlaylistRequest,
  SavedExternalDiscovery,
  AddWishListItemRequest,
  WishListItem,
  WishListResponse,
  SavedPlaylist,
  SaveAiSnapshotRequest,
  ArtistListRequest,
  ArtistListResponse,
  ArtistSummary,
  BillboardImportSummary,
  BillboardSinglesImportSummary,
  BrowseFilters,
  BrowseRequest,
  BrowseResponse,
  BrowseRow,
  CoverImportProgress,
  CoverImportRequest,
  CoverImportSummary,
  DatabaseBackup,
  DatabaseRestoreSummary,
  DiscoveryResponse,
  ExportResult,
  ImportProgress,
  ImportRun,
  ImportSummary,
  LibraryStatus,
  SavedChart,
  SavedSearch,
  ChartConfig,
  GenreProgressRequest,
  GenreProgressStats,
  StatisticsResponse,
  YearProgressRequest,
  YearProgressStats,
  GenreListRequest,
  GenreListResponse,
  GenreSummary,
  MusicToolFixRequest,
  MusicToolFixSummary,
  MusicToolIssueRequest,
  MusicToolIssueResponse,
  MusicToolIssueRow,
  MusicToolProgress,
  MusicToolSummary,
  MusicBrainzArtistDiscographyResponse,
  MusicBrainzArtistExportRequest,
  MusicBrainzArtistInfoImportProgress,
  MusicBrainzArtistInfoImportRequest,
  MusicBrainzArtistInfoImportSummary,
  MusicBrainzArtistInfoPreview,
  MusicBrainzArtistInfoPreviewRow,
  MusicBrainzArtistInfoStatus,
  MusicBrainzArtistOriginCountryUpdate,
  MusicBrainzArtistRefreshResult,
  MusicBrainzArtistReleaseRow,
  MusicBrainzCacheStatus,
  MusicBrainzOriginCountryImportRequest,
  MusicBrainzOriginCountryImportProgress,
  MusicBrainzOriginCountryImportSummary,
  MusicBrainzOriginCountryPreview,
  MusicBrainzOriginCountryPreviewRow,
  MusicBrainzOriginCountryStatus,
  MusicBrainzOverlaySyncLogEntry,
  MusicBrainzOverlaySyncResult,
  PerformanceProbeResponse,
} from "./types";

let mockSavedPlaylists: SavedPlaylist[] = [];
let mockSavedExternalDiscoveries: SavedExternalDiscovery[] = [];
let mockWishListItems: WishListItem[] = [];

type RawExportResult = Omit<ExportResult, "pathCopied">;

export async function copyTextToClipboard(value: string) {
  if (!value) return false;
  try {
    if (isTauriRuntime()) {
      await writeText(value);
    } else if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function finalizeExport(result: RawExportResult): Promise<ExportResult> {
  return {
    ...result,
    pathCopied: await copyTextToClipboard(result.path),
  };
}

export async function openExternalUrl(url: string) {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("Invalid external URL.");
  }

  const isAllowedMusicBrainzUrl =
    parsedUrl.protocol === "https:" &&
    parsedUrl.hostname === "musicbrainz.org" &&
    ["/artist/", "/release-group/", "/recording/"].some((prefix) =>
      parsedUrl.pathname.startsWith(prefix),
    );

  if (!isAllowedMusicBrainzUrl) {
    throw new Error(
      "Only MusicBrainz artist, release-group, and recording URLs can be opened from this view.",
    );
  }

  const normalizedUrl = parsedUrl.toString();

  if (!isTauriRuntime()) {
    window.open(normalizedUrl, "_blank", "noopener,noreferrer");
    return;
  }

  await openUrl(normalizedUrl);
}

export async function openResearchSourceUrl(url: string) {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("Invalid research source URL.");
  }

  if (parsedUrl.protocol !== "https:") {
    throw new Error("Research sources must use HTTPS.");
  }

  const normalizedUrl = parsedUrl.toString();
  if (!isTauriRuntime()) {
    window.open(normalizedUrl, "_blank", "noopener,noreferrer");
    return;
  }

  await openUrl(normalizedUrl);
}

export async function getLibraryStatus() {
  if (!isTauriRuntime()) {
    return mockStatus;
  }

  return invoke<LibraryStatus>("get_library_status");
}

export async function runPerformanceProbe() {
  if (!isTauriRuntime()) {
    const operations = [
      [
        "search-albums-default",
        "Album search default page",
        "Search",
        18,
        mockRows.length,
        "Default album page, sorted by album.",
      ],
      [
        "search-albums-sampled-text",
        "Album search sampled text",
        "Search",
        23,
        1,
        "Sampled album text: Actually",
      ],
      [
        "search-tracks-sampled-text",
        "Track search sampled text",
        "Search",
        27,
        1,
        "Sampled track text: What Have I Done to Deserve This?",
      ],
      [
        "chart-album-score",
        "Chart-style album score ranking",
        "Charts",
        31,
        1,
        "Fully rated albums sorted by Album Score.",
      ],
      [
        "tools-missing-covers",
        "Music Tool missing covers",
        "Tools",
        34,
        1,
        "Albums without imported cover records.",
      ],
      [
        "tools-whitespace",
        "Music Tool whitespace anomalies",
        "Tools",
        12,
        1,
        "Repeated whitespace validator.",
      ],
      [
        "statistics-dashboard",
        "Statistics dashboard payload",
        "Statistics",
        44,
        mockRows.length,
        "Mock dashboard summary.",
      ],
      [
        "discovery-dashboard",
        "Discovery dashboard payload",
        "Discovery",
        39,
        12,
        "Mock discovery summary.",
      ],
    ] as const;

    return {
      generatedAt: new Date().toISOString(),
      databasePath: mockStatus.dbPath,
      trackCount: mockStatus.trackCount,
      albumCount: mockStatus.albumCount,
      totalDurationMs: operations.reduce(
        (sum, operation) => sum + operation[3],
        0,
      ),
      slowestOperationMs: Math.max(
        ...operations.map((operation) => operation[3]),
      ),
      operations: operations.map(
        ([id, label, category, durationMs, rowCount, detail]) => ({
          id,
          label,
          category,
          status: "ok",
          durationMs,
          totalCount: rowCount,
          rowCount,
          detail,
          errorMessage: null,
        }),
      ),
    } satisfies PerformanceProbeResponse;
  }

  return invoke<PerformanceProbeResponse>("run_performance_probe");
}

export async function listImportRuns(limit: number) {
  if (!isTauriRuntime()) {
    return mockImportRuns.slice(0, limit) satisfies ImportRun[];
  }

  return invoke<ImportRun[]>("list_import_runs", { limit });
}

export async function listDatabaseBackups() {
  if (!isTauriRuntime()) {
    return mockDatabaseBackups satisfies DatabaseBackup[];
  }

  return invoke<DatabaseBackup[]>("list_database_backups");
}

export async function restoreDatabaseBackup(backupPath: string) {
  if (!isTauriRuntime()) {
    throw new Error(
      "Start restore from the Tauri desktop app to access local SQLite backups.",
    );
  }

  return invoke<DatabaseRestoreSummary>("restore_database_backup", {
    backupPath,
  });
}

export async function getStatistics() {
  if (!isTauriRuntime()) {
    return mockStatistics;
  }

  return invoke<StatisticsResponse>("get_statistics");
}

export async function getYearProgress(request: YearProgressRequest) {
  if (!isTauriRuntime()) {
    const includedGenres = new Set(expandGenreFilterKeys(request.genres));
    const excludedGenres = new Set(
      expandGenreFilterKeys(request.excludedGenres),
    );
    const rowsByYear = new Map<
      number,
      YearProgressStats & { scoreTotal: number; scoredAlbumCount: number }
    >();

    mockRows.forEach((album) => {
      if (album.trackId != null || album.year == null) return;
      const genre = normalizeGenreKey(album.canonicalGenre);
      if (includedGenres.size > 0 && !includedGenres.has(genre)) return;
      if (excludedGenres.has(genre)) return;

      const existing = rowsByYear.get(album.year) ?? {
        year: album.year,
        albumCount: 0,
        ratedAlbumCount: 0,
        partialAlbumCount: 0,
        unratedAlbumCount: 0,
        trackCount: 0,
        totalSeconds: 0,
        lovedTracks: 0,
        averageAlbumScore: null,
        scoreTotal: 0,
        scoredAlbumCount: 0,
      };
      existing.albumCount += 1;
      existing.trackCount += album.totalTracks ?? 0;
      existing.totalSeconds += album.totalSeconds ?? 0;
      existing.lovedTracks += album.lovedTracks ?? 0;
      if ((album.ratingCompleteness ?? 0) >= 1) {
        existing.ratedAlbumCount += 1;
      } else if ((album.ratingCompleteness ?? 0) > 0) {
        existing.partialAlbumCount += 1;
      } else {
        existing.unratedAlbumCount += 1;
      }
      if (album.albumScore != null) {
        existing.scoreTotal += album.albumScore;
        existing.scoredAlbumCount += 1;
        existing.averageAlbumScore =
          existing.scoreTotal / existing.scoredAlbumCount;
      }
      rowsByYear.set(album.year, existing);
    });

    return Array.from(rowsByYear.values())
      .sort((left, right) => left.year - right.year)
      .map(({ scoreTotal: _scoreTotal, scoredAlbumCount: _scoredCount, ...row }) =>
        row,
      );
  }

  return invoke<YearProgressStats[]>("get_year_progress", { request });
}

export async function getGenreProgress(request: GenreProgressRequest) {
  if (!isTauriRuntime()) {
    const includedGenres = new Set(expandGenreFilterKeys(request.genres));
    const excludedGenres = new Set(
      expandGenreFilterKeys(request.excludedGenres),
    );
    const rowsByGenre = new Map<
      string,
      GenreProgressStats & { scoreTotal: number; scoredAlbumCount: number }
    >();

    mockRows.forEach((album) => {
      if (album.trackId != null) return;
      if (
        request.yearFrom != null &&
        (album.year == null || album.year < request.yearFrom)
      ) {
        return;
      }
      if (
        request.yearTo != null &&
        (album.year == null || album.year > request.yearTo)
      ) {
        return;
      }
      const genre = normalizeGenreKey(album.canonicalGenre) || "unknown";
      if (includedGenres.size > 0 && !includedGenres.has(genre)) return;
      if (excludedGenres.has(genre)) return;

      const existing = rowsByGenre.get(genre) ?? {
        genre: album.canonicalGenre?.trim() || "Unknown",
        albumCount: 0,
        ratedAlbumCount: 0,
        partialAlbumCount: 0,
        unratedAlbumCount: 0,
        trackCount: 0,
        totalSeconds: 0,
        lovedTracks: 0,
        averageAlbumScore: null,
        scoreTotal: 0,
        scoredAlbumCount: 0,
      };
      existing.albumCount += 1;
      existing.trackCount += album.totalTracks ?? 0;
      existing.totalSeconds += album.totalSeconds ?? 0;
      existing.lovedTracks += album.lovedTracks ?? 0;
      if ((album.ratingCompleteness ?? 0) >= 1) {
        existing.ratedAlbumCount += 1;
      } else if ((album.ratingCompleteness ?? 0) > 0) {
        existing.partialAlbumCount += 1;
      } else {
        existing.unratedAlbumCount += 1;
      }
      if (album.albumScore != null) {
        existing.scoreTotal += album.albumScore;
        existing.scoredAlbumCount += 1;
        existing.averageAlbumScore =
          existing.scoreTotal / existing.scoredAlbumCount;
      }
      rowsByGenre.set(genre, existing);
    });

    return Array.from(rowsByGenre.values())
      .sort(
        (left, right) =>
          right.albumCount - left.albumCount ||
          left.genre.localeCompare(right.genre),
      )
      .map(({ scoreTotal: _scoreTotal, scoredAlbumCount: _scoredCount, ...row }) =>
        row,
      );
  }

  return invoke<GenreProgressStats[]>("get_genre_progress", { request });
}

export async function getDiscovery() {
  if (!isTauriRuntime()) {
    return mockDiscovery;
  }

  return invoke<DiscoveryResponse>("get_discovery");
}

export async function getSettings() {
  if (!isTauriRuntime()) {
    return mockSettings;
  }

  const settings = await invoke<AppSettings>("get_settings");
  cacheSettings(settings);
  return settings;
}

export async function getAiKeyStatus() {
  if (!isTauriRuntime()) {
    return {
      configured: false,
      source: "none",
      model: "gpt-5.6-luna",
    } satisfies AiKeyStatus;
  }

  return invoke<AiKeyStatus>("get_ai_key_status");
}

export async function saveOpenAiApiKey(apiKey: string) {
  if (!isTauriRuntime()) {
    throw new Error(
      "OpenAI keys can only be stored by the Tauri desktop app.",
    );
  }

  return invoke<AiKeyStatus>("save_openai_api_key", { apiKey });
}

export async function deleteOpenAiApiKey() {
  if (!isTauriRuntime()) {
    throw new Error(
      "OpenAI keys can only be removed by the Tauri desktop app.",
    );
  }

  return invoke<AiKeyStatus>("delete_openai_api_key");
}

export async function testOpenAiConnection() {
  if (!isTauriRuntime()) {
    throw new Error("OpenAI connection tests require the Tauri desktop app.");
  }

  return invoke<AiConnectionTest>("test_openai_connection");
}

export async function compileNaturalLanguageQuery(input: AiCompileRequest) {
  if (!isTauriRuntime()) {
    throw new Error("Natural-language queries require the Tauri desktop app.");
  }

  return invoke<AiCompiledQuery>("compile_natural_language_query", { input });
}

export async function askCurrentView(input: AiCurrentViewQuestion) {
  if (!isTauriRuntime()) {
    const preview = await searchLibrary({
      ...input.request,
      offset: 0,
      limit: Math.min(input.request.limit, 50),
    });
    const artistCounts = new Map<string, number>();
    for (const row of preview.rows) {
      const artist =
        (input.request.view === "tracks"
          ? row.displayArtist || row.albumArtistDisplay
          : row.albumArtistDisplay) || "Unknown";
      artistCounts.set(artist, (artistCounts.get(artist) ?? 0) + 1);
    }
    const topArtist = [...artistCounts.entries()].sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
    )[0];
    const noun = input.request.view === "tracks" ? "tracks" : "albums";
    const artistSummary = topArtist
      ? ` The most frequent artist in the inspected preview rows is ${topArtist[0]} (${topArtist[1]}).`
      : "";
    return {
      answer: `This filtered view contains ${preview.total.toLocaleString()} ${noun}.${artistSummary}`,
      view: input.request.view,
      matchingRows: preview.total,
      analysisCount: 2,
      namedRowsShared: 0,
      model: "gpt-5.6-luna",
      usage: {
        inputTokens: null,
        cachedInputTokens: null,
        outputTokens: null,
      },
    } satisfies AiCurrentViewAnswer;
  }

  return invoke<AiCurrentViewAnswer>("ask_current_view", { input });
}

export async function researchMusic(input: AiMusicResearchRequest) {
  if (!isTauriRuntime()) {
    const context = input.context.selectedLabel
      ? `${input.context.selectedLabel}${input.context.selectedSubtitle ? ` — ${input.context.selectedSubtitle}` : ""}`
      : "the wider music question";
    return {
      answer: [
        "## Preview research finding",
        "",
        `This is a **Markdown preview** about ${context}. In the desktop app, Luna can search the web and, when relevant, inspect a small bounded slice of the selected local album, artist, or genre.`,
        "",
        "- Web-supported music research",
        "- Bounded local-library context when requested",
        "- Exact local snapshots for later reopening",
        "",
        `> Your question: ${input.question.trim()}`,
      ].join("\n"),
      sources: [
        {
          title: "OpenAI web search documentation",
          url: "https://developers.openai.com/api/docs/guides/tools-web-search",
        },
      ],
      model: "gpt-5.6-luna",
      usage: {
        inputTokens: null,
        cachedInputTokens: null,
        outputTokens: null,
      },
      usedWebSearch: true,
      localInspectionCount: input.context.selectedEntityId ? 1 : 0,
    } satisfies AiMusicResearchAnswer;
  }

  return invoke<AiMusicResearchAnswer>("research_music", { input });
}

export async function analyzeLibrary(input: AiLibraryAnalysisRequest) {
  if (!isTauriRuntime()) {
    const albumTotal = mockStatistics.overview.albumCount;
    const unrated = mockStatistics.ratingProgress.unratedAlbums;
    const ratingCoverage = mockStatistics.healthScore.ratingCoverage * 100;
    const genre = mockStatistics.genreProgress[0];
    const lensSummary = {
      overview: `The preview library contains ${albumTotal.toLocaleString()} albums and ${mockStatistics.overview.trackCount.toLocaleString()} tracks.`,
      ratingBacklog: `${unrated.toLocaleString()} albums remain unrated, while track rating coverage is ${ratingCoverage.toFixed(1)}%.`,
      tasteProfile: `${mockStatistics.lovedTracks.lovedTracks.toLocaleString()} tracks are marked loved${genre ? `, with ${genre.genre} the largest preview genre` : ""}.`,
      catalogBalance: `${mockStatistics.libraryShape.mostRepresentedDecade ?? "The leading decade"}s is the most represented decade in the preview profile.`,
      metadataHealth: `The preview library health score is ${mockStatistics.healthScore.score.toFixed(1)}%.`,
    }[input.lens];
    return {
      lens: input.lens,
      headline: "A compact profile with a clear next step",
      summary: lensSummary,
      findings: [
        {
          title: "Rating coverage is the main opportunity",
          evidence: `${unrated.toLocaleString()} albums are unrated and track coverage is ${ratingCoverage.toFixed(1)}%.`,
          interpretation:
            "A focused rating pass would improve both completion and the quality of later taste comparisons.",
        },
        {
          title: "The catalog has a visible center of gravity",
          evidence: `${mockStatistics.libraryShape.mostRepresentedDecade ?? 1980}s contains ${mockStatistics.libraryShape.mostRepresentedDecadeAlbums.toLocaleString()} albums.`,
          interpretation:
            "Compare that decade with a smaller adjacent decade to distinguish collection size from preference.",
        },
      ],
      nextQuestions: [
        "Which genres contain the largest unrated backlog?",
        "How concentrated is the catalog by decade?",
      ],
      profileSections: ["overview", "ratingProgress"],
      aggregatePointsShared: 17,
      model: "gpt-5.6-luna",
      usage: {
        inputTokens: null,
        cachedInputTokens: null,
        outputTokens: null,
      },
    } satisfies AiLibraryAnalysis;
  }

  return invoke<AiLibraryAnalysis>("analyze_library", { input });
}

export async function listAiSnapshots(kind?: AiSnapshotKind) {
  if (!isTauriRuntime()) {
    return mockAiSnapshots.filter(
      (snapshot) => kind == null || snapshot.content.kind === kind,
    ) satisfies AiSnapshot[];
  }

  return invoke<AiSnapshot[]>("list_ai_snapshots", { kind: kind ?? null });
}

export async function saveAiSnapshot(input: SaveAiSnapshotRequest) {
  if (!isTauriRuntime()) {
    const nextId =
      mockAiSnapshots.reduce(
        (largest, snapshot) => Math.max(largest, snapshot.id),
        0,
      ) + 1;
    const saved = {
      id: nextId,
      title: input.title,
      content: input.content,
      libraryImportRunId: mockStatus.lastImport?.id ?? null,
      libraryImportedAt: mockStatus.lastImport?.completedAt ?? null,
      libraryAlbumCount: mockStatus.albumCount,
      libraryTrackCount: mockStatus.trackCount,
      createdAt: new Date().toISOString(),
    } satisfies AiSnapshot;
    setMockAiSnapshots([saved, ...mockAiSnapshots]);
    return saved;
  }

  return invoke<AiSnapshot>("save_ai_snapshot", { input });
}

export async function deleteAiSnapshot(id: number) {
  if (!isTauriRuntime()) {
    setMockAiSnapshots(
      mockAiSnapshots.filter((snapshot) => snapshot.id !== id),
    );
    return;
  }

  return invoke<void>("delete_ai_snapshot", { id });
}

export async function exportAiMarkdown(input: AiMarkdownExportRequest) {
  if (!isTauriRuntime()) {
    return finalizeExport({
      path: `C:\\Music Library\\exports\\music-library-ai-${input.title
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "research"}-preview.md`,
      format: "md",
      rowCount: input.markdown.split(/\r?\n/).length,
    } satisfies RawExportResult);
  }

  return finalizeExport(
    await invoke<RawExportResult>("export_ai_markdown", { input }),
  );
}

export async function buildPlaylist(input: AiPlaylistBuildRequest) {
  if (!isTauriRuntime()) {
    const request = createRequest("tracks");
    request.sort = { field: "trackRating", direction: "desc" };
    request.limit = 200;
    const tracks = mockRows
      .filter((row) => row.trackId != null)
      .map((row) => ({
        trackId: row.trackId!,
        albumId: row.albumId,
        album: row.album,
        albumArtist: row.albumArtistDisplay,
        displayArtist: row.displayArtist,
        title: row.title,
        genre: row.canonicalGenre,
        year: row.year,
        seconds: row.trackSeconds ?? 0,
        rating: row.normalizedRating,
        loved: row.love?.trim().toLowerCase() === "l",
        filePath: row.filePath,
        filename: row.filename,
      }));
    const prompt = input.prompt.trim();
    const strategy = /discover|surpris|deep cut/i.test(prompt)
      ? "discovery"
      : /random|shuffle/i.test(prompt)
        ? "random"
        : "variety";
    return {
      prompt,
      name: "Luna preview mix",
      description:
        "A varied local-library sequence shaped from the request, with repeat caps applied.",
      request,
      strategy,
      targetTrackCount: 12,
      targetMinutes: 45,
      maxTracksPerArtist: 2,
      maxTracksPerAlbum: 1,
      model: "gpt-5.6-luna",
      usage: {
        inputTokens: null,
        cachedInputTokens: null,
        outputTokens: null,
      },
      matchingTrackCount: tracks.length,
      candidateCount: tracks.length,
      totalSeconds: tracks.reduce((total, track) => total + track.seconds, 0),
      tracks,
    } satisfies AiPlaylist;
  }

  return invoke<AiPlaylist>("build_playlist", { input });
}

export async function listSavedPlaylists() {
  if (!isTauriRuntime()) {
    return mockSavedPlaylists;
  }
  return invoke<SavedPlaylist[]>("list_saved_playlists");
}

export async function savePlaylist(input: SavePlaylistRequest) {
  if (!isTauriRuntime()) {
    const now = new Date().toISOString();
    const existing = input.id == null
      ? null
      : mockSavedPlaylists.find((playlist) => playlist.id === input.id) ?? null;
    const saved = {
      id:
        existing?.id ??
        mockSavedPlaylists.reduce(
          (largest, playlist) => Math.max(largest, playlist.id),
          0,
        ) + 1,
      name: input.name.trim(),
      playlist: input.playlist,
      libraryImportRunId: mockStatus.lastImport?.id ?? null,
      libraryImportedAt: mockStatus.lastImport?.completedAt ?? null,
      libraryAlbumCount: mockStatus.albumCount,
      libraryTrackCount: mockStatus.trackCount,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    } satisfies SavedPlaylist;
    mockSavedPlaylists = [
      saved,
      ...mockSavedPlaylists.filter((playlist) => playlist.id !== saved.id),
    ];
    return saved;
  }
  return invoke<SavedPlaylist>("save_playlist", { input });
}

export async function deleteSavedPlaylist(id: number) {
  if (!isTauriRuntime()) {
    mockSavedPlaylists = mockSavedPlaylists.filter(
      (playlist) => playlist.id !== id,
    );
    return;
  }
  return invoke<void>("delete_saved_playlist", { id });
}

const previewExternalCatalog: Record<
  ExternalDiscoveryEntity,
  Array<[string, string, string]>
> = {
  artist: [
    ["Porcupine Tree", "On the Sunday of Life…", "b9d134dd-2e7c-4ccc-9a26-81cb9c8d4d7a"],
    ["The Cardigans", "Emmerdale", "0a03e7c3-63e6-4db2-902c-438c1f7241c0"],
    ["Kyuss", "Blues for the Red Sun", "bd53f61e-ade8-4151-9a31-8b8b7d41a1c3"],
    ["Morphine", "Good", "13e28215-eae1-4bd4-b7e7-6b4b6b9e81cb"],
    ["The Pharcyde", "Bizarre Ride II the Pharcyde", "647221d0-f45a-4238-8d16-320f1c2f9b46"],
    ["Luna", "Lunapark", "44aa8475-aba2-480b-8a89-a7c9339d1bf8"],
    ["Pavement", "Slanted and Enchanted", "bdea8a47-0c90-4a9a-95c6-a790c9f7bf45"],
    ["Stereolab", "Peng!", "98d2f0ec-3c08-4f52-ac0c-2243b2b0c31a"],
    ["Helmet", "Meantime", "e2b2c4a8-9b9a-44d3-9d4b-97a6a274710b"],
    ["Spiritualized", "Lazer Guided Melodies", "c1fda6fa-2a76-4d6c-bd0c-0e53285c1718"],
  ],
  album: [
    ["Images and Words", "Dream Theater", "8b2acb43-832f-34f5-b372-01b37d368636"],
    ["Automatic for the People", "R.E.M.", "3402eece-7c5c-354b-bf87-a8108912f9a7"],
    ["Copper Blue", "Sugar", "4a51cbcf-878e-3f09-89a3-3e7a6e80623a"],
    ["Dirt", "Alice in Chains", "82822e11-4cb6-39cc-8c4e-791923d62561"],
    ["Dry", "PJ Harvey", "00465433-411a-33e1-aecb-4572f7b14848"],
    ["Selected Ambient Works 85–92", "Aphex Twin", "fdefee02-3886-3b28-b1fd-22664d17b5ed"],
    ["Meantime", "Helmet", "812d8919-04a8-3ae7-a0e4-8afc8157fe2c"],
    ["The Chronic", "Dr. Dre", "0d1868bd-3b30-33c4-8664-55826459c3f9"],
    ["Little Earthquakes", "Tori Amos", "88b6c5e7-4e6c-35b8-a029-6941d15a5535"],
    ["Lazer Guided Melodies", "Spiritualized", "152815ca-8ce5-3e54-9155-0fa16f7d20d1"],
  ],
  song: [
    ["Friday I'm in Love", "The Cure", "083721bb-1f61-4da0-a4f4-baa8d758b516"],
    ["Nuthin' but a ‘G’ Thang", "Dr. Dre", "1d557f61-5f77-499c-bc28-b86f9b03c97c"],
    ["Would?", "Alice in Chains", "8488d5e4-30f2-4f38-8dd8-89a33a2095fb"],
    ["Connected", "Stereo MC's", "c74215e7-7bb5-42e0-9456-f5a05122f2c7"],
    ["Drive", "R.E.M.", "6d4d4032-f476-4e33-aecf-fc51cfe17da7"],
    ["Killing in the Name", "Rage Against the Machine", "c0727b09-0f08-4a42-8aa4-e511e08e6b34"],
    ["Silent Lucidity", "Queensrÿche", "3be10621-7df9-4ecb-8b0b-391577fcf40b"],
    ["Motorcycle Emptiness", "Manic Street Preachers", "d54e2b7e-270d-4e13-9b4a-88448f05a5ad"],
    ["Human Behaviour", "Björk", "485778d2-5edb-4b5d-bf8e-037b979bf8fd"],
    ["Creep", "Radiohead", "ccfdd180-22e5-4dd2-a739-907a40055a27"],
  ],
};

function previewDiscoveryEntity(prompt: string): ExternalDiscoveryEntity {
  if (/\b(song|songs|track|tracks|recording|recordings)\b/i.test(prompt)) {
    return "song";
  }
  if (/\b(album|albums|record|records|lp|lps)\b/i.test(prompt)) {
    return "album";
  }
  return "artist";
}

function previewDiscoveryCount(prompt: string) {
  const match = prompt.match(/\b(\d{1,2})\b/);
  const value = match ? Number(match[1]) : 5;
  return Math.min(25, Math.max(1, value));
}

export async function discoverOutsideLibrary(input: { prompt: string }) {
  if (!isTauriRuntime()) {
    const prompt = input.prompt.trim();
    const entity = previewDiscoveryEntity(prompt);
    const count = previewDiscoveryCount(prompt);
    const year = Number(prompt.match(/\b(19|20)\d{2}\b/)?.[0] ?? 0);
    const formedYear =
      entity === "artist" && /\b(formed|founded|started)\b/i.test(prompt);
    const entityLabel = entity === "song" ? "songs" : `${entity}s`;
    const rows = previewExternalCatalog[entity].slice(0, count);
    const path = entity === "album" ? "release-group" : entity === "song" ? "recording" : "artist";
    const items = rows.map(([title, artistOrAnchor, id]) => ({
      id,
      entity,
      title,
      artist: entity === "artist" ? title : artistOrAnchor,
      anchor: entity === "artist" ? artistOrAnchor : null,
      year: year || 1992,
      country: null,
      itemType: entity === "artist" ? "Group" : entity === "album" ? "Album" : "Recording",
      tags: [],
      score: 100,
      evidence:
        entity === "artist"
          ? `MusicBrainz verifies the release “${artistOrAnchor}” in ${year || 1992}.`
          : `MusicBrainz verifies this ${entity}'s first release in ${year || 1992}.`,
      url: `https://musicbrainz.org/${path}/${id}`,
    })) satisfies ExternalDiscoveryItem[];
    const title = `${entityLabel[0].toUpperCase()}${entityLabel.slice(1)} outside my library`;
    return {
      prompt,
      title,
      summary: `${count} verified ${entityLabel}${year ? ` tied to ${year}` : ""}, excluding local-library matches.`,
      plan: {
        prompt,
        entity,
        count,
        year,
        yearMeaning: formedYear ? "formedYear" : "releaseYear",
        genres: /\baor\b/i.test(prompt) ? ["AOR"] : [],
        countries: [],
        keywords: "",
        title,
        summary: `${count} verified ${entityLabel} outside the local library.`,
        model: "gpt-5.6-luna",
        usage: { inputTokens: null, cachedInputTokens: null, outputTokens: null },
      },
      items,
      source: "MusicBrainz",
      fetchedAt: new Date().toISOString(),
      catalogCandidateCount: Math.min(100, Math.max(25, count * 12)),
      excludedOwnedCount: 3,
      limitations: rows.length < count
        ? [`MusicBrainz returned ${rows.length} unowned results from the bounded candidate set, fewer than the requested ${count}.`]
        : [],
    } satisfies ExternalDiscoveryResponse;
  }
  return invoke<ExternalDiscoveryResponse>("discover_outside_library", { input });
}

export async function listSavedExternalDiscoveries() {
  if (!isTauriRuntime()) return mockSavedExternalDiscoveries;
  return invoke<SavedExternalDiscovery[]>("list_saved_external_discoveries");
}

export async function saveExternalDiscovery(input: SaveExternalDiscoveryRequest) {
  if (!isTauriRuntime()) {
    const now = new Date().toISOString();
    const existing = input.id == null
      ? null
      : mockSavedExternalDiscoveries.find((saved) => saved.id === input.id) ?? null;
    const saved = {
      id: existing?.id ?? mockSavedExternalDiscoveries.reduce(
        (largest, entry) => Math.max(largest, entry.id),
        0,
      ) + 1,
      name: input.name.trim(),
      response: input.response,
      libraryImportRunId: mockStatus.lastImport?.id ?? null,
      libraryImportedAt: mockStatus.lastImport?.completedAt ?? null,
      libraryAlbumCount: mockStatus.albumCount,
      libraryTrackCount: mockStatus.trackCount,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    } satisfies SavedExternalDiscovery;
    mockSavedExternalDiscoveries = [
      saved,
      ...mockSavedExternalDiscoveries.filter((entry) => entry.id !== saved.id),
    ];
    return saved;
  }
  return invoke<SavedExternalDiscovery>("save_external_discovery", { input });
}

export async function deleteSavedExternalDiscovery(id: number) {
  if (!isTauriRuntime()) {
    mockSavedExternalDiscoveries = mockSavedExternalDiscoveries.filter(
      (saved) => saved.id !== id,
    );
    return;
  }
  return invoke<void>("delete_saved_external_discovery", { id });
}

export async function listWishList() {
  if (!isTauriRuntime()) {
    return {
      items: mockWishListItems,
      autoRemovedCount: 0,
    } satisfies WishListResponse;
  }
  return invoke<WishListResponse>("list_wish_list");
}

export async function addWishListItem(input: AddWishListItemRequest) {
  if (!isTauriRuntime()) {
    const existing = mockWishListItems.find((item) =>
      input.musicbrainzId
        ? item.entity === input.entity && item.musicbrainzId === input.musicbrainzId
        : item.entity === input.entity &&
          item.title.localeCompare(input.title, undefined, { sensitivity: "base" }) === 0 &&
          item.artist.localeCompare(input.artist, undefined, { sensitivity: "base" }) === 0,
    );
    if (existing) return existing;
    const item = {
      ...input,
      id: mockWishListItems.reduce((largest, entry) => Math.max(largest, entry.id), 0) + 1,
      createdAt: new Date().toISOString(),
    } satisfies WishListItem;
    mockWishListItems = [item, ...mockWishListItems];
    return item;
  }
  return invoke<WishListItem>("add_wish_list_item", { input });
}

export async function removeWishListItem(id: number) {
  if (!isTauriRuntime()) {
    mockWishListItems = mockWishListItems.filter((item) => item.id !== id);
    return;
  }
  return invoke<void>("remove_wish_list_item", { id });
}

export async function exportPlaylist(input: ExportPlaylistRequest) {
  if (!isTauriRuntime()) {
    return finalizeExport({
      path: `Preview runtime / ${input.name.trim() || "playlist"}.m3u8`,
      format: "m3u8",
      rowCount: input.playlist.tracks.filter(
        (track) => track.filePath && track.filename,
      ).length,
    } satisfies RawExportResult);
  }
  return finalizeExport(
    await invoke<RawExportResult>("export_playlist", { input }),
  );
}

export async function getMusicBrainzCacheStatus(cachePath?: string) {
  if (!isTauriRuntime()) {
    const nextCachePath = normalizeMusicBrainzCachePath(
      cachePath ?? mockSettings.musicBrainzCachePath,
    );
    return {
      ...mockMusicBrainzCacheStatus,
      cachePath: nextCachePath,
      resolvedPath: `Preview runtime / ${nextCachePath}`,
    } satisfies MusicBrainzCacheStatus;
  }

  return invoke<MusicBrainzCacheStatus>("get_musicbrainz_cache_status", {
    cachePath: cachePath ?? null,
  });
}

function mockOriginPreview(
  request: MusicBrainzOriginCountryImportRequest = {},
): MusicBrainzOriginCountryPreview {
  const selectedKeys = new Set(
    (request.artistKeys ?? []).map(normalizeArtistKey).filter(Boolean),
  );
  const rows = mockMusicBrainzOriginPreviewRows
    .filter(
      (row) => selectedKeys.size === 0 || selectedKeys.has(row.localArtistKey),
    )
    .slice(0, request.limit ?? undefined)
    .map((row) => {
      if (
        request.refetch &&
        (row.status === "alreadyImported" || row.status === "manual")
      ) {
        return { ...row, status: "eligible" };
      }
      return row;
    });
  return {
    totalAlbumArtists: mockMusicBrainzOriginCountryStatus.totalAlbumArtists,
    eligibleCount: rows.filter((row) => row.status === "eligible").length,
    alreadyImportedCount: rows.filter(
      (row) => row.status === "alreadyImported" || row.status === "manual",
    ).length,
    skippedCount: rows.filter((row) => row.status === "skipped").length,
    unresolvedCount: rows.filter((row) => row.status === "unresolved").length,
    estimatedSeconds:
      rows.filter((row) => row.status === "eligible").length * 2,
    rows,
  };
}

export async function getMusicBrainzOriginCountryStatus() {
  if (!isTauriRuntime()) {
    return mockMusicBrainzOriginCountryStatus;
  }

  return invoke<MusicBrainzOriginCountryStatus>(
    "get_musicbrainz_origin_country_status",
  );
}

export async function previewMusicBrainzOriginCountryImport(
  request: MusicBrainzOriginCountryImportRequest = {},
) {
  if (!isTauriRuntime()) {
    return mockOriginPreview(request);
  }

  return invoke<MusicBrainzOriginCountryPreview>(
    "preview_musicbrainz_origin_country_import",
    {
      request,
    },
  );
}

export async function importMusicBrainzOriginCountries(
  request: MusicBrainzOriginCountryImportRequest = {},
) {
  if (!isTauriRuntime()) {
    const preview = mockOriginPreview(request);
    const eligibleRows = preview.rows.filter(
      (row) => row.status === "eligible",
    );
    const fetchedCount = eligibleRows.length;
    const skippedCount = Math.max(0, preview.rows.length - eligibleRows.length);
    let storedCount = 0;
    let unresolvedCount = 0;
    emitMockMusicBrainzOriginProgress(
      mockOriginProgress(
        "running",
        preview.totalAlbumArtists,
        fetchedCount,
        0,
        0,
        0,
        skippedCount,
        0,
        0,
        null,
        `Ready to fetch ${fetchedCount} eligible artists; ${skippedCount} skipped by preview rules.`,
      ),
    );

    for (const [index, row] of eligibleRows.entries()) {
      emitMockMusicBrainzOriginProgress(
        mockOriginProgress(
          "fetching",
          preview.totalAlbumArtists,
          fetchedCount,
          index,
          index,
          storedCount,
          skippedCount,
          unresolvedCount,
          0,
          row,
          `Fetching ${row.displayArtist} from MusicBrainz.`,
        ),
      );
      await new Promise((resolve) => window.setTimeout(resolve, 180));
      const isUnresolved = row.displayArtist === "Dio" && request.refetch;
      if (isUnresolved) {
        unresolvedCount += 1;
      } else {
        storedCount += 1;
      }
      emitMockMusicBrainzOriginProgress(
        mockOriginProgress(
          isUnresolved ? "unresolved" : "stored",
          preview.totalAlbumArtists,
          fetchedCount,
          index + 1,
          index + 1,
          storedCount,
          skippedCount,
          unresolvedCount,
          0,
          row,
          isUnresolved
            ? `${row.displayArtist} did not return a usable country; saved as unresolved.`
            : `Stored ${row.existingCountryName ?? "origin country"} for ${row.displayArtist}.`,
        ),
      );
    }

    emitMockMusicBrainzOriginProgress(
      mockOriginProgress(
        "completed",
        preview.totalAlbumArtists,
        fetchedCount,
        fetchedCount,
        fetchedCount,
        storedCount,
        skippedCount,
        unresolvedCount,
        0,
        null,
        `Import completed: ${storedCount} succeeded, ${unresolvedCount} unresolved, 0 failed, ${skippedCount} skipped.`,
      ),
    );

    return {
      run: {
        ...mockMusicBrainzOriginRun,
        id: mockMusicBrainzOriginRun.id + 1,
        eligibleCount: fetchedCount,
        fetchedCount,
        skippedCount,
        unresolvedCount,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      },
      totalAlbumArtists: preview.totalAlbumArtists,
      eligibleCount: fetchedCount,
      fetchedCount,
      storedCount,
      skippedCount,
      unresolvedCount,
      failedCount: 0,
      cancelled: false,
      rows: preview.rows,
    } satisfies MusicBrainzOriginCountryImportSummary;
  }

  return invoke<MusicBrainzOriginCountryImportSummary>(
    "import_musicbrainz_origin_countries",
    {
      request,
    },
  );
}

export async function cancelMusicBrainzOriginCountryImport() {
  if (!isTauriRuntime()) {
    return;
  }

  await invoke<void>("cancel_musicbrainz_origin_country_import");
}

function mockArtistInfoPreview(
  request: MusicBrainzArtistInfoImportRequest = {},
): MusicBrainzArtistInfoPreview {
  const selectedKeys = new Set(
    (request.artistKeys ?? []).map(normalizeArtistKey).filter(Boolean),
  );
  const rows = mockMusicBrainzArtistInfoPreviewRows
    .filter(
      (row) => selectedKeys.size === 0 || selectedKeys.has(row.localArtistKey),
    )
    .slice(0, request.limit ?? undefined)
    .map((row) => {
      if (request.refetch && row.status === "alreadyImported") {
        return { ...row, status: "eligible" };
      }
      return row;
    });
  return {
    totalAlbumArtists: mockMusicBrainzArtistInfoStatus.totalAlbumArtists,
    eligibleCount: rows.filter((row) => row.status === "eligible").length,
    alreadyImportedCount: rows.filter((row) => row.status === "alreadyImported")
      .length,
    skippedCount: rows.filter((row) => row.status === "skipped").length,
    unresolvedCount: rows.filter((row) => row.status === "unresolved").length,
    estimatedSeconds:
      rows.filter((row) => row.status === "eligible").length * 2,
    rows,
  };
}

export async function getMusicBrainzArtistInfoStatus() {
  if (!isTauriRuntime()) {
    return mockMusicBrainzArtistInfoStatus;
  }

  return invoke<MusicBrainzArtistInfoStatus>(
    "get_musicbrainz_artist_info_status",
  );
}

export async function previewMusicBrainzArtistInfoImport(
  request: MusicBrainzArtistInfoImportRequest = {},
) {
  if (!isTauriRuntime()) {
    return mockArtistInfoPreview(request);
  }

  return invoke<MusicBrainzArtistInfoPreview>(
    "preview_musicbrainz_artist_info_import",
    {
      request,
    },
  );
}

export async function importMusicBrainzArtistInfos(
  request: MusicBrainzArtistInfoImportRequest = {},
) {
  if (!isTauriRuntime()) {
    const preview = mockArtistInfoPreview(request);
    const eligibleRows = preview.rows.filter(
      (row) => row.status === "eligible",
    );
    const fetchedCount = eligibleRows.length;
    const skippedCount = Math.max(0, preview.rows.length - eligibleRows.length);
    let storedCount = 0;
    let unresolvedCount = 0;
    emitMockMusicBrainzArtistInfoProgress(
      mockArtistInfoProgress(
        "running",
        preview.totalAlbumArtists,
        fetchedCount,
        0,
        0,
        0,
        skippedCount,
        0,
        0,
        null,
        `Ready to fetch ${fetchedCount} eligible artists; ${skippedCount} skipped by preview rules.`,
      ),
    );

    for (const [index, row] of eligibleRows.entries()) {
      emitMockMusicBrainzArtistInfoProgress(
        mockArtistInfoProgress(
          "fetching",
          preview.totalAlbumArtists,
          fetchedCount,
          index,
          index,
          storedCount,
          skippedCount,
          unresolvedCount,
          0,
          row,
          `Fetching artist info for ${row.displayArtist} from MusicBrainz.`,
        ),
      );
      await new Promise((resolve) => window.setTimeout(resolve, 180));
      const isUnresolved =
        row.displayArtist === "Austin Wintory" && request.refetch;
      if (isUnresolved) {
        unresolvedCount += 1;
      } else {
        storedCount += 1;
      }
      emitMockMusicBrainzArtistInfoProgress(
        mockArtistInfoProgress(
          isUnresolved ? "unresolved" : "stored",
          preview.totalAlbumArtists,
          fetchedCount,
          index + 1,
          index + 1,
          storedCount,
          skippedCount,
          unresolvedCount,
          0,
          row,
          isUnresolved
            ? `${row.displayArtist} did not return type, gender, or life-span data; saved as unresolved.`
            : `Stored artist info for ${row.displayArtist}.`,
        ),
      );
    }

    emitMockMusicBrainzArtistInfoProgress(
      mockArtistInfoProgress(
        "completed",
        preview.totalAlbumArtists,
        fetchedCount,
        fetchedCount,
        fetchedCount,
        storedCount,
        skippedCount,
        unresolvedCount,
        0,
        null,
        `Import completed: ${storedCount} succeeded, ${unresolvedCount} unresolved, 0 failed, ${skippedCount} skipped.`,
      ),
    );

    return {
      run: {
        ...mockMusicBrainzArtistInfoRun,
        id: mockMusicBrainzArtistInfoRun.id + 1,
        eligibleCount: fetchedCount,
        fetchedCount,
        skippedCount,
        unresolvedCount,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      },
      totalAlbumArtists: preview.totalAlbumArtists,
      eligibleCount: fetchedCount,
      fetchedCount,
      storedCount,
      skippedCount,
      unresolvedCount,
      failedCount: 0,
      cancelled: false,
      rows: preview.rows,
    } satisfies MusicBrainzArtistInfoImportSummary;
  }

  return invoke<MusicBrainzArtistInfoImportSummary>(
    "import_musicbrainz_artist_infos",
    {
      request,
    },
  );
}

export async function cancelMusicBrainzArtistInfoImport() {
  if (!isTauriRuntime()) {
    return;
  }

  await invoke<void>("cancel_musicbrainz_artist_info_import");
}

export async function getMusicBrainzArtistDiscography(
  artistKey: string,
  artistName: string,
) {
  if (!isTauriRuntime()) {
    const normalizedKey = normalizeArtistKey(artistKey || artistName);
    const mockDiscography = mockMusicBrainzDiscographies[normalizedKey];
    if (mockDiscography) {
      return mockDiscography;
    }
    return {
      artistKey: normalizedKey,
      artistName: artistName || artistKey || "Unknown Artist",
      state: "notFound",
      message: "No MusicBrainz artist match was found in the preview cache.",
      cachePath: mockSettings.musicBrainzCachePath,
      resolvedPath: `Preview runtime / ${mockSettings.musicBrainzCachePath}`,
      musicbrainzMbid: null,
      matchedCacheName: null,
      matchMethod: "none",
      artistLinkState: "none",
      artistLinkIgnored: false,
      suspectMapping: false,
      cachedNameCount: 0,
      totalReleaseGroupCount: 0,
      pureAlbumCount: 0,
      ownedCount: 0,
      missingCount: 0,
      excludedCount: 0,
      localAlbumCount: 0,
      completion: null,
      releaseGroupSource: "cache",
      releaseGroupUpdatedAt: null,
      releases: [],
      candidates: [],
    } satisfies MusicBrainzArtistDiscographyResponse;
  }

  return invoke<MusicBrainzArtistDiscographyResponse>(
    "get_musicbrainz_artist_discography",
    {
      request: { artistKey, artistName },
    },
  );
}

export async function refreshMusicBrainzArtistInfo(input: {
  artistKey: string;
  artistName: string;
  musicbrainzMbid: string | null;
}) {
  if (!isTauriRuntime()) {
    const normalizedKey = normalizeArtistKey(
      input.artistKey || input.artistName,
    );
    const mockDiscography = mockMusicBrainzDiscographies[normalizedKey];
    const fetchedAt = new Date().toISOString();
    if (
      mockDiscography &&
      !mockDiscography.releases.some(
        (row) => row.releaseMbid === "preview-sandbox",
      )
    ) {
      mockDiscography.releases.push({
        releaseMbid: "preview-sandbox",
        title: "Sandbox",
        year: 2026,
        trackCount: null,
        status: "missing",
        localAlbumId: null,
        localAlbumTitle: null,
        localYear: null,
        matchMethod: "none",
        confidence: 0,
        decision: null,
      });
      mockDiscography.releaseGroupSource = "refreshed";
      mockDiscography.releaseGroupUpdatedAt = fetchedAt;
      recomputeMockMusicBrainzDiscographyCounts(mockDiscography);
    }
    const currentOrigin = mockOriginForArtist(
      input.artistName || input.artistKey,
    );
    const origin = applyMockArtistOriginCountry(
      input.artistKey,
      input.artistName,
      input.musicbrainzMbid ?? mockDiscography?.musicbrainzMbid ?? null,
      currentOrigin.originCountryCode ?? "US",
      currentOrigin.originCountryName ?? "United States",
      currentOrigin.originCountryReviewState ?? "imported",
    );
    return {
      artistKey: normalizedKey,
      artistName: input.artistName || input.artistKey || "Unknown Artist",
      musicbrainzMbid:
        input.musicbrainzMbid ??
        mockDiscography?.musicbrainzMbid ??
        "preview-mbid",
      fetchedCount: mockDiscography?.releases.length ?? 0,
      storedCount: mockDiscography?.releases.length ?? 0,
      fetchedAt,
      origin,
    } satisfies MusicBrainzArtistRefreshResult;
  }

  return invoke<MusicBrainzArtistRefreshResult>(
    "refresh_musicbrainz_artist_releases",
    {
      request: input,
    },
  );
}

export async function setMusicBrainzArtistOriginCountry(input: {
  artistKey: string;
  artistName: string;
  musicbrainzMbid?: string | null;
  countryCode: string;
  countryName?: string | null;
}) {
  if (!isTauriRuntime()) {
    const countryCode = input.countryCode.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(countryCode)) {
      throw new Error("Origin Country must be a two-letter country code.");
    }
    const countryName =
      input.countryName?.trim() || mockCountryNameFromCode(countryCode);
    return applyMockArtistOriginCountry(
      input.artistKey,
      input.artistName,
      input.musicbrainzMbid,
      countryCode,
      countryName,
      "manual",
    );
  }

  return invoke<MusicBrainzArtistOriginCountryUpdate>(
    "set_musicbrainz_artist_origin_country",
    {
      request: input,
    },
  );
}

export async function setMusicBrainzArtistLink(input: {
  artistKey: string;
  artistName: string;
  action: "verify" | "ignore" | "unlink" | "set";
  musicbrainzMbid?: string | null;
  canonicalName?: string | null;
}) {
  if (!isTauriRuntime()) {
    const normalizedKey = normalizeArtistKey(
      input.artistKey || input.artistName,
    );
    const mockDiscography = mockMusicBrainzDiscographies[normalizedKey];
    if (!mockDiscography) {
      return;
    }

    if (input.action === "unlink") {
      mockDiscography.artistLinkState = "unverified";
      mockDiscography.artistLinkIgnored = false;
      mockDiscography.matchMethod = mockDiscography.musicbrainzMbid
        ? "exact-name"
        : "none";
      mockDiscography.state = mockDiscography.musicbrainzMbid
        ? "available"
        : "notFound";
      recomputeMockMusicBrainzDiscographyCounts(mockDiscography);
      return;
    }

    const nextMbid =
      input.musicbrainzMbid?.trim() || mockDiscography.musicbrainzMbid;
    const nextName =
      input.canonicalName?.trim() ||
      mockDiscography.matchedCacheName ||
      input.artistName;

    if (input.action === "ignore") {
      mockDiscography.musicbrainzMbid = nextMbid;
      mockDiscography.matchedCacheName = nextName;
      mockDiscography.matchMethod = "ignored";
      mockDiscography.artistLinkState = "ignored";
      mockDiscography.artistLinkIgnored = true;
      mockDiscography.state = "ignored";
      mockDiscography.message = "MusicBrainz is ignored for this local artist.";
      mockDiscography.releases = [];
      mockDiscography.candidates = [];
      recomputeMockMusicBrainzDiscographyCounts(mockDiscography);
      mockDiscography.message = "MusicBrainz is ignored for this local artist.";
      return;
    }

    mockDiscography.musicbrainzMbid = nextMbid;
    mockDiscography.matchedCacheName = nextName;
    mockDiscography.matchMethod =
      input.action === "set" ? "manual-mbid" : "verified-link";
    mockDiscography.artistLinkState = "verified";
    mockDiscography.artistLinkIgnored = false;
    mockDiscography.state = "available";
    mockDiscography.candidates = [];
    recomputeMockMusicBrainzDiscographyCounts(mockDiscography);
    return;
  }

  return invoke<void>("set_musicbrainz_artist_link", {
    request: input,
  });
}

export async function setMusicBrainzReleaseDecision(input: {
  artistKey: string;
  artistName: string;
  musicbrainzMbid: string | null;
  releaseMbid: string;
  decision: "not-in-scope" | "ignored" | "clear" | "include";
  localAlbumId?: string | null;
}) {
  if (!isTauriRuntime()) {
    const normalizedKey = normalizeArtistKey(
      input.artistKey || input.artistName,
    );
    const mockDiscography = mockMusicBrainzDiscographies[normalizedKey];
    if (!mockDiscography) {
      return;
    }

    const nextDecision =
      input.decision === "clear" || input.decision === "include"
        ? null
        : input.decision;
    mockDiscography.releases = mockDiscography.releases.map((row) =>
      row.releaseMbid === input.releaseMbid
        ? applyMockMusicBrainzReleaseDecision(row, nextDecision)
        : row,
    );
    recomputeMockMusicBrainzDiscographyCounts(mockDiscography);
    return;
  }

  return invoke<void>("set_musicbrainz_release_decision", {
    request: input,
  });
}

export async function syncMusicBrainzOverlay(
  options: { recordNoop?: boolean } = {},
) {
  if (!isTauriRuntime()) {
    const result = createMockMusicBrainzOverlaySyncResult();
    if (options.recordNoop !== false || result.changedCount > 0) {
      setMockMusicBrainzOverlaySyncLog(
        [result, ...mockMusicBrainzOverlaySyncLog].slice(0, 12),
      );
    }
    return result;
  }

  return invoke<MusicBrainzOverlaySyncResult>("sync_musicbrainz_overlay", {
    recordNoop: options.recordNoop ?? true,
  });
}

export async function listMusicBrainzOverlaySyncLog(limit = 12) {
  if (!isTauriRuntime()) {
    return mockMusicBrainzOverlaySyncLog.slice(
      0,
      limit,
    ) satisfies MusicBrainzOverlaySyncLogEntry[];
  }

  return invoke<MusicBrainzOverlaySyncLogEntry[]>(
    "list_musicbrainz_overlay_sync_log",
    { limit },
  );
}

function createMockMusicBrainzOverlaySyncResult(): MusicBrainzOverlaySyncLogEntry {
  const syncedAt = new Date().toISOString();
  return {
    id: Date.now(),
    syncPath: mockSettings.musicBrainzOverlaySyncPath,
    syncedAt,
    importedCount: 0,
    exportedCount: 0,
    changedCount: 0,
    summary: "No MusicBrainz overlay changes.",
    artistLinksImported: 0,
    artistLinksExported: 0,
    artistUnlinksImported: 0,
    artistUnlinksExported: 0,
    releaseDecisionsImported: 0,
    releaseDecisionsExported: 0,
    releaseDecisionClearsImported: 0,
    releaseDecisionClearsExported: 0,
    releaseStatusesImported: 0,
    releaseStatusesExported: 0,
    releaseGroupsImported: 0,
    releaseGroupsExported: 0,
  };
}

function applyMockMusicBrainzReleaseDecision(
  row: MusicBrainzArtistReleaseRow,
  decision: "not-in-scope" | "ignored" | null,
): MusicBrainzArtistReleaseRow {
  if (decision) {
    return {
      ...row,
      status: "excluded",
      localAlbumId: null,
      localAlbumTitle: null,
      localYear: null,
      matchMethod: decision,
      confidence: 0,
      decision,
    };
  }

  const owned = Boolean(row.localAlbumTitle);
  return {
    ...row,
    status: owned ? "owned" : "missing",
    matchMethod: owned ? row.matchMethod || "normalized-title" : "none",
    confidence: owned ? row.confidence || 0.92 : 0,
    decision: null,
  };
}

function recomputeMockMusicBrainzDiscographyCounts(
  response: MusicBrainzArtistDiscographyResponse,
) {
  response.ownedCount = response.releases.filter(
    (row) => row.status === "owned",
  ).length;
  response.missingCount = response.releases.filter(
    (row) => row.status === "missing",
  ).length;
  response.excludedCount = response.releases.filter(
    (row) => row.status === "excluded",
  ).length;
  response.pureAlbumCount = response.ownedCount + response.missingCount;
  response.completion =
    response.pureAlbumCount > 0
      ? response.ownedCount / response.pureAlbumCount
      : null;
  response.message = `Matched ${response.pureAlbumCount} scoped MusicBrainz albums against ${response.localAlbumCount} local albums; ${response.excludedCount} excluded by release decisions.`;
}

export async function saveSettings(settings: AppSettings) {
  if (!isTauriRuntime()) {
    setMockSettings({
      ...normalizeSettings(settings),
      updatedAt: new Date().toISOString(),
    });
    cacheSettings(mockSettings);
    return mockSettings;
  }

  const saved = await invoke<AppSettings>("save_settings", { settings });
  cacheSettings(saved);
  return saved;
}

export async function importMusicBeeTsv(sourcePath: string) {
  if (!isTauriRuntime()) {
    throw new Error(
      "Start import from the Tauri desktop app to access local files and SQLite.",
    );
  }

  return invoke<ImportSummary>("import_musicbee_tsv", { sourcePath });
}

export async function importAlbumCovers(request: CoverImportRequest) {
  if (!isTauriRuntime()) {
    throw new Error(
      "Start cover import from the Tauri desktop app to access local files and SQLite.",
    );
  }

  return invoke<CoverImportSummary>("import_album_covers", { request });
}

export async function importBillboardCharts(sourcePath: string) {
  if (!isTauriRuntime()) {
    const matchedAlbums = mockRows.filter(
      (row) => row.trackId === null && row.billboardRank != null,
    ).length;
    return {
      sourcePath,
      filesScanned: 70,
      chartEntries: 12000,
      matchedAlbums,
      durationMs: 0,
    } satisfies BillboardImportSummary;
  }

  return invoke<BillboardImportSummary>("import_billboard_charts", {
    sourcePath,
  });
}

export async function importBillboardSingles(sourcePath: string) {
  if (!isTauriRuntime()) {
    const matchedTracks = mockRows.filter(
      (row) => row.trackId !== null && row.billboardSingleRank != null,
    ).length;
    return {
      sourcePath,
      filesScanned: 135,
      chartEntries: 18000,
      matchedTracks,
      durationMs: 0,
    } satisfies BillboardSinglesImportSummary;
  }

  return invoke<BillboardSinglesImportSummary>("import_billboard_singles", {
    sourcePath,
  });
}

export async function getAlbumCoverDataUrl(albumId: string) {
  if (!isTauriRuntime()) {
    return null;
  }

  if (coverDataUrlCache.has(albumId)) {
    return coverDataUrlCache.get(albumId) ?? null;
  }

  const request = invoke<string | null>("get_album_cover_data_url", {
    albumId,
  }).catch(() => null);
  coverDataUrlCache.set(albumId, request);
  const dataUrl = await request;
  coverDataUrlCache.set(albumId, dataUrl);
  return dataUrl;
}

export function clearCoverImageCache() {
  coverDataUrlCache.clear();
}

export async function searchLibrary(request: BrowseRequest) {
  if (!isTauriRuntime()) {
    const isTracks = request.view === "tracks";
    const albumIds = new Set(request.filters.albumIds);
    const artistKeys = new Set(request.filters.artistKeys);
    const genreKeys = new Set(expandGenreFilterKeys(request.filters.genres));
    const excludedGenreKeys = new Set(
      expandGenreFilterKeys(request.filters.excludedGenres),
    );
    const originCountryCodes = new Set(
      (request.filters.originCountryCodes ?? []).map((code) =>
        code.trim().toUpperCase(),
      ),
    );
    const excludedOriginCountryCodes = new Set(
      (request.filters.excludedOriginCountryCodes ?? []).map((code) =>
        code.trim().toUpperCase(),
      ),
    );
    const ratedTracksMin = request.filters.ratedTracksMin;
    const ratedTracksMax = request.filters.ratedTracksMax;
    const yearFrom = request.filters.yearFrom;
    const yearTo = request.filters.yearTo;
    const releaseYearFrom = request.filters.releaseYearFrom;
    const releaseYearTo = request.filters.releaseYearTo;
    const totalMinutesMin = request.filters.totalMinutesMin;
    const totalMinutesMax = request.filters.totalMinutesMax;
    const trackCountMin = request.filters.trackCountMin;
    const trackCountMax = request.filters.trackCountMax;
    const albumRatingMin = request.filters.albumRatingMin;
    const albumRatingMax = request.filters.albumRatingMax;
    const trackRatingMin = request.filters.trackRatingMin;
    const trackRatingMax = request.filters.trackRatingMax;
    const billboardRankMin = request.filters.billboardRankMin;
    const billboardRankMax = request.filters.billboardRankMax;
    const billboardSingleRankMin = request.filters.billboardSingleRankMin;
    const billboardSingleRankMax = request.filters.billboardSingleRankMax;
    const lovedTracksMin = request.filters.lovedTracksMin;
    const lovedTracksMax = request.filters.lovedTracksMax;
    const ratingCompletenessMin = normalizePercentFilter(
      request.filters.ratingCompletenessMin,
    );
    const ratingCompletenessMax = normalizePercentFilter(
      request.filters.ratingCompletenessMax,
    );
    const rows = mockRows.filter((row) => {
      const matchesView = isTracks
        ? row.trackId !== null
        : row.trackId === null;
      const artistKey = normalizeArtistKey(row.albumArtistDisplay);
      const genreKey = normalizeGenreKey(row.canonicalGenre);
      const ratedTracks = row.ratedTracks ?? 0;
      const ratingCompleteness = row.ratingCompleteness ?? 0;
      const artistInfo = mockArtistInfoForArtist(row.albumArtistDisplay);
      const lovedTracks = isTracks
        ? row.love === "L"
          ? 1
          : 0
        : (row.lovedTracks ?? 0);
      return (
        matchesView &&
        (albumIds.size === 0 || albumIds.has(row.albumId)) &&
        (artistKeys.size === 0 || artistKeys.has(artistKey)) &&
        (genreKeys.size === 0 || genreKeys.has(genreKey)) &&
        !excludedGenreKeys.has(genreKey) &&
        (originCountryCodes.size === 0 ||
          originCountryCodes.has(
            (row.originCountryCode ?? "").trim().toUpperCase(),
          )) &&
        !excludedOriginCountryCodes.has(
          (row.originCountryCode ?? "").trim().toUpperCase(),
        ) &&
        (!request.filters.missingOriginCountry || !row.originCountryCode) &&
        matchesArtistInfoFilters(artistInfo, request.filters) &&
        matchesNumberRange(row.year, yearFrom, yearTo) &&
        matchesNumberRange(row.releaseYear, releaseYearFrom, releaseYearTo) &&
        matchesMinuteRange(
          isTracks ? row.trackSeconds : row.totalSeconds,
          totalMinutesMin,
          totalMinutesMax,
        ) &&
        matchesNumberRange(row.totalTracks, trackCountMin, trackCountMax) &&
        matchesNumberRange(ratedTracks, ratedTracksMin, ratedTracksMax) &&
        matchesNumberRange(
          row.effectiveAlbumRating,
          albumRatingMin,
          albumRatingMax,
        ) &&
        matchesTrackRatingRange(
          row,
          isTracks,
          trackRatingMin,
          trackRatingMax,
        ) &&
        matchesNumberRange(
          row.billboardRank,
          billboardRankMin,
          billboardRankMax,
        ) &&
        (!isTracks ||
          matchesNumberRange(
            row.billboardSingleRank,
            billboardSingleRankMin,
            billboardSingleRankMax,
          )) &&
        (lovedTracksMin == null || lovedTracks >= lovedTracksMin) &&
        (lovedTracksMax == null || lovedTracks <= lovedTracksMax) &&
        (ratingCompletenessMin == null ||
          ratingCompleteness >= ratingCompletenessMin) &&
        (ratingCompletenessMax == null ||
          ratingCompleteness <= ratingCompletenessMax) &&
        (!request.filters.notFullyRated || ratingCompleteness < 1) &&
        matchesMissingFields(row, isTracks, request.filters.missingFields)
      );
    });
    const sorted = [...rows];
    if (request.sort.field === "random") {
      for (let index = sorted.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [sorted[index], sorted[swapIndex]] = [sorted[swapIndex], sorted[index]];
      }
    } else {
      sorted.sort((left, right) =>
        compareBrowseRows(left, right, request.sort.field),
      );
      if (request.sort.direction === "desc") {
        sorted.reverse();
      }
    }
    return {
      view: request.view,
      rows: sorted.slice(request.offset, request.offset + request.limit),
      total: sorted.length,
      limit: request.limit,
      offset: request.offset,
    } satisfies BrowseResponse;
  }

  return invoke<BrowseResponse>("search_library", { request });
}

export async function listArtists(request: ArtistListRequest) {
  if (!isTauriRuntime()) {
    const searchText = request.searchText.trim().toLowerCase();
    const filtered = mockArtists.filter((artist) =>
      artist.name.toLowerCase().includes(searchText),
    );
    const sorted = [...filtered].sort((left, right) =>
      compareArtists(left, right, request.sort.field),
    );
    if (request.sort.direction === "desc") {
      sorted.reverse();
    }
    return {
      rows: sorted.slice(request.offset, request.offset + request.limit),
      total: sorted.length,
      limit: request.limit,
      offset: request.offset,
    } satisfies ArtistListResponse;
  }

  return invoke<ArtistListResponse>("list_artists", { request });
}

export async function listGenres(request: GenreListRequest) {
  if (!isTauriRuntime()) {
    const searchText = request.searchText.trim().toLowerCase();
    const filtered = mockGenres.filter((genre) =>
      genre.name.toLowerCase().includes(searchText),
    );
    const sorted = [...filtered].sort((left, right) =>
      compareGenres(left, right, request.sort.field),
    );
    if (request.sort.direction === "desc") {
      sorted.reverse();
    }
    return {
      rows: sorted.slice(request.offset, request.offset + request.limit),
      total: sorted.length,
      limit: request.limit,
      offset: request.offset,
    } satisfies GenreListResponse;
  }

  return invoke<GenreListResponse>("list_genres", { request });
}

export async function listGenreSuggestions() {
  if (!isTauriRuntime()) {
    return mockGenres.map((genre) => genre.name);
  }

  return invoke<string[]>("list_genre_suggestions");
}

export async function listMusicTools() {
  if (!isTauriRuntime()) {
    return mockMusicTools;
  }

  return invoke<MusicToolSummary[]>("list_music_tools");
}

export async function listMusicToolIssues(request: MusicToolIssueRequest) {
  if (!isTauriRuntime()) {
    const searchText = request.searchText.trim().toLowerCase();
    const tool =
      mockMusicTools.find((item) => item.id === request.toolId) ??
      mockMusicTools[0];
    const filtered = mockMusicToolIssues.filter((issue) => {
      if (issue.toolId !== tool.id) {
        return false;
      }
      if (!searchText) {
        return true;
      }
      return [
        issue.album,
        issue.albumArtistDisplay,
        issue.title,
        issue.canonicalGenre,
        issue.detail,
        issue.value,
        issue.filename,
        issue.filePath,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(searchText);
    });
    const sorted = [...filtered].sort((left, right) =>
      compareMusicToolIssues(left, right, request.sort.field),
    );
    if (request.sort.direction === "desc") {
      sorted.reverse();
    }
    return {
      tool,
      rows: sorted.slice(request.offset, request.offset + request.limit),
      total: sorted.length,
      limit: request.limit,
      offset: request.offset,
    } satisfies MusicToolIssueResponse;
  }

  return invoke<MusicToolIssueResponse>("list_music_tool_issues", { request });
}

export async function fixMusicToolIssues(input: MusicToolFixRequest) {
  if (!isTauriRuntime()) {
    const requestedIds = new Set(input.issueIds);
    const fixableRows = mockMusicToolIssues.filter(
      (issue) =>
        issue.toolId === "whitespace-anomalies" &&
        issue.toolId === input.toolId &&
        requestedIds.has(issue.id),
    );
    if (input.toolId !== "whitespace-anomalies") {
      throw new Error(
        `No fix action is available for this music tool yet: ${input.toolId}`,
      );
    }

    if (input.apply) {
      setMockMusicToolIssues(
        mockMusicToolIssues.filter(
          (issue) =>
            !(issue.toolId === input.toolId && requestedIds.has(issue.id)),
        ),
      );
      setMockMusicTools(
        mockMusicTools.map((tool) =>
          tool.id === input.toolId
            ? {
                ...tool,
                issueCount: Math.max(0, tool.issueCount - fixableRows.length),
                albumCount: fixableRows.length > 0 ? 0 : tool.albumCount,
                trackCount: Math.max(0, tool.trackCount - fixableRows.length),
              }
            : tool,
        ),
      );
    }

    return {
      toolId: input.toolId,
      action: "compact-whitespace",
      applied: input.apply,
      requestedCount: requestedIds.size,
      fixableCount: fixableRows.length,
      affectedAlbumCount: new Set(fixableRows.map((issue) => issue.albumId))
        .size,
      affectedTrackCount: new Set(
        fixableRows
          .map((issue) => issue.trackId)
          .filter((trackId) => trackId != null),
      ).size,
      changedAlbumCount: input.apply && fixableRows.length > 0 ? 1 : 0,
      changedTrackCount: input.apply ? fixableRows.length : 0,
      skippedCount: Math.max(0, requestedIds.size - fixableRows.length),
      backupPath: null,
      message: input.apply
        ? `Compacted whitespace for ${fixableRows.length} tracks and ${fixableRows.length > 0 ? 1 : 0} albums.`
        : `Preview found ${fixableRows.length} visible whitespace issue rows that can be compacted.`,
    } satisfies MusicToolFixSummary;
  }

  return invoke<MusicToolFixSummary>("fix_music_tool_issues", { input });
}

export async function listSavedSearches() {
  if (!isTauriRuntime()) {
    return normalizeSavedSearchesForClient(mockSavedSearches);
  }

  return normalizeSavedSearchesForClient(
    await invoke<SavedSearch[]>("list_saved_searches"),
  );
}

export async function saveSearch(name: string, request: BrowseRequest) {
  if (!isTauriRuntime()) {
    const now = new Date().toISOString();
    const saved = {
      id: Date.now(),
      name,
      view: request.view,
      request,
      createdAt: now,
      updatedAt: now,
    } satisfies SavedSearch;
    setMockSavedSearches([saved, ...mockSavedSearches]);
    return normalizeSavedSearchForClient(saved);
  }

  return normalizeSavedSearchForClient(
    await invoke<SavedSearch>("save_search", { input: { name, request } }),
  );
}

export async function deleteSavedSearch(id: number) {
  if (!isTauriRuntime()) {
    setMockSavedSearches(
      mockSavedSearches.filter((search) => search.id !== id),
    );
    return;
  }

  return invoke<void>("delete_saved_search", { id });
}

export async function listSavedCharts() {
  if (!isTauriRuntime()) {
    return normalizeSavedChartsForClient(mockSavedCharts);
  }

  return normalizeSavedChartsForClient(
    await invoke<SavedChart[]>("list_saved_charts"),
  );
}

export async function saveChart(name: string, config: ChartConfig) {
  if (!isTauriRuntime()) {
    const now = new Date().toISOString();
    const saved = {
      id: Date.now(),
      name,
      config,
      createdAt: now,
      updatedAt: now,
    } satisfies SavedChart;
    setMockSavedCharts([saved, ...mockSavedCharts]);
    return normalizeSavedChartForClient(saved);
  }

  return normalizeSavedChartForClient(
    await invoke<SavedChart>("save_chart", { input: { name, config } }),
  );
}

export async function deleteSavedChart(id: number) {
  if (!isTauriRuntime()) {
    setMockSavedCharts(mockSavedCharts.filter((chart) => chart.id !== id));
    return;
  }

  return invoke<void>("delete_saved_chart", { id });
}

export async function exportSearch(
  request: BrowseRequest,
  format: string,
  includeCalculated: boolean,
  exportColumns: string[] = [],
) {
  if (!isTauriRuntime()) {
    return finalizeExport({
      path: `Preview runtime export.${format}`,
      format,
      rowCount: mockRows.filter((row) =>
        request.view === "tracks" ? row.trackId !== null : row.trackId === null,
      ).length,
    } satisfies RawExportResult);
  }

  return finalizeExport(
    await invoke<RawExportResult>("export_search", {
      input: { request, format, includeCalculated, exportColumns },
    }),
  );
}

export async function exportMusicToolIssues(
  request: MusicToolIssueRequest,
  format: string,
) {
  if (!isTauriRuntime()) {
    const normalizedSearch = request.searchText.trim().toLowerCase();
    const rowCount = mockMusicToolIssues.filter((issue) => {
      if (issue.toolId !== request.toolId) {
        return false;
      }
      if (!normalizedSearch) {
        return true;
      }
      return [
        issue.album,
        issue.albumArtistDisplay,
        issue.title,
        issue.canonicalGenre,
        issue.detail,
        issue.value,
        issue.filename,
        issue.filePath,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);
    }).length;
    return finalizeExport({
      path: `Preview runtime tools export.${format}`,
      format,
      rowCount,
    } satisfies RawExportResult);
  }

  return finalizeExport(
    await invoke<RawExportResult>("export_music_tool_issues", {
      input: { request, format },
    }),
  );
}

export async function exportMusicBrainzArtistReleases(
  request: Omit<MusicBrainzArtistExportRequest, "format">,
  format: string,
) {
  const visibleRows = request.rows.filter((row) => row.status !== "excluded");

  if (!isTauriRuntime()) {
    return finalizeExport({
      path: `Preview runtime MusicBrainz artist export.${format}`,
      format,
      rowCount: visibleRows.length,
    } satisfies RawExportResult);
  }

  return finalizeExport(
    await invoke<RawExportResult>("export_musicbrainz_artist_releases", {
      input: { ...request, rows: visibleRows, format },
    }),
  );
}

export async function listenToImportProgress(
  handler: (progress: ImportProgress) => void,
) {
  if (!isTauriRuntime()) {
    return (() => undefined) satisfies UnlistenFn;
  }

  return listen<ImportProgress>("import-progress", (event) => {
    handler(event.payload);
  });
}

export async function listenToCoverImportProgress(
  handler: (progress: CoverImportProgress) => void,
) {
  if (!isTauriRuntime()) {
    return (() => undefined) satisfies UnlistenFn;
  }

  return listen<CoverImportProgress>("cover-import-progress", (event) => {
    handler(event.payload);
  });
}

export async function listenToMusicBrainzOriginCountryImportProgress(
  handler: (progress: MusicBrainzOriginCountryImportProgress) => void,
) {
  if (!isTauriRuntime()) {
    mockOriginProgressHandlers.add(handler);
    return (() => {
      mockOriginProgressHandlers.delete(handler);
    }) satisfies UnlistenFn;
  }

  return listen<MusicBrainzOriginCountryImportProgress>(
    "musicbrainz-origin-country-import-progress",
    (event) => {
      handler(event.payload);
    },
  );
}

export async function listenToMusicBrainzArtistInfoImportProgress(
  handler: (progress: MusicBrainzArtistInfoImportProgress) => void,
) {
  if (!isTauriRuntime()) {
    mockArtistInfoProgressHandlers.add(handler);
    return (() => {
      mockArtistInfoProgressHandlers.delete(handler);
    }) satisfies UnlistenFn;
  }

  return listen<MusicBrainzArtistInfoImportProgress>(
    "musicbrainz-artist-info-import-progress",
    (event) => {
      handler(event.payload);
    },
  );
}

export async function listenToMusicToolProgress(
  handler: (progress: MusicToolProgress) => void,
) {
  if (!isTauriRuntime()) {
    return (() => undefined) satisfies UnlistenFn;
  }

  return listen<MusicToolProgress>("music-tool-progress", (event) => {
    handler(event.payload);
  });
}

function normalizeGenreKey(value: string | null) {
  const normalized = (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return normalized || "unknown";
}

function expandGenreFilterKeys(values: string[]) {
  const keys: string[] = [];
  values.forEach((value) => {
    const key = normalizeGenreKey(value);
    if (key === "unknown") {
      return;
    }
    if (isScoreGenreGroupAlias(key)) {
      scoreGenreGroup.forEach((genre) => addUnique(keys, genre));
    } else {
      addUnique(keys, key);
    }
  });
  return keys;
}

function isScoreGenreGroupAlias(value: string) {
  return value === "score" || value === "scores";
}

function addUnique(values: string[], value: string) {
  if (!values.includes(value)) {
    values.push(value);
  }
}

function isMissingText(value: string | null) {
  return (value ?? "").trim() === "";
}

function normalizePercentFilter(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }
  return value > 1
    ? Math.min(1, Math.max(0, value / 100))
    : Math.min(1, Math.max(0, value));
}

function matchesNumberRange(
  value: number | null | undefined,
  minimum: number | null | undefined,
  maximum: number | null | undefined,
) {
  if (minimum == null && maximum == null) {
    return true;
  }
  if (value == null || !Number.isFinite(value)) {
    return false;
  }
  return (
    (minimum == null || value >= minimum) &&
    (maximum == null || value <= maximum)
  );
}

function normalizedArtistInfoValue(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function hasYearRange(
  minimum: number | null | undefined,
  maximum: number | null | undefined,
) {
  return minimum != null || maximum != null;
}

function artistInfoEnded(info: MusicBrainzArtistInfoFields) {
  return (
    Boolean(info.musicBrainzEnded) ||
    info.musicBrainzEndYear != null ||
    Boolean(info.musicBrainzEndDate?.trim())
  );
}

function matchesArtistInfoFilters(
  info: MusicBrainzArtistInfoFields,
  filters: BrowseFilters,
) {
  const artistType = normalizedArtistInfoValue(info.musicBrainzArtistType);
  const artistGender = normalizedArtistInfoValue(info.musicBrainzGender);
  const typeFilter = normalizedArtistInfoValue(filters.artistType);
  const genderFilter = normalizedArtistInfoValue(filters.artistGender);
  const bornRange = hasYearRange(
    filters.artistBornYearFrom,
    filters.artistBornYearTo,
  );
  const diedRange = hasYearRange(
    filters.artistDiedYearFrom,
    filters.artistDiedYearTo,
  );
  const foundedRange = hasYearRange(
    filters.artistFoundedYearFrom,
    filters.artistFoundedYearTo,
  );
  const dissolvedRange = hasYearRange(
    filters.artistDissolvedYearFrom,
    filters.artistDissolvedYearTo,
  );

  return (
    (!typeFilter || artistType === typeFilter) &&
    (!genderFilter || artistGender === genderFilter) &&
    (!bornRange ||
      (artistType === "person" &&
        matchesNumberRange(
          info.musicBrainzBeginYear,
          filters.artistBornYearFrom,
          filters.artistBornYearTo,
        ))) &&
    (!filters.artistDied ||
      (artistType === "person" && artistInfoEnded(info))) &&
    (!diedRange ||
      (artistType === "person" &&
        matchesNumberRange(
          info.musicBrainzEndYear,
          filters.artistDiedYearFrom,
          filters.artistDiedYearTo,
        ))) &&
    (!foundedRange ||
      (artistType === "group" &&
        matchesNumberRange(
          info.musicBrainzBeginYear,
          filters.artistFoundedYearFrom,
          filters.artistFoundedYearTo,
        ))) &&
    (!filters.artistDissolved ||
      (artistType === "group" && artistInfoEnded(info))) &&
    (!dissolvedRange ||
      (artistType === "group" &&
        matchesNumberRange(
          info.musicBrainzEndYear,
          filters.artistDissolvedYearFrom,
          filters.artistDissolvedYearTo,
        )))
  );
}

function matchesMinuteRange(
  seconds: number | null | undefined,
  minimumMinutes: number | null | undefined,
  maximumMinutes: number | null | undefined,
) {
  return matchesNumberRange(
    seconds,
    minimumMinutes == null ? null : Math.round(minimumMinutes * 60),
    maximumMinutes == null ? null : Math.round(maximumMinutes * 60),
  );
}

function matchesTrackRatingRange(
  row: BrowseRow,
  isTracks: boolean,
  minimum: number | null | undefined,
  maximum: number | null | undefined,
) {
  if (minimum == null && maximum == null) {
    return true;
  }

  const minimumPoints = minimum == null ? null : minimum * 20;
  const maximumPoints = maximum == null ? null : maximum * 20;
  if (isTracks) {
    return matchesNumberRange(
      row.normalizedRating,
      minimumPoints,
      maximumPoints,
    );
  }

  const albumTracks = mockRows.filter(
    (track) => track.trackId != null && track.albumId === row.albumId,
  );
  if (albumTracks.length === 0) {
    return true;
  }
  return albumTracks.some((track) =>
    matchesNumberRange(track.normalizedRating, minimumPoints, maximumPoints),
  );
}

function matchesMissingFields(
  row: BrowseRow,
  isTracks: boolean,
  fields: string[],
) {
  return fields.every((field) => {
    switch (field) {
      case "album":
        return isMissingText(row.album);
      case "albumArtist":
        return isMissingText(row.albumArtistDisplay);
      case "genre":
        return isMissingText(row.canonicalGenre);
      case "year":
        return row.year == null;
      case "billboard":
        return row.billboardRank == null;
      case "billboardSingle":
        return isTracks ? row.billboardSingleRank == null : true;
      case "rating":
        return isTracks
          ? row.normalizedRating == null
          : row.effectiveAlbumRating == null;
      case "time":
        return isTracks
          ? row.trackSeconds == null
          : (row.totalSeconds ?? 0) <= 0;
      default:
        return true;
    }
  });
}

function compareBrowseRows(left: BrowseRow, right: BrowseRow, field: string) {
  const leftValue = browseSortValue(left, field);
  const rightValue = browseSortValue(right, field);
  if (typeof leftValue === "string" || typeof rightValue === "string") {
    return String(leftValue).localeCompare(String(rightValue));
  }
  return (leftValue ?? 0) - (rightValue ?? 0);
}

function browseSortValue(row: BrowseRow, field: string) {
  switch (field) {
    case "title":
      return row.title?.toLowerCase() ?? "";
    case "displayArtist":
      return row.displayArtist?.toLowerCase() ?? "";
    case "artist":
      return row.albumArtistDisplay?.toLowerCase() ?? "";
    case "year":
      return row.year;
    case "genre":
      return row.canonicalGenre?.toLowerCase() ?? "";
    case "originCountry":
      return (
        row.originCountryName ||
        row.originCountryCode ||
        ""
      ).toLowerCase();
    case "billboardRank":
      return row.billboardRank;
    case "billboardSingleRank":
      return row.billboardSingleRank;
    case "trackRating":
      return row.normalizedRating;
    case "time":
      return row.trackSeconds;
    case "trackNumber":
      return (row.discNumber ?? 0) * 10000 + (row.trackNumber ?? 0);
    case "totalMinutes":
      return row.totalSeconds;
    case "trackCount":
      return row.totalTracks;
    case "albumRating":
      return row.effectiveAlbumRating;
    case "ratingCompleteness":
      return row.ratingCompleteness;
    case "lovedTracks":
      return row.lovedTracks;
    case "ae":
      return row.aeRatio;
    case "tmoe":
      return row.tmoeSeconds;
    case "albumScore":
      return row.albumScore;
    default:
      return row.album?.toLowerCase() ?? "";
  }
}

function compareArtists(
  left: ArtistSummary,
  right: ArtistSummary,
  field: string,
) {
  const leftValue = artistSortValue(left, field);
  const rightValue = artistSortValue(right, field);
  if (typeof leftValue === "string" || typeof rightValue === "string") {
    return String(leftValue).localeCompare(String(rightValue));
  }
  return (leftValue ?? 0) - (rightValue ?? 0);
}

function artistSortValue(artist: ArtistSummary, field: string) {
  switch (field) {
    case "albumCount":
      return artist.albumCount;
    case "trackCount":
      return artist.trackCount;
    case "lovedTracks":
      return artist.lovedTracks;
    case "totalMinutes":
      return artist.totalSeconds;
    case "averageCompleteness":
      return artist.averageRatingCompleteness;
    case "averageRating":
      return artist.averageAlbumRating;
    case "averageScore":
      return artist.averageAlbumScore;
    case "firstYear":
      return artist.firstYear;
    case "lastYear":
      return artist.lastYear;
    case "topGenre":
      return artist.topGenre ?? "";
    case "originCountry":
      return (
        artist.originCountryName ||
        artist.originCountryCode ||
        ""
      ).toLowerCase();
    default:
      return artist.name.toLowerCase();
  }
}

function compareGenres(left: GenreSummary, right: GenreSummary, field: string) {
  const leftValue = genreSortValue(left, field);
  const rightValue = genreSortValue(right, field);
  if (typeof leftValue === "string" || typeof rightValue === "string") {
    return String(leftValue).localeCompare(String(rightValue));
  }
  return (leftValue ?? 0) - (rightValue ?? 0);
}

function genreSortValue(genre: GenreSummary, field: string) {
  switch (field) {
    case "albumCount":
      return genre.albumCount;
    case "trackCount":
      return genre.trackCount;
    case "lovedTracks":
      return genre.lovedTracks;
    case "totalMinutes":
      return genre.totalSeconds;
    case "averageCompleteness":
      return genre.averageRatingCompleteness;
    case "averageRating":
      return genre.averageAlbumRating;
    case "averageScore":
      return genre.averageAlbumScore;
    case "firstYear":
      return genre.firstYear;
    case "lastYear":
      return genre.lastYear;
    case "topArtist":
      return genre.topArtist ?? "";
    default:
      return genre.name.toLowerCase();
  }
}

function compareMusicToolIssues(
  left: MusicToolIssueRow,
  right: MusicToolIssueRow,
  field: string,
) {
  const leftValue = musicToolIssueSortValue(left, field);
  const rightValue = musicToolIssueSortValue(right, field);
  if (typeof leftValue === "string" || typeof rightValue === "string") {
    return String(leftValue).localeCompare(String(rightValue));
  }
  return (leftValue ?? 0) - (rightValue ?? 0);
}

function musicToolIssueSortValue(issue: MusicToolIssueRow, field: string) {
  switch (field) {
    case "artist":
      return issue.albumArtistDisplay?.toLowerCase() ?? "";
    case "year":
      return issue.year;
    case "title":
      return issue.title?.toLowerCase() ?? "";
    case "severity":
      return issue.severity;
    case "value":
      return issue.value?.toLowerCase() ?? "";
    case "filename":
      return issue.filename?.toLowerCase() ?? "";
    case "detail":
      return issue.detail.toLowerCase();
    default:
      return issue.album?.toLowerCase() ?? "";
  }
}
