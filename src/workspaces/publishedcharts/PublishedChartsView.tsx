import { PublishedChartsWorkspace } from "../PublishedChartsWorkspace";
import type { AppModel } from "../../app/useAppController";
export function PublishedChartsView({
  model,
}: {
  model: Pick<AppModel, never>;
}) {
  const {} = model;
  return <PublishedChartsWorkspace />;
}
