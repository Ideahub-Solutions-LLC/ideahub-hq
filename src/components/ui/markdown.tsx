import type { ReactNode } from "react";

/**
 * Minimal, dependency-free renderer for the subset of Markdown our employees produce:
 * headings (#, ##), bullet lists (-, •, *), bold (**x**), italics (_x_), inline code (`x`).
 * Text is rendered as React nodes — never as raw HTML — so model output cannot inject markup.
 */
export function Markdown({ text, className = "" }: { text: string; className?: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.split(/\r?\n/);
  let list: ReactNode[] = [];
  const flushList = () => {
    if (list.length) {
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="my-1.5 list-disc space-y-0.5 pl-5">
          {list}
        </ul>,
      );
      list = [];
    }
  };
  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*(?:[-*•]\s+)(.*)$/);
    if (bullet) {
      list.push(<li key={i}>{inline(bullet[1])}</li>);
      return;
    }
    flushList();
    if (!line.trim()) return;
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      blocks.push(
        <p key={i} className={`font-semibold ${h[1].length === 1 ? "text-base" : "text-sm"} mt-2`}>
          {inline(h[2])}
        </p>,
      );
      return;
    }
    if (line.trim() === "---") {
      blocks.push(<hr key={i} className="my-2 border-line" />);
      return;
    }
    blocks.push(
      <p key={i} className="my-1">
        {inline(line)}
      </p>,
    );
  });
  flushList();
  return <div className={`text-sm leading-relaxed ${className}`}>{blocks}</div>;
}

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|_[^_]+_)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) out.push(<strong key={k++}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) out.push(<code key={k++} className="rounded bg-surface-2 px-1 font-mono text-xs">{tok.slice(1, -1)}</code>);
    else out.push(<em key={k++} className="text-ink-2">{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
