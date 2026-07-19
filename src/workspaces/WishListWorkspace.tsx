import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Album,
  ExternalLink,
  Heart,
  RefreshCw,
  Sparkles,
  Trash2,
  UsersRound,
} from "lucide-react";

import {
  listWishList,
  openExternalUrl,
  removeWishListItem,
} from "../backend";
import type { WishListEntity, WishListItem } from "../types";

function WishListGroup({
  entity,
  items,
  onOpen,
  onRemove,
}: {
  entity: WishListEntity;
  items: WishListItem[];
  onOpen: (item: WishListItem) => void;
  onRemove: (item: WishListItem) => void;
}) {
  const isArtist = entity === "artist";
  const Icon = isArtist ? UsersRound : Album;
  const heading = isArtist ? "Artists" : "Albums";
  const emptyCopy = isArtist
    ? "Artists added from Luna discovery will appear here."
    : "Missing MusicBrainz albums and Luna discoveries will appear here.";

  return (
    <section className="wish-list-group" aria-labelledby={`wish-list-${entity}-heading`}>
      <header>
        <div>
          <span className={`wish-list-group-icon ${entity}`}>
            <Icon size={18} aria-hidden="true" />
          </span>
          <div>
            <h2 id={`wish-list-${entity}-heading`}>{heading}</h2>
            <p>{items.length} waiting</p>
          </div>
        </div>
      </header>

      {items.length === 0 ? (
        <div className="wish-list-empty">
          <Heart size={21} aria-hidden="true" />
          <strong>No {heading.toLowerCase()} on the list</strong>
          <span>{emptyCopy}</span>
        </div>
      ) : (
        <div className="wish-list-items">
          {items.map((item) => (
            <article key={item.id}>
              <span className="wish-list-item-mark">
                <Icon size={17} aria-hidden="true" />
              </span>
              <div className="wish-list-item-copy">
                <strong>{item.title}</strong>
                <span>
                  {isArtist ? "Artist" : item.artist}
                  {item.year ? ` · ${item.year}` : ""}
                </span>
                <small>Added from {item.source}</small>
              </div>
              <div className="wish-list-item-actions">
                {item.musicbrainzUrl ? (
                  <button
                    className="icon-button"
                    type="button"
                    title="Open in MusicBrainz"
                    aria-label={`Open ${item.title} in MusicBrainz`}
                    onClick={() => onOpen(item)}
                  >
                    <ExternalLink size={16} />
                  </button>
                ) : null}
                <button
                  className="icon-button"
                  type="button"
                  title="Remove from Wish List"
                  aria-label={`Remove ${item.title} from Wish List`}
                  onClick={() => onRemove(item)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function WishListWorkspace() {
  const [items, setItems] = useState<WishListItem[]>([]);
  const [autoRemovedCount, setAutoRemovedCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await listWishList();
      setItems(response.items);
      setAutoRemovedCount(response.autoRemovedCount);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(
    () => ({
      artists: items.filter((item) => item.entity === "artist"),
      albums: items.filter((item) => item.entity === "album"),
    }),
    [items],
  );

  async function removeItem(item: WishListItem) {
    setError(null);
    try {
      await removeWishListItem(item.id);
      setItems((previous) => previous.filter((entry) => entry.id !== item.id));
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : String(removeError));
    }
  }

  async function openItem(item: WishListItem) {
    if (!item.musicbrainzUrl) return;
    setError(null);
    try {
      await openExternalUrl(item.musicbrainzUrl);
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : String(openError));
    }
  }

  return (
    <section className="workspace wish-list-workspace">
      <header className="topbar">
        <div>
          <h1>Wish List</h1>
          <p>Keep track of the artists and albums you want to add to your collection.</p>
        </div>
        <div className="topbar-actions">
          <button
            className="icon-button"
            type="button"
            aria-label="Refresh Wish List"
            title="Refresh Wish List"
            disabled={isLoading}
            onClick={() => void load()}
          >
            <RefreshCw size={18} className={isLoading ? "spin" : ""} />
          </button>
        </div>
      </header>

      <section className="wish-list-summary" aria-label="Wish List summary">
        <div>
          <Heart size={19} aria-hidden="true" />
          <span>Total wishes</span>
          <strong>{items.length}</strong>
        </div>
        <div>
          <UsersRound size={19} aria-hidden="true" />
          <span>Artists</span>
          <strong>{grouped.artists.length}</strong>
        </div>
        <div>
          <Album size={19} aria-hidden="true" />
          <span>Albums</span>
          <strong>{grouped.albums.length}</strong>
        </div>
      </section>

      {autoRemovedCount > 0 ? (
        <div className="wish-list-reconciled" role="status">
          <Sparkles size={17} aria-hidden="true" />
          <span>
            Removed {autoRemovedCount} {autoRemovedCount === 1 ? "item" : "items"} now found in your library.
          </span>
        </div>
      ) : null}
      {error ? <p className="error-message">{error}</p> : null}

      <div className="wish-list-columns" aria-busy={isLoading}>
        <WishListGroup
          entity="artist"
          items={grouped.artists}
          onOpen={(item) => void openItem(item)}
          onRemove={(item) => void removeItem(item)}
        />
        <WishListGroup
          entity="album"
          items={grouped.albums}
          onOpen={(item) => void openItem(item)}
          onRemove={(item) => void removeItem(item)}
        />
      </div>
    </section>
  );
}
