import {
  Suspense,
  ViewTransition,
  addTransitionType,
  startTransition,
  type KeyboardEvent,
  type ReactNode,
} from "react";

export type ArtistDetailTab =
  | "overview"
  | "loved-tracks"
  | "chart-busters"
  | "local-albums"
  | "artist-info"
  | "discography"
  | "cover-view";

const artistDetailTabs: ReadonlyArray<{
  id: ArtistDetailTab;
  label: string;
}> = [
  { id: "overview", label: "Overview" },
  { id: "loved-tracks", label: "Loved Tracks" },
  { id: "chart-busters", label: "Chart Busters" },
  { id: "local-albums", label: "Local albums" },
  { id: "artist-info", label: "Artist info" },
  { id: "discography", label: "MusicBrainz discography" },
  { id: "cover-view", label: "Cover view" },
];

export function artistDetailTabNeedsMusicBrainz(tab: ArtistDetailTab) {
  return tab === "artist-info" || tab === "discography";
}

export function artistDetailTabNeedsTracks(tab: ArtistDetailTab) {
  return tab === "cover-view";
}

export function artistDetailTabNeedsPopularity(tab: ArtistDetailTab) {
  return tab === "overview";
}

export function artistDetailTabNeedsHighlights(tab: ArtistDetailTab) {
  return tab === "loved-tracks" || tab === "chart-busters";
}

export type ArtistDetailTabDirection = "forward" | "backward";

export function artistDetailTabDirection(
  from: ArtistDetailTab,
  to: ArtistDetailTab,
): ArtistDetailTabDirection | null {
  const fromIndex = artistDetailTabs.findIndex((tab) => tab.id === from);
  const toIndex = artistDetailTabs.findIndex((tab) => tab.id === to);

  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
    return null;
  }

  return toIndex > fromIndex ? "forward" : "backward";
}

function ArtistDetailPanelFallback() {
  return (
    <div
      className="artist-detail-tab-panel artist-detail-tab-panel-pending"
      role="status"
      aria-label="Loading artist view"
    >
      <span
        className="artist-detail-tab-panel-pending-bar"
        aria-hidden="true"
      />
      <span
        className="artist-detail-tab-panel-pending-bar"
        aria-hidden="true"
      />
      <span
        className="artist-detail-tab-panel-pending-bar"
        aria-hidden="true"
      />
    </div>
  );
}

export function ArtistDetailTabs({
  activeTab,
  onChange,
  children,
}: {
  activeTab: ArtistDetailTab;
  onChange: (tab: ArtistDetailTab) => void;
  children: ReactNode;
}) {
  const activeIndex = artistDetailTabs.findIndex((tab) => tab.id === activeTab);

  function selectTab(nextTab: ArtistDetailTab) {
    const direction = artistDetailTabDirection(activeTab, nextTab);

    if (!direction) {
      onChange(nextTab);
      return;
    }

    startTransition(() => {
      addTransitionType(direction);
      onChange(nextTab);
    });
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ) {
    let nextIndex: number | null = null;

    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % artistDetailTabs.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex =
        (currentIndex - 1 + artistDetailTabs.length) % artistDetailTabs.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = artistDetailTabs.length - 1;
    }

    if (nextIndex == null) {
      return;
    }

    event.preventDefault();
    const nextTab = artistDetailTabs[nextIndex];
    selectTab(nextTab.id);
    event.currentTarget.parentElement
      ?.querySelector<HTMLButtonElement>(`#artist-detail-tab-${nextTab.id}`)
      ?.focus();
  }

  return (
    <section
      className="artist-detail-shell"
      aria-label="Selected artist details"
    >
      <div
        className="artist-detail-tabs"
        role="tablist"
        aria-label="Artist detail views"
      >
        {artistDetailTabs.map((tab, index) => (
          <button
            className="artist-detail-tab"
            id={`artist-detail-tab-${tab.id}`}
            key={tab.id}
            type="button"
            role="tab"
            aria-controls={`artist-detail-panel-${tab.id}`}
            aria-selected={tab.id === activeTab}
            tabIndex={index === activeIndex ? 0 : -1}
            onClick={() => selectTab(tab.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <ViewTransition
        key={activeTab}
        default="none"
        enter={{
          default: "artist-tab-enter",
          forward: "artist-tab-enter-forward",
          backward: "artist-tab-enter-backward",
        }}
        exit={{
          default: "artist-tab-exit",
          forward: "artist-tab-exit-forward",
          backward: "artist-tab-exit-backward",
        }}
      >
        <Suspense fallback={<ArtistDetailPanelFallback />}>
          <div
            className="artist-detail-tab-panel"
            id={`artist-detail-panel-${activeTab}`}
            role="tabpanel"
            aria-labelledby={`artist-detail-tab-${activeTab}`}
            tabIndex={0}
          >
            {children}
          </div>
        </Suspense>
      </ViewTransition>
    </section>
  );
}

export function ArtistsWorkspace({
  actions,
  children,
}: {
  actions: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="workspace artists-workspace">
      <header className="topbar">
        <div>
          <h1>Artists</h1>
          <p>
            Album-artist index, biographies, popular tracks, local albums, and
            artist-level metadata.
          </p>
        </div>
        <div className="topbar-actions">{actions}</div>
      </header>
      {children}
    </section>
  );
}
