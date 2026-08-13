import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  CircleX,
  Database,
  RefreshCw,
  Wrench,
} from "lucide-react";

import type {
  DiscoverySourceHealthAction,
  DiscoverySourceHealthItem,
  DiscoverySourceHealthResponse,
} from "../types";

type DiscoverySourceHealthProps = {
  editionDate: string;
  isArchived: boolean;
  onBack: () => void;
  onLoad: (date: string) => Promise<DiscoverySourceHealthResponse>;
  onRebuildCharts: (date: string) => Promise<DiscoverySourceHealthResponse>;
  onRebuildEdition: () => Promise<void>;
  onOpenAction: (action: DiscoverySourceHealthAction) => void;
};

const statusDetails = {
  healthy: { label: "Healthy", icon: CheckCircle2 },
  stale: { label: "Stale", icon: CircleAlert },
  missing: { label: "Missing", icon: CircleX },
} as const;

function formatLastSuccess(value: string | null) {
  if (!value) return "Last success: never";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "Last success: time unavailable"
    : `Last success: ${parsed.toLocaleString()}`;
}

function SourceHealthRow({
  source,
  isBusy,
  onAction,
}: {
  source: DiscoverySourceHealthItem;
  isBusy: boolean;
  onAction: () => void;
}) {
  const status = statusDetails[source.state];
  const StatusIcon = status.icon;
  const percent = Math.round(source.coveragePercent * 100);

  return (
    <article className={`daily-edition-source-row source-state-${source.state}`}>
      <div className="daily-edition-source-title">
        <div>
          <h3>{source.label}</h3>
          <p>{source.shelves.join(" · ")}</p>
        </div>
        <span className="daily-edition-source-state">
          <StatusIcon aria-hidden="true" />
          {status.label}
        </span>
      </div>

      <div className="daily-edition-source-coverage">
        <div>
          <span>{source.coverageLabel}</span>
          <strong>{percent}%</strong>
        </div>
        <div className="daily-edition-source-progress" aria-label={`${percent}% coverage`}>
          <span style={{ width: `${percent}%` }} />
        </div>
      </div>

      <div className="daily-edition-source-meta">
        <span>{source.freshnessLabel}</span>
        <span>{formatLastSuccess(source.lastSuccessfulUpdate)}</span>
        {source.details.map((detail) => <span key={detail}>{detail}</span>)}
      </div>

      {source.sparseReasons.length ? (
        <div className="daily-edition-source-reasons">
          <strong>Why a shelf may be sparse</strong>
          <ul>
            {source.sparseReasons.map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
        </div>
      ) : (
        <p className="daily-edition-source-ready">No source-level sparsity detected.</p>
      )}

      <button
        className="daily-edition-source-action"
        type="button"
        disabled={isBusy}
        onClick={onAction}
      >
        {source.action === "rebuild-chart-matches" ? (
          <Wrench aria-hidden="true" />
        ) : (
          <RefreshCw aria-hidden="true" />
        )}
        {isBusy ? "Rebuilding" : source.actionLabel}
      </button>
    </article>
  );
}

export function DiscoverySourceHealth({
  editionDate,
  isArchived,
  onBack,
  onLoad,
  onRebuildCharts,
  onRebuildEdition,
  onOpenAction,
}: DiscoverySourceHealthProps) {
  const [health, setHealth] = useState<DiscoverySourceHealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busySource, setBusySource] = useState<string | null>(null);
  const [isRebuildingEdition, setIsRebuildingEdition] = useState(false);

  const loadHealth = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setHealth(await onLoad(editionDate));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [editionDate, onLoad]);

  useEffect(() => {
    void loadHealth();
  }, [loadHealth]);

  async function runSourceAction(source: DiscoverySourceHealthItem) {
    if (source.action !== "rebuild-chart-matches") {
      onOpenAction(source.action);
      return;
    }
    setBusySource(source.id);
    setError(null);
    try {
      setHealth(await onRebuildCharts(editionDate));
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
    } finally {
      setBusySource(null);
    }
  }

  async function rebuildEdition() {
    setIsRebuildingEdition(true);
    setError(null);
    try {
      await onRebuildEdition();
      await loadHealth();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
    } finally {
      setIsRebuildingEdition(false);
    }
  }

  return (
    <section className="daily-edition-source-health" aria-labelledby="source-health-heading">
      <header className="daily-edition-source-health-header">
        <button className="daily-edition-source-back" type="button" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
          Back to Daily Edition
        </button>
        <div className="daily-edition-source-health-heading">
          <Database aria-hidden="true" />
          <div>
            <h2 id="source-health-heading">Daily Edition Source Health</h2>
            <p>Live coverage and update evidence for the sources behind this edition.</p>
          </div>
        </div>
        <div className="daily-edition-source-health-actions">
          <button type="button" disabled={isLoading} onClick={() => void loadHealth()}>
            <RefreshCw aria-hidden="true" />
            Recheck
          </button>
          <button
            type="button"
            disabled={isArchived || isRebuildingEdition}
            title={isArchived ? "Archived editions remain immutable." : undefined}
            onClick={() => void rebuildEdition()}
          >
            <RefreshCw aria-hidden="true" />
            {isRebuildingEdition ? "Rebuilding" : "Rebuild today's edition"}
          </button>
        </div>
      </header>

      {error ? <p className="error-message" role="alert">{error}</p> : null}
      {isLoading && !health ? (
        <div className="daily-edition-source-loading" aria-busy="true">
          Inspecting ratings, charts, MusicBrainz, Last.fm, genres, dates, and covers…
        </div>
      ) : null}

      {health ? (
        <>
          <div className="daily-edition-source-summary" aria-label="Source health summary">
            <span><CheckCircle2 aria-hidden="true" />{health.healthyCount} healthy</span>
            <span><CircleAlert aria-hidden="true" />{health.staleCount} stale</span>
            <span><CircleX aria-hidden="true" />{health.missingCount} missing</span>
            <small>Checked {new Date(health.checkedAt).toLocaleString()}</small>
          </div>
          <div className="daily-edition-source-grid">
            {health.sources.map((source) => (
              <SourceHealthRow
                key={source.id}
                source={source}
                isBusy={busySource === source.id}
                onAction={() => void runSourceAction(source)}
              />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
