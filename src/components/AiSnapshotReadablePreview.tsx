import { lazy, Suspense } from "react";

const MusicResearchMarkdown = lazy(() => import("./MusicResearchMarkdown"));

type AiSnapshotReadablePreviewProps = {
  markdown: string;
};

export function AiSnapshotReadablePreview({
  markdown,
}: AiSnapshotReadablePreviewProps) {
  return (
    <section className="ai-snapshot-readable" aria-label="Readable saved snapshot">
      <Suspense fallback={<p>Opening saved snapshot…</p>}>
        <div className="music-research-markdown">
          <MusicResearchMarkdown markdown={markdown} />
        </div>
      </Suspense>
    </section>
  );
}
