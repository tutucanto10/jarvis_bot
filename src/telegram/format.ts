import type { EntryWithFuel } from "@/db/entries";
import { formatCalendarDay } from "@/lib/dates";
import { formatBRL } from "@/lib/money";

const LABELS = {
  gasto: "Gasto",
  abastecimento: "Abastecimento",
  ideia: "Ideia",
  tarefa: "Tarefa",
  nota: "Nota",
} as const;

const km = new Intl.NumberFormat("pt-BR");
const liters = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

/** One-line, plain-text description: "Gasto: R$ 40,00 · mercado". */
export function describeEntry({ entry, fuelLog }: EntryWithFuel): string {
  const summary = typeof entry.payload.summary === "string" ? entry.payload.summary : entry.rawText;
  const tags = entry.tags.filter((t) => t !== entry.category).map((t) => `#${t}`);
  let parts: string[];

  switch (entry.type) {
    case "gasto":
      parts = [formatBRL(entry.amountCents ?? 0), entry.category ?? "outros"];
      break;
    case "abastecimento":
      parts = [formatBRL(fuelLog?.totalCents ?? entry.amountCents ?? 0)];
      if (fuelLog?.liters) parts.push(`${liters.format(fuelLog.liters)} L`);
      if (fuelLog?.pricePerLiterCents) parts.push(`${formatBRL(fuelLog.pricePerLiterCents)}/L`);
      if (fuelLog?.odometerKm != null) parts.push(`${km.format(fuelLog.odometerKm)} km`);
      break;
    case "tarefa":
      parts = [summary];
      if (entry.dueDate) parts.push(formatCalendarDay(entry.dueDate));
      parts.push(...tags);
      break;
    default:
      parts = [summary, ...tags];
  }

  return `${LABELS[entry.type]}: ${parts.join(" · ")}`;
}
