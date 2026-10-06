import type { AppModel } from "./useAppController";
import { TimelinesView } from "../workspaces/timelines/TimelinesView";
import { UpdatesView } from "../workspaces/updates/UpdatesView";
import { ImportsView } from "../workspaces/imports/ImportsView";
import { PublishedChartsView } from "../workspaces/publishedcharts/PublishedChartsView";
import { ChartsView } from "../workspaces/charts/ChartsView";
import { PlaylistsView } from "../workspaces/playlists/PlaylistsView";
import { DiscoveryView } from "../workspaces/discovery/DiscoveryView";
import { MusicMapView } from "../workspaces/musicmap/MusicMapView";
import { CompletionView } from "../workspaces/completion/CompletionView";
import { WishListView } from "../workspaces/wishlist/WishListView";
import { ArtistsView } from "../workspaces/artists/ArtistsView";
import { GenresView } from "../workspaces/genres/GenresView";
import { ToolsView } from "../workspaces/tools/ToolsView";
import { AlbumsView } from "../workspaces/albums/AlbumsView";
import { StatisticsView } from "../workspaces/statistics/StatisticsView";
import { SettingsView } from "../workspaces/settings/SettingsView";
import { SearchView } from "../workspaces/search/SearchView";
export function WorkspaceRouter({ model }: { model: AppModel }) {
  const { activeSection } = model;
  return activeSection === "Timelines" ? (
    <TimelinesView model={model} />
  ) : activeSection === "Updates" ? (
    <UpdatesView model={model} />
  ) : activeSection === "Imports" ? (
    <ImportsView model={model} />
  ) : activeSection === "Published Charts" ? (
    <PublishedChartsView model={model} />
  ) : activeSection === "Charts" ? (
    <ChartsView model={model} />
  ) : activeSection === "Playlists" ? (
    <PlaylistsView model={model} />
  ) : activeSection === "Discovery" ? (
    <DiscoveryView model={model} />
  ) : activeSection === "Music Map" ? (
    <MusicMapView model={model} />
  ) : activeSection === "Completion" ? (
    <CompletionView model={model} />
  ) : activeSection === "Wish List" ? (
    <WishListView model={model} />
  ) : activeSection === "Artists" ? (
    <ArtistsView model={model} />
  ) : activeSection === "Genres" ? (
    <GenresView model={model} />
  ) : activeSection === "Tools" ? (
    <ToolsView model={model} />
  ) : activeSection === "Albums" ? (
    <AlbumsView model={model} />
  ) : activeSection === "Statistics" ? (
    <StatisticsView model={model} />
  ) : activeSection === "Settings" ? (
    <SettingsView model={model} />
  ) : (
    <SearchView model={model} />
  );
}
