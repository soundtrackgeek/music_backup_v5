import { WishListWorkspace } from "../WishListWorkspace";
import type { AppModel } from "../../app/useAppController";
export function WishListView({ model }: { model: Pick<AppModel, never> }) {
  const {} = model;
  return <WishListWorkspace />;
}
