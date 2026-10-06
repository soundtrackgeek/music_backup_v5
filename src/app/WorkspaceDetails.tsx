import type { AppModel } from "./useAppController";
import { UpdatesDetails } from "../workspaces/updates/UpdatesDetails";
import { ImportsDetails } from "../workspaces/imports/ImportsDetails";
import { PlaylistsDetails } from "../workspaces/playlists/PlaylistsDetails";
import { DiscoveryDetails } from "../workspaces/discovery/DiscoveryDetails";
import { WishListDetails } from "../workspaces/wishlist/WishListDetails";
import { ChartsDetails } from "../workspaces/charts/ChartsDetails";
import { ArtistsDetails } from "../workspaces/artists/ArtistsDetails";
import { GenresDetails } from "../workspaces/genres/GenresDetails";
import { ToolsDetails } from "../workspaces/tools/ToolsDetails";
import { AlbumsDetails } from "../workspaces/albums/AlbumsDetails";
import { StatisticsDetails } from "../workspaces/statistics/StatisticsDetails";
import { SettingsDetails } from "../workspaces/settings/SettingsDetails";
import { SearchDetails } from "../workspaces/search/SearchDetails";
export function WorkspaceDetails({ model }: { model: AppModel }) {
  const { activeSection } = model;
  return activeSection === "Updates" ? (
    <UpdatesDetails model={model} />
  ) : activeSection === "Imports" ? (
    <ImportsDetails model={model} />
  ) : activeSection === "Playlists" ? (
    <PlaylistsDetails model={model} />
  ) : activeSection === "Discovery" ? (
    <DiscoveryDetails model={model} />
  ) : activeSection === "Wish List" ? (
    <WishListDetails model={model} />
  ) : activeSection === "Charts" ? (
    <ChartsDetails model={model} />
  ) : activeSection === "Artists" ? (
    <ArtistsDetails model={model} />
  ) : activeSection === "Genres" ? (
    <GenresDetails model={model} />
  ) : activeSection === "Tools" ? (
    <ToolsDetails model={model} />
  ) : activeSection === "Albums" ? (
    <AlbumsDetails model={model} />
  ) : activeSection === "Statistics" ? (
    <StatisticsDetails model={model} />
  ) : activeSection === "Settings" ? (
    <SettingsDetails model={model} />
  ) : (
    <SearchDetails model={model} />
  );
}
