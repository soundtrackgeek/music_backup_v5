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

  return async function checkCatalogRevision(pushedRevision?: string) {
    if (checking || !isVisible()) return false;
    checking = true;
    try {
      const revision = pushedRevision ?? await getRevision();
      if (!hasObservedRevision()) {
        await onRevision(revision, "baseline");
        setObservedRevision(revision);
        revisionAwaitingRetry = revision;
        return true;
      }
      if (revision !== getObservedRevision()) {
        await onRevision(revision, "change");
        setObservedRevision(revision);
        revisionAwaitingRetry = revision;
        return true;
      }

      if (revisionAwaitingRetry !== revision) return true;

      await onRevision(revision, "retry");
      revisionAwaitingRetry = null;
      return true;
    } finally {
      checking = false;
    }
  };
}
