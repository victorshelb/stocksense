import { useNavigate } from 'react-router-dom';
import StockLogo from './StockLogo.jsx';

function formatPrice(price, ccy = '$') {
  const num = parseFloat(price);
  return isNaN(num) ? '—' : `${ccy}${num.toFixed(num < 1 ? 4 : 2)}`;
}

function parseChange(change) {
  if (!change) return { text: '—', positive: null, raw: 0 };
  const str = String(change).replace('%', '');
  const val = parseFloat(str);
  return {
    text: `${val >= 0 ? '+' : ''}${val.toFixed(2)}%`,
    positive: val >= 0,
    raw: val,
  };
}

// Conservative security-type hint — only flag unambiguous cases so we never
// mislabel ordinary tickers (e.g. SNOW is not a "Warrant", MU is not a "Unit").
function getSecurityType(ticker) {
  if (!ticker) return null;
  const t = String(ticker).toUpperCase();
  if (/\.WS$/.test(t)) return 'Warrant';
  if (/\.U$/.test(t)) return 'Unit';
  if (/\.(PR|P)[A-Z]?$/.test(t) || /\+$/.test(t)) return 'Preferred';
  if (/\.R$/.test(t)) return 'Rights';
  // Warrant convention: a 5+ character symbol whose final letter is W (e.g. GCLWW)
  if (/^[A-Z]{4,}W$/.test(t)) return 'Warrant';
  return null;
}

export default function StockCard({ stock, listType, index = 0 }) {
  const navigate = useNavigate();
  const change = parseChange(stock.change_percentage);
  const secType = getSecurityType(stock.ticker);
  const up = change.positive;

  function handleClick() {
    const params = new URLSearchParams();
    if (listType) params.set('from', listType); // 'gainers' | 'losers' | 'active'
    if (stock.change_percentage) params.set('change', stock.change_percentage);
    if (stock.price) params.set('price', stock.price);
    if (stock.market) params.set('market', stock.market); // e.g. 'ngx'
    navigate(`/stock/${stock.ticker}?${params.toString()}`);
  }

  return (
    <div
      onClick={handleClick}
      style={{ animationDelay: `${(index % 10) * 45}ms` }}
      className="animate-rise cursor-pointer group relative bg-slate-900 border border-slate-800 rounded-xl p-4
                 hover:-translate-y-1 hover:border-blue-500/50 hover:shadow-xl hover:shadow-black/25
                 transition-[transform,border-color,box-shadow] duration-300 ease-out overflow-hidden"
    >
      {/* accent line that grows on hover — up=gain colour, down=loss colour */}
      <span
        className={`absolute left-0 top-0 h-full w-[3px] origin-top scale-y-0 group-hover:scale-y-100 transition-transform duration-300 ${
          up === null ? 'bg-slate-600' : up ? 'bg-emerald-500' : 'bg-red-500'
        }`}
      />

      {/* Top row — logo + ticker + change badge */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <StockLogo symbol={stock.ticker} name={stock.name} size={36} />
          <div className="min-w-0">
            <span className="text-base font-bold text-white group-hover:text-blue-300 transition-colors block truncate">
              {stock.ticker}
            </span>
            {stock.name && (
              <p className="text-xs text-slate-500 truncate">{stock.name}</p>
            )}
            {secType && <span className="text-[10px] text-amber-500 font-semibold uppercase tracking-wide">{secType}</span>}
          </div>
        </div>
        {up === null ? (
          <span className="text-xs font-semibold px-2 py-1 rounded-full shrink-0 bg-slate-800 text-slate-400">—</span>
        ) : (
          <span
            className={`text-xs font-bold px-2 py-1 rounded-full shrink-0 ${
              up ? 'bg-emerald-900/60 text-emerald-400' : 'bg-red-900/60 text-red-400'
            }`}
          >
            {up ? '▲' : '▼'} {change.text}
          </span>
        )}
      </div>

      {/* Price */}
      <div className="mt-3">
        <span className="text-2xl font-bold text-white tabular-nums">{formatPrice(stock.price, stock.market === 'ngx' ? '₦' : '$')}</span>
      </div>

      <p className="mt-3 text-xs text-slate-500 group-hover:text-blue-400 transition-colors flex items-center gap-1">
        View AI Analysis
        <span className="inline-block transition-transform duration-300 group-hover:translate-x-1">→</span>
      </p>
    </div>
  );
}
