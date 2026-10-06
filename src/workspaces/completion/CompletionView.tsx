import { LibraryCompletionWorkspace } from "../LibraryCompletionWorkspace";
import type { AppModel } from "../../app/useAppController";
export function CompletionView({
  model,
}: {
  model: Pick<AppModel, "setActiveSection">;
}) {
  const { setActiveSection } = model;
  return (
    <LibraryCompletionWorkspace
      onOpenWishList={() => setActiveSection("Wish List")}
    />
  );
}
