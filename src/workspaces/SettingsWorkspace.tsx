import type { ReactNode } from "react";

export function SettingsWorkspace({
  reloadAction,
  children,
}: {
  reloadAction: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="workspace settings-workspace">
      <header className="topbar">
        <div>
          <h1>Settings</h1>
          <p>Backup retention, appearance, and workspace layout.</p>
        </div>
        {reloadAction}
      </header>
      {children}
    </section>
  );
}
