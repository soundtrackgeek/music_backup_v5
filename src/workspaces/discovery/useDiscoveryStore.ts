import { type InsightCohort } from "../../app/insightCohorts";
import {
  type DiscoveryResponse,
  type BrowseRequest,
  type BrowseResponse,
} from "../../types";
import {
  type DiscoverySelection,
  createDiscoveryAlbumRequest,
} from "../../app/requests";
import { useMemo, useRef } from "react";
import {
  createWorkspaceContext,
  createWorkspaceSetters,
  workspaceReducer,
} from "../../app/workspaceStore";
import { useReducer } from "react";
type DiscoveryState = {
  discoveryCohort: InsightCohort | null;
  discovery: DiscoveryResponse | null;
  discoveryError: string | null;
  isDiscoveryLoading: boolean;
  isDiscoveryAnniversaryLoading: boolean;
  isDiscoveryChartLoading: boolean;
  isDiscoveryDeepCutLoading: boolean;
  isDiscoveryCompletionLoading: boolean;
  isDiscoveryRecommendationLoading: boolean;
  discoveryAlbumRequest: BrowseRequest;
  discoveryAlbumResponse: BrowseResponse | null;
  discoveryAlbumError: string | null;
  isDiscoveryAlbumsLoading: boolean;
  discoverySelection: DiscoverySelection | null;
};

function createInitialState(): DiscoveryState {
  const discoveryCohort: InsightCohort | null = null;
  const discovery: DiscoveryResponse | null = null;
  const discoveryError: string | null = null;
  const isDiscoveryLoading: boolean = true;
  const isDiscoveryAnniversaryLoading: boolean = false;
  const isDiscoveryChartLoading: boolean = false;
  const isDiscoveryDeepCutLoading: boolean = false;
  const isDiscoveryCompletionLoading: boolean = false;
  const isDiscoveryRecommendationLoading: boolean = false;
  const discoveryAlbumRequest: BrowseRequest = (() =>
    createDiscoveryAlbumRequest(
      {},
      { field: "albumScore", direction: "desc" },
      30,
    ))();
  const discoveryAlbumResponse: BrowseResponse | null = null;
  const discoveryAlbumError: string | null = null;
  const isDiscoveryAlbumsLoading: boolean = false;
  const discoverySelection: DiscoverySelection | null = null;
  return {
    discoveryCohort,
    discovery,
    discoveryError,
    isDiscoveryLoading,
    isDiscoveryAnniversaryLoading,
    isDiscoveryChartLoading,
    isDiscoveryDeepCutLoading,
    isDiscoveryCompletionLoading,
    isDiscoveryRecommendationLoading,
    discoveryAlbumRequest,
    discoveryAlbumResponse,
    discoveryAlbumError,
    isDiscoveryAlbumsLoading,
    discoverySelection,
  };
}

function useDiscoveryStoreValue() {
  const [state, dispatch] = useReducer(
    workspaceReducer<DiscoveryState>,
    undefined,
    createInitialState,
  );
  const {
    discoveryCohort,
    discovery,
    discoveryError,
    isDiscoveryLoading,
    isDiscoveryAnniversaryLoading,
    isDiscoveryChartLoading,
    isDiscoveryDeepCutLoading,
    isDiscoveryCompletionLoading,
    isDiscoveryRecommendationLoading,
    discoveryAlbumRequest,
    discoveryAlbumResponse,
    discoveryAlbumError,
    isDiscoveryAlbumsLoading,
    discoverySelection,
  } = state;
  const setters = useMemo(
    () =>
      createWorkspaceSetters<DiscoveryState>(dispatch, [
        "discoveryCohort",
        "discovery",
        "discoveryError",
        "isDiscoveryLoading",
        "isDiscoveryAnniversaryLoading",
        "isDiscoveryChartLoading",
        "isDiscoveryDeepCutLoading",
        "isDiscoveryCompletionLoading",
        "isDiscoveryRecommendationLoading",
        "discoveryAlbumRequest",
        "discoveryAlbumResponse",
        "discoveryAlbumError",
        "isDiscoveryAlbumsLoading",
        "discoverySelection",
      ]),
    [dispatch],
  );
  const {
    setDiscoveryCohort,
    setDiscovery,
    setDiscoveryError,
    setIsDiscoveryLoading,
    setIsDiscoveryAnniversaryLoading,
    setIsDiscoveryChartLoading,
    setIsDiscoveryDeepCutLoading,
    setIsDiscoveryCompletionLoading,
    setIsDiscoveryRecommendationLoading,
    setDiscoveryAlbumRequest,
    setDiscoveryAlbumResponse,
    setDiscoveryAlbumError,
    setIsDiscoveryAlbumsLoading,
    setDiscoverySelection,
  } = setters;
  const discoveryAnniversaryYearsRef = useRef(50);
  const discoveryDateRequestRef = useRef(0);
  const discoveryChartRequestRef = useRef(0);
  const discoveryDeepCutRequestRef = useRef(0);
  const discoveryCompletionRequestRef = useRef(0);
  const discoveryRecommendationRequestRef = useRef(0);
  return {
    discoveryCohort,
    setDiscoveryCohort,
    discovery,
    setDiscovery,
    discoveryError,
    setDiscoveryError,
    isDiscoveryLoading,
    setIsDiscoveryLoading,
    isDiscoveryAnniversaryLoading,
    setIsDiscoveryAnniversaryLoading,
    isDiscoveryChartLoading,
    setIsDiscoveryChartLoading,
    isDiscoveryDeepCutLoading,
    setIsDiscoveryDeepCutLoading,
    isDiscoveryCompletionLoading,
    setIsDiscoveryCompletionLoading,
    isDiscoveryRecommendationLoading,
    setIsDiscoveryRecommendationLoading,
    discoveryAnniversaryYearsRef,
    discoveryDateRequestRef,
    discoveryChartRequestRef,
    discoveryDeepCutRequestRef,
    discoveryCompletionRequestRef,
    discoveryRecommendationRequestRef,
    discoveryAlbumRequest,
    setDiscoveryAlbumRequest,
    discoveryAlbumResponse,
    setDiscoveryAlbumResponse,
    discoveryAlbumError,
    setDiscoveryAlbumError,
    isDiscoveryAlbumsLoading,
    setIsDiscoveryAlbumsLoading,
    discoverySelection,
    setDiscoverySelection,
  };
}

export const { Provider: DiscoveryStoreProvider, useStore: useDiscoveryStore } =
  createWorkspaceContext(useDiscoveryStoreValue, "discovery");
