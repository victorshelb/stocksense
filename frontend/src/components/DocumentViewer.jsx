import { useMemo, useEffect, useRef } from 'react';

/**
 * Renders raw SEC filing text with the AI's source passages highlighted inline.
 * Each highlight is searchable/jumpable by id (doc-hl-{id}).
 */

const SENTIMENT_MARK = {
  positive: 'bg-emerald-500/25 border-b-2 border-emerald-500 text-emerald-100',
  negative: 'bg-red-500/25 border-b-2 border-red-500 text-red-100',
  neutral:  'bg-amber-500/25 border-b-2 border-amber-500 text-amber-100',
};

// Build text segments with highlight ranges located via fuzzy anchor matching
function buildSegments(text, highlights) {
  const ranges = [];

  highlights.forEach((h) => {
    const cleaned = (h.quote || '')
      .replace(/^["'""]+|["'""]+$/g, '')
      .replace(/\.\.\.$/, '')
      .trim();

    const words = cleaned.split(/\s+/).filter(Boolean).slice(0, 14);
    if (words.length < 4) return;

    // Flexible regex — tolerate whitespace/newline differences between AI quote and source
    const pattern = words
      .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('\\s+');

    let re;
    try { re = new RegExp(pattern, 'i'); } catch { return; }
    const m = re.exec(text);
    if (m) ranges.push({ start: m.index, end: m.index + m[0].length, id: h.id, sentiment: h.sentiment, impact: h.impact });
  });

  // Sort and drop overlaps
  ranges.sort((a, b) => a.start - b.start);
  const clean = [];
  let lastEnd = -1;
  for (const r of ranges) {
    if (r.start >= lastEnd) { clean.push(r); lastEnd = r.end; }
  }

  // Build node list
  const nodes = [];
  let cursor = 0;
  clean.forEach((r, i) => {
    if (r.start > cursor) nodes.push({ type: 'text', text: text.slice(cursor, r.start), key: `t${i}` });
    nodes.push({ type: 'mark', text: text.slice(r.start, r.end), id: r.id, sentiment: r.sentiment, impact: r.impact, key: `m${i}` });
    cursor = r.end;
  });
  if (cursor < text.length) nodes.push({ type: 'text', text: text.slice(cursor), key: 'tail' });

  return { nodes, matchedCount: clean.length };
}

export default function DocumentViewer({ docText, highlights, activeId, filing }) {
  const containerRef = useRef(null);

  const { nodes, matchedCount } = useMemo(
    () => buildSegments(docText || '', highlights || []),
    [docText, highlights]
  );

  // Scroll to the active highlight when it changes
  useEffect(() => {
    if (activeId == null) return;
    const el = document.getElementById(`doc-hl-${activeId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-blue-400', 'rounded');
      const t = setTimeout(() => el.classList.remove('ring-2', 'ring-blue-400', 'rounded'), 2000);
      return () => clearTimeout(t);
    }
  }, [activeId]);

  if (!docText) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center">
        <p className="text-slate-400 text-sm">Document text could not be extracted.</p>
        <a href={filing?.docUrl} target="_blank" rel="noopener noreferrer"
          className="inline-block mt-3 text-sm text-blue-400 hover:underline">
          ↓ Download the original filing ↗
        </a>
      </div>
    );
  }

  return (
    <div>
      {/* Legend */}
      <div className="flex items-center gap-4 mb-4 flex-wrap text-xs">
        <span className="text-slate-500">
          {matchedCount} of {highlights.length} insights located in document
        </span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-500/40 border-b-2 border-emerald-500 inline-block" /> Positive</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-500/40 border-b-2 border-red-500 inline-block" /> Negative</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-500/40 border-b-2 border-amber-500 inline-block" /> Neutral</span>
      </div>

      {/* Document body */}
      <div
        ref={containerRef}
        className="bg-slate-950 border border-slate-800 rounded-2xl p-5 sm:p-7 max-h-[70vh] overflow-y-auto"
      >
        <p className="text-slate-300 text-sm leading-7 whitespace-pre-wrap font-serif">
          {nodes.map((n) =>
            n.type === 'mark' ? (
              <mark
                key={n.key}
                id={`doc-hl-${n.id}`}
                className={`px-0.5 rounded-sm cursor-pointer scroll-mt-24 ${SENTIMENT_MARK[n.sentiment] || SENTIMENT_MARK.neutral}`}
                title={n.impact}
              >
                {n.text}
              </mark>
            ) : (
              <span key={n.key}>{n.text}</span>
            )
          )}
        </p>
      </div>

      <p className="text-xs text-slate-600 mt-3 text-center">
        Source: SEC EDGAR · text extracted from the official {filing?.form} filing ·{' '}
        <a href={filing?.docUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
          view original ↗
        </a>
      </p>
    </div>
  );
}
