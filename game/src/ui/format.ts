import { locale, t } from '../i18n';
// Numbers in the player's language: compact for big figures ("4.1B", "4,1 bi"), money in US dollars.
const nf = (o: Intl.NumberFormatOptions) => new Intl.NumberFormat(locale(), o);
export const fmtInt = (n: number) => nf({ maximumFractionDigits: 0 }).format(Math.round(n));
/** Compact big numbers. Spanish has no short form between a thousand millions and ten thousand millions ("4100,8 M"): use "4,1 mil M" there, as Spanish does above. */
const compact = (n: number, o: Intl.NumberFormatOptions) => locale().startsWith('es') && Math.abs(n) >= 1e9 && Math.abs(n) < 1e10 ? nf({ ...o, notation: 'standard' }).format(n / 1e9) + '\u00a0mil\u00a0M' : nf({ notation: 'compact', ...o }).format(n);
export const fmtBig = (n: number) => compact(n, { maximumFractionDigits: Math.abs(n) >= 1e5 && Math.abs(n) < 1e6 ? 0 : 1 });
export const fmtMoney = (usdMillions: number) => (usdMillions < 0 ? '−' : '') + t('fmt.money', { v: fmtBig(Math.abs(usdMillions) * 1e6) });
/** Money to two significant figures, for tight spots like the top bar ("US$ 150 bi"). */
export const fmtMoney2 = (usdMillions: number) => (usdMillions < 0 ? '−' : '') + t('fmt.money', { v: compact(Math.abs(usdMillions) * 1e6, { maximumSignificantDigits: 2 }) });
export const pct = (v: number) => nf({ style: 'percent', maximumFractionDigits: 0 }).format(Math.round(v * 100) === 0 ? 0 : v); // never "-0%"
/** Percent with one decimal for small shares (0.4%), whole numbers otherwise. */
export const pct1 = (v: number) => nf({ style: 'percent', maximumFractionDigits: Math.abs(v) < 0.1 ? 1 : 0 }).format(v);
/** A percentage for CSS (never localized: '50 %' or '50,5%' is not valid CSS). */
export const cssPct = (v: number) => `${+(v * 100).toFixed(3)}%`;
