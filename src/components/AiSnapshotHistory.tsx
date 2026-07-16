import { History, Trash2 } from "lucide-react";

import type { AiSnapshot } from "../types";

type AiSnapshotHistoryProps = {
  snapshots: AiSnapshot[];
  activeSnapshotId: number | null;
  description: string;
  emptyMessage: string;
  getCategoryLabel: (snapshot: AiSnapshot) => string;
  onOpen: (snapshot: AiSnapshot) => void;
  onDelete: (snapshot: AiSnapshot) => void;
  tone?: "light" | "dark";
};

const snapshotDateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatSnapshotDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : snapshotDateFormatter.format(date);
}

function snapshotMetadata(snapshot: AiSnapshot, category: string) {
  const counts =
    snapshot.libraryAlbumCount > 0 || snapshot.libraryTrackCount > 0
      ? ` · ${snapshot.libraryAlbumCount.toLocaleString()} albums · ${snapshot.libraryTrackCount.toLocaleString()} tracks`
      : "";
  return `${category} · ${formatSnapshotDate(snapshot.createdAt)}${counts}`;
}

export function AiSnapshotHistory({
  snapshots,
  activeSnapshotId,
  description,
  emptyMessage,
  getCategoryLabel,
  onOpen,
  onDelete,
  tone = "light",
}: AiSnapshotHistoryProps) {
  return (
    <section
      className={`ai-snapshot-history ai-snapshot-history-${tone}`}
      aria-label="Luna snapshot history"
    >
      <header>
        <span className="ai-snapshot-history-icon" aria-hidden="true">
          <History size={15} />
        </span>
        <div>
          <strong>Snapshot history</strong>
          <span>{description}</span>
        </div>
        <small>{snapshots.length.toLocaleString()} saved</small>
      </header>

      {snapshots.length > 0 ? (
        <div className="ai-snapshot-list">
          {snapshots.map((snapshot) => {
            const metadata = snapshotMetadata(
              snapshot,
              getCategoryLabel(snapshot),
            );
            return (
              <div
                key={snapshot.id}
                className={snapshot.id === activeSnapshotId ? "active" : ""}
              >
                <button type="button" onClick={() => onOpen(snapshot)}>
                  <span>
                    <strong>{snapshot.title}</strong>
                    <small title={metadata}>{metadata}</small>
                  </span>
                </button>
                <button
                  className="ai-snapshot-delete"
                  type="button"
                  aria-label={`Delete snapshot ${snapshot.title}`}
                  title="Delete snapshot"
                  onClick={() => onDelete(snapshot)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <p>{emptyMessage}</p>
      )}
    </section>
  );
}
