import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  CSSProperties,
  ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { getAlbumCoverDataUrl } from "../backend";
import type { BrowseRow } from "../types";

const COVER_PREVIEW_SIZE = 300;
const COVER_PREVIEW_GAP = 16;
const COVER_PREVIEW_MARGIN = 16;
const COVER_PREVIEW_HIDE_DELAY = 55;
const COVER_PREVIEW_EXIT_DURATION = 180;

type CoverPreviewRequest = {
  id: string;
  imageUrl: string | null;
  initial: string;
  label: string;
  left: number;
  size: number;
  top: number;
};

type CoverPreviewState = CoverPreviewRequest & {
  visible: boolean;
};

type CoverPreviewContextValue = {
  hidePreview: (id: string) => void;
  showPreview: (preview: CoverPreviewRequest) => void;
};

const CoverPreviewContext = createContext<CoverPreviewContextValue | null>(
  null,
);

function albumInitial(row: BrowseRow | null) {
  return row?.album?.trim().slice(0, 1).toUpperCase() || "A";
}

function coverPreviewPosition(element: HTMLElement) {
  const bounds = element.getBoundingClientRect();
  const size = Math.max(
    1,
    Math.min(
      COVER_PREVIEW_SIZE,
      window.innerWidth - COVER_PREVIEW_MARGIN * 2,
      window.innerHeight - COVER_PREVIEW_MARGIN * 2,
    ),
  );
  const preferredRight = bounds.right + COVER_PREVIEW_GAP;
  const preferredLeft = bounds.left - size - COVER_PREVIEW_GAP;
  const left =
    preferredRight + size <= window.innerWidth - COVER_PREVIEW_MARGIN
      ? preferredRight
      : preferredLeft >= COVER_PREVIEW_MARGIN
        ? preferredLeft
        : Math.max(
            COVER_PREVIEW_MARGIN,
            Math.min(
              preferredRight,
              window.innerWidth - size - COVER_PREVIEW_MARGIN,
            ),
          );
  const centeredTop = bounds.top + (bounds.height - size) / 2;
  const top = Math.max(
    COVER_PREVIEW_MARGIN,
    Math.min(
      centeredTop,
      window.innerHeight - size - COVER_PREVIEW_MARGIN,
    ),
  );

  return { left, size, top };
}

export function AlbumCoverPreviewProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [preview, setPreview] = useState<CoverPreviewState | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const removeTimerRef = useRef<number | null>(null);

  const clearPreviewTimers = useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (removeTimerRef.current !== null) {
      window.clearTimeout(removeTimerRef.current);
      removeTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearPreviewTimers, [clearPreviewTimers]);

  const showPreview = useCallback(
    (nextPreview: CoverPreviewRequest) => {
      clearPreviewTimers();
      setPreview({ ...nextPreview, visible: true });
    },
    [clearPreviewTimers],
  );

  const hidePreview = useCallback((id: string) => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null;
      setPreview((current) =>
        current?.id === id ? { ...current, visible: false } : current,
      );
      removeTimerRef.current = window.setTimeout(() => {
        removeTimerRef.current = null;
        setPreview((current) => (current?.id === id ? null : current));
      }, COVER_PREVIEW_EXIT_DURATION);
    }, COVER_PREVIEW_HIDE_DELAY);
  }, []);

  const contextValue = useMemo(
    () => ({ hidePreview, showPreview }),
    [hidePreview, showPreview],
  );
  const previewStyle = preview
    ? ({
        width: `${preview.size}px`,
        height: `${preview.size}px`,
        transform: `translate3d(${preview.left}px, ${preview.top}px, 0) scale(${
          preview.visible ? 1 : 0.965
        })`,
      } satisfies CSSProperties)
    : undefined;

  return (
    <CoverPreviewContext.Provider value={contextValue}>
      {children}
      {preview && typeof document !== "undefined"
        ? createPortal(
            <div
              className={`album-cover-preview${
                preview.visible ? " is-visible" : ""
              }`}
              style={previewStyle}
              data-album-cover={preview.label}
              aria-hidden="true"
            >
              <div
                className="album-cover-preview-art"
                key={`${preview.id}:${preview.imageUrl ?? "fallback"}`}
              >
                {preview.imageUrl ? (
                  <img src={preview.imageUrl} alt="" draggable={false} />
                ) : (
                  <span>{preview.initial}</span>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </CoverPreviewContext.Provider>
  );
}

export function AlbumCover({
  row,
  className = "",
  decorative = true,
  previewOnHover = false,
}: {
  row: BrowseRow | null;
  className?: string;
  decorative?: boolean;
  previewOnHover?: boolean;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const coverPreview = useContext(CoverPreviewContext);
  const coverRef = useRef<HTMLSpanElement | null>(null);
  const previewActiveRef = useRef(false);
  const previewId = useId();
  const coverPath = row?.coverPath ?? null;
  const albumId = row?.albumId ?? null;

  useEffect(() => {
    setImageFailed(false);
    setImageUrl(null);
    if (!albumId || !coverPath) {
      return;
    }

    let cancelled = false;
    void getAlbumCoverDataUrl(albumId).then((nextImageUrl) => {
      if (!cancelled) {
        setImageUrl(nextImageUrl);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [albumId, coverPath]);

  const displayImageUrl = imageFailed ? null : imageUrl;
  const label = row?.album ? `${row.album} cover` : "Album cover";
  const initial = albumInitial(row);
  const classes = [
    "cover-placeholder",
    displayImageUrl ? "cover-image" : "",
    previewOnHover ? "cover-preview-trigger" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const showHoverPreview = useCallback(
    (element: HTMLElement) => {
      if (!previewOnHover || !coverPreview) {
        return;
      }
      coverPreview.showPreview({
        id: previewId,
        imageUrl: displayImageUrl,
        initial,
        label,
        ...coverPreviewPosition(element),
      });
    },
    [
      coverPreview,
      displayImageUrl,
      initial,
      label,
      previewId,
      previewOnHover,
    ],
  );

  useEffect(() => {
    if (previewActiveRef.current && coverRef.current) {
      showHoverPreview(coverRef.current);
    }
  }, [showHoverPreview]);

  useEffect(
    () => () => {
      coverPreview?.hidePreview(previewId);
    },
    [coverPreview, previewId],
  );

  function handleMouseEnter() {
    previewActiveRef.current = true;
    if (coverRef.current) {
      showHoverPreview(coverRef.current);
    }
  }

  function handleMouseLeave() {
    previewActiveRef.current = false;
    coverPreview?.hidePreview(previewId);
  }

  return (
    <span
      ref={coverRef}
      className={classes}
      aria-hidden={decorative ? "true" : undefined}
      onMouseEnter={previewOnHover ? handleMouseEnter : undefined}
      onMouseLeave={previewOnHover ? handleMouseLeave : undefined}
    >
      {displayImageUrl ? (
        <img
          src={displayImageUrl}
          alt={decorative ? "" : label}
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span>{initial}</span>
      )}
    </span>
  );
}
