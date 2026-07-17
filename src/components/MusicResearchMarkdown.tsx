import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type MusicResearchMarkdownProps = {
  markdown: string;
  onOpenUrl?: (url: string) => void;
};

function isHttpsUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export default function MusicResearchMarkdown({
  markdown,
  onOpenUrl,
}: MusicResearchMarkdownProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      skipHtml
      components={{
        a: ({ href, children }) =>
          isHttpsUrl(href) && onOpenUrl ? (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => {
                event.preventDefault();
                onOpenUrl(href);
              }}
            >
              {children}
            </a>
          ) : (
            <span>{children}</span>
          ),
        img: ({ alt }) =>
          alt ? (
            <span className="music-research-image-alt">[Image: {alt}]</span>
          ) : null,
      }}
    >
      {markdown}
    </ReactMarkdown>
  );
}
