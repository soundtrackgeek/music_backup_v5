import { useEffect, useState } from "react";

import { getArtistImageDataUrl } from "../backend";
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

  useEffect(() => {
    setImageUrl(null);
    setImageFailed(false);
    if (!portraitAvailable) return;
    let cancelled = false;
    void getArtistImageDataUrl(artistId)
      .then((nextUrl) => {
        if (!cancelled) setImageUrl(nextUrl);
      })
      .catch(() => {
        if (!cancelled) setImageFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [artistId, portraitAvailable]);

  const classes = ["artist-portrait", className].filter(Boolean).join(" ");
  const label = `${artistName} portrait`;
  if (imageUrl && !imageFailed) {
    return (
      <span className={`${classes} has-image`} aria-hidden={decorative || undefined}>
        <img
          src={imageUrl}
          alt={decorative ? "" : label}
          loading="lazy"
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
