import { Sparkles, Gauge, Heart, Clock3, BarChart3 } from "lucide-react";
import { formatBytes, formatDate } from "../../app/display";
import type { AppModel } from "../../app/useAppController";
export function ImportsDetails({
  model,
}: {
  model: Pick<AppModel, "lastRun" | "sourcePath">;
}) {
  const { lastRun, sourcePath } = model;
  return (
    <aside className="detail-panel" aria-label="Selected import details">
      <div className="detail-header">
        <Sparkles size={20} />
        <div>
          <h2>Calculation Summary</h2>
          <p>Phase 1 album fields</p>
        </div>
      </div>

      <div className="calculation-list">
        <div>
          <Gauge size={17} />
          <span>Rating completeness</span>
        </div>
        <div>
          <Heart size={17} />
          <span>Loved tracks</span>
        </div>
        <div>
          <Clock3 size={17} />
          <span>TMOE and AE</span>
        </div>
        <div>
          <BarChart3 size={17} />
          <span>Album Score</span>
        </div>
      </div>

      <dl className="run-details">
        <div>
          <dt>Source size</dt>
          <dd>
            {lastRun
              ? formatBytes(lastRun.sourceSizeBytes)
              : "Waiting for first import"}
          </dd>
        </div>
        <div>
          <dt>Completed</dt>
          <dd>{lastRun ? formatDate(lastRun.completedAt) : "Not yet"}</dd>
        </div>
        <div>
          <dt>Backup</dt>
          <dd>{lastRun?.backupPath ?? "Created before import replacement"}</dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>{lastRun?.sourcePath ?? sourcePath}</dd>
        </div>
      </dl>
    </aside>
  );
}
