import { type ReactNode } from "react";
import {
  ShellStoreProvider,
  useShellStore,
} from "../workspaces/shell/useShellStore";
import {
  StatisticsStoreProvider,
  useStatisticsStore,
} from "../workspaces/statistics/useStatisticsStore";
import {
  DiscoveryStoreProvider,
  useDiscoveryStore,
} from "../workspaces/discovery/useDiscoveryStore";
import {
  ImportsStoreProvider,
  useImportsStore,
} from "../workspaces/imports/useImportsStore";
import {
  CatalogStoreProvider,
  useCatalogStore,
} from "../workspaces/catalog/useCatalogStore";
import {
  SearchStoreProvider,
  useSearchStore,
} from "../workspaces/search/useSearchStore";
import {
  ChartsStoreProvider,
  useChartsStore,
} from "../workspaces/charts/useChartsStore";
import {
  AlbumsStoreProvider,
  useAlbumsStore,
} from "../workspaces/albums/useAlbumsStore";
import {
  ArtistsStoreProvider,
  useArtistsStore,
} from "../workspaces/artists/useArtistsStore";
import {
  GenresStoreProvider,
  useGenresStore,
} from "../workspaces/genres/useGenresStore";
import {
  ToolsStoreProvider,
  useToolsStore,
} from "../workspaces/tools/useToolsStore";
import {
  TimelinesStoreProvider,
  useTimelinesStore,
} from "../workspaces/timelines/useTimelinesStore";
import {
  SettingsStoreProvider,
  useSettingsStore,
} from "../workspaces/settings/useSettingsStore";
export function WorkspaceStoresProvider({ children }: { children: ReactNode }) {
  return (
    <ShellStoreProvider>
      <StatisticsStoreProvider>
        <DiscoveryStoreProvider>
          <ImportsStoreProvider>
            <CatalogStoreProvider>
              <SearchStoreProvider>
                <ChartsStoreProvider>
                  <AlbumsStoreProvider>
                    <ArtistsStoreProvider>
                      <GenresStoreProvider>
                        <ToolsStoreProvider>
                          <TimelinesStoreProvider>
                            <SettingsStoreProvider>
                              {children}
                            </SettingsStoreProvider>
                          </TimelinesStoreProvider>
                        </ToolsStoreProvider>
                      </GenresStoreProvider>
                    </ArtistsStoreProvider>
                  </AlbumsStoreProvider>
                </ChartsStoreProvider>
              </SearchStoreProvider>
            </CatalogStoreProvider>
          </ImportsStoreProvider>
        </DiscoveryStoreProvider>
      </StatisticsStoreProvider>
    </ShellStoreProvider>
  );
}

export function useWorkspaceStores() {
  const shell = useShellStore();
  const statistics = useStatisticsStore();
  const discovery = useDiscoveryStore();
  const imports = useImportsStore();
  const catalog = useCatalogStore();
  const search = useSearchStore();
  const charts = useChartsStore();
  const albums = useAlbumsStore();
  const artists = useArtistsStore();
  const genres = useGenresStore();
  const tools = useToolsStore();
  const timelines = useTimelinesStore();
  const settings = useSettingsStore();
  return {
    ...shell,
    ...statistics,
    ...discovery,
    ...imports,
    ...catalog,
    ...search,
    ...charts,
    ...albums,
    ...artists,
    ...genres,
    ...tools,
    ...timelines,
    ...settings,
  };
}

export type WorkspaceStores = ReturnType<typeof useWorkspaceStores>;
