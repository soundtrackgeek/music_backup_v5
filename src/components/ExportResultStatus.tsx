import { useEffect, useState } from "react";
import { Check, ClipboardCheck, Copy } from "lucide-react";

import { copyTextToClipboard } from "../backend";
import type { ExportResult } from "../types";

type ExportResultStatusProps = {
  result: ExportResult;
  itemLabel: string;
  compact?: boolean;
  summary?: string;
};

function fileName(path: string) {
  const segments = path.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] ?? path;
}

export function ExportResultStatus({
  result,
  itemLabel,
  compact = false,
  summary,
}: ExportResultStatusProps) {
  const [isCopied, setIsCopied] = useState(result.pathCopied);
  const [copyError, setCopyError] = useState(false);

  useEffect(() => {
    setIsCopied(result.pathCopied);
    setCopyError(false);
  }, [result.path, result.pathCopied]);

  async function copyAgain() {
    const copied = await copyTextToClipboard(result.path);
    setIsCopied(copied);
    setCopyError(!copied);
  }

  const countLabel =
    summary ??
    `${result.rowCount.toLocaleString()} ${itemLabel}${result.rowCount === 1 ? "" : "s"} exported`;

  return (
    <div
      className={`export-result-status${compact ? " compact" : ""}`}
      role="status"
      title={result.path}
    >
      <Check size={16} aria-hidden="true" />
      <span className="export-result-status-copy">
        <strong>{countLabel}</strong>
        <small>{fileName(result.path)}</small>
      </span>
      <button
        type="button"
        className="export-path-copy-button"
        aria-label={isCopied ? "Copy exported file path again" : "Copy exported file path"}
        title={result.path}
        onClick={() => void copyAgain()}
      >
        {isCopied ? <ClipboardCheck size={14} /> : <Copy size={14} />}
        <span>{isCopied ? "Path copied" : "Copy path"}</span>
      </button>
      {copyError ? <small className="error-message">Could not copy the path.</small> : null}
    </div>
  );
}
