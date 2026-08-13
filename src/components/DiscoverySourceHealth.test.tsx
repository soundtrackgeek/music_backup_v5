import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type {
  DiscoverySourceHealthItem,
  DiscoverySourceHealthResponse,
} from "../types";
import { DiscoverySourceHealth } from "./DiscoverySourceHealth";

function source(
  id: string,
  label: string,
  state: DiscoverySourceHealthItem["state"],
  action: DiscoverySourceHealthItem["action"] = "open-imports",
): DiscoverySourceHealthItem {
  return {
    id,
    label,
    state,
    coverageCount: state === "missing" ? 0 : 8,
    totalCount: 10,
    coveragePercent: state === "missing" ? 0 : 0.8,
    coverageLabel: state === "missing" ? "0 of 10 covered" : "8 of 10 covered",
    lastSuccessfulUpdate: state === "missing" ? null : "2026-08-12T12:00:00Z",
    freshnessLabel: state === "missing" ? "Never updated" : "Updated 1 day ago",
    shelves: ["Chart Toppers"],
    details: ["10 local records"],
    sparseReasons: state === "healthy" ? [] : [`${label} needs attention.`],
    action,
    actionLabel: action === "rebuild-chart-matches" ? "Rebuild matches" : "Open workflow",
  };
}

const health: DiscoverySourceHealthResponse = {
  checkedAt: "2026-08-13T12:00:00Z",
  editionDate: "2026-08-13",
  overallState: "missing",
  healthyCount: 1,
  staleCount: 1,
  missingCount: 1,
  sources: [
    source("ratings", "Ratings", "healthy"),
    source("lastfm", "Last.fm", "stale", "open-lastfm"),
    source("charts", "Album charts", "missing", "rebuild-chart-matches"),
  ],
};

const commonProps = {
  editionDate: "2026-08-13",
  isArchived: false,
  onBack: vi.fn(),
  onRebuildEdition: vi.fn(async () => {}),
  onOpenAction: vi.fn(),
};

describe("DiscoverySourceHealth", () => {
  it("renders observable healthy, stale, and missing states with sparse reasons", async () => {
    render(
      <DiscoverySourceHealth
        {...commonProps}
        onLoad={vi.fn(async () => health)}
        onRebuildCharts={vi.fn(async () => health)}
      />,
    );

    expect(await screen.findByRole("heading", { name: "Ratings" })).toBeInTheDocument();
    expect(screen.getByText("Healthy")).toBeInTheDocument();
    expect(screen.getByText("Stale")).toBeInTheDocument();
    expect(screen.getByText("Missing")).toBeInTheDocument();
    expect(screen.getByText("Last.fm needs attention.")).toBeInTheDocument();
    expect(screen.getByText("No source-level sparsity detected.")).toBeInTheDocument();
  });

  it("runs the safe chart rebuild and refreshes the displayed state", async () => {
    const rebuilt = {
      ...health,
      healthyCount: 2,
      missingCount: 0,
      sources: health.sources.map((item) =>
        item.id === "charts" ? source("charts", "Album charts", "healthy", "rebuild-chart-matches") : item,
      ),
    };
    const onRebuildCharts = vi.fn(async () => rebuilt);
    render(
      <DiscoverySourceHealth
        {...commonProps}
        onLoad={vi.fn(async () => health)}
        onRebuildCharts={onRebuildCharts}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Rebuild matches" }));
    await waitFor(() => expect(onRebuildCharts).toHaveBeenCalledWith("2026-08-13"));
    expect(screen.getAllByText("Healthy")).toHaveLength(2);
  });

  it("routes guarded refreshes and keeps archived edition rebuilding disabled", async () => {
    const onOpenAction = vi.fn();
    render(
      <DiscoverySourceHealth
        {...commonProps}
        isArchived
        onOpenAction={onOpenAction}
        onLoad={vi.fn(async () => health)}
        onRebuildCharts={vi.fn(async () => health)}
      />,
    );

    fireEvent.click((await screen.findAllByRole("button", { name: "Open workflow" }))[0]);
    expect(onOpenAction).toHaveBeenCalledWith("open-imports");
    expect(screen.getByRole("button", { name: "Rebuild today's edition" })).toBeDisabled();
  });
});
