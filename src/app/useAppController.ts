import { useWorkspaceStores } from "./WorkspaceStoresProvider";
import { useCatalogWorkspace } from "./useCatalogWorkspace";
import { useChartsWorkspace } from "../workspaces/charts/useChartsWorkspace";
import { useAlbumsWorkspace } from "../workspaces/albums/useAlbumsWorkspace";
import { useToolsWorkspace } from "../workspaces/tools/useToolsWorkspace";
import { useTimelinesWorkspace } from "../workspaces/timelines/useTimelinesWorkspace";
import { useNavigationWorkspace } from "./useNavigationWorkspace";
import { useStatisticsWorkspace } from "../workspaces/statistics/useStatisticsWorkspace";
import { useDiscoveryWorkspace } from "../workspaces/discovery/useDiscoveryWorkspace";
import { useImportsWorkspace } from "../workspaces/imports/useImportsWorkspace";
import { useArtistsWorkspace } from "../workspaces/artists/useArtistsWorkspace";
import { useGenresWorkspace } from "../workspaces/genres/useGenresWorkspace";
import { useSettingsWorkspace } from "../workspaces/settings/useSettingsWorkspace";
import { useShellWorkspace } from "./useShellWorkspace";
import { useSearchWorkspace } from "../workspaces/search/useSearchWorkspace";
export function useAppController() {
  const stores = useWorkspaceStores();
  const catalog = useCatalogWorkspace({ ...stores });
  const charts = useChartsWorkspace({ ...stores });
  const albums = useAlbumsWorkspace({ ...stores });
  const tools = useToolsWorkspace({ ...stores });
  const timelines = useTimelinesWorkspace({ ...stores });
  const navigation = useNavigationWorkspace({ ...stores });
  const statistics = useStatisticsWorkspace({ ...stores, ...catalog });
  const discovery = useDiscoveryWorkspace({ ...stores, ...catalog });
  const imports = useImportsWorkspace({ ...stores, ...catalog });
  const artists = useArtistsWorkspace({ ...stores, ...navigation, ...catalog });
  const genres = useGenresWorkspace({ ...stores, ...catalog });
  const settings = useSettingsWorkspace({ ...stores, ...catalog });
  const shell = useShellWorkspace({
    ...stores,
    ...albums,
    ...genres,
    ...tools,
  });
  const search = useSearchWorkspace({ ...stores, ...settings });
  return {
    ...stores,
    ...catalog,
    ...charts,
    ...albums,
    ...tools,
    ...timelines,
    ...navigation,
    ...statistics,
    ...discovery,
    ...imports,
    ...artists,
    ...genres,
    ...settings,
    ...shell,
    ...search,
  };
}

export type AppModel = ReturnType<typeof useAppController>;
