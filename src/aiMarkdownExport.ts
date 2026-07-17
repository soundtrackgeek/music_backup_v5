import type {
  AiCompiledQuery,
  AiCurrentViewAnswer,
  AiLibraryAnalysis,
  AiMusicResearchContext,
  AiMusicResearchExchange,
  AiPlaylist,
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

export function aiMarkdownTitle(prefix: string, value: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  const title = normalized ? `${prefix} — ${normalized}` : prefix;
  return title.slice(0, 160);
}

export function compiledQueryMarkdown(
  prompt: string,
  result: AiCompiledQuery,
  snapshot?: AiSnapshot,
) {
  return finish([
    `# Luna ${result.target === "chart" ? "Chart" : "Search"}`,
    "",
    "## Request",
    "",
    quote(prompt),
    "",
    "## Luna result",
    "",
    result.summary,
    "",
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
