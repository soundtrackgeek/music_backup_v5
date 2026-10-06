import { type LibraryStatus, type ImportRun } from "../../types";
import { useMemo, useRef } from "react";
import {
  createWorkspaceContext,
  createWorkspaceSetters,
  workspaceReducer,
} from "../../app/workspaceStore";
import { useReducer } from "react";
type CatalogState = {
  status: LibraryStatus | null;
  runs: ImportRun[];
  catalogRefreshKey: number;
};

function createInitialState(): CatalogState {
  const status: LibraryStatus | null = null;
  const runs: ImportRun[] = [];
  const catalogRefreshKey: number = 0;
  return { status, runs, catalogRefreshKey };
}

function useCatalogStoreValue() {
  const [state, dispatch] = useReducer(
    workspaceReducer<CatalogState>,
    undefined,
    createInitialState,
  );
  const { status, runs, catalogRefreshKey } = state;
  const setters = useMemo(
    () =>
      createWorkspaceSetters<CatalogState>(dispatch, [
        "status",
        "runs",
        "catalogRefreshKey",
      ]),
    [dispatch],
  );
  const { setStatus, setRuns, setCatalogRefreshKey } = setters;
  const observedCatalogRevisionRef = useRef("");
  const hasObservedCatalogRevisionRef = useRef(false);
  return {
    status,
    setStatus,
    runs,
    setRuns,
    catalogRefreshKey,
    setCatalogRefreshKey,
    observedCatalogRevisionRef,
    hasObservedCatalogRevisionRef,
  };
}

export const { Provider: CatalogStoreProvider, useStore: useCatalogStore } =
  createWorkspaceContext(useCatalogStoreValue, "catalog");
