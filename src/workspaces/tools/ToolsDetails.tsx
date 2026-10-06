import { MusicToolDetailPanel } from "./MusicToolPanels";
import type { AppModel } from "../../app/useAppController";
export function ToolsDetails({
  model,
}: {
  model: Pick<
    AppModel,
    | "selectedTool"
    | "activeToolProgress"
    | "toolProgressStartedAt"
    | "toolExportResult"
    | "runToolExport"
  >;
}) {
  const {
    selectedTool,
    activeToolProgress,
    toolProgressStartedAt,
    toolExportResult,
    runToolExport,
  } = model;
  return (
    <MusicToolDetailPanel
      tool={selectedTool}
      progress={activeToolProgress}
      progressStartedAt={toolProgressStartedAt}
      exportResult={toolExportResult}
      onExport={runToolExport}
    />
  );
}
