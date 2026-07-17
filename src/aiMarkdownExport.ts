import type {
  AiCompiledQuery,
  AiCurrentViewAnswer,
  AiLibraryAnalysis,
  AiMusicResearchContext,
  AiMusicResearchExchange,
  AiPlaylist,
  AiQueryExchange,
  AiSnapshot,
  AiUsage,
  BrowseRequest,
  ExternalDiscoveryResponse,
  SavedExternalDiscovery,
  SavedPlaylist,
} from "./types";

type LibraryState = Pick<
  AiSnapshot | SavedPlaylist | SavedExternalDiscovery,
  | "createdAt"
  | "libraryImportedAt"
  | "libraryAlbumCount"
  | "libraryTrackCount"
>;

function quote(value: string) {
  return value
    .trim()
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join("\n");
}

function tableCell(value: unknown) {
  return String(value ?? "—")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ");
}

function usageLines(usage: AiUsage) {
  return [
    `- Input tokens: ${usage.inputTokens?.toLocaleString() ?? "not reported"}`,
    `- Cached input tokens: ${usage.cachedInputTokens?.toLocaleString() ?? "not reported"}`,
    `- Output tokens: ${usage.outputTokens?.toLocaleString() ?? "not reported"}`,
  ].join("\n");
}

function libraryStateSection(state?: LibraryState) {
  if (!state) return "";
  return [
    "## Saved snapshot",
    "",
    `- Saved: ${state.createdAt}`,
    `- Source library import: ${state.libraryImportedAt ?? "not recorded"}`,
    `- Library albums: ${state.libraryAlbumCount.toLocaleString()}`,
    `- Library tracks: ${state.libraryTrackCount.toLocaleString()}`,
    "",
  ].join("\n");
}

function jsonSection(title: string, value: unknown) {
  return [
    `## ${title}`,
    "",
    "```json",
    JSON.stringify(value, null, 2),
    "```",
    "",
  ].join("\n");
}

function finish(parts: string[]) {
  return `${parts.filter(Boolean).join("\n").trim()}\n`;
}

const filterLabels: Record<string, string> = {
  albumIds: "Albums",
  artistKeys: "Artists",
  albumTitle: "Album title",
  trackTitle: "Track title",
  albumArtist: "Album artist",
  displayArtist: "Track artist",
  filePath: "File path",
  hasTrackText: "Track text",
  excludedGenres: "Excluded genres",
  missingFields: "Missing fields",
  originCountryCodes: "Artist countries",
  excludedOriginCountryCodes: "Excluded artist countries",
  missingOriginCountry: "Missing artist country",
  notFullyRated: "Not fully rated",
};

function readableIdentifier(value: string) {
  const spaced = value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\bIds\b/g, "IDs")
    .replace(/\bId\b/g, "ID");
  return `${spaced.charAt(0).toUpperCase()}${spaced.slice(1)}`;
}

function readableFilterValue(value: unknown) {
  if (value == null || value === false || value === "") return null;
  if (Array.isArray(value)) return value.length ? value.join(", ") : null;
  if (typeof value === "object") {
    const filter = value as { operator?: string; value?: string };
    if (!filter.value?.trim()) return null;
    return `${readableIdentifier(filter.operator ?? "contains").toLowerCase()} “${filter.value.trim()}”`;
  }
  return value === true ? "Yes" : String(value);
}

function readableFilterLines(request: BrowseRequest) {
  const lines = Object.entries(request.filters).flatMap(([field, value]) => {
    const readable = readableFilterValue(value);
    return readable == null
      ? []
      : [`- **${filterLabels[field] ?? readableIdentifier(field)}:** ${readable}`];
  });
  if (request.searchText.trim()) {
    lines.unshift(`- **General search:** “${request.searchText.trim()}”`);
  }
  return lines.length ? lines : ["- No additional filters"];
}

export function aiMarkdownTitle(prefix: string, value: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  const title = normalized ? `${prefix} — ${normalized}` : prefix;
  return title.slice(0, 160);
}

