type CatalogRevisionCheckerOptions = {
  isVisible: () => boolean;
  getRevision: () => Promise<string>;
  hasObservedRevision: () => boolean;
  getObservedRevision: () => string;
  setObservedRevision: (revision: string) => void;
  onRevision: (
    revision: string,
    reason: "baseline" | "change" | "retry",
  ) => Promise<void>;
};

export function createCatalogRevisionChecker({
  isVisible,
  getRevision,
  hasObservedRevision,
  getObservedRevision,
  setObservedRevision,
  onRevision,
}: CatalogRevisionCheckerOptions) {
  let checking = false;
  let revisionAwaitingRetry: string | null = null;

  return async function checkCatalogRevision() {
    if (checking || !isVisible()) return;
    checking = true;
    try {
      const revision = await getRevision();
      if (!hasObservedRevision()) {
        await onRevision(revision, "baseline");
        setObservedRevision(revision);
        revisionAwaitingRetry = revision;
        return;
      }
      if (revision !== getObservedRevision()) {
        await onRevision(revision, "change");
        setObservedRevision(revision);
        revisionAwaitingRetry = revision;
        return;
      }

      if (revisionAwaitingRetry !== revision) return;

      await onRevision(revision, "retry");
      revisionAwaitingRetry = null;
    } finally {
      checking = false;
    }
  };
}
