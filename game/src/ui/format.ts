import { locale, t } from '../i18n';
// Numbers in the player's language: compact for big figures ("4.1B", "4,1 bi"), money in US dollars.
const nf = (o: Intl.NumberFormatOptions) => new Intl.NumberFormat(locale(), o);
export const fmtInt = (n: number) => nf({ maximumFractionDigits: 0 }).format(Math.round(n));
export const fmtBig = (n: number) => nf({ notation: 'compact', maximumFractionDigits: Math.abs(n) >= 1e5 && Math.abs(n) < 1e6 ? 0 : 1 }).format(n);
export const fmtMoney = (usdMillions: number) => (usdMillions < 0 ? '−' : '') + t('fmt.money', { v: fmtBig(Math.abs(usdMillions) * 1e6) });
export const pct = (v: number) => nf({ style: 'percent', maximumFractionDigits: 0 }).format(Math.round(v * 100) === 0 ? 0 : v); // never "-0%"
