import type { ReviewReport } from "../../backend/review";
import type { ReviewRange } from "./reviewPeriods";

export const reviewNotes =
  "Collection additions and new artists mean first recorded introductions, including the initial import. Album ratings given counts recorded non-empty album-rating changes; newly rated tracks counts positive completion gains on existing albums, not individual star clicks. Completion is the change in rated-track share between saved snapshots; no baseline means unavailable. New artists use current reviewed identities. Genres use current catalog labels; removed or unknown albums are grouped explicitly. Taste drift reconstructs the latest recorded 4★+ album ratings at each UTC year end, or through the selected period in its last year (up to 12 years). Discovery means the most-played library album first heard in imported history during this period. Missing imports can undercount activity and make an old album look newly discovered. Comparisons use the full preceding calendar period; the current period may still be in progress.";
const safe = (value: string) =>
  value.replace(/[\\`*_{}[\]<>#|!]/g, "\\$&").replace(/[\r\n]+/g, " ");
export function reviewMarkdown(
  report: ReviewReport,
  range: ReviewRange,
): string {
  const c = report.current,
    p = report.previous;
  const lines = [
    `# ${range.title}`,
    "",
    range.dates,
    `Compared with ${range.previousDates}.`,
    `Report through ${new Date((report.endAt - 1) * 1000).toLocaleString()}.`,
    "",
    "| Measure | Selected period | Previous period |",
    "| --- | ---: | ---: |",
    ...[
      ["Albums added", c.albumsAdded, p.albumsAdded],
      ["New artists", c.newArtists, p.newArtists],
      ["Album ratings given", c.albumRatingsGiven, p.albumRatingsGiven],
      ["Newly rated tracks", c.newlyRatedTracks, p.newlyRatedTracks],
      ["Plays", c.listening.plays, p.listening.plays],
      ["Matched plays", c.listening.matchedPlays, p.listening.matchedPlays],
      ["Tracks played", c.listening.tracks, p.listening.tracks],
      [
        "Completion change (percentage points)",
        c.completionChange == null
          ? "Unavailable"
          : (c.completionChange * 100).toFixed(1),
        p.completionChange == null
          ? "Unavailable"
          : (p.completionChange * 100).toFixed(1),
      ],
    ].map((row) => `| ${row.join(" | ")} |`),
    "",
    "## Top genres of albums added",
    "",
    ...report.topGenres.map((g) => `- ${safe(g.genre)}: ${g.albums} albums`),
    "",
    "## Biggest rating changes",
    "",
    ...report.ratingChanges.map(
      (r) =>
        `- ${safe(r.artist)} — ${safe(r.album)}: ${r.previous / 20}★ → ${r.current / 20}★`,
    ),
  ];
  for (const [label, rows] of [
    ["Most-played tracks", c.listening.topTracks],
    ["Most-played albums", c.listening.topAlbums],
    ["Most-played artists", c.listening.topArtists],
  ] as const) {
    lines.push(
      "",
      `## ${label}`,
      "",
      ...rows.map(
        (r, i) =>
          `${i + 1}. ${safe(r.title)}${label.endsWith("artists") ? "" : ` — ${safe(r.artist)}`}${r.artistDisambiguation ? ` (${safe(r.artistDisambiguation)})` : ""}: ${r.plays} plays`,
      ),
    );
  }
  const discovery = c.listening.discovery;
  lines.push(
    "",
    "## Discovery of the period",
    "",
    discovery
      ? `${safe(discovery.artist)} — ${safe(discovery.title)} (${discovery.plays} plays)`
      : "No first-heard album found.",
    "",
    "## Taste drift",
    "",
    "| Year | Genre | 4★+ albums | Share |",
    "| --- | --- | ---: | ---: |",
    ...report.tasteDrift.flatMap((y) =>
      y.total
        ? y.genres.map(
            (g) =>
              `| ${y.year} | ${safe(g.genre)} | ${g.albums} | ${((g.albums / y.total) * 100).toFixed(1)}% |`,
          )
        : [`| ${y.year} | No recorded favorites | 0 | — |`],
    ),
    "",
    "## History coverage",
    "",
    `Collection history since: ${report.activitySince == null ? "unavailable" : new Date(report.activitySince * 1000).toLocaleDateString()}.`,
    `Listening history since: ${c.listening.historySince == null ? "unavailable" : new Date(c.listening.historySince * 1000).toLocaleDateString()}.`,
    "",
    reviewNotes,
    "",
  );
  return lines.join("\n");
}

export async function reviewCard(
  report: ReviewReport,
  range: ReviewRange,
): Promise<Blob> {
  await document.fonts.ready;
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 1000;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create the review image.");
  ctx.fillStyle = "#f4f2e9";
  ctx.fillRect(0, 0, 1200, 1000);
  const text = (
    value: string,
    x: number,
    y: number,
    size: number,
    color = "#173d35",
    max = 1060,
  ) => {
    ctx.fillStyle = color;
    ctx.font = `${size >= 36 ? 600 : 400} ${size}px Manrope, sans-serif`;
    let label = value;
    while (ctx.measureText(label).width > max && label.length > 1)
      label = label.slice(0, -2) + "…";
    ctx.fillText(label, x, y);
  };
  text("MUSIC LIBRARY · YOUR LISTENING STORY", 70, 76, 20);
  text(range.title, 70, 154, 58);
  text(range.dates, 70, 201, 24);
  const c = report.current;
  [
    [c.listening.plays, "PLAYS"],
    [c.albumsAdded, "ALBUMS ADDED"],
    [c.newArtists, "NEW ARTISTS"],
    [c.albumRatingsGiven, "ALBUM RATINGS"],
  ].forEach(([value, label], i) => {
    const x = 70 + i * 280;
    text(Number(value).toLocaleString(), x, 308, 54);
    text(String(label), x, 345, 17);
  });
  text("MOST PLAYED", 70, 435, 19);
  const sections = [
    ["Artist", c.listening.topArtists[0]],
    ["Album", c.listening.topAlbums[0]],
    ["Track", c.listening.topTracks[0]],
  ] as const;
  sections.forEach(([label, row], i) => {
    text(label, 70, 490 + i * 92, 20, "#5b7168");
    text(
      row
        ? `${row.title}${row.artistDisambiguation ? ` (${row.artistDisambiguation})` : ""}${label === "Artist" ? "" : ` · ${row.artist}`}`
        : "No matched plays",
      225,
      490 + i * 92,
      28,
      "#173d35",
      900,
    );
  });
  text("DISCOVERY OF THE PERIOD", 70, 792, 19);
  const discovery = c.listening.discovery;
  text(
    discovery
      ? `${discovery.artist} · ${discovery.title}`
      : "No first-heard album in imported history",
    70,
    840,
    32,
  );
  text(
    "Based on recorded collection activity and imported listening history.",
    70,
    925,
    18,
    "#5b7168",
  );
  text(
    `Through ${new Date((report.endAt - 1) * 1000).toLocaleDateString()} · Missing history can affect discoveries and totals.`,
    70,
    956,
    16,
    "#5b7168",
  );
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("Could not encode the review image.")),
      "image/png",
    ),
  );
}
