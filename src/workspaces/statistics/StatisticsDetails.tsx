import { TransitionRegion } from "../../components/TransitionRegion";
import {
  Activity,
  Album,
  Gauge,
  Heart,
  FolderInput,
  ShieldCheck,
  Clock3,
  Sparkles,
} from "lucide-react";
import {
  formatDate,
  formatAverage,
  formatNumber,
  formatPercent,
  formatHours,
} from "../../app/display";
import { RatingEventList } from "./ProgressExplorers";
import type { AppModel } from "../../app/useAppController";
export function StatisticsDetails({
  model,
}: {
  model: Pick<AppModel, "statistics" | "setStatisticsCohort">;
}) {
  const { statistics, setStatisticsCohort } = model;
  return (
    <TransitionRegion>
      <aside
        className="detail-panel statistics-detail"
        aria-label="Statistics details"
      >
        <div className="detail-header">
          <Activity size={20} />
          <div>
            <h2>Library Signals</h2>
            <p>
              {statistics?.lastUpdated
                ? formatDate(statistics.lastUpdated)
                : "No import yet"}
            </p>
          </div>
        </div>

        <dl className="run-details">
          <div>
            <dt>Health score</dt>
            <dd>
              {statistics
                ? `${Math.round(statistics.healthScore.score ?? 0)}/100`
                : ""}
            </dd>
          </div>
          <div>
            <dt>Average album rating</dt>
            <dd>
              {formatAverage(statistics?.ratingProgress.averageAlbumRating, 1)}
            </dd>
          </div>
          <div>
            <dt>Average album score</dt>
            <dd>{formatAverage(statistics?.overview.averageAlbumScore, 2)}</dd>
          </div>
          <div>
            <dt>Unrated albums</dt>
            <dd>{formatNumber(statistics?.ratingProgress.unratedAlbums)}</dd>
          </div>
          <div>
            <dt>Top loved genre</dt>
            <dd>{statistics?.lovedTracks.topLovedGenre ?? "Not yet"}</dd>
          </div>
          <div>
            <dt>Median release year</dt>
            <dd>{statistics?.libraryShape.medianYear ?? "Not yet"}</dd>
          </div>
          <div>
            <dt>Top artist share</dt>
            <dd>
              {formatPercent(
                statistics?.catalogConcentration.artistPoints[0]?.share,
                1,
              )}
            </dd>
          </div>
        </dl>

        <section className="calculation-list statistics-signals">
          <div>
            <Album size={17} />
            <span>
              {formatNumber(statistics?.ratingProgress.fullyRatedAlbums)} fully
              rated albums
            </span>
          </div>
          <div>
            <Gauge size={17} />
            <span>
              {formatNumber(statistics?.ratingProgress.partiallyRatedAlbums)}{" "}
              partial albums
            </span>
          </div>
          <div>
            <Heart size={17} />
            <span>
              {formatNumber(statistics?.lovedTracks.lovedTracks)} loved tracks
            </span>
          </div>
          <div>
            <FolderInput size={17} />
            <span>
              {formatNumber(statistics?.importHistory.length)} import runs
            </span>
          </div>
          <div>
            <ShieldCheck size={17} />
            <span>
              {formatPercent(statistics?.healthScore.metadataCoverage, 0)}{" "}
              metadata coverage
            </span>
          </div>
          <div>
            <Clock3 size={17} />
            <span>
              {formatHours(statistics?.durationAnalytics.averageAlbumSeconds)}{" "}
              average album
            </span>
          </div>
        </section>

        <section className="saved-list" aria-label="Recent rating events">
          <div className="detail-header small">
            <Sparkles size={18} />
            <div>
              <h2>Recent Events</h2>
              <p>Rating changes from imports</p>
            </div>
          </div>
          <RatingEventList
            events={statistics?.recentRatingEvents ?? []}
            onSelect={setStatisticsCohort}
          />
        </section>
      </aside>
    </TransitionRegion>
  );
}
