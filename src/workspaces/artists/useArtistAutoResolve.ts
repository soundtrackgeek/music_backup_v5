import { useEffect, useRef, useState } from "react";
import { autoResolveArtist, listArtists } from "../../backend";
import type { ArtistAutoResolveResult } from "../../bindings";
import type { ArtistListRequest, ArtistSummary } from "../../types";

export function useArtistAutoResolve(request: ArtistListRequest, onUpdated: (id: string) => void) {
  const [count, setCount] = useState("10");
  const [running, setRunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [current, setCurrent] = useState("");
  const [total, setTotal] = useState(0);
  const [results, setResults] = useState<ArtistAutoResolveResult[]>([]);
  const [message, setMessage] = useState("");
  const active = useRef(false);
  const cancelled = useRef(false);
  const onUpdatedRef = useRef(onUpdated);
  useEffect(() => { onUpdatedRef.current = onUpdated; }, [onUpdated]);
  useEffect(() => () => { cancelled.current = true; }, []);
  const amount = Number(count);
  const validCount = Number.isInteger(amount) && amount >= 1 && amount <= 1000;
  const validYears = request.yearFrom == null || request.yearTo == null || request.yearFrom <= request.yearTo;

  function stop() {
    cancelled.current = true;
    setStopping(true);
  }

  async function start() {
    if (active.current || !validCount || !validYears) return;
    active.current = true;
    cancelled.current = false;
    setRunning(true);
    setStopping(false);
    setResults([]);
    setTotal(0);
    setCurrent("");
    setMessage("Finding artists without an MBID…");
    let completed = 0;
    try {
      // Freeze the whole ordered queue before saving anything: resolving artists
      // can shrink the filtered list and must not cause paged targets to be skipped.
      const targets: ArtistSummary[] = [];
      const seen = new Set<string>();
      let offset = 0;
      while (targets.length < amount && !cancelled.current) {
        const page = await listArtists({ ...request, missingMbidOnly: true, offset, limit: Math.min(500, amount - targets.length) });
        for (const artist of page.rows) {
          if (!seen.has(artist.id) && !artist.musicBrainzMbid?.trim()) {
            seen.add(artist.id);
            targets.push(artist);
          }
        }
        offset += page.rows.length;
        if (!page.rows.length || offset >= page.total) break;
      }
      setTotal(targets.length);
      setMessage(targets.length ? "" : "No artists without an MBID match the current filters.");
      for (const artist of targets) {
        if (cancelled.current) break;
        setCurrent(artist.name);
        let result: ArtistAutoResolveResult;
        try {
          result = await autoResolveArtist(artist.id);
          result = { ...result, artistName: result.artistName || artist.name };
        } catch (error) {
          result = { artistId: artist.id, artistName: artist.name, status: "failed", candidates: [],
            message: error instanceof Error ? error.message : String(error) };
        }
        completed++;
        setResults((previous) => [...previous, result]);
        if (result.status === "updated") onUpdatedRef.current(artist.id);
      }
      if (cancelled.current) setMessage(`Stopped after ${completed} of ${targets.length} artists. Completed updates are saved.`);
      else if (targets.length) setMessage(`Finished checking ${completed} ${completed === 1 ? "artist" : "artists"}.`);
    } catch (error) {
      setMessage(`Could not prepare the batch: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      active.current = false;
      setRunning(false);
      setStopping(false);
      setCurrent("");
    }
  }

  return { count, setCount, running, stopping, current, total, results, message, validCount, validYears, start, stop };
}
