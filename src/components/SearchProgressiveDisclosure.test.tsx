import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  ChartAdvancedControls,
  ChartFilterSourceGroup,
  ChartFiltersDisclosure,
  ChartLunaCommandArea,
  SearchAdvancedFilters,
  SearchLunaCommandArea,
} from "./SearchProgressiveDisclosure";

describe("Search progressive disclosure", () => {
  it("keeps Luna collapsed until requested and switches between commands", () => {
    render(
      <SearchLunaCommandArea
        searchCommand={<p>Search command</p>}
        resultsCommand={<p>Results command</p>}
      />,
    );

    expect(screen.getByText("Search command")).not.toBeVisible();
    expect(screen.getByText("Results command")).not.toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByText("Search command")).toBeVisible();
    expect(screen.getByText("Results command")).not.toBeVisible();

    fireEvent.click(screen.getByRole("tab", { name: "Ask these results" }));
    expect(screen.getByText("Search command")).not.toBeVisible();
    expect(screen.getByText("Results command")).toBeVisible();
  });

  it("opens the requested command when Luna launches a workspace mode", () => {
    const { rerender } = render(
      <SearchLunaCommandArea
        searchCommand={<p>Search command</p>}
        resultsCommand={<p>Results command</p>}
      />,
    );

    rerender(
      <SearchLunaCommandArea
        launch={{ id: 1, mode: "results" }}
        searchCommand={<p>Search command</p>}
        resultsCommand={<p>Results command</p>}
      />,
    );

    expect(screen.getByText("Search command")).not.toBeVisible();
    expect(screen.getByText("Results command")).toBeVisible();
    expect(
      screen.getByRole("tab", { name: "Ask these results" }),
    ).toHaveAttribute("aria-selected", "true");
  });

  it("summarizes active filters while keeping advanced controls collapsed", () => {
    render(
      <SearchAdvancedFilters activeFilterCount={3}>
        <label>
          File path
          <input />
        </label>
      </SearchAdvancedFilters>,
    );

    expect(screen.getByText("3 active")).toBeVisible();
    expect(screen.getByLabelText("File path")).not.toBeVisible();
  });

  it("uses chart-specific Luna tasks in one collapsed command area", () => {
    render(
      <ChartLunaCommandArea
        chartCommand={<p>Chart command</p>}
        resultsCommand={<p>Chart results command</p>}
      />,
    );

    expect(screen.getByText("Chart command")).not.toBeVisible();
    expect(screen.getByText("Chart results command")).not.toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByText("Chart command")).toBeVisible();

    fireEvent.click(screen.getByRole("tab", { name: "Ask this chart" }));
    expect(screen.getByText("Chart command")).not.toBeVisible();
    expect(screen.getByText("Chart results command")).toBeVisible();
  });

  it("keeps advanced chart controls collapsed and summarizes active groups", () => {
    render(
      <ChartAdvancedControls activeControlCount={2}>
        <label>
          Billboard minimum
          <input />
        </label>
      </ChartAdvancedControls>,
    );

    expect(screen.getByText("2 active")).toBeVisible();
    expect(screen.getByLabelText("Billboard minimum")).not.toBeVisible();
  });

  it("groups growing chart-source filters behind a nested disclosure", () => {
    render(
      <ChartFiltersDisclosure activeFilterCount={2}>
        <ChartFilterSourceGroup
          title="NO · Ti i Skuddet"
          description="Unofficial Norwegian singles chart history."
        >
          <label>
            Ti i Skuddet best rank
            <input />
          </label>
        </ChartFilterSourceGroup>
      </ChartFiltersDisclosure>,
    );

    expect(screen.getByText("2 active")).toBeVisible();
    expect(screen.getByLabelText("Ti i Skuddet best rank")).not.toBeVisible();

    fireEvent.click(screen.getByText("Chart filters"));
    expect(screen.getByLabelText("Ti i Skuddet best rank")).toBeVisible();
    expect(screen.getByText("NO · Ti i Skuddet")).toBeVisible();
  });
});
