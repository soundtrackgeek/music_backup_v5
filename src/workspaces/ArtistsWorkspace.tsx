import type { ReactNode } from "react";

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
