import { CheckCircle, AlertTriangle } from 'lucide-react';

const FIT_CONFIG = {
  strong_match:     { label: 'Strong Match',     bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  good_match:       { label: 'Good Match',        bg: 'bg-blue-500/20',    text: 'text-blue-400',    border: 'border-blue-500/30'    },
  worth_exploring:  { label: 'Worth Exploring',   bg: 'bg-amber-500/20',   text: 'text-amber-400',   border: 'border-amber-500/30'   },
};

const BUDGET_FIT_CONFIG = {
  within_range: { label: 'Within Budget',  color: 'text-emerald-400' },
  stretch:      { label: 'Stretch',        color: 'text-amber-400'   },
  over_budget:  { label: 'Over Budget',    color: 'text-red-400'     },
};

function humanizeFieldName(fieldName) {
  if (!fieldName) return fieldName;
  // camelCase → "Camel Case"
  return fieldName
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, s => s.toUpperCase())
    .trim();
}

function formatCurrency(amount) {
  if (amount == null) return null;
  return `$${Number(amount).toLocaleString()}`;
}

export default function SchoolAnalysisCard({ analysis }) {
  if (!analysis) return null;

  const { fitLabel, tradeOffs, dataGaps, financialSummary } = analysis;

  const fitConfig = fitLabel ? FIT_CONFIG[fitLabel] : null;

  // Deduplicate by dimension, then filter trade-offs that have at least one non-null value
  const uniqueTradeOffs = tradeOffs?.filter((t, i, arr) => arr.findIndex(x => x.dimension === t.dimension) === i) || [];
  const validTradeOffs = uniqueTradeOffs.filter(t => t && (t.strength || t.concern));

  const validDataGaps = Array.isArray(dataGaps) && dataGaps.length > 0 ? dataGaps : null;

  const hasFinancial = financialSummary && (financialSummary.tuition != null || financialSummary.budgetFit);
  const budgetFitConfig = financialSummary?.budgetFit ? BUDGET_FIT_CONFIG[financialSummary.budgetFit] : null;

  // If nothing to show at all, don't render
  if (!fitConfig && validTradeOffs.length === 0 && !validDataGaps && !hasFinancial) return null;

  return (
    <div className="mt-2 rounded-xl border border-white/10 bg-[#1A1A2A] overflow-hidden text-sm">

      {/* Header: Fit Badge */}
      {fitConfig && (
        <div className={`px-4 py-3 flex items-center gap-2 border-b border-white/10 ${fitConfig.bg}`}>
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${fitConfig.bg} ${fitConfig.text} ${fitConfig.border}`}>
            {fitConfig.label}
          </span>
          <span className="text-white/40 text-xs">Fit Assessment</span>
        </div>
      )}

      <div className="px-4 py-3 space-y-4">

        {/* Trade-offs — always shown */}
        <div>
          <p className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">Trade-offs</p>
          {validTradeOffs.length > 0 ? (
            <div className="space-y-2">
              {validTradeOffs.map((item, i) => (
                <div key={i} className="space-y-1">
                  {item.strength && (
                    <div className="flex items-start gap-2">
                      <CheckCircle className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                      <span className="text-white/80 leading-snug">
                        <span className="text-white/50 font-medium">{item.dimension}: </span>
                        {item.strength}
                      </span>
                    </div>
                  )}
                  {item.concern && (
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                      <span className="text-white/80 leading-snug">
                        <span className="text-white/50 font-medium">{item.dimension}: </span>
                        {item.concern}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-white/30 italic">Trade-off analysis will appear after deeper exploration.</p>
          )}
        </div>

        {/* Financial Summary */}
        {hasFinancial && (
          <div>
            <p className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">Financial</p>
            <div className="flex items-center gap-4">
              {financialSummary.tuition != null && (
                <div>
                  <span className="text-white/40 text-xs">Tuition</span>
                  <p className="text-white/90 font-medium">{formatCurrency(financialSummary.tuition)}</p>
                </div>
              )}
              {budgetFitConfig && (
                <div>
                  <span className="text-white/40 text-xs">Budget Fit</span>
                  <p className={`font-medium ${budgetFitConfig.color}`}>{budgetFitConfig.label}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Data Gaps */}
        {validDataGaps && (
          <div>
            <p className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">Unconfirmed Data</p>
            <div className="flex flex-wrap gap-1.5">
              {validDataGaps.map((gap, i) => (
                <span key={i} className="px-2 py-0.5 rounded-full text-xs bg-white/5 text-white/40 border border-white/10">
                  {humanizeFieldName(gap)}
                </span>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}