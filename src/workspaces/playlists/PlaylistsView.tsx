import { PlaylistBuilderWorkspace } from "../PlaylistBuilderWorkspace";
import type { AppModel } from "../../app/useAppController";
export function PlaylistsView({
  model,
}: {
  model: Pick<
    AppModel,
    "status" | "playlistLaunch" | "setPlaylistLaunch" | "savedPlaylistToOpen"
  >;
}) {
  const { status, playlistLaunch, setPlaylistLaunch, savedPlaylistToOpen } =
    model;
  return (
    <PlaylistBuilderWorkspace
      isAvailable={Boolean(status?.hasDatabase && status.trackCount > 0)}
      launch={playlistLaunch}
      onLaunchConsumed={() => setPlaylistLaunch(null)}
      savedPlaylistToOpen={savedPlaylistToOpen}
    />
  );
}
