import { useState } from "react";
import {
  BarChart3,
  Save,
  Trash2,
  Download
} from "lucide-react";
import {
  rankingLabel
} from "../../app/display";
import { artistChartMetricLabel } from "../../app/artistChart";
import {
  ExportResultStatus
} from "../../components/ExportResultStatus";
import type { AppModel } from "../../app/useAppController";
import type { SavedChart } from "../../types";

/** Which chart tab a saved chart belongs to, plus its ranking, for the library list. */
export function savedChartSummary(chart: SavedChart) {
  const { config } = chart;
  if (config.artistChart) {
    return `Artists · ${artistChartMetricLabel(config.artistChart.metric)}`;
  }
  const tab = config.request.view === "tracks" ? "Tracks" : "Albums";
  return `${tab} · ${rankingLabel(config.rankingMetric)} / ${config.viewMode}`;
}

export function ChartsDetails({ model }: { model: Pick<AppModel, "chartName" | "setChartName" | "saveCurrentChart" | "savedCharts" | "openSavedChart" | "setActiveSection" | "removeSavedChart" | "runChartExport" | "chartExportResult"> }) {
  const { chartName, setChartName, saveCurrentChart, savedCharts, openSavedChart, setActiveSection, removeSavedChart, runChartExport, chartExportResult } = model;
  const [exportingFormat, setExportingFormat] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  async function startExport(format: string) {
    setExportingFormat(format);
    setExportError(null);
    try {
      await runChartExport(format);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : String(error));
    } finally {
      setExportingFormat(null);
    }
  }

  return (
          <aside
            className="detail-panel chart-detail"
            aria-label="Chart actions"
          >
            <div className="detail-header">
              <BarChart3 size={20} />
              <div>
                <h2>Chart Library</h2>
                <p>Saved chart configs and exports</p>
              </div>
            </div>

            <section className="save-search-box">
              <label className="source-input">
                <span>Name</span>
                <input
                  value={chartName}
                  onChange={(event) => setChartName(event.target.value)}
                />
              </label>
              <button
                className="primary-button"
                type="button"
                onClick={() => void saveCurrentChart()}
              >
                <Save size={17} />
                <span>Save chart</span>
              </button>
            </section>

            <section className="saved-list" aria-label="Saved charts">
              {savedCharts.length === 0 ? (
                <div className="empty-state">
                  <BarChart3 size={20} />
                  <span>No saved charts.</span>
                </div>
              ) : (
                savedCharts.map((chart) => (
                  <div className="saved-search" key={chart.id}>
                    <button
                      type="button"
                      onClick={() => {
                        openSavedChart(chart);
                        setActiveSection("Charts");
                      }}
                    >
                      <strong>{chart.name}</strong>
                      <span>{savedChartSummary(chart)}</span>
                    </button>
                    <button
                      className="icon-button"
                      type="button"
                      aria-label={`Delete ${chart.name}`}
                      onClick={() => void removeSavedChart(chart.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))
              )}
            </section>

            <section className="export-box">
              <div className="export-grid">
                {["csv", "tsv", "xlsx", "json", "txt"].map((format) => (
                  <button
                    type="button"
                    key={format}
                    disabled={exportingFormat !== null}
                    onClick={() => void startExport(format)}
                  >
                    <Download size={16} />
                    <span>{format.toUpperCase()}</span>
                  </button>
                ))}
              </div>
              {exportingFormat ? (
                <p role="status">Exporting {exportingFormat.toUpperCase()}…</p>
              ) : null}
              {exportError ? <p role="alert" className="error-message">Export failed: {exportError}</p> : null}
              {chartExportResult && !exportingFormat && !exportError ? (
                <ExportResultStatus result={chartExportResult} itemLabel="row" />
              ) : null}
            </section>
          </aside>
        );
}
