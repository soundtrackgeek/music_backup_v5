import type { WorkspaceStores } from "../../app/WorkspaceStoresProvider";
import type { useCatalogWorkspace } from "../../app/useCatalogWorkspace";
type Inputs = Pick<
  WorkspaceStores,
  "setIsStatsLoading" | "setStatsError" | "statistics"
> &
  Pick<ReturnType<typeof useCatalogWorkspace>, "loadData">;

export function useStatisticsWorkspace({
  setIsStatsLoading,
  setStatsError,
  statistics,
  loadData,
}: Inputs) {
  async function refreshStatistics() {
    setIsStatsLoading(true);
    setStatsError(null);
    try {
      await loadData();
    } catch (error) {
      setStatsError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsStatsLoading(false);
    }
  }

  const ratingAlbumTotal =
    (statistics?.ratingProgress.fullyRatedAlbums ?? 0) +
    (statistics?.ratingProgress.partiallyRatedAlbums ?? 0) +
    (statistics?.ratingProgress.unratedAlbums ?? 0);

  const ratingTrackTotal =
    (statistics?.ratingProgress.ratedTracks ?? 0) +
    (statistics?.ratingProgress.unratedTracks ?? 0);
  return { refreshStatistics, ratingAlbumTotal, ratingTrackTotal };
}