export function compiledQueryMarkdown(
  prompt: string,
  result: AiCompiledQuery,
  snapshot?: AiSnapshot,
  answer?: AiCurrentViewAnswer | null,
  exchanges: AiQueryExchange[] = [],
) {
  if (exchanges.length > 1) {
    return finish([
      `# Luna ${result.target === "chart" ? "Chart" : "Search"} Conversation`,
      "",
      ...exchanges.flatMap((exchange, index) => [
        `## ${index + 1}. ${index === 0 ? "Question" : "Follow-up"}`,
        "",
        quote(exchange.prompt),
        "",
        ...(exchange.answer
          ? [
              "### Answer",
              "",
              exchange.answer.answer,
              "",
              "### Local inspection",
              "",
              `- Matching rows: ${exchange.answer.matchingRows.toLocaleString()}`,
              `- Local analyses: ${exchange.answer.analysisCount.toLocaleString()}`,
              `- Named rows shared: ${exchange.answer.namedRowsShared.toLocaleString()}`,
              `- Answer model: ${exchange.answer.model}`,
              usageLines(exchange.answer.usage),
              "",
            ]
          : []),
        "### Local query scope",
        "",
        exchange.result.summary,
        "",
        `- Intent: ${exchange.result.queryIntent ?? "filter"}`,
        `- View: ${exchange.result.request.view}`,
        `- Planner model: ${exchange.result.model}`,
        usageLines(exchange.result.usage),
        "",
        jsonSection(`Turn ${index + 1} compiled local request`, exchange.result.request),
      ]),
      libraryStateSection(snapshot),
    ]);
  }
  const answerSection = answer
    ? [
        "## Answer",
        "",
        answer.answer,
        "",
        "## Local inspection",
        "",
        `- Matching rows: ${answer.matchingRows.toLocaleString()}`,
        `- Local analyses: ${answer.analysisCount.toLocaleString()}`,
        `- Named rows shared: ${answer.namedRowsShared.toLocaleString()}`,
        `- Answer model: ${answer.model}`,
        usageLines(answer.usage),
        "",
      ]
    : [];
  return finish([
    `# Luna ${result.target === "chart" ? "Chart" : "Search"}${answer ? " Answer" : ""}`,
    "",
    "## Request",
    "",
    quote(prompt),
    "",
    ...answerSection,
    `## ${answer ? "How Luna scoped the local query" : "Luna result"}`,
    "",
    result.summary,
    "",
    `- Intent: ${result.queryIntent ?? "filter"}`,
    `- Target: ${result.target}`,
    `- View: ${result.request.view}`,
    `- Model: ${result.model}`,
    usageLines(result.usage),
    "",
    jsonSection("Compiled local request", result.request),
    result.chartConfig
      ? jsonSection("Compiled chart configuration", result.chartConfig)
      : "",
    libraryStateSection(snapshot),
  ]);
}

export function compiledQueryReadableMarkdown(
  prompt: string,
  result: AiCompiledQuery,
  snapshot?: AiSnapshot,
  answer?: AiCurrentViewAnswer | null,
  restored = true,
  exchanges: AiQueryExchange[] = [],
) {
  if (exchanges.length > 1) {
    return finish([
      `# ${restored ? "Restored " : ""}Luna ${result.target === "chart" ? "Chart" : "Search"} Conversation`,
      "",
      ...exchanges.flatMap((exchange, index) => [
        `## ${index + 1}. ${index === 0 ? "Question" : "Follow-up"}`,
        "",
        quote(exchange.prompt),
        "",
        ...(exchange.answer
          ? [
              "### Answer",
              "",
              exchange.answer.answer,
              "",
              "### Local inspection",
              "",
              `- **Matching rows:** ${exchange.answer.matchingRows.toLocaleString()}`,
              `- **Local analyses:** ${exchange.answer.analysisCount.toLocaleString()}`,
              `- **Named rows shared:** ${exchange.answer.namedRowsShared.toLocaleString()}`,
              "",
            ]
          : []),
        "### Active local filters",
        "",
        ...readableFilterLines(exchange.result.request),
        "",
        `- **View:** ${readableIdentifier(exchange.result.request.view)}`,
        `- **Sort:** ${readableIdentifier(exchange.result.request.sort.field)}`,
        `- **Direction:** ${readableIdentifier(exchange.result.request.sort.direction)}`,
        `- **Row limit:** ${exchange.result.request.limit.toLocaleString()}`,
        "",
      ]),
      libraryStateSection(snapshot),
    ]);
  }
  const chartLines = result.chartConfig
    ? [
        "## Chart setup",
        "",
        `- **Ranking metric:** ${readableIdentifier(result.chartConfig.rankingMetric)}`,
        `- **Result limit:** ${result.chartConfig.resultLimit.toLocaleString()}`,
        `- **Rating completeness:** ${result.chartConfig.ratingCompletenessMin}–${result.chartConfig.ratingCompletenessMax}%`,
        `- **Layout:** ${readableIdentifier(result.chartConfig.viewMode)}`,
        "",
      ]
    : [];

  return finish([
    `# ${restored ? "Restored " : ""}Luna ${result.target === "chart" ? "Chart" : "Search"}${answer ? " Answer" : ""}`,
    "",
    "## Original request",
    "",
    quote(prompt),
    "",
    ...(answer
      ? [
          "## Answer",
          "",
          answer.answer,
          "",
          "## Local inspection",
          "",
          `- **Matching rows:** ${answer.matchingRows.toLocaleString()}`,
          `- **Local analyses:** ${answer.analysisCount.toLocaleString()}`,
          `- **Named rows shared:** ${answer.namedRowsShared.toLocaleString()}`,
          "",
        ]
      : []),
    `## ${answer ? "How Luna scoped the local query" : "Luna interpretation"}`,
    "",
    result.summary,
    "",
    "## Active local filters",
    "",
    ...readableFilterLines(result.request),
    "",
    "## Applied view",
    "",
    `- **View:** ${readableIdentifier(result.request.view)}`,
    `- **Sort:** ${readableIdentifier(result.request.sort.field)}`,
    `- **Direction:** ${readableIdentifier(result.request.sort.direction)}`,
    `- **Row limit:** ${result.request.limit.toLocaleString()}`,
    "",
    ...chartLines,
    libraryStateSection(snapshot),
  ]);
}

