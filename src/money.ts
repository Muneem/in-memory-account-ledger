export type Currency = 'AED' | 'BHD';

export const PRECISION: Readonly<Record<Currency, number>> = Object.freeze({ AED: 2, BHD: 3 });
export const INTEREST_DENOMINATOR = 2500n; // 0.04% = 1 / 2500, exactly.

/** Parse decimal text, rounding ties away from zero in the account currency. */
export function parseMoney(text: string, currency: Currency): bigint {
  if (typeof text !== 'string' || !/^-?\d+(?:\.\d+)?$/.test(text)) {
    throw new Error('Amount must be plain decimal text (no exponent, separators, or whitespace)');
  }
  const negative = text.startsWith('-');
  const [whole = '0', fraction = ''] = (negative ? text.slice(1) : text).split('.');
  const precision = PRECISION[currency];
  const scale = 10n ** BigInt(precision);
  let units = BigInt(whole) * scale + BigInt(fraction.padEnd(precision, '0').slice(0, precision));
  if (Number(fraction[precision] ?? '0') >= 5) units += 1n;
  return negative ? -units : units;
}

export function formatMoney(units: bigint, currency: Currency): string {
  const precision = PRECISION[currency];
  const scale = 10n ** BigInt(precision);
  const magnitude = units < 0n ? -units : units;
  return `${units < 0n ? '-' : ''}${magnitude / scale}.${String(magnitude % scale).padStart(precision, '0')}`;
}

export function roundRatio(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error('Denominator must be positive');
  const magnitude = numerator < 0n ? -numerator : numerator;
  const rounded = magnitude / denominator + (2n * (magnitude % denominator) >= denominator ? 1n : 0n);
  return numerator < 0n ? -rounded : rounded;
}

/** Allocate the residual to earlier installments; conserve every minor unit. */
export function splitMoney(total: bigint, count: number): readonly bigint[] {
  if (!Number.isSafeInteger(count) || count < 1 || total < BigInt(count)) {
    throw new Error('Installments must be a positive integer, each at least one minor unit');
  }
  const divisor = BigInt(count);
  return Object.freeze(Array.from({ length: count }, (_, index) =>
    total / divisor + (BigInt(index) < total % divisor ? 1n : 0n)));
}

/** Largest remainder allocation, ties by earliest day. Total rounds only once. */
export function allocateInterest(numerators: readonly bigint[]): readonly bigint[] {
  if (numerators.some(value => value < 0n)) throw new Error('Interest bases cannot be negative');
  const denominator = INTEREST_DENOMINATOR;
  const allocated = numerators.map(value => value / denominator);
  const total = roundRatio(numerators.reduce((sum, value) => sum + value, 0n), denominator);
  const residual = total - allocated.reduce((sum, value) => sum + value, 0n);
  const order = numerators.map((value, day) => ({ day, remainder: value % denominator }))
    .sort((a, b) => a.remainder === b.remainder ? a.day - b.day : a.remainder > b.remainder ? -1 : 1);
  for (let index = 0; index < Number(residual); index++) {
    const day = order[index]!.day;
    allocated[day] = allocated[day]! + 1n;
  }
  return Object.freeze(allocated);
}
