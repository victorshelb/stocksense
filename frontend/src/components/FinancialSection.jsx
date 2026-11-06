import { useState } from 'react';
import FinancialsModal from './FinancialsModal.jsx';

/* ── Number formatter ──────────────────────────────────────────────────── */
function Cell({ value, baseline }) {
  if (value === null || value === undefined) return <td className="px-3 py-2 text-center text-slate-600 text-xs">—</td>;

  // Colour vs baseline (first column = most recent)
  let color = 'text-slate-300';
  if (baseline !== undefined && baseline !== null && value !== null) {
    color = value >= baseline ? 'text-emerald-400' : 'text-red-400';
  }

  // Format the number
  let display = value;
  if (typeof value === 'number') {
    const abs = Math.abs(value);
    if (abs >= 1e12) display = `$${(value / 1e12).toFixed(2)}T`;
    else if (abs >= 1e9)  display = `$${(value / 1e9).toFixed(2)}B`;
    else if (abs >= 1e6)  display = `$${(value / 1e6).toFixed(2)}M`;
    else if (abs >= 1e3)  display = `$${(value / 1e3).toFixed(1)}K`;
    else display = `$${value.toFixed(2)}`;
  }

  return <td className={`px-3 py-2 text-right text-xs font-mono font-semibold ${color}`}>{display}</td>;
}

/* ── Generic financial table ───────────────────────────────────────────── */
function FinancialTable({ rows, data }) {
  if (!data?.length) {
    return <p className="text-slate-500 text-sm px-4 py-4">No data available.</p>;
  }

  // Columns = dates (most recent first)
  const columns = data.map(d => d.date).filter(Boolean);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[400px]">
        <thead>
          <tr className="border-b border-slate-800">
            <th className="px-3 py-2 text-left text-xs text-slate-500 font-semibold uppercase tracking-wide w-44">Metric</th>
            {columns.map(col => (
              <th key={col} className="px-3 py-2 text-right text-xs text-slate-500 font-semibold">{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ label, key, pctKey }) => (
            <tr key={key} className="border-b border-slate-900 hover:bg-slate-800/30 transition">
              <td className="px-3 py-2 text-xs text-slate-400 font-medium">{label}</td>
              {data.map((period, i) => {
                const val      = period[key];
                const fmtVal   = period[key + 'Fmt'];
                const baseline = i === 0 ? undefined : data[i - 1][key];

                if (fmtVal) return (
                  <td key={i} className={`px-3 py-2 text-right text-xs font-mono font-semibold ${val !== null && data[0][key] !== null ? (val >= data[0][key] ? 'text-emerald-400' : 'text-red-400') : 'text-slate-300'}`}>
                    {fmtVal}
                  </td>
                );
                return <Cell key={i} value={val} baseline={baseline} />;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Section definitions ───────────────────────────────────────────────── */
const INCOME_ROWS = [
  { label: 'Revenue',          key: 'revenue',         pctKey: null },
  { label: 'Gross Profit',     key: 'grossProfit',     pctKey: 'grossMargin' },
  { label: 'Operating Income', key: 'operatingIncome', pctKey: null },
  { label: 'Net Income',       key: 'netIncome',       pctKey: 'netMargin' },
  { label: 'EBITDA',           key: 'ebitda',          pctKey: null },
  { label: 'EPS (diluted)',     key: 'eps',             pctKey: null },
];

const BALANCE_ROWS = [
  { label: 'Total Assets',      key: 'totalAssets',     pctKey: null },
  { label: 'Total Liabilities', key: 'totalLiabilities',pctKey: null },
  { label: 'Shareholders Equity',key:'totalEquity',     pctKey: null },
  { label: 'Cash & Equivalents',key: 'cash',            pctKey: null },
  { label: 'Long-Term Debt',    key: 'longTermDebt',    pctKey: null },
  { label: 'Debt/Equity Ratio', key: 'debtToEquity',    pctKey: null },
];

const CASHFLOW_ROWS = [
  { label: 'Operating Cash Flow',key:'operatingCF',   pctKey: null },
  { label: 'Investing Cash Flow',key:'investingCF',   pctKey: null },
  { label: 'Financing Cash Flow',key:'financingCF',   pctKey: null },
  { label: 'Free Cash Flow',     key:'freeCashFlow',  pctKey: null },
  { label: 'Capital Expenditure',key:'capex',         pctKey: null },
];

/* ── Main component ────────────────────────────────────────────────────── */
export default function FinancialSection({ title, icon, section, annualData, quarterlyData, metrics, symbol, companyName }) {
  const [open, setOpen]         = useState(false);
  const [tab, setTab]           = useState('annual');
  const [modalOpen, setModalOpen] = useState(false);

  const rows = {
    incomeStatement: INCOME_ROWS,
    balanceSheet:    BALANCE_ROWS,
    cashFlow:        CASHFLOW_ROWS,
  }[section] || [];

  const currentData = tab === 'annual' ? annualData : quarterlyData;
  const hasData = (annualData?.length || 0) + (quarterlyData?.length || 0) > 0;

  return (
    <>
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        {/* Section header — click to expand */}
        <button
          onClick={() => setOpen(v => !v)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-800/50 transition"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">{icon}</span>
            <div className="text-left">
              <p className="text-sm font-bold text-white">{title}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {hasData ? `${annualData?.length || 0} annual · ${quarterlyData?.length || 0} quarterly periods` : 'No data available'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {hasData && (
              <button
                onClick={e => { e.stopPropagation(); setModalOpen(true); setOpen(true); }}
                className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white font-medium px-3 py-1.5 rounded-lg transition"
              >
                🤖 AI Breakdown
              </button>
            )}
            <span className="text-slate-500 text-sm">{open ? '▲' : '▼'}</span>
          </div>
        </button>

        {/* Expanded content */}
        {open && (
          <div className="border-t border-slate-800">
            {/* Tab switcher */}
            {(annualData?.length > 0 || quarterlyData?.length > 0) && (
              <div className="flex gap-1 px-4 py-3 border-b border-slate-800">
                {[['annual', 'Annual'], ['quarterly', 'Quarterly']].map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setTab(val)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition ${tab === val ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white bg-slate-800'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {/* Table */}
            <FinancialTable rows={rows} data={currentData} />

            {/* Gross/Net margin rows */}
            {section === 'incomeStatement' && currentData?.length > 0 && (
              <div className="flex flex-wrap gap-3 px-4 py-3 border-t border-slate-800">
                {currentData[0]?.grossMargin && (
                  <div className="text-xs text-slate-500">
                    Gross Margin (latest): <span className="text-emerald-400 font-semibold">{currentData[0].grossMargin}</span>
                  </div>
                )}
                {currentData[0]?.netMargin && (
                  <div className="text-xs text-slate-500">
                    Net Margin (latest): <span className="text-emerald-400 font-semibold">{currentData[0].netMargin}</span>
                  </div>
                )}
              </div>
            )}

            {!hasData && (
              <p className="text-slate-500 text-sm text-center py-6">
                Financial data not available for this stock.
              </p>
            )}
          </div>
        )}
      </div>

      {/* AI breakdown modal */}
      {modalOpen && (
        <FinancialsModal
          symbol={symbol}
          companyName={companyName}
          section={section}
          sectionLabel={title}
          annualData={annualData}
          quarterlyData={quarterlyData}
          metrics={metrics}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}
