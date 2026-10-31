import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SonicTimelinePanel, clock, heatColumns, lanePath } from "./SonicTimelinePanel";
import { getAlbumTimelines, getTrackTimeline, type AlbumTimelines, type TimelinePoint, type TrackTimeline } from "../backend/sonic";
vi.mock("../backend/sonic", () => ({ getAlbumTimelines: vi.fn(), getTrackTimeline: vi.fn() }));
afterEach(() => vi.resetAllMocks());

const chroma = (pitch: number) => Array.from({ length: 12 }, (_, c) => (c === pitch ? 0.6 : 0.4 / 11));
const point = (start: number, over: Partial<TimelinePoint> = {}): TimelinePoint => ({ start, level: -20, brightness: 1500, width: -12, correlation: 0.8, chroma: chroma(9), ...over });
const album: AlbumTimelines = { ready: 1, tracks: [
  { trackId: 1, title: "Not yet", discNumber: 1, trackNumber: 1, seconds: 60, state: "missing" },
  { trackId: 2, title: "Main Theme", discNumber: 1, trackNumber: 2, seconds: 4, state: "ready" },
  { trackId: 3, title: "Booklet", discNumber: 1, trackNumber: 3, seconds: null, state: "notMp3" },
] };
const ready: TrackTimeline = { trackId: 2, title: "Main Theme", state: "ready", error: null, seconds: 4, bucketSeconds: 1, channels: 2, sampleRate: 44100, leftDb: -18.5, rightDb: -19, truncated: false,
  points: [point(0, { level: -30 }), point(1), point(2, { level: -6.4, brightness: 3210 }), point(3)] };
const empty = { ...ready, points: [], seconds: 0 };

it("opens the first track with a timeline and reads values at a moment", async () => {
  vi.mocked(getAlbumTimelines).mockResolvedValue(album);
  vi.mocked(getTrackTimeline).mockResolvedValue(ready);
  render(<SonicTimelinePanel albumId="a" />);
  expect(await screen.findByText("1 of 2 MP3 tracks have a timeline.")).toBeInTheDocument();
  expect(await screen.findByText(/0:04 · stereo · 44.1 kHz · left -18.5 dBFS, right -19.0 dBFS/)).toBeInTheDocument();
  expect(getTrackTimeline).toHaveBeenCalledWith(2);
  expect(screen.getByRole("button", { name: /Main Theme/ })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: /Booklet/ })).toBeDisabled();

  const lanes = screen.getByRole("group", { name: /Timeline/ });
  fireEvent.keyDown(lanes, { key: "ArrowRight" });
  fireEvent.keyDown(lanes, { key: "ArrowRight" });
  fireEvent.keyDown(lanes, { key: "ArrowRight" });
  expect(screen.getByText(/^0:02 · Level -6.4 dBFS · Brightness 3,210 Hz · Stereo width -12.0 dB · Left\/right correlation 0.80 · Strongest pitch class A$/)).toBeInTheDocument();
  fireEvent.keyDown(lanes, { key: "End" });
  expect(screen.getByText(/^0:03 · /)).toBeInTheDocument();
});

it("explains tracks without a usable timeline", async () => {
  vi.mocked(getAlbumTimelines).mockResolvedValue({ ...album, ready: 0, tracks: album.tracks.map(t => ({ ...t, state: t.state === "ready" ? "failed" : t.state })) });
  vi.mocked(getTrackTimeline)
    .mockResolvedValueOnce({ ...empty, trackId: 1, state: "missing" })
    .mockResolvedValueOnce({ ...empty, state: "failed", error: "Bad frame at 0:12" })
    .mockResolvedValueOnce({ ...empty, state: "changed" });
  render(<SonicTimelinePanel albumId="a" />);
  expect(await screen.findByText(/No track on this album has a timeline yet/)).toBeInTheDocument();
  expect(getTrackTimeline).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /Not yet/ }));
  expect(await screen.findByText(/analyzed but has no timeline yet/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Main Theme/ }));
  expect(await screen.findByText("The timeline could not be measured from this file: Bad frame at 0:12")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Main Theme/ }));
  expect(await screen.findByText(/The file changed after it was analyzed/)).toBeInTheDocument();
});

it("hides stereo lanes for mono files", async () => {
  vi.mocked(getAlbumTimelines).mockResolvedValue(album);
  vi.mocked(getTrackTimeline).mockResolvedValue({ ...ready, channels: 1, rightDb: null, points: ready.points.map(p => ({ ...p, width: null, correlation: null })) });
  render(<SonicTimelinePanel albumId="a" />);
  expect(await screen.findByText(/Mono file/)).toBeInTheDocument();
  expect(screen.queryByRole("img", { name: "Stereo width over time" })).not.toBeInTheDocument();
  expect(screen.getByRole("img", { name: "Level over time" })).toBeInTheDocument();
});

it("ignores a late timeline after another track or album is chosen", async () => {
  let finish!: (t: TrackTimeline) => void;
  vi.mocked(getAlbumTimelines).mockResolvedValue(album);
  vi.mocked(getTrackTimeline).mockReturnValueOnce(new Promise(resolve => { finish = resolve; })).mockResolvedValue({ ...empty, trackId: 1, state: "missing" });
  render(<SonicTimelinePanel albumId="a" />);
  await screen.findByText("Loading timeline…");
  fireEvent.click(screen.getByRole("button", { name: /Not yet/ }));
  expect(await screen.findByText(/analyzed but has no timeline yet/)).toBeInTheDocument();
  await act(async () => finish(ready));
  expect(screen.queryByText(/0:04 · stereo/)).not.toBeInTheDocument();
});

it("reports a failure to read the album", async () => {
  vi.mocked(getAlbumTimelines).mockRejectedValue(new Error("Timeline database busy"));
  render(<SonicTimelinePanel albumId="a" />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Timeline database busy");
});

it("formats times and builds chart data", () => {
  expect([clock(0), clock(75), clock(3725)]).toEqual(["0:00", "1:15", "1:02:05"]);
  const lane = { key: "level" as const, label: "Level", min: -60, max: 0, format: String };
  // A missing value splits the line into two runs.
  expect(lanePath([point(0, { level: 0 }), point(1, { level: null }), point(2, { level: -60 })], lane, 40)).toBe("M0.5 0.00M2.5 40.00");
  const columns = heatColumns(Array.from({ length: 300 }, (_, i) => point(i)));
  expect(columns).toHaveLength(150);
  expect(columns[0][9]).toBe(1);
  expect(columns[0][0]).toBeCloseTo(0.4 / 11 / 0.6);
});
