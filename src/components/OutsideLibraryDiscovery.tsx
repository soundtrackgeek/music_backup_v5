import { useEffect, useState, type FormEvent } from "react";
import {
  Album,
  Check,
  ExternalLink,
  Globe2,
  Heart,
  History,
  Music2,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  UsersRound,
} from "lucide-react";

import {
  addWishListItem,
  deleteSavedExternalDiscovery,
  discoverOutsideLibrary,
  listWishList,
  listSavedExternalDiscoveries,
  openExternalUrl,
  saveExternalDiscovery,
} from "../backend";
import type {
  ExternalDiscoveryEntity,
  ExternalDiscoveryResponse,
  SavedExternalDiscovery,
} from "../types";
import {
  aiMarkdownTitle,
  externalDiscoveryMarkdown,
} from "../aiMarkdownExport";
import { AiMarkdownExportButton } from "./AiMarkdownExportButton";

type OutsideLibraryDiscoveryProps = {
  isAvailable: boolean;
};

const examples = [
  "Find me 5 artists with releases from 1992 that I don't have",
  "Show me 8 AOR albums from 1986 missing from my library",
  "Find 10 synthpop songs from 1984 I don't own",
];

function entityLabel(entity: ExternalDiscoveryEntity, count: number) {
  const singular = entity === "song" ? "song" : entity;
  return count === 1 ? singular : `${singular}s`;
}

function EntityIcon({ entity }: { entity: ExternalDiscoveryEntity }) {
  const Icon = entity === "artist" ? UsersRound : entity === "album" ? Album : Music2;
  return <Icon size={17} aria-hidden="true" />;
}

function interpretationLabel(response: ExternalDiscoveryResponse) {
  const { plan } = response;
  const parts = [`${plan.count} ${entityLabel(plan.entity, plan.count)}`];
  if (plan.year > 0) {
    parts.push(plan.yearMeaning === "formedYear" ? `formed in ${plan.year}` : `releases from ${plan.year}`);
  }
  if (plan.genres.length) parts.push(plan.genres.join(" + "));
  return parts.join(" · ");
}

function SavedDiscoveryHistory({
  saved,
  activeSavedId,
  error,
  onOpen,
  onDelete,
}: {
  saved: SavedExternalDiscovery[];
  activeSavedId: number | null;
  error: string | null;
  onOpen: (entry: SavedExternalDiscovery) => void;
  onDelete: (entry: SavedExternalDiscovery) => void;
}) {
  return (
    <aside className="outside-library-saved" aria-label="Saved discovery lists">
      <header>
        <div><History size={16} /><span>Local snapshots</span></div>
        <strong>{saved.length}</strong>
      </header>
      <h3>Saved discoveries</h3>
      <p>Reopen the exact verified result order without calling Luna or MusicBrainz.</p>
      <div>
        {saved.map((entry) => (
          <article key={entry.id} className={entry.id === activeSavedId ? "active" : ""}>
            <button type="button" onClick={() => onOpen(entry)}>
              <strong>{entry.name}</strong>
              <span>
                {entry.response.items.length} {entityLabel(entry.response.plan.entity, entry.response.items.length)} · {entry.libraryAlbumCount.toLocaleString()}-album snapshot
              </span>
            </button>
            <button
              type="button"
              aria-label={`Delete ${entry.name}`}
              onClick={() => onDelete(entry)}
            >
              <Trash2 size={15} />
            </button>
          </article>
        ))}
        {saved.length === 0 ? (
          <div className="outside-library-saved-empty">No saved discoveries yet.</div>
        ) : null}
      </div>
      {error ? <p className="error-message">{error}</p> : null}
    </aside>
  );
}

