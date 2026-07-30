import {
  ChartLineUp,
  UsersThree,
  WaveSine,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";

export type TimelinesView = "charts" | "genres" | "artists";

type TimelinesWorkspaceProps = {
  activeView: TimelinesView;
  onViewChange: (view: TimelinesView) => void;
  children: ReactNode;
};

const timelineViews: Array<{
  id: TimelinesView;
  label: string;
  icon: typeof ChartLineUp;
}> = [
  { id: "charts", label: "Charts", icon: ChartLineUp },
  { id: "genres", label: "Genres", icon: WaveSine },
  { id: "artists", label: "Artists", icon: UsersThree },
];

export function TimelinesWorkspace({
  activeView,
  onViewChange,
  children,
}: TimelinesWorkspaceProps) {
  return (
    <section className="timelines-workspace">
      <header className="timelines-header">
        <h1>Timelines</h1>
        <nav className="timelines-switcher" aria-label="Timeline views">
          {timelineViews.map((view) => {
            const Icon = view.icon;
            const isActive = view.id === activeView;
            return (
              <button
                type="button"
                key={view.id}
                className={isActive ? "active" : ""}
                aria-current={isActive ? "page" : undefined}
                aria-label={view.label}
                onClick={() => onViewChange(view.id)}
              >
                <Icon size={16} />
                <span>{view.label}</span>
              </button>
            );
          })}
        </nav>
      </header>
      <div className="timelines-content">{children}</div>
    </section>
  );
}
