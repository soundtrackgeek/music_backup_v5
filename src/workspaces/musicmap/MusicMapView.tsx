import { MusicMapWorkspace } from "../MusicMapWorkspace";
import type { AppModel } from "../../app/useAppController";
export function MusicMapView({
  model,
}: {
  model: Pick<AppModel, "openArtistFromMusicMap">;
}) {
  const { openArtistFromMusicMap } = model;
  return <MusicMapWorkspace onOpenArtist={openArtistFromMusicMap} />;
}
