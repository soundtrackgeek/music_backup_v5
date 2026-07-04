import {
  BarChart3,
  Clock3,
  Film,
  Gauge,
  Heart,
  Sparkles,
  Tags,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import type { ChartConfig } from "../types";
import { createChartTemplateConfig } from "./requests";

export type ChartTemplate = {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  createConfig: () => ChartConfig;
};

export const chartTemplates: ChartTemplate[] = [
  {
    id: "year",
    label: "Year",
    description: "Top albums from a selected year.",
    icon: BarChart3,
    createConfig: () =>
      createChartTemplateConfig({
        request: { filters: { yearFrom: 1987, yearTo: 1987 } },
      }),
  },
  {
    id: "decade",
    label: "Decade",
    description: "Top albums from a selected decade.",
    icon: Gauge,
    createConfig: () =>
      createChartTemplateConfig({
        request: { filters: { yearFrom: 1980, yearTo: 1989 } },
      }),
  },
  {
    id: "billboard",
    label: "Billboard",
    description: "Albums with imported Billboard year-end ranks.",
    icon: BarChart3,
    createConfig: () =>
      createChartTemplateConfig({
        rankingMetric: "billboardRank",
        sortDirection: "asc",
        visibleColumns: ["billboard", "rating", "complete", "score"],
        request: {
          sort: { field: "billboardRank", direction: "asc" },
          filters: { billboardRankMin: 1 },
        },
      }),
  },
  {
    id: "genre",
    label: "Genre",
    description: "Top albums in a canonical genre.",
    icon: Tags,
    createConfig: () =>
      createChartTemplateConfig({
        request: { filters: { genres: ["Synthpop"] } },
      }),
  },
  {
    id: "scores",
    label: "Scores",
    description: "Film, TV, and game score albums.",
    icon: Film,
    createConfig: () =>
      createChartTemplateConfig({
        request: { filters: { genres: ["scores"] } },
      }),
  },
  {
    id: "artist",
    label: "Artist",
    description: "Top albums by album artist.",
    icon: UsersRound,
    createConfig: () =>
      createChartTemplateConfig({
        request: { filters: { albumArtist: { operator: "contains", value: "Pet Shop Boys" } } },
      }),
  },
  {
    id: "loved",
    label: "Loved",
    description: "Albums with the most loved tracks.",
    icon: Heart,
    createConfig: () =>
      createChartTemplateConfig({
        rankingMetric: "lovedTracks",
        request: { sort: { field: "lovedTracks", direction: "desc" }, filters: { lovedTracksMin: 1 } },
      }),
  },
  {
    id: "ae",
    label: "AE",
    description: "Albums with the highest Album Excellence.",
    icon: Sparkles,
    createConfig: () =>
      createChartTemplateConfig({
        rankingMetric: "ae",
        request: { sort: { field: "ae", direction: "desc" } },
      }),
  },
  {
    id: "tmoe",
    label: "TMOE",
    description: "Albums with the highest Total Minutes Of Excellence.",
    icon: Clock3,
    createConfig: () =>
      createChartTemplateConfig({
        rankingMetric: "tmoe",
        request: { sort: { field: "tmoe", direction: "desc" } },
      }),
  },
];

