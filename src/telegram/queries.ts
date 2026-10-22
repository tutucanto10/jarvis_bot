import type { Context } from "grammy";
import type { QueryOutcome, StructuredQuery } from "@/ai/query";
import { countByType, findEntries, fuelSpending, latestIdeas, recentFuelLogs, spendingByCategory } from "@/db/queries";
import type { Entry } from "@/db/schema";
import { formatDayMonth } from "@/lib/dates";
import { averageKmPerLiter, kmPerLiter } from "@/lib/fuel";
import { escapeHtml } from "@/lib/html";
import { logger } from "@/lib/logger";
import { formatBRL } from "@/lib/money";
import { formatRange, monthName, thisMonthRange, thisWeekRange } from "@/lib/periods";
import type { BotDeps } from "./deps";
import { describeEntry } from "./format";
import { texts } from "./texts";

const HTML = { parse_mode: "HTML" } as const;
const kmL = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const liters = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const km = new Intl.NumberFormat("pt-BR");
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const truncate = (text: string, max = 90) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** Runs a query handler, replying with a friendly error instead of failing silently. */
async function safely(ctx: Context, name: string, fn: () => Promise<string>): Promise<void> {
  let message: string;
  try {
    message = await fn();
  } catch (err) {
    logger.error(`${name} failed`, err);
    await ctx.reply(texts.queryError);
    return;
  }
  await ctx.reply(message, HTML);
}

function currentMonthLabel(deps: BotDeps): string {
  const month = Number(formatDayMonth(deps.now(), deps.timeZone).split("/")[1]);
  return monthName(month);
}

export function handleSummary(ctx: Context, deps: BotDeps, arg: string): Promise<void> {
  const period = arg.trim().toLowerCase();
  if (period && !["semana", "mes", "mês"].includes(period)) {
    return ctx.reply(texts.summaryUsage).then(() => undefined);
  }
  const monthly = period === "mes" || period === "mês";

  return safely(ctx, "summary", async () => {
    const now = deps.now();
    const range = monthly ? thisMonthRange(now, deps.timeZone) : thisWeekRange(now, deps.timeZone);
    const db = deps.getDb();
    const [categories, counts] = await Promise.all([spendingByCategory(db, range), countByType(db, range)]);
    const total = categories.reduce((sum, c) => sum + c.totalCents, 0);

    const lines = [
      `📊 <b>Resumo ${monthly ? `de ${currentMonthLabel(deps)}` : "da semana"}</b> · ${formatRange(range, deps.timeZone)}`,
      "",
      `💸 Total gasto: <b>${formatBRL(total)}</b>`,
      ...categories.slice(0, 3).map((c) => `• ${escapeHtml(c.category)} — ${formatBRL(c.totalCents)}`),
      "",
      `💡 ${plural(counts.ideia ?? 0, "ideia", "ideias")} · ✅ ${plural(counts.tarefa ?? 0, "tarefa", "tarefas")}`,
    ];
    return lines.join("\n");
  });
}

export function handleSpending(ctx: Context, deps: BotDeps): Promise<void> {
  return safely(ctx, "spending", async () => {
    const range = thisMonthRange(deps.now(), deps.timeZone);
    const categories = await spendingByCategory(deps.getDb(), range);
    const month = currentMonthLabel(deps);
    if (categories.length === 0) return `Nenhum gasto em ${month} ainda. 🙌`;

    const total = categories.reduce((sum, c) => sum + c.totalCents, 0);
    return [
      `💸 <b>Gastos de ${month}</b> · ${formatRange(range, deps.timeZone)}`,
      "",
      ...categories.map(
        (c) => `• ${escapeHtml(c.category)} — ${formatBRL(c.totalCents)} (${Math.round((c.totalCents / total) * 100)}%)`,
      ),
      "",
      `<b>Total: ${formatBRL(total)}</b>`,
    ].join("\n");
  });
}

