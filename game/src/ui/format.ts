export const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US');
export function fmtBig(n: number) { const a = Math.abs(n); if (a >= 1e12) return (n / 1e12).toFixed(2) + 'T'; if (a >= 1e9) return (n / 1e9).toFixed(a >= 1e11 ? 0 : 1) + 'B'; if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e8 ? 0 : 1) + 'M'; if (a >= 1e3) return (n / 1e3).toFixed(a >= 1e5 ? 0 : 1) + 'k'; return String(Math.round(n)); }
export const fmtMoney = (usdMillions: number) => '$' + fmtBig(usdMillions * 1e6);
export const pct = (v: number) => Math.round(v * 100) + '%';
