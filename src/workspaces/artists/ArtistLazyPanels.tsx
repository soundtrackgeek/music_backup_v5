import { lazy } from "react";

export const ArtistBiographyPanel = lazy(() =>
  import("../../components/ArtistBiographyPanel").then((module) => ({
    default: module.ArtistBiographyPanel,
  })),
);

export const ArtistPopularTracksPanel = lazy(() =>
  import("../../components/ArtistPopularTracksPanel").then((module) => ({
    default: module.ArtistPopularTracksPanel,
  })),
);

export const ArtistSimilarArtistsPanel = lazy(() =>
  import("../../components/ArtistSimilarArtistsPanel").then((module) => ({
    default: module.ArtistSimilarArtistsPanel,
  })),
);

export const ArtistLovedTracksPanel = lazy(() =>
  import("../../components/ArtistTrackHighlightsPanels").then((module) => ({
    default: module.ArtistLovedTracksPanel,
  })),
);

export const ArtistChartBustersPanel = lazy(() =>
  import("../../components/ArtistTrackHighlightsPanels").then((module) => ({
    default: module.ArtistChartBustersPanel,
  })),
);