export function currentViewAnswerMarkdown(
  prompt: string,
  request: BrowseRequest,
  result: AiCurrentViewAnswer,
  snapshot?: AiSnapshot,
) {
  return finish([
    "# Luna Current-view Answer",
    "",
    "## Question",
    "",
    quote(prompt),
    "",
    "## Answer",
    "",
    result.answer,
    "",
    "## Inspection",
    "",
    `- View: ${result.view}`,
    `- Matching rows: ${result.matchingRows.toLocaleString()}`,
    `- Local analyses: ${result.analysisCount.toLocaleString()}`,
    `- Named rows shared: ${result.namedRowsShared.toLocaleString()}`,
    `- Model: ${result.model}`,
    usageLines(result.usage),
    "",
    jsonSection("Filtered local request", request),
    libraryStateSection(snapshot),
  ]);
}

export function libraryAnalysisMarkdown(
  prompt: string,
  result: AiLibraryAnalysis,
  snapshot?: AiSnapshot,
) {
  const findings = result.findings.flatMap((finding, index) => [
    `### ${index + 1}. ${finding.title}`,
    "",
    `**Evidence:** ${finding.evidence}`,
    "",
    finding.interpretation,
    "",
  ]);
  return finish([
    `# ${result.headline}`,
    "",
    "## Focus",
    "",
    prompt.trim() ? quote(prompt) : "> General analysis for the selected lens",
    "",
    "## Summary",
    "",
    result.summary,
    "",
    "## Findings",
    "",
    ...findings,
    "## Useful next questions",
    "",
    ...result.nextQuestions.map((question) => `- ${question}`),
    "",
    "## Analysis metadata",
    "",
    `- Lens: ${result.lens}`,
    `- Profile sections: ${result.profileSections.join(", ")}`,
    `- Aggregate points shared: ${result.aggregatePointsShared.toLocaleString()}`,
    `- Model: ${result.model}`,
    usageLines(result.usage),
    "",
    libraryStateSection(snapshot),
  ]);
}

