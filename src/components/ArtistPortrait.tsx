import { useEffect, useState } from "react";

import { getArtistImageUrl } from "../backend";
import { getArtistPortraitCredit } from "../backend/artistArtwork";
import type { ArtworkCredit } from "../bindings";
import { useArtworkRevision } from "../backend/artwork";
import { AlbumCover } from "./AlbumCover";

type ArtistPortraitProps = {
  artistId: string;
  artistName: string;
  portraitAvailable?: boolean;
  representativeAlbumId?: string | null;
  representativeAlbum?: string | null;
  representativeCoverPath?: string | null;
  className?: string;
  decorative?: boolean;
};

export function ArtistPortrait({
  artistId,
  artistName,
  portraitAvailable = false,
  representativeAlbumId = null,
  representativeAlbum = null,
  representativeCoverPath = null,
  className = "",
  decorative = true,
}: ArtistPortraitProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [credit, setCredit] = useState<ArtworkCredit | null>(null);
  const revision = useArtworkRevision();

  useEffect(() => {
    setImageUrl(null);
    setImageFailed(false);
    setCredit(null);
    if (!portraitAvailable && revision === 0) return;
    let cancelled = false;
    void getArtistImageUrl(artistId)
      .then((nextUrl) => {
        if (!cancelled) setImageUrl(nextUrl);
      })
      .catch(() => {
        if (!cancelled) setImageFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [artistId, portraitAvailable, revision]);

  useEffect(() => {
    if (!imageUrl || imageFailed) return;
    let cancelled = false;
    void getArtistPortraitCredit(artistId, revision).then(value => { if (!cancelled) setCredit(value); });
    return () => { cancelled = true; };
  }, [artistId, imageUrl, imageFailed, revision]);

  const classes = ["artist-portrait", className].filter(Boolean).join(" ");
  const label = `${artistName} portrait`;
  if (imageUrl && !imageFailed) {
    return (
      <span className={`${classes} has-image`} aria-hidden={decorative || undefined} title={credit ? [label, credit.author, credit.license, credit.provider, credit.sourceUrl].filter(Boolean).join(" · ") : label}>
        <img
          src={imageUrl}
          alt={decorative ? "" : label}
          loading="lazy"
          decoding="async"
          onError={() => setImageFailed(true)}
        />
      </span>
    );
  }

  if (representativeAlbumId && representativeCoverPath) {
    return (
      <AlbumCover
        row={{
          albumId: representativeAlbumId,
          album: representativeAlbum,
          coverPath: representativeCoverPath,
        }}
        className={`${classes} artist-portrait-cover`}
        decorative={decorative}
      />
    );
  }

  return (
    <span className={`${classes} artist-portrait-fallback`} aria-hidden={decorative || undefined}>
      <span>{artistName.trim().slice(0, 1).toLocaleUpperCase() || "A"}</span>
    </span>
  );
}
