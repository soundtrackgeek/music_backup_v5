import { UpdatesWorkspace } from "../UpdatesWorkspace";
import type { AppModel } from "../../app/useAppController";
export function UpdatesView({
  model,
}: {
  model: Pick<
    AppModel,
    | "catalogRefreshKey"
    | "selectedUpdate"
    | "setSelectedUpdate"
    | "openArtistFromUpdates"
  >;
}) {
  const {
    catalogRefreshKey,
    selectedUpdate,
    setSelectedUpdate,
    openArtistFromUpdates,
  } = model;
  return (
    <UpdatesWorkspace
      catalogRefreshKey={catalogRefreshKey}
      selectedUpdateId={selectedUpdate?.id ?? null}
      onSelectUpdate={setSelectedUpdate}
      onOpenArtist={openArtistFromUpdates}
    />
  );
}
