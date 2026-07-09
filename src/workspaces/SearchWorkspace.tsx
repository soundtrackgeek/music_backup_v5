import type { ReactNode } from "react";

export function SearchWorkspace({
  actions,
  children,
}: {
  actions: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="workspace search-workspace">
      <header className="topbar">
        <div>
          <h1>Search</h1>
          <p>Album and track browsing over the imported MusicBee library.</p>
        </div>
        <div className="topbar-actions">{actions}</div>
      </header>
      {children}
    </section>
  );
}
