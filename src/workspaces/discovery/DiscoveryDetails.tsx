import { Compass, Gauge, Heart, Tags, UsersRound } from "lucide-react";
import { formatDate, formatNumber } from "../../app/display";
import type { AppModel } from "../../app/useAppController";
export function DiscoveryDetails({
  model,
}: {
  model: Pick<
    AppModel,
    "discovery" | "discoveryAlbumTotal" | "discoverySelection"
  >;
}) {
  const { discovery, discoveryAlbumTotal, discoverySelection } = model;
  return (
    <aside
      className="detail-panel discovery-detail"
      aria-label="Discovery details"
    >
      <div className="detail-header">
        <Compass size={20} />
        <div>
          <h2>Discovery Map</h2>
          <p>
            {discovery?.generatedAt
              ? formatDate(discovery.generatedAt)
              : "Waiting for library data"}
          </p>
        </div>
      </div>

      <dl className="run-details">
        <div>
          <dt>Backlog missions</dt>
          <dd>{formatNumber(discovery?.backlogMissions.length)}</dd>
        </div>
        <div>
          <dt>Smart missions</dt>
          <dd>{formatNumber(discovery?.smartMissions.length)}</dd>
        </div>
        <div>
          <dt>Current result</dt>
          <dd>{formatNumber(discoveryAlbumTotal)}</dd>
        </div>
        <div>
          <dt>Selection</dt>
          <dd>{discoverySelection?.title ?? "None yet"}</dd>
        </div>
      </dl>

      <section className="calculation-list discovery-signals">
        <div>
          <Gauge size={17} />
          <span>Heatmap cells open matching genre/year albums</span>
        </div>
        <div>
          <Heart size={17} />
          <span>Scatter points open individual outlier albums</span>
        </div>
        <div>
          <Tags size={17} />
          <span>Genre bubbles open full genre album sets</span>
        </div>
        <div>
          <UsersRound size={17} />
          <span>Artist bubbles open catalog deep dives</span>
        </div>
      </section>
    </aside>
  );
}
