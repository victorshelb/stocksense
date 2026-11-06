function sentimentStyle(sentiment) {
  if (!sentiment) return 'text-slate-400';
  const s = sentiment.toLowerCase();
  if (s.includes('bullish') || s.includes('positive')) return 'text-emerald-400';
  if (s.includes('bearish') || s.includes('negative')) return 'text-red-400';
  return 'text-amber-400';
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  // Alpha Vantage format: 20240115T160000
  const year = dateStr.slice(0, 4);
  const month = dateStr.slice(4, 6);
  const day = dateStr.slice(6, 8);
  return new Date(`${year}-${month}-${day}`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function NewsCard({ article }) {
  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-slate-600 hover:bg-slate-800 transition-all duration-200 group"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-200 group-hover:text-white leading-snug flex-1">
          {article.title}
        </h3>
        <span className={`text-xs font-medium shrink-0 ${sentimentStyle(article.sentiment)}`}>
          {article.sentiment || 'Neutral'}
        </span>
      </div>
      {article.summary && (
        <p className="text-xs text-slate-500 mt-2 line-clamp-2 leading-relaxed">
          {article.summary}
        </p>
      )}
      <div className="flex items-center gap-2 mt-3">
        <span className="text-xs text-slate-600">{article.source}</span>
        <span className="text-slate-700">·</span>
        <span className="text-xs text-slate-600">{formatDate(article.publishedAt)}</span>
        <span className="ml-auto text-xs text-blue-500 group-hover:text-blue-300 transition">
          Read →
        </span>
      </div>
    </a>
  );
}
