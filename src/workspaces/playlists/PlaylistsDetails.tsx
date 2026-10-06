import { ListMusic, Sparkles, ShieldCheck, Save, Download } from "lucide-react";
import { formatNumber } from "../../app/display";
import type { AppModel } from "../../app/useAppController";
export function PlaylistsDetails({
  model,
}: {
  model: Pick<AppModel, "status">;
}) {
  const { status } = model;
  return (
    <aside
      className="detail-panel playlist-detail"
      aria-label="Playlist builder details"
    >
      <div className="detail-header">
        <ListMusic size={20} />
        <div>
          <h2>Local by design</h2>
          <p>Luna plans; SQLite selects</p>
        </div>
      </div>

      <section className="calculation-list">
        <div>
          <Sparkles size={17} />
          <span>One AI call creates a bounded search recipe</span>
        </div>
        <div>
          <ShieldCheck size={17} />
          <span>Track names, artists, and file paths stay local</span>
        </div>
        <div>
          <Save size={17} />
          <span>Exact track order is saved only when you choose</span>
        </div>
        <div>
          <Download size={17} />
          <span>UTF-8 M3U8 exports point to your local files</span>
        </div>
      </section>

      <dl className="run-details">
        <div>
          <dt>Candidate ceiling</dt>
          <dd>500 tracks</dd>
        </div>
        <div>
          <dt>Playlist ceiling</dt>
          <dd>200 tracks</dd>
        </div>
        <div>
          <dt>Current library</dt>
          <dd>{formatNumber(status?.trackCount)} tracks</dd>
        </div>
      </dl>
    </aside>
  );
}
