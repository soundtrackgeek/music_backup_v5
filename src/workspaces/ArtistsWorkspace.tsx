import type { KeyboardEvent, ReactNode } from "react";

export type ArtistDetailTab =
  | "local-albums"
  | "artist-info"
  | "discography"
  | "cover-view";

const artistDetailTabs: ReadonlyArray<{
  id: ArtistDetailTab;
  label: string;
}> = [
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
    onChange(nextTab.id);
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
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        className="artist-detail-tab-panel"
        id={`artist-detail-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`artist-detail-tab-${activeTab}`}
        tabIndex={0}
      >
        {children}
      </div>
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
            Album-artist index, selected artist album lists, and artist-level
            summary stats.
          </p>
        </div>
        <div className="topbar-actions">{actions}</div>
      </header>
      {children}
    </section>
  );
}