export function OutsideLibraryDiscovery({
  isAvailable,
}: OutsideLibraryDiscoveryProps) {
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState<ExternalDiscoveryResponse | null>(null);
  const [name, setName] = useState("");
  const [activeSavedId, setActiveSavedId] = useState<number | null>(null);
  const [saved, setSaved] = useState<SavedExternalDiscovery[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedError, setSavedError] = useState<string | null>(null);
  const [wishListError, setWishListError] = useState<string | null>(null);
  const [wishListItemIds, setWishListItemIds] = useState<Set<string>>(new Set());
  const [addingWishListItemId, setAddingWishListItemId] = useState<string | null>(null);
  const [isAddingAllToWishList, setIsAddingAllToWishList] = useState(false);

  useEffect(() => {
    let disposed = false;
    void listSavedExternalDiscoveries()
      .then((entries) => {
        if (!disposed) setSaved(entries);
      })
      .catch((loadError) => {
        if (!disposed) {
          setSavedError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      });
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    void listWishList()
      .then((wishList) => {
        if (!disposed) {
          setWishListItemIds(
            new Set(
              wishList.items.flatMap((item) =>
                item.musicbrainzId ? [`${item.entity}:${item.musicbrainzId}`] : [],
              ),
            ),
          );
        }
      })
      .catch((loadError) => {
        if (!disposed) {
          setWishListError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      });
    return () => {
      disposed = true;
    };
  }, []);

  async function runDiscovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedPrompt = prompt.trim();
    if (!isAvailable || !normalizedPrompt || isDiscovering) return;
    setIsDiscovering(true);
    setError(null);
    setSavedError(null);
    try {
      const next = await discoverOutsideLibrary({ prompt: normalizedPrompt });
      setResponse(next);
      setName(next.title);
      setActiveSavedId(null);
    } catch (discoveryError) {
      setError(
        discoveryError instanceof Error ? discoveryError.message : String(discoveryError),
      );
    } finally {
      setIsDiscovering(false);
    }
  }

  async function saveCurrent() {
    if (!response || !name.trim() || response.items.length === 0 || isSaving) return;
    setIsSaving(true);
    setSavedError(null);
    try {
      const entry = await saveExternalDiscovery({
        id: activeSavedId,
        name: name.trim(),
        response: { ...response, title: name.trim() },
      });
      setResponse(entry.response);
      setName(entry.name);
      setActiveSavedId(entry.id);
      setSaved((previous) => [
        entry,
        ...previous.filter((item) => item.id !== entry.id),
      ]);
    } catch (saveError) {
      setSavedError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  function openSaved(entry: SavedExternalDiscovery) {
    setPrompt(entry.response.prompt);
    setResponse(entry.response);
    setName(entry.name);
    setActiveSavedId(entry.id);
    setError(null);
    setSavedError(null);
  }

  async function removeSaved(entry: SavedExternalDiscovery) {
    setSavedError(null);
    try {
      await deleteSavedExternalDiscovery(entry.id);
      setSaved((previous) => previous.filter((item) => item.id !== entry.id));
      if (activeSavedId === entry.id) setActiveSavedId(null);
    } catch (deleteError) {
      setSavedError(
        deleteError instanceof Error ? deleteError.message : String(deleteError),
      );
    }
  }

  async function openResult(url: string) {
    setError(null);
    try {
      await openExternalUrl(url);
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : String(openError));
    }
  }

  async function addResultToWishList(item: ExternalDiscoveryResponse["items"][number]) {
    if (item.entity === "song") return;
    const itemKey = `${item.entity}:${item.id}`;
    if (wishListItemIds.has(itemKey) || addingWishListItemId) return;
    setAddingWishListItemId(itemKey);
    setWishListError(null);
    try {
      await addWishListItem({
        entity: item.entity,
        title: item.title,
        artist: item.entity === "artist" ? "" : item.artist,
        year: item.year,
        musicbrainzId: item.id,
        musicbrainzUrl: item.url,
        source: "MusicBrainz discovery",
      });
      setWishListItemIds((previous) => new Set(previous).add(itemKey));
    } catch (addError) {
      setWishListError(addError instanceof Error ? addError.message : String(addError));
    } finally {
      setAddingWishListItemId(null);
    }
  }

  async function addAllMissingToWishList() {
    if (!response || isAddingAllToWishList) return;
    const items = response.items.filter(
      (item) =>
        item.entity !== "song" &&
        !wishListItemIds.has(`${item.entity}:${item.id}`),
    );
    if (items.length === 0) return;
    setIsAddingAllToWishList(true);
    setWishListError(null);
    const addedKeys: string[] = [];
    try {
      for (const item of items) {
        if (item.entity === "song") continue;
        await addWishListItem({
          entity: item.entity,
          title: item.title,
          artist: item.entity === "artist" ? "" : item.artist,
          year: item.year,
          musicbrainzId: item.id,
          musicbrainzUrl: item.url,
          source: "MusicBrainz discovery",
        });
        addedKeys.push(`${item.entity}:${item.id}`);
      }
    } catch (addError) {
      setWishListError(
        addError instanceof Error ? addError.message : String(addError),
      );
    } finally {
      if (addedKeys.length > 0) {
        setWishListItemIds((previous) => {
          const next = new Set(previous);
          addedKeys.forEach((key) => next.add(key));
          return next;
        });
      }
      setIsAddingAllToWishList(false);
    }
  }

  const activeSavedDiscovery =
    saved.find((entry) => entry.id === activeSavedId) ?? undefined;

  return (
    <section className="outside-library" aria-labelledby="outside-library-heading">
      <div className="outside-library-heading">
        <div className="outside-library-mark"><Globe2 size={21} /></div>
        <div>
          <span>Luna · external discovery</span>
          <h2 id="outside-library-heading">Find what your library is missing</h2>
          <p>
            Luna interprets the request. MusicBrainz verifies candidates, then your SQLite
            library excludes artists, albums, or songs you already own.
          </p>
        </div>
        <span className="outside-library-privacy">
          <ShieldCheck size={14} /> Ownership stays local
        </span>
      </div>

      <form className="outside-library-form" onSubmit={runDiscovery}>
        <label htmlFor="outside-library-prompt">Discovery request</label>
        <div>
          <input
            id="outside-library-prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="e.g. Find 5 artists with releases from 1992 that I don't have"
            disabled={!isAvailable || isDiscovering}
          />
          <button
            className="primary-button"
            type="submit"
            disabled={!isAvailable || !prompt.trim() || isDiscovering}
          >
            {isDiscovering ? <Sparkles size={16} className="spin" /> : <Search size={16} />}
            {isDiscovering ? "Discovering" : "Discover"}
          </button>
        </div>
      </form>

      <div className="outside-library-examples" aria-label="Discovery examples">
        {examples.map((example) => (
          <button key={example} type="button" onClick={() => setPrompt(example)}>
            {example}
          </button>
        ))}
      </div>

      {!isAvailable ? (
        <p className="outside-library-note">Import a library before checking what is missing.</p>
      ) : null}
      {error ? <p className="error-message">{error}</p> : null}
      {wishListError ? <p className="error-message">{wishListError}</p> : null}

      {response ? (
        <div className="outside-library-content">
          <section className="outside-library-results" aria-label="Outside-library results">
            <header>
              <div>
                <span>Verified suggestions</span>
                <input
                  aria-label="Discovery list name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={120}
                />
                <p>{response.summary}</p>
              </div>
              <div className="outside-library-cohort-actions">
                {response.items.some((item) => item.entity !== "song") ? (
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => void addAllMissingToWishList()}
                    disabled={
                      isAddingAllToWishList ||
                      response.items
                        .filter((item) => item.entity !== "song")
                        .every((item) =>
                          wishListItemIds.has(`${item.entity}:${item.id}`),
                        )
                    }
                  >
                    {response.items
                      .filter((item) => item.entity !== "song")
                      .every((item) =>
                        wishListItemIds.has(`${item.entity}:${item.id}`),
                      ) ? (
                      <Check size={16} />
                    ) : (
                      <Heart size={16} />
                    )}
                    {isAddingAllToWishList
                      ? "Adding"
                      : response.items
                            .filter((item) => item.entity !== "song")
                            .every((item) =>
                              wishListItemIds.has(`${item.entity}:${item.id}`),
                            )
                        ? "All on Wish List"
                        : "Add missing items to Wish List"}
                  </button>
                ) : null}
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void saveCurrent()}
                  disabled={!name.trim() || response.items.length === 0 || isSaving}
                >
                  <Save size={16} />
                  {isSaving ? "Saving" : activeSavedId == null ? "Save list" : "Update saved"}
                </button>
              </div>
            </header>

            <AiMarkdownExportButton
              title={aiMarkdownTitle("Luna discovery", name)}
              markdown={externalDiscoveryMarkdown(
                name,
                response,
                activeSavedDiscovery,
              )}
            />

            <div className="outside-library-recipe">
              <span><Sparkles size={14} /> {interpretationLabel(response)}</span>
              <span><Globe2 size={14} /> {response.source}</span>
              <span>{response.catalogCandidateCount} checked</span>
              <span>{response.excludedOwnedCount} owned excluded</span>
            </div>

            <div className="outside-library-result-list">
              {response.items.map((item, index) => (
                <article key={`${item.entity}-${item.id}`}>
                  <span className="outside-library-index">{String(index + 1).padStart(2, "0")}</span>
                  <span className="outside-library-entity"><EntityIcon entity={item.entity} /></span>
                  <div>
                    <strong>{item.title}</strong>
                    <span>
                      {item.entity === "artist"
                        ? item.anchor ?? item.itemType ?? "Artist"
                        : item.artist || "Unknown artist"}
                      {item.year ? ` · ${item.year}` : ""}
                    </span>
                    <small>{item.evidence}</small>
                    {item.tags.length ? (
                      <div className="outside-library-tags">
                        {item.tags.map((tag) => <em key={tag}>{tag}</em>)}
                      </div>
                    ) : null}
                  </div>
                  <div className="outside-library-result-actions">
                    {item.entity !== "song" ? (
                      <button
                        className="outside-library-wish-button"
                        type="button"
                        aria-label={`${wishListItemIds.has(`${item.entity}:${item.id}`) ? "Added" : "Add"} ${item.title} to Wish List`}
                        title={wishListItemIds.has(`${item.entity}:${item.id}`) ? "Already on Wish List" : "Add to Wish List"}
                        disabled={
                          isAddingAllToWishList ||
                          wishListItemIds.has(`${item.entity}:${item.id}`) ||
                          addingWishListItemId === `${item.entity}:${item.id}`
                        }
                        onClick={() => void addResultToWishList(item)}
                      >
                        {wishListItemIds.has(`${item.entity}:${item.id}`) ? <Check size={15} /> : <Heart size={15} />}
                        <span>{wishListItemIds.has(`${item.entity}:${item.id}`) ? "Added" : "Wish List"}</span>
                      </button>
                    ) : null}
                    <button
                      type="button"
                      aria-label={`Open ${item.title} in MusicBrainz`}
                      title="Open in MusicBrainz"
                      onClick={() => void openResult(item.url)}
                    >
                      <ExternalLink size={16} />
                    </button>
                  </div>
                </article>
              ))}
              {response.items.length === 0 ? (
                <div className="outside-library-empty">
                  No unowned results remained in this bounded MusicBrainz search. Try a broader request.
                </div>
              ) : null}
            </div>

            {response.limitations.length ? (
              <div className="outside-library-limitations">
                {response.limitations.map((limitation) => <p key={limitation}>{limitation}</p>)}
              </div>
            ) : null}

            <footer>
              <span>No library names or rows were sent to Luna or MusicBrainz.</span>
              <span>
                {response.plan.usage.inputTokens?.toLocaleString() ?? "—"} input / {response.plan.usage.outputTokens?.toLocaleString() ?? "—"} output tokens
              </span>
            </footer>
          </section>

          <SavedDiscoveryHistory
            saved={saved}
            activeSavedId={activeSavedId}
            error={savedError}
            onOpen={openSaved}
            onDelete={(entry) => void removeSaved(entry)}
          />
        </div>
      ) : (
        <SavedDiscoveryHistory
          saved={saved}
          activeSavedId={activeSavedId}
          error={savedError}
          onOpen={openSaved}
          onDelete={(entry) => void removeSaved(entry)}
        />
      )}
    </section>
  );
}
