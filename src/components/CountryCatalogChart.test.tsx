import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { CountryCatalogStats } from "../types";
import { CountryCatalogChart } from "./CountryCatalogChart";

const rows: CountryCatalogStats[] = [
  {
    countryCode: "NO",
    countryName: "Norway",
    artistCount: 4,
    albumCount: 18,
  },
  {
    countryCode: "US",
    countryName: "United States",
    artistCount: 12,
    albumCount: 14,
  },
  {
    countryCode: "GB",
    countryName: "United Kingdom",
    artistCount: 7,
    albumCount: 23,
  },
];

function rankedCountries(label: string) {
  return within(screen.getByRole("list", { name: label }))
    .getAllByRole("listitem")
    .map((item) => item.getAttribute("aria-label"));
}

describe("CountryCatalogChart", () => {
  it("defaults to artists and renders direct country names and flags", () => {
    const { container } = render(<CountryCatalogChart rows={rows} />);

    expect(rankedCountries("Countries ranked by artists")).toEqual([
      "1. United States: 12 artists",
      "2. United Kingdom: 7 artists",
      "3. Norway: 4 artists",
    ]);
    expect(screen.getByText("Norway")).toBeInTheDocument();
    expect(
      container.querySelector(".country-catalog-flag.fi-no"),
    ).toBeInTheDocument();
  });

  it("switches to albums and reorders every country descending", async () => {
    const user = userEvent.setup();
    render(<CountryCatalogChart rows={rows} />);

    await user.click(screen.getByRole("button", { name: "Albums" }));

    expect(rankedCountries("Countries ranked by albums")).toEqual([
      "1. United Kingdom: 23 albums",
      "2. Norway: 18 albums",
      "3. United States: 14 albums",
    ]);
    expect(screen.getByRole("button", { name: "Albums" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("resolves code-only country names before labeling and sorting rows", () => {
    const codeOnlyRows: CountryCatalogStats[] = [
      {
        countryCode: "RO",
        countryName: "RO",
        artistCount: 2,
        albumCount: 2,
      },
      {
        countryCode: "PR",
        countryName: "PR",
        artistCount: 2,
        albumCount: 2,
      },
      {
        countryCode: "CZ",
        countryName: "Czechia",
        artistCount: 1,
        albumCount: 1,
      },
    ];

    render(<CountryCatalogChart rows={codeOnlyRows} />);

    expect(rankedCountries("Countries ranked by artists")).toEqual([
      "1. Puerto Rico: 2 artists",
      "2. Romania: 2 artists",
      "3. Czechia: 1 artist",
    ]);
    expect(screen.queryByText("RO")).not.toBeInTheDocument();
    expect(screen.queryByText("PR")).not.toBeInTheDocument();
    expect(screen.getByText("Romania")).toBeInTheDocument();
    expect(screen.getByText("Puerto Rico")).toBeInTheDocument();
    expect(screen.getByText("Czechia")).toBeInTheDocument();
  });

  it("shows a clear empty state when no origin countries are stored", () => {
    render(<CountryCatalogChart rows={[]} />);

    expect(screen.getByText("No country statistics yet.")).toBeInTheDocument();
  });
});
