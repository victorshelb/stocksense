import { useEffect, useRef, useState } from 'react';

// Follow the device light/dark preference (the app has no manual toggle).
function usePrefScheme() {
  const [scheme, setScheme] = useState(() =>
    window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e) => setScheme(e.matches ? 'dark' : 'light');
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  return scheme;
}

// Maps Alpha Vantage exchange names → TradingView exchange prefixes
const AV_TO_TV_EXCHANGE = {
  NASDAQ: 'NASDAQ',
  NYSE: 'NYSE',
  'NYSE ARCA': 'AMEX',
  AMEX: 'AMEX',
  TSX: 'TSX',
  LSE: 'LSE',
};

function getTVSymbol(symbol, exchange, market) {
  // Nigerian Exchange — TradingView uses the NSENG prefix
  if (market === 'ngx') return `NSENG:${symbol}`;
  // Warrants / units / OTC — just pass symbol; TradingView resolves them
  if (!exchange) return symbol;
  const tv = AV_TO_TV_EXCHANGE[exchange];
  return tv ? `${tv}:${symbol}` : symbol;
}

export default function TradingViewChart({ symbol, exchange, market, height = 440 }) {
  const containerRef = useRef(null);
  const tvSymbol = getTVSymbol(symbol, exchange, market);
  const scheme = usePrefScheme();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Wipe previous widget
    container.innerHTML = '';

    // TradingView requires a wrapper div before the script
    const widgetDiv = document.createElement('div');
    widgetDiv.className = 'tradingview-widget-container__widget';
    widgetDiv.style.cssText = 'height:100%;width:100%';
    container.appendChild(widgetDiv);

    // Config is passed as the script's inline text (TradingView's documented embed format)
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src =
      'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: tvSymbol,
      interval: 'D',
      timezone: 'America/New_York',
      theme: scheme,
      style: '1',
      locale: 'en',
      gridColor: scheme === 'dark' ? 'rgba(30, 41, 59, 0.8)' : 'rgba(231, 224, 208, 0.9)',
      enable_publishing: false,
      hide_side_toolbar: false,
      allow_symbol_change: false,
      save_image: false,
      calendar: false,
      support_host: 'https://www.tradingview.com',
    });

    container.appendChild(script);

    return () => {
      container.innerHTML = '';
    };
  }, [tvSymbol, scheme]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden mb-8">
      <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base font-bold text-white">{symbol}</span>
          <span className="text-xs text-slate-500">Price Chart</span>
        </div>
        <a
          href={`https://www.tradingview.com/chart/?symbol=${tvSymbol}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-slate-500 hover:text-blue-400 transition"
        >
          Open in TradingView ↗
        </a>
      </div>
      <div
        ref={containerRef}
        className="tradingview-widget-container"
        style={{ height }}
      />
    </div>
  );
}