export function handleIdeas(ctx: Context, deps: BotDeps, arg: string): Promise<void> {
  const tag = arg.trim().toLowerCase().replace(/^#/, "") || undefined;
  return safely(ctx, "ideas", async () => {
    const ideas = await latestIdeas(deps.getDb(), { tag, limit: 15 });
    const title = `💡 <b>Últimas ideias</b>${tag ? ` · #${escapeHtml(tag)}` : ""}`;
    if (ideas.length === 0) return `${title}\n\nNenhuma ideia${tag ? " com essa tag" : ""} ainda.`;
    return [title, "", ...ideas.map((e) => entryLine(e, deps))].join("\n");
  });
}

export function handleFuel(ctx: Context, deps: BotDeps): Promise<void> {
  return safely(ctx, "fuel", async () => {
    const db = deps.getDb();
    const range = thisMonthRange(deps.now(), deps.timeZone);
    // Extra history so km/l can be computed for the oldest shown fill-up too.
    const [newestFirst, month] = await Promise.all([recentFuelLogs(db, 30), fuelSpending(db, range)]);
    if (newestFirst.length === 0) return "⛽ Nenhum abastecimento registrado ainda.";

    const logs = [...newestFirst].reverse();
    const efficiency = kmPerLiter(logs);
    const shown = logs.map((log, i) => ({ log, kmPerLiter: efficiency[i] })).slice(-10).reverse();
    const average = averageKmPerLiter(logs);

    const lines = shown.map(({ log, kmPerLiter }) => {
      const parts = [formatBRL(log.totalCents)];
      if (log.liters) parts.push(`${liters.format(log.liters)} L`);
      if (log.pricePerLiterCents) parts.push(`${formatBRL(log.pricePerLiterCents)}/L`);
      if (log.odometerKm != null) parts.push(`${km.format(log.odometerKm)} km`);
      if (kmPerLiter != null) parts.push(`<b>${kmL.format(kmPerLiter)} km/l</b>`);
      return `• ${formatDayMonth(log.createdAt, deps.timeZone)} — ${parts.join(" · ")}`;
    });

    return [
      "⛽ <b>Abastecimentos</b>",
      "",
      ...lines,
      "",
      ...(average != null ? [`Média: <b>${kmL.format(average)} km/l</b>`] : []),
      `Combustível em ${currentMonthLabel(deps)}: <b>${formatBRL(month.totalCents)}</b> (${plural(month.count, "abastecimento", "abastecimentos")})`,
    ].join("\n");
  });
}

export async function handleQuestion(ctx: Context, deps: BotDeps, text: string): Promise<void> {
  await ctx.replyWithChatAction("typing").catch(() => undefined);

  let outcome: QueryOutcome;
  try {
    outcome = await deps.parseQuery(text, { now: deps.now(), timeZone: deps.timeZone });
  } catch (err) {
    logger.error("query parse failed", err);
    await ctx.reply(texts.queryError);
    return;
  }
  if (outcome.status === "unsure") {
    logger.info("query unsure", { reason: outcome.reason });
    await ctx.reply(texts.questionNotUnderstood);
    return;
  }

  const { query } = outcome;
  await safely(ctx, "question", async () => {
    const result = await findEntries(deps.getDb(), query.filter, 10);
    return formatAnswer(query, result, deps);
  });
}

export function formatAnswer(
  query: StructuredQuery,
  result: { totalCents: number; count: number; items: Entry[] },
  deps: Pick<BotDeps, "timeZone">,
): string {
  const scope = describeQuery(query);
  if (result.count === 0) return `🔎 Não achei nada${scope ? ` ${scope}` : ""}.`;

  const headline =
    query.intent === "total"
      ? `💸 <b>${formatBRL(result.totalCents)}</b>${scope ? ` ${scope}` : ""} · ${plural(result.count, "registro", "registros")}`
      : query.intent === "count"
        ? `🔢 <b>${plural(result.count, "registro", "registros")}</b>${scope ? ` ${scope}` : ""}`
        : `🔎 <b>${plural(result.count, "resultado", "resultados")}</b>${scope ? ` ${scope}` : ""}`;

  const more = result.count > result.items.length ? [`… e mais ${result.count - result.items.length}`] : [];
  return [headline, "", ...result.items.map((e) => entryLine(e, deps)), ...more].join("\n");
}

/** "com “uber” em outubro" — built from the validated filter, not from the model's words. */
function describeQuery({ filter, period }: StructuredQuery): string {
  const parts: string[] = [];
  if (filter.search) parts.push(`com “${escapeHtml(filter.search)}”`);
  if (filter.categories?.length) parts.push(`em ${filter.categories.map(escapeHtml).join(", ")}`);
  if (filter.tags?.length) parts.push(filter.tags.map((t) => `#${escapeHtml(t)}`).join(" "));

  const periodLabels: Record<string, string> = {
    today: "hoje",
    yesterday: "ontem",
    this_week: "nesta semana",
    last_week: "na semana passada",
    this_month: "neste mês",
    last_month: "no mês passado",
    this_year: "neste ano",
  };
  if (period.preset === "month" && period.month) {
    parts.push(`em ${monthName(period.month)}${period.year ? ` de ${period.year}` : ""}`);
  } else if (period.preset === "custom" && filter.range) {
    parts.push(`de ${formatRange(filter.range)}`);
  } else if (periodLabels[period.preset]) {
    parts.push(periodLabels[period.preset]!);
  }
  return parts.join(" ");
}

function entryLine(entry: Entry, deps: Pick<BotDeps, "timeZone">): string {
  const description = describeEntry({ entry, fuelLog: null }).replace(/^[^:]+: /, "");
  return `• ${formatDayMonth(entry.createdAt, deps.timeZone)} — ${escapeHtml(truncate(description))}`;
}
