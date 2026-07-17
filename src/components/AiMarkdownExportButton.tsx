import { useEffect, useState } from "react";
import { Check, Download } from "lucide-react";

import { exportAiMarkdown } from "../backend";
import type { ExportResult } from "../types";
import { ExportResultStatus } from "./ExportResultStatus";

type AiMarkdownExportButtonProps = {
  title: string;
  markdown: string;
  disabled?: boolean;
  compact?: boolean;
};

export function AiMarkdownExportButton({
  title,
  markdown,
  disabled = false,
  compact = false,
}: AiMarkdownExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setResult(null);
    setError(null);
  }, [markdown, title]);

  async function runExport() {
    if (disabled || isExporting || !markdown.trim()) return;
    setIsExporting(true);
    setError(null);
    try {
      setResult(await exportAiMarkdown({ title, markdown }));
    } catch (exportError) {
      setError(
        exportError instanceof Error ? exportError.message : String(exportError),
      );
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className={`ai-markdown-export${compact ? " compact" : ""}`}>
      <button
        className="secondary-button"
        type="button"
        disabled={disabled || isExporting || !markdown.trim()}
        title={result?.path ?? "Export this AI result as Markdown"}
        onClick={() => void runExport()}
      >
        {result ? <Check size={15} /> : <Download size={15} />}
        <span>
          {isExporting ? "Exporting" : result ? "Exported MD" : "Export Markdown"}
        </span>
      </button>
      {result ? (
        <ExportResultStatus
          result={result}
          itemLabel="line"
          summary="Markdown exported"
          compact={compact}
        />
      ) : null}
      {error ? <small className="error-message">{error}</small> : null}
    </div>
  );
}
