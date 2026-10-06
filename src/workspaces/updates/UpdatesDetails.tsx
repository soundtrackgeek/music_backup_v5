import { UpdateDetailPanel } from "../UpdatesWorkspace";
import type { AppModel } from "../../app/useAppController";
export function UpdatesDetails({
  model,
}: {
  model: Pick<AppModel, "selectedUpdate" | "openArtistFromUpdates">;
}) {
  const { selectedUpdate, openArtistFromUpdates } = model;
  return (
    <UpdateDetailPanel
      update={selectedUpdate}
      onOpenArtist={openArtistFromUpdates}
    />
  );
}
