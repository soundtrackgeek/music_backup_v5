import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import {
  ChevronDown,
  ExternalLink,
  GitBranch,
  List,
  Network,
  Orbit,
  RotateCcw,
} from "lucide-react";

import type { LastFmArtistSimilarity, LastFmSimilarArtist } from "../types";
import { ArtistPortrait } from "./ArtistPortrait";

function matchLabel(score: number) {
  return `${Math.round(Math.max(0, Math.min(score, 1)) * 100)}% match`;
}

const CONSTELLATION_FIRST_HOP_LIMIT = 8;
const CONSTELLATION_SECOND_HOP_LIMIT = 6;
const CONSTELLATION_EXPANSION_LIMIT = 3;

const FIRST_HOP_POSITIONS = [
  { x: 50, y: 13 },
  { x: 75, y: 22 },
  { x: 87, y: 49 },
  { x: 75, y: 77 },
  { x: 50, y: 87 },
  { x: 25, y: 77 },
  { x: 13, y: 49 },
  { x: 25, y: 22 },
] as const;

type ConstellationNode = {
  key: string;
  parentKey: string | null;
  hop: 1 | 2;
  artist: LastFmSimilarArtist;
  x: number;
  y: number;
};

function artistIdentityKey(artist: LastFmSimilarArtist) {
  return (
    artist.musicbrainzMbid?.toLocaleLowerCase() ??
    normalizedArtistNameKey(artist.name)
  );
}

function normalizedArtistNameKey(name: string) {
  return name.normalize("NFKC").trim().toLocaleLowerCase();
}

function secondHopPositions(parent: ConstellationNode) {
  const offsets = [12, 27, 42, 58, 73, 88];
  const dx = parent.x - 50;
  const dy = parent.y - 50;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return offsets.map((y) => ({ x: dx >= 0 ? 94 : 6, y }));
  }
  return offsets.map((x) => ({ x, y: dy >= 0 ? 93 : 7 }));
}

function navigationLabel(artist: LastFmSimilarArtist) {
  const displayName = artist.localArtistName ?? artist.name;
  return artist.localArtistId
    ? `Open ${displayName} in Artists`
    : `Explore ${displayName} on Last.fm`;
}

