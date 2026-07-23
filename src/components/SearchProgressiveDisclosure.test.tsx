import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
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
});
