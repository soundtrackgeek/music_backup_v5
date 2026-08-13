import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowRight,
  CircleAlert,
  Layers3,
  LoaderCircle,
  Plus,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";

import type {
  DiscoveryMixerRequest,
  DiscoveryMixerResponse,
  DiscoveryMixerSeedKind,
  DiscoveryMixerSeedOption,
  DiscoveryMixerSeedSearchRequest,
} from "../types";
import { AlbumCover } from "./AlbumCover";

type DiscoveryMixerProps = {
  onSearchSeeds: (
    request: DiscoveryMixerSeedSearchRequest,
  ) => Promise<DiscoveryMixerSeedOption[]>;
  onGenerate: (request: DiscoveryMixerRequest) => Promise<DiscoveryMixerResponse>;
  onOpenAlbum: (albumId: string) => void;
};

const MAX_SEEDS = 8;

function seedKey(seed: Pick<DiscoveryMixerSeedOption, "kind" | "id">) {
  return `${seed.kind}:${seed.id}`;
}

function balanceLabel(value: number) {
  if (value < 40) return "Mostly familiar";
  if (value > 60) return "Mostly explore";
  return "Balanced";
}

export function DiscoveryMixer({
  onSearchSeeds,
  onGenerate,
  onOpenAlbum,
}: DiscoveryMixerProps) {
  const headingId = useId();
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchSequenceRef = useRef(0);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<DiscoveryMixerSeedKind | "all">("all");
  const [options, setOptions] = useState<DiscoveryMixerSeedOption[]>([]);
  const [seeds, setSeeds] = useState<DiscoveryMixerSeedOption[]>([]);
  const [explorePercent, setExplorePercent] = useState(50);
  const [response, setResponse] = useState<DiscoveryMixerResponse | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sequence = ++searchSequenceRef.current;
    setIsSearching(true);
    const timeout = window.setTimeout(() => {
      void onSearchSeeds({
        query: query.trim() || undefined,
        kind: kind === "all" ? undefined : kind,
        limit: 16,
      })
        .then((nextOptions) => {
          if (sequence === searchSequenceRef.current) {
            setOptions(nextOptions);
            setError(null);
          }
        })
        .catch((reason: unknown) => {
          if (sequence === searchSequenceRef.current) {
            setOptions([]);
            setError(
              reason instanceof Error ? reason.message : "Could not search local seeds.",
            );
          }
        })
        .finally(() => {
          if (sequence === searchSequenceRef.current) setIsSearching(false);
        });
    }, 160);
    return () => window.clearTimeout(timeout);
  }, [kind, onSearchSeeds, query]);

  function markChanged() {
    if (response) setIsDirty(true);
    setError(null);
  }

  function addSeed(option: DiscoveryMixerSeedOption) {
    if (
      seeds.length >= MAX_SEEDS ||
      seeds.some((seed) => seedKey(seed) === seedKey(option))
    ) {
      return;
    }
    setSeeds((current) => [...current, option]);
    markChanged();
    searchInputRef.current?.focus();
  }

  function removeSeed(option: DiscoveryMixerSeedOption) {
    setSeeds((current) =>
      current.filter((seed) => seedKey(seed) !== seedKey(option)),
    );
    markChanged();
  }

  async function generateMix() {
    if (seeds.length < 2 || isGenerating) return;
    setIsGenerating(true);
    setError(null);
    try {
      const nextResponse = await onGenerate({
        seeds: seeds.map(({ kind: seedKind, id }) => ({ kind: seedKind, id })),
        explorePercent,
        limit: 12,
      });
      setResponse(nextResponse);
      setIsDirty(false);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not generate this mix.",
      );
    } finally {
      setIsGenerating(false);
    }
  }

  const selectedKeys = new Set(seeds.map(seedKey));
  const currentBalanceLabel = balanceLabel(explorePercent);

  return (
    <section className="discovery-mixer" aria-labelledby={headingId}>
      <header className="discovery-mixer-heading">
        <div className="discovery-mixer-title">
          <span className="discovery-mixer-mark" aria-hidden="true">
            <Layers3 />
          </span>
          <div>
            <span className="discovery-mixer-kicker">Build your own thread</span>
            <h2 id={headingId}>Recommendation Mixer</h2>
            <p>
              Blend two to eight local artists or albums. Results use cached
              relationships and your rating history—never a new provider request.
            </p>
          </div>
        </div>
        <div className="discovery-mixer-count" aria-label={`${seeds.length} of 8 seeds selected`}>
          <strong>{seeds.length}</strong>
          <span>/ {MAX_SEEDS} seeds</span>
        </div>
      </header>

      <div className="discovery-mixer-builder">
        <div className="discovery-mixer-seed-column">
          <div className="discovery-mixer-step-heading">
            <span>01</span>
            <div>
              <h3>Choose the sources</h3>
              <p>Mix artist and album seeds freely.</p>
            </div>
          </div>

          <div className="discovery-mixer-kind-filter" aria-label="Seed type filter">
            {(["all", "artist", "album"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={kind === value}
                onClick={() => setKind(value)}
              >
                {value === "all" ? "All" : value === "artist" ? "Artists" : "Albums"}
              </button>
            ))}
          </div>

          <label className="discovery-mixer-search">
            <span className="sr-only">Search local artists and albums</span>
            <input
              ref={searchInputRef}
              type="search"
              value={query}
              placeholder="Search your library…"
              onChange={(event) => setQuery(event.target.value)}
            />
            {isSearching ? <LoaderCircle className="is-spinning" aria-label="Searching" /> : null}
          </label>

          <div className="discovery-mixer-options" aria-live="polite">
            {!isSearching && options.length === 0 ? (
              <p>No matching local artists or albums.</p>
            ) : (
              <ul aria-label="Local seed search results">
                {options.map((option) => {
                  const selected = selectedKeys.has(seedKey(option));
                  return (
                    <li key={seedKey(option)}>
                      <button
                        type="button"
                        disabled={selected || seeds.length >= MAX_SEEDS}
                        onClick={() => addSeed(option)}
                        aria-label={
                          selected
                            ? `${option.title} is already selected`
                            : `Add ${option.title} ${option.kind} as a seed`
                        }
                      >
                        {option.kind === "album" ? (
                          <AlbumCover
                            row={{
                              album: option.title,
                              albumId: option.id,
                              coverPath: option.coverPath,
                            }}
                            className="discovery-mixer-option-cover"
                          />
                        ) : (
                          <span className="discovery-mixer-artist-initial" aria-hidden="true">
                            {option.title.trim().slice(0, 1).toLocaleUpperCase() || "A"}
                          </span>
                        )}
                        <span className="discovery-mixer-option-copy">
                          <strong>{option.title}</strong>
                          <small>{option.subtitle}</small>
                        </span>
                        <span className="discovery-mixer-option-kind">{option.kind}</span>
                        <Plus aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="discovery-mixer-control-column">
          <div className="discovery-mixer-step-heading">
            <span>02</span>
            <div>
              <h3>Set the distance</h3>
              <p>Bias the ranking without changing its evidence.</p>
            </div>
          </div>

          <div className="discovery-mixer-selected">
            <h4>Selected seeds</h4>
            {seeds.length === 0 ? (
              <p>Add two or more sources from your library.</p>
            ) : (
              <ol>
                {seeds.map((seed, index) => (
                  <li key={seedKey(seed)}>
                    <span className="discovery-mixer-seed-number">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span>
                      <strong>{seed.title}</strong>
                      <small>{seed.kind}</small>
                    </span>
                    <button
                      type="button"
                      onClick={() => removeSeed(seed)}
                      aria-label={`Remove ${seed.title} seed`}
                    >
                      <X aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="discovery-mixer-balance">
            <div>
              <SlidersHorizontal aria-hidden="true" />
              <span>
                <strong>{currentBalanceLabel}</strong>
                <small>{explorePercent}% explore</small>
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={explorePercent}
              aria-label="Familiar versus explore balance"
              aria-valuetext={`${currentBalanceLabel}, ${explorePercent}% explore`}
              onChange={(event) => {
                setExplorePercent(Number(event.target.value));
                markChanged();
              }}
            />
            <div className="discovery-mixer-balance-labels" aria-hidden="true">
              <span>Familiar</span>
              <span>Explore</span>
            </div>
          </div>

          <button
            className="discovery-mixer-generate"
            type="button"
            disabled={seeds.length < 2 || isGenerating}
            onClick={() => void generateMix()}
          >
            {isGenerating ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
            {isGenerating ? "Building your mix…" : "Generate local mix"}
          </button>
          {seeds.length === 1 ? (
            <p className="discovery-mixer-hint">Add one more seed to generate.</p>
          ) : null}
          {isDirty ? (
            <p className="discovery-mixer-dirty" role="status">
              Settings changed · generate again to update these results.
            </p>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="discovery-mixer-error" role="alert">
          <CircleAlert aria-hidden="true" />
          {error}
        </p>
      ) : null}

      {response ? (
        <div className="discovery-mixer-results" aria-live="polite">
          <div className="discovery-mixer-results-heading">
            <div>
              <span className="discovery-mixer-kicker">Your local sequence</span>
              <h3>{response.recommendations.length} albums, deliberately varied</h3>
            </div>
            <p>{response.evidence}</p>
          </div>
          {response.recommendations.length === 0 ? (
            <p className="discovery-mixer-no-results">
              No cached relationship reaches another local artist yet. Refresh Similar
              Artists or Related Albums on the seed pages, then try again.
            </p>
          ) : (
            <ol>
              {response.recommendations.map((recommendation, index) => (
                <li key={recommendation.albumId}>
                  <button
                    type="button"
                    onClick={() => onOpenAlbum(recommendation.albumId)}
                    aria-label={`Open ${recommendation.album} by ${recommendation.artist} in Albums`}
                  >
                    <span className="discovery-mixer-result-index">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <AlbumCover
                      row={{
                        album: recommendation.album,
                        albumId: recommendation.albumId,
                        coverPath: recommendation.coverPath,
                      }}
                      className="discovery-mixer-result-cover"
                      previewOnHover
                      previewCaption={`${recommendation.album} · ${recommendation.artist}`}
                    />
                    <span className="discovery-mixer-result-copy">
                      <span className="discovery-mixer-result-meta">
                        {recommendation.reason} · {recommendation.genre}
                      </span>
                      <strong>{recommendation.album}</strong>
                      <small>
                        {recommendation.artist}
                        {recommendation.releaseYear == null
                          ? ""
                          : ` · ${recommendation.releaseYear}`}
                      </small>
                      <span className="discovery-mixer-seed-links">
                        Via {recommendation.seedLabels.join(" + ")}
                      </span>
                      <span
                        className="discovery-mixer-result-evidence"
                        role="list"
                        aria-label={`Why ${recommendation.album} was recommended`}
                      >
                        {recommendation.evidence.map((item) => (
                          <span role="listitem" key={item}>{item}</span>
                        ))}
                      </span>
                    </span>
                    <ArrowRight aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : null}
    </section>
  );
}