function ArtistConstellation({
  similarity,
  onExpandArtist,
  onOpenArtist,
  onOpenSource,
}: {
  similarity: LastFmArtistSimilarity;
  onExpandArtist: (
    artist: LastFmSimilarArtist,
  ) => Promise<LastFmArtistSimilarity>;
  onOpenArtist: (artistId: string, artistName: string) => void;
  onOpenSource: (url: string) => void;
}) {
  const regionId = useId();
  const graphRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<"constellation" | "list">("constellation");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [activeBranchKey, setActiveBranchKey] = useState<string | null>(null);
  const [branches, setBranches] = useState(
    () => new Map<string, LastFmArtistSimilarity>(),
  );
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const firstHop = useMemo<ConstellationNode[]>(
    () =>
      similarity.artists
        .slice(0, CONSTELLATION_FIRST_HOP_LIMIT)
        .map((artist, index) => ({
          key: `first:${artistIdentityKey(artist)}`,
          parentKey: null,
          hop: 1,
          artist,
          ...FIRST_HOP_POSITIONS[index],
        })),
    [similarity.artists],
  );
  const firstHopIdentityKeys = useMemo(
    () => new Set(firstHop.map((node) => artistIdentityKey(node.artist))),
    [firstHop],
  );
  const rootNameKey = normalizedArtistNameKey(similarity.artistName);
  const secondHop = useMemo<ConstellationNode[]>(() => {
    if (!activeBranchKey) return [];
    const parent = firstHop.find((node) => node.key === activeBranchKey);
    const branch = branches.get(activeBranchKey);
    if (!parent || !branch) return [];
    const positions = secondHopPositions(parent);
    return branch.artists
      .filter(
        (artist) =>
          artistIdentityKey(artist) !== artistIdentityKey(parent.artist) &&
          normalizedArtistNameKey(artist.name) !== rootNameKey &&
          !firstHopIdentityKeys.has(artistIdentityKey(artist)),
      )
      .slice(0, CONSTELLATION_SECOND_HOP_LIMIT)
      .map((artist, index) => ({
        key: `second:${activeBranchKey}:${artistIdentityKey(artist)}`,
        parentKey: activeBranchKey,
        hop: 2,
        artist,
        ...positions[index],
      }));
  }, [activeBranchKey, branches, firstHop, firstHopIdentityKeys, rootNameKey]);
  const nodes = useMemo(() => [...firstHop, ...secondHop], [firstHop, secondHop]);
  const selected = nodes.find((node) => node.key === selectedKey) ?? firstHop[0];
  const selectedBranch = selected?.hop === 1 ? branches.get(selected.key) : null;
  const expandedCount = branches.size;

  useEffect(() => {
    setIsOpen(false);
    setSelectedKey(null);
    setActiveBranchKey(null);
    setBranches(new Map());
    setLoadingKey(null);
    setError(null);
  }, [similarity.artistId, similarity.fetchedAt]);

  function selectNode(node: ConstellationNode) {
    setSelectedKey(node.key);
    setError(null);
    if (node.hop === 1) setActiveBranchKey(node.key);
  }

  function openArtist(artist: LastFmSimilarArtist) {
    const displayName = artist.localArtistName ?? artist.name;
    if (artist.localArtistId) {
      onOpenArtist(artist.localArtistId, displayName);
    } else if (artist.sourceUrl) {
      onOpenSource(artist.sourceUrl);
    }
  }

  async function expand(node: ConstellationNode) {
    if (node.hop !== 1 || branches.has(node.key) || loadingKey) return;
    if (branches.size >= CONSTELLATION_EXPANSION_LIMIT) {
      setError(
        `This constellation is limited to ${CONSTELLATION_EXPANSION_LIMIT} expanded artists.`,
      );
      return;
    }
    setLoadingKey(node.key);
    setError(null);
    setActiveBranchKey(node.key);
    setSelectedKey(node.key);
    try {
      const branch = await onExpandArtist(node.artist);
      setBranches((current) => {
        const next = new Map(current);
        next.set(node.key, branch);
        return next;
      });
    } catch (expandError) {
      setError(
        expandError instanceof Error ? expandError.message : String(expandError),
      );
    } finally {
      setLoadingKey(null);
    }
  }

  function moveNodeFocus(current: HTMLButtonElement, direction: number) {
    const buttons = Array.from(
      graphRef.current?.querySelectorAll<HTMLButtonElement>(
        "button[data-constellation-node]",
      ) ?? [],
    );
    const index = buttons.indexOf(current);
    if (index < 0 || buttons.length === 0) return;
    buttons[(index + direction + buttons.length) % buttons.length]?.focus();
  }

  function handleNodeKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (["ArrowRight", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      moveNodeFocus(event.currentTarget, 1);
    } else if (["ArrowLeft", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      moveNodeFocus(event.currentTarget, -1);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const buttons = graphRef.current?.querySelectorAll<HTMLButtonElement>(
        "button[data-constellation-node]",
      );
      buttons?.[event.key === "Home" ? 0 : buttons.length - 1]?.focus();
    }
  }

  if (firstHop.length === 0) return null;

  return (
    <div className="artist-constellation-disclosure">
      <button
        className="artist-constellation-toggle"
        type="button"
        aria-expanded={isOpen}
        aria-controls={regionId}
        onClick={() => {
          setIsOpen((current) => !current);
          if (!selectedKey) {
            setSelectedKey(firstHop[0].key);
            setActiveBranchKey(firstHop[0].key);
          }
        }}
      >
        <Orbit size={16} aria-hidden="true" />
        <span>Explore artist constellation</span>
        <small>Up to two hops · expands only when requested</small>
        <ChevronDown
          className={isOpen ? "is-open" : undefined}
          size={16}
          aria-hidden="true"
        />
      </button>

      {isOpen ? (
        <section id={regionId} className="artist-constellation" aria-label="Artist constellation">
          <div className="artist-constellation-toolbar">
            <p>
              {firstHop.length} nearby artists · {expandedCount}/
              {CONSTELLATION_EXPANSION_LIMIT} branches expanded
            </p>
            <div className="artist-constellation-view" aria-label="Constellation view">
              <button
                type="button"
                className={view === "constellation" ? "active" : undefined}
                aria-pressed={view === "constellation"}
                onClick={() => setView("constellation")}
              >
                <GitBranch size={14} aria-hidden="true" /> Constellation
              </button>
              <button
                type="button"
                className={view === "list" ? "active" : undefined}
                aria-pressed={view === "list"}
                onClick={() => setView("list")}
              >
                <List size={14} aria-hidden="true" /> List
              </button>
            </div>
          </div>

          {view === "constellation" ? (
            <div
              ref={graphRef}
              className="artist-constellation-graph"
              role="group"
              aria-label={`Connections from ${similarity.artistName}. Use arrow keys to move between artists.`}
            >
              <svg viewBox="0 0 100 100" aria-hidden="true" preserveAspectRatio="none">
                {firstHop.map((node) => (
                  <line key={node.key} x1="50" y1="50" x2={node.x} y2={node.y} />
                ))}
                {secondHop.map((node) => {
                  const parent = firstHop.find((candidate) => candidate.key === node.parentKey);
                  return parent ? (
                    <line
                      className="second-hop"
                      key={node.key}
                      x1={parent.x}
                      y1={parent.y}
                      x2={node.x}
                      y2={node.y}
                    />
                  ) : null;
                })}
              </svg>
              <div className="artist-constellation-root">
                <strong>{similarity.artistName}</strong>
                <small>Current artist</small>
              </div>
              {nodes.map((node) => {
                const displayName = node.artist.localArtistName ?? node.artist.name;
                const isSelected = node.key === selected?.key;
                return (
                  <button
                    key={node.key}
                    type="button"
                    data-constellation-node
                    className={`artist-constellation-node hop-${node.hop}${
                      node.artist.localArtistId ? " is-owned" : " is-missing"
                    }${isSelected ? " is-selected" : ""}`}
                    style={{ left: `${node.x}%`, top: `${node.y}%` }}
                    aria-pressed={isSelected}
                    aria-label={`Select ${displayName}; ${
                      node.artist.localArtistId ? "in your library" : "not in your library"
                    }; ${matchLabel(node.artist.matchScore)}`}
                    onClick={() => selectNode(node)}
                    onKeyDown={handleNodeKeyDown}
                  >
                    <strong>{displayName}</strong>
                    <small>
                      {node.artist.localArtistId ? "In library" : "Explore"} · {matchLabel(node.artist.matchScore)}
                    </small>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="artist-constellation-lists">
              <div>
                <h4>One hop</h4>
                <ul>
                  {firstHop.map((node) => (
                    <li key={node.key}>
                      <button type="button" onClick={() => openArtist(node.artist)}>
                        <strong>{node.artist.localArtistName ?? node.artist.name}</strong>
                        <small>
                          {node.artist.localArtistId ? "In your library" : "Last.fm"} · {matchLabel(node.artist.matchScore)}
                        </small>
                      </button>
                      <button
                        type="button"
                        disabled={
                          loadingKey !== null ||
                          branches.has(node.key) ||
                          branches.size >= CONSTELLATION_EXPANSION_LIMIT
                        }
                        onClick={() => void expand(node)}
                        aria-label={`Expand ${node.artist.localArtistName ?? node.artist.name} connections`}
                      >
                        {loadingKey === node.key
                          ? "Loading"
                          : branches.has(node.key)
                            ? "Expanded"
                            : "Expand"}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              {secondHop.length ? (
                <div>
                  <h4>Two hops via {branches.get(activeBranchKey!)?.artistName}</h4>
                  <ul>
                    {secondHop.map((node) => (
                      <li key={node.key}>
                        <button type="button" onClick={() => openArtist(node.artist)}>
                          <strong>{node.artist.localArtistName ?? node.artist.name}</strong>
                          <small>
                            {node.artist.localArtistId ? "In your library" : "Last.fm"} · {matchLabel(node.artist.matchScore)}
                          </small>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}

          {selected ? (
            <div className="artist-constellation-selection" aria-live="polite">
              <div>
                <strong>{selected.artist.localArtistName ?? selected.artist.name}</strong>
                <span>
                  {selected.artist.localArtistId
                    ? `${selected.artist.localAlbumCount} ${
                        selected.artist.localAlbumCount === 1 ? "album" : "albums"
                      } in your library`
                    : "Not in your library"}
                  {` · ${matchLabel(selected.artist.matchScore)}`}
                </span>
              </div>
              <div>
                <button
                  className="secondary-button compact-button"
                  type="button"
                  disabled={!selected.artist.localArtistId && !selected.artist.sourceUrl}
                  aria-label={navigationLabel(selected.artist)}
                  onClick={() => openArtist(selected.artist)}
                >
                  {selected.artist.localArtistId ? "Open in Artists" : "Open on Last.fm"}
                  {!selected.artist.localArtistId ? (
                    <ExternalLink size={13} aria-hidden="true" />
                  ) : null}
                </button>
                {selected.hop === 1 ? (
                  <button
                    className="secondary-button compact-button"
                    type="button"
                    disabled={
                      loadingKey !== null ||
                      branches.has(selected.key) ||
                      branches.size >= CONSTELLATION_EXPANSION_LIMIT
                    }
                    onClick={() => void expand(selected)}
                  >
                    <GitBranch size={14} aria-hidden="true" />
                    {loadingKey === selected.key
                      ? "Loading connections"
                      : branches.has(selected.key)
                        ? "Connections expanded"
                        : "Expand connections"}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
          {selectedBranch?.stale ? (
            <p className="artist-constellation-offline" role="status">
              Cached connections are shown because Last.fm is unavailable.
            </p>
          ) : null}
          {error ? (
            <p className="error-message artist-constellation-error" role="alert">
              {error} The existing constellation remains available.
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function SimilarArtistCard({
  artist,
  onOpenArtist,
  onOpenSource,
}: {
  artist: LastFmSimilarArtist;
  onOpenArtist: (artistId: string, artistName: string) => void;
  onOpenSource: (url: string) => void;
}) {
  const localArtistId = artist.localArtistId;
  const displayName = artist.localArtistName ?? artist.name;
  const isOwned = localArtistId !== null;
  const description = isOwned
    ? `${artist.localAlbumCount} ${artist.localAlbumCount === 1 ? "album" : "albums"} in your library`
    : "Not in your library";

  return (
    <li>
      <button
        className={`artist-similar-card${isOwned ? " is-owned" : ""}`}
        type="button"
        onClick={() => {
          if (localArtistId) {
            onOpenArtist(localArtistId, displayName);
          } else if (artist.sourceUrl) {
            onOpenSource(artist.sourceUrl);
          }
        }}
        disabled={!localArtistId && !artist.sourceUrl}
        aria-label={
          isOwned
            ? `Open ${displayName} in Artists`
            : `Explore ${displayName} on Last.fm`
        }
      >
        {isOwned ? (
          <ArtistPortrait
            artistId={localArtistId}
            artistName={displayName}
            portraitAvailable={artist.portraitAvailable}
            representativeAlbumId={artist.representativeAlbumId}
            representativeAlbum={artist.representativeAlbum}
            representativeCoverPath={artist.representativeCoverPath}
          />
        ) : (
          <span className="artist-similar-fallback" aria-hidden="true">
            {displayName.trim().slice(0, 1).toLocaleUpperCase() || "A"}
          </span>
        )}
        <span className="artist-similar-copy">
          <strong>{displayName}</strong>
          <small>{description}</small>
        </span>
        <span className="artist-similar-match">{matchLabel(artist.matchScore)}</span>
        {!isOwned ? <ExternalLink size={14} aria-hidden="true" /> : null}
      </button>
    </li>
  );
}

export function ArtistSimilarArtistsPanel({
  similarity,
  isLoading,
  error,
  onRefresh,
  onExpandArtist,
  onOpenArtist,
  onOpenSource,
}: {
  similarity: LastFmArtistSimilarity | null;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  onExpandArtist: (
    artist: LastFmSimilarArtist,
  ) => Promise<LastFmArtistSimilarity>;
  onOpenArtist: (artistId: string, artistName: string) => void;
  onOpenSource: (url: string) => void;
}) {
  const owned =
    similarity?.artists.filter((artist) => artist.localArtistId !== null) ?? [];
  const explore =
    similarity?.artists.filter((artist) => artist.localArtistId === null) ?? [];

  return (
    <section className="artist-similar-artists" aria-label="Similar artists">
      <div className="artist-similar-heading">
        <div>
          <span className="eyebrow">Last.fm listener relationships</span>
          <h2>Similar Artists</h2>
        </div>
        <button
          className="secondary-button compact-button"
          type="button"
          disabled={isLoading}
          onClick={onRefresh}
        >
          <RotateCcw size={15} aria-hidden="true" />
          <span>{isLoading ? "Loading" : "Refresh"}</span>
        </button>
      </div>

      {error ? (
        <p className="error-message" role="alert">
          {error}
        </p>
      ) : null}
      {!similarity && isLoading ? (
        <div className="empty-state large">
          <Network size={19} />
          <span>Loading similar artists.</span>
        </div>
      ) : null}
      {owned.length ? (
        <div className="artist-similar-group">
          <h3>In your library</h3>
          <ul className="artist-similar-grid">
            {owned.map((artist) => (
              <SimilarArtistCard
                key={`${artist.rank}-${artist.name}`}
                artist={artist}
                onOpenArtist={onOpenArtist}
                onOpenSource={onOpenSource}
              />
            ))}
          </ul>
        </div>
      ) : null}
      {explore.length ? (
        <div className="artist-similar-group">
          <h3>Explore</h3>
          <ul className="artist-similar-grid">
            {explore.map((artist) => (
              <SimilarArtistCard
                key={`${artist.rank}-${artist.name}`}
                artist={artist}
                onOpenArtist={onOpenArtist}
                onOpenSource={onOpenSource}
              />
            ))}
          </ul>
        </div>
      ) : null}
      {similarity && similarity.artists.length === 0 ? (
        <div className="empty-state large">
          <Network size={19} />
          <span>{similarity.message}</span>
        </div>
      ) : null}

      {similarity?.artists.length ? (
        <ArtistConstellation
          similarity={similarity}
          onExpandArtist={onExpandArtist}
          onOpenArtist={onOpenArtist}
          onOpenSource={onOpenSource}
        />
      ) : null}

      {similarity ? (
        <footer className="artist-similar-source">
          <span>
            {similarity.stale
              ? "Cached Last.fm data (refresh failed)"
              : similarity.cached
                ? "Cached from Last.fm"
                : "From Last.fm"}
          </span>
          {similarity.sourceUrl ? (
            <button
              type="button"
              onClick={() => onOpenSource(similarity.sourceUrl!)}
            >
              View all on Last.fm <ExternalLink size={13} aria-hidden="true" />
            </button>
          ) : null}
        </footer>
      ) : null}
    </section>
  );
}
