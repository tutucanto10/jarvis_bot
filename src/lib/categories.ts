export const SPENDING_CATEGORIES = [
  "mercado",
  "transporte",
  "combustível",
  "comida fora",
  "lazer",
  "contas",
  "astro",
  "outros",
] as const;

export type SpendingCategory = (typeof SPENDING_CATEGORIES)[number];

/** Messages mentioning the brand get the "astro" tag regardless of what the model says. */
export const ASTRO_PATTERN = /\bastro\b/i;
