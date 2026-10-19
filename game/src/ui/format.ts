import { locale, t } from '../i18n';
// Numbers in the player's language: compact for big figures ("4.1B", "4,1 bi"), money in US dollars.
const nf = (o: Intl.NumberFormatOptions) => new Intl.NumberFormat(locale(), o);
export const fmtInt = (n: number) => nf({ maximumFractionDigits: 0 }).format(Math.round(n));
/** one decimal, in the reader's notation (1.7 / 1,7) */
export const fmt1 = (n: number) => nf({ minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n);
/** Compact big numbers. Spanish has no short form between a thousand millions and ten thousand millions ("4100,8 M"): use "4,1 mil M" there, as Spanish does above. */
const compact = (n: number, o: Intl.NumberFormatOptions) => locale().startsWith('es') && Math.abs(n) >= 1e9 && Math.abs(n) < 1e10 ? nf({ ...o, notation: 'standard' }).format(n / 1e9) + '\u00a0mil\u00a0M' : nf({ notation: 'compact', ...o }).format(n);
export const fmtBig = (n: number) => compact(n, { maximumFractionDigits: Math.abs(n) >= 1e5 && Math.abs(n) < 1e6 ? 0 : 1 });
export const fmtMoney = (usdMillions: number) => nb((usdMillions < 0 ? '−' : '') + t('fmt.money', { v: fmtBig(Math.abs(usdMillions) * 1e6) }));
/** a sum never breaks across lines ("US$ 335,6 mi" stays together) */
const nb = (s: string) => s.replace(/ /g, '\u00a0');
/** Money to two significant figures, for tight spots like the top bar ("US$ 150 bi"). */
export const fmtMoney2 = (usdMillions: number) => nb(Math.abs(usdMillions) < 0.05 ? t('fmt.money', { v: '0' }) : (usdMillions < 0 ? '−' : '') + t('fmt.money', { v: compact(Math.abs(usdMillions) * 1e6, { maximumSignificantDigits: 2 }) })); // under $50k a month reads as zero
export const pct = (v: number) => nf({ style: 'percent', maximumFractionDigits: 0 }).format(Math.round(v * 100) === 0 ? 0 : v); // never "-0%"
/** Percent with one decimal for small shares (0.4%), whole numbers otherwise. */
export const pct1 = (v: number) => nf({ style: 'percent', maximumFractionDigits: Math.abs(v) < 0.1 ? 1 : 0 }).format(v);
/** A percentage for CSS (never localized: '50 %' or '50,5%' is not valid CSS). */
export const cssPct = (v: number) => `${+(v * 100).toFixed(3)}%`;
/** A monthly money change: its text with sign, and its tone ('' for no change, shown as a dash rather than a green +0) */
export const moneyDelta = (v: number): [string, '' | 'good' | 'bad'] => Math.abs(v) < 0.5 ? ['–', ''] : [(v > 0 ? '+' : '−') + fmtMoney(Math.abs(v)), v > 0 ? 'good' : 'bad'];
