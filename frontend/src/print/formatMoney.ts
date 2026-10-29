import type { DecimalString } from '../types/nalog';

/**
 * DISPLAY ONLY. Turns "7462.92" into "7.462,92" by moving characters around.
 * It never converts to a number, so it cannot introduce a rounding error (RULE A).
 */
export function formatMoney(value: DecimalString): string {
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!m) return value;                                   // unknown shape: show as-is, never guess
  const [, sign, whole, frac = ''] = m;
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}${grouped},${frac.padEnd(2, '0')}`;
}

/** "0.2000" -> "20%" (string maths on a fixed 4-decimal rate, no floats). */
export function formatRate(rate: DecimalString): string {
  const m = /^0\.(\d{1,4})$/.exec(rate);
  if (!m) return rate;
  const digits = m[1].padEnd(4, '0');                     // "2000"
  const pct = digits.slice(0, 2).replace(/^0/, '');       // "20"
  const rest = digits.slice(2).replace(/0+$/, '');        // "" or "5" for 20.5%
  return `${pct || '0'}${rest ? ',' + rest : ''}%`;
}