export function musicResearchMarkdown(
  context: AiMusicResearchContext,
  exchanges: AiMusicResearchExchange[],
  snapshot?: AiSnapshot,
) {
  const contextLabel = context.selectedLabel
    ? `${context.selectedEntityType ?? "selection"}: ${context.selectedLabel}${context.selectedSubtitle ? ` · ${context.selectedSubtitle}` : ""}`
    : `${context.workspace}: General music research`;
  const conversation = exchanges.flatMap((exchange, index) => {
    const sources = exchange.result.sources.length
      ? [
          "### Sources",
          "",
          ...exchange.result.sources.map(
            (source) =>
              `- [${source.title.replace(/[\[\]]/g, "\\$&")}](<${source.url}>)`,
          ),
          "",
        ]
      : [];
    return [
      `## ${index + 1}. Question`,
      "",
      quote(exchange.question),
      "",
      "### Luna",
      "",
      exchange.result.answer,
      "",
      ...sources,
      "### Turn metadata",
      "",
      `- Web search used: ${exchange.result.usedWebSearch ? "yes" : "no"}`,
      `- Local items shared: ${exchange.result.localInspectionCount.toLocaleString()}`,
      `- Model: ${exchange.result.model}`,
      usageLines(exchange.result.usage),
      "",
    ];
  });
  return finish([
    `# Luna Music Research — ${context.selectedLabel ?? "General"}`,
    "",
    "## Context",
    "",
    `- Workspace: ${context.workspace}`,
    `- Attached context: ${contextLabel}`,
    "",
    ...conversation,
    libraryStateSection(snapshot),
  ]);
}

export function playlistMarkdown(
  name: string,
  playlist: AiPlaylist,
  saved?: SavedPlaylist,
) {
  const trackRows = playlist.tracks.map(
    (track, index) =>
      `| ${index + 1} | ${tableCell(track.title)} | ${tableCell(track.displayArtist || track.albumArtist)} | ${tableCell(track.album)} | ${tableCell(track.year)} | ${tableCell(track.rating)} | ${track.loved ? "♥" : ""} |`,
  );
  return finish([
    `# ${name}`,
    "",
    "## Playlist request",
    "",
    quote(playlist.prompt),
    "",
    "## Luna plan",
    "",
    playlist.description,
    "",
    `- Strategy: ${playlist.strategy}`,
    `- Selected tracks: ${playlist.tracks.length.toLocaleString()}`,
    `- Local matches: ${playlist.matchingTrackCount.toLocaleString()}`,
    `- Candidate tracks reviewed: ${playlist.candidateCount.toLocaleString()}`,
    `- Target minutes: ${playlist.targetMinutes || "not specified"}`,
    `- Target tracks: ${playlist.targetTrackCount || "not specified"}`,
    `- Max tracks per artist: ${playlist.maxTracksPerArtist}`,
    `- Max tracks per album: ${playlist.maxTracksPerAlbum}`,
    `- Model: ${playlist.model}`,
    usageLines(playlist.usage),
    "",
    "## Tracks",
    "",
    "| # | Track | Artist | Album | Year | Rating | Loved |",
    "|---:|---|---|---|---:|---:|:---:|",
    ...trackRows,
    "",
    jsonSection("Compiled local request", playlist.request),
    libraryStateSection(saved),
  ]);
}

export function externalDiscoveryMarkdown(
  name: string,
  response: ExternalDiscoveryResponse,
  saved?: SavedExternalDiscovery,
) {
  const results = response.items.flatMap((item, index) => [
    `### ${index + 1}. ${item.title}`,
    "",
    `- Entity: ${item.entity}`,
    `- Artist: ${item.artist || "not reported"}`,
    `- Year: ${item.year ?? "not reported"}`,
    `- Country: ${item.country ?? "not reported"}`,
    `- Evidence: ${item.evidence}`,
    `- Tags: ${item.tags.join(", ") || "none"}`,
    `- MusicBrainz: <${item.url}>`,
    "",
  ]);
  return finish([
    `# ${name}`,
    "",
    "## Discovery request",
    "",
    quote(response.prompt),
    "",
    "## Luna plan",
    "",
    response.summary,
    "",
    `- Entity: ${response.plan.entity}`,
    `- Requested count: ${response.plan.count}`,
    `- Year: ${response.plan.year || "not specified"}`,
    `- Year meaning: ${response.plan.yearMeaning}`,
    `- Genres: ${response.plan.genres.join(", ") || "none"}`,
    `- Countries: ${response.plan.countries.join(", ") || "none"}`,
    `- Catalog candidates checked: ${response.catalogCandidateCount.toLocaleString()}`,
    `- Owned candidates excluded locally: ${response.excludedOwnedCount.toLocaleString()}`,
    `- Source: ${response.source}`,
    `- Fetched: ${response.fetchedAt}`,
    `- Model: ${response.plan.model}`,
    usageLines(response.plan.usage),
    "",
    "## Verified results",
    "",
    ...results,
    response.limitations.length
      ? `## Limitations\n\n${response.limitations.map((value) => `- ${value}`).join("\n")}\n`
      : "",
    libraryStateSection(saved),
  ]);
}
