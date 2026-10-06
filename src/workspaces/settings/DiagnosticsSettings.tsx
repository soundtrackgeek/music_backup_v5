import { SettingsSection } from "../SettingsWorkspace";
import { Activity, Gauge } from "lucide-react";
import { formatNumber, formatDate, formatDuration } from "../../app/display";
import type { AppModel } from "../../app/useAppController";

type Model = Pick<
  AppModel,
  | "performanceProbe"
  | "isPerformanceProbeRunning"
  | "runSettingsPerformanceProbe"
  | "performanceProbeError"
>;

export function DiagnosticsSettings({ model }: { model: Model }) {
  const {
    performanceProbe,
    isPerformanceProbeRunning,
    runSettingsPerformanceProbe,
    performanceProbeError,
  } = model;
  return (
    <SettingsSection id="diagnostics">
      <section className="settings-panel performance-settings-panel">
        <div className="panel-heading compact">
          <div>
            <h2>Performance Proof</h2>
            <p>
              {performanceProbe
                ? `${formatDate(performanceProbe.generatedAt)} / ${formatDuration(performanceProbe.totalDurationMs)} total`
                : "Not run"}
            </p>
          </div>
          <Activity size={18} />
        </div>

        <div className="performance-toolbar">
          <button
            className="primary-button"
            type="button"
            disabled={isPerformanceProbeRunning}
            onClick={() => void runSettingsPerformanceProbe()}
          >
            <Gauge size={16} />
            <span>{isPerformanceProbeRunning ? "Running" : "Run probe"}</span>
          </button>
          <span>
            {performanceProbe
              ? `${formatNumber(performanceProbe.operations.length)} checks`
              : "No report"}
          </span>
        </div>

        {performanceProbeError ? (
          <p className="error-message">{performanceProbeError}</p>
        ) : null}

        {performanceProbe ? (
          <>
            <dl className="performance-summary">
              <div>
                <dt>Tracks</dt>
                <dd>{formatNumber(performanceProbe.trackCount)}</dd>
              </div>
              <div>
                <dt>Albums</dt>
                <dd>{formatNumber(performanceProbe.albumCount)}</dd>
              </div>
              <div>
                <dt>Total</dt>
                <dd>{formatDuration(performanceProbe.totalDurationMs)}</dd>
              </div>
              <div>
                <dt>Slowest</dt>
                <dd>{formatDuration(performanceProbe.slowestOperationMs)}</dd>
              </div>
            </dl>

            <div className="performance-probe-list">
              {performanceProbe.operations.map((operation) => (
                <article
                  className={`performance-probe-row ${operation.status}`}
                  key={operation.id}
                >
                  <div>
                    <strong>{operation.label}</strong>
                    <span>{operation.category}</span>
                  </div>
                  <dl>
                    <div>
                      <dt>Time</dt>
                      <dd>{formatDuration(operation.durationMs)}</dd>
                    </div>
                    <div>
                      <dt>Total</dt>
                      <dd>
                        {operation.totalCount == null
                          ? "n/a"
                          : formatNumber(operation.totalCount)}
                      </dd>
                    </div>
                    <div>
                      <dt>Rows</dt>
                      <dd>
                        {operation.rowCount == null
                          ? "n/a"
                          : formatNumber(operation.rowCount)}
                      </dd>
                    </div>
                  </dl>
                  <small>{operation.errorMessage ?? operation.detail}</small>
                </article>
              ))}
            </div>

            <small className="performance-database-path">
              {performanceProbe.databasePath}
            </small>
          </>
        ) : null}
      </section>
    </SettingsSection>
  );
}
