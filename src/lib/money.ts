const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** 4000 → "R$ 40,00" (with a regular space, safe for Telegram). */
export function formatBRL(cents: number): string {
  return brl.format(cents / 100).replace(/\u00a0/g, " ");
}

const CURRENCY_WORDS = /\b(reais|real|contos?|pilas?|mangos?|paus?|r\$)|r\$/gi;

/**
 * Parses an amount written the Brazilian way into cents.
 * "40" → 4000, "23,50" → 2350, "R$ 1.234,56" → 123456, "150 conto" → 15000, "2 mil" → 200000.
 * Returns null when the text isn't a single positive amount.
 */
export function parseBRL(input: string): number | null {
  let text = input.toLowerCase().replace(CURRENCY_WORDS, " ").trim();

  let multiplier = 1;
  const suffix = /^(.*?)\s*(mil|k)$/.exec(text);
  if (suffix) {
    text = suffix[1]!.trim();
    multiplier = 1000;
  }

  const cents = parseDecimalCents(text);
  if (cents === null || cents <= 0) return null;
  return cents * multiplier;
}

/** Exact decimal → cents, without floating point. */
function parseDecimalCents(text: string): number | null {
  const normalized = normalizeSeparators(text);
  if (normalized === null) return null;
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) return null;
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? "0").padEnd(2, "0"));
  const cents = whole * 100 + fraction;
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Converts "1.234,56" / "1,234.56" / "23,5" / "1.500" into "1234.56" / "1234.56" / "23.5" / "1500". */
function normalizeSeparators(text: string): string | null {
  if (!/^\d[\d.,]*$/.test(text)) return null;

  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");

  if (lastComma >= 0 && lastDot >= 0) {
    // Both present: the last one is the decimal separator.
    const [thousands, decimal] = lastComma > lastDot ? [".", ","] : [",", "."];
    return checkGroups(text.split(decimal)[0]!, thousands) && text.split(decimal).length === 2
      ? text.replaceAll(thousands, "").replace(decimal, ".")
      : null;
  }

  const sep = lastComma >= 0 ? "," : lastDot >= 0 ? "." : null;
  if (!sep) return text;

  const parts = text.split(sep);
  // Only "1.500" / "1.234.567" shapes are thousands; "23,5", "23,50", "23.50" are decimals.
  if (parts.length === 2 && parts[1]!.length !== 3) return `${parts[0]}.${parts[1]}`;
  if (parts.length === 2 && sep === ",") return null; // "1,500" is ambiguous in pt-BR
  return checkGroups(text, sep) ? parts.join("") : null;
}

function checkGroups(text: string, sep: string): boolean {
  const [head, ...groups] = text.split(sep);
  return /^\d{1,3}$/.test(head!) || groups.length === 0
    ? groups.every((g) => /^\d{3}$/.test(g))
    : false;
}

/** "26" / "26,5" / "26.5" → 26.5; null if not a positive number. */
export function parseDecimalBR(input: string): number | null {
  const text = input.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const value = Number(text);
  return value > 0 ? value : null;
}

const AMOUNT_IN_TEXT =
  /(?:r\$\s*)?\d[\d.,]*(?:\s*(?:mil|k)\b)?(?:\s*(?:reais|real|contos?|pilas?)\b)?/gi;

/** First amount found in free text ("uber 23,50 ontem" → 2350), used when the AI is unavailable. */
export function extractAmountCents(text: string): number | null {
  for (const match of text.matchAll(AMOUNT_IN_TEXT)) {
    const cents = parseBRL(match[0].replace(/[.,]$/, ""));
    if (cents) return cents;
  }
  return null;
}
