import {
  BarChart3,
  Save,
  Trash2,
  Download
} from "lucide-react";
import {
  normalizeChartConfigForClient
} from "../../app/requests";
import {
  rankingLabel
} from "../../app/display";
import {
  ExportResultStatus
} from "../../components/ExportResultStatus";
import type { AppModel } from "../../app/useAppController";
export function ChartsDetails({ model }: { model: Pick<AppModel, "chartName" | "setChartName" | "saveCurrentChart" | "savedCharts" | "setChartConfig" | "setChartTableSort" | "setActiveSection" | "removeSavedChart" | "runChartExport" | "chartExportResult"> }) {
  const { chartName, setChartName, saveCurrentChart, savedCharts, setChartConfig, setChartTableSort, setActiveSection, removeSavedChart, runChartExport, chartExportResult } = model;
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
                        setChartConfig(
                          normalizeChartConfigForClient(chart.config),
                        );
                        setChartTableSort(null);
                        setActiveSection("Charts");
                      }}
                    >
                      <strong>{chart.name}</strong>
                      <span>
                        {rankingLabel(chart.config.rankingMetric)} /{" "}
                        {chart.config.viewMode}
                      </span>
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
                    onClick={() => void runChartExport(format)}
                  >
                    <Download size={16} />
                    <span>{format.toUpperCase()}</span>
                  </button>
                ))}
              </div>
              {chartExportResult ? (
                <ExportResultStatus result={chartExportResult} itemLabel="row" />
              ) : null}
            </section>
          </aside>
        );
}
