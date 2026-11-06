import { useEffect, useRef, useState } from 'react';

/**
 * Lightweight TradingView mini chart (sparkline + current price).
 * Free to embed — no cost, no API limit.
 */
export default function MiniChart({ symbol, height = 160, range = '3M' }) {
  const containerRef = useRef(null);
  const [scheme, setScheme] = useState(() =>
    window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e) => setScheme(e.matches ? 'dark' : 'light');
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = '';

    const widgetDiv = document.createElement('div');
    widgetDiv.className = 'tradingview-widget-container__widget';
    widgetDiv.style.cssText = 'height:100%;width:100%';
    container.appendChild(widgetDiv);

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src =
      'https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js';
    script.async = true;
    script.innerHTML = JSON.stringify({
      symbol,
      width: '100%',
      height,
      locale: 'en',
      dateRange: range,
      colorTheme: scheme,
      trendLineColor: 'rgba(75, 70, 214, 1)',
      underLineColor: 'rgba(75, 70, 214, 0.12)',
      underLineBottomColor: 'rgba(75, 70, 214, 0)',
      isTransparent: true,
      autosize: true,
      largeChartUrl: `${window.location.origin}/stock/${symbol}`,
    });
    container.appendChild(script);

    return () => {
      container.innerHTML = '';
    };
  }, [symbol, range, scheme]);

  return (
    <div
      ref={containerRef}
      className="tradingview-widget-container w-full"
      style={{ height }}
    />
  );
}
