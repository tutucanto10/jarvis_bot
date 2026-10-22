import { InlineKeyboard, type Context } from "grammy";
import { normalizeTags, type Classification } from "@/ai/classify";
import { AI_MODEL } from "@/ai/client";
import { createEntry, deleteEntry, deleteLastEntry, type CreateEntryInput } from "@/db/entries";
import type { EntryType } from "@/db/schema";
import { logger } from "@/lib/logger";
import { extractAmountCents } from "@/lib/money";
import type { BotDeps } from "./deps";
import { describeEntry } from "./format";
import { texts } from "./texts";

export const PICKABLE_TYPES = ["gasto", "ideia", "tarefa", "nota"] as const satisfies EntryType[];
export type PickableType = (typeof PICKABLE_TYPES)[number];

export const callbackData = {
  pick: (type: PickableType) => `pick:${type}`,
  undo: (id: number) => `undo:${id}`,
};

const typeKeyboard = () =>
  new InlineKeyboard()
    .text(texts.buttons.gasto, callbackData.pick("gasto"))
    .text(texts.buttons.ideia, callbackData.pick("ideia"))
    .row()
    .text(texts.buttons.tarefa, callbackData.pick("tarefa"))
    .text(texts.buttons.nota, callbackData.pick("nota"));

const undoKeyboard = (id: number) => new InlineKeyboard().text(texts.buttons.undo, callbackData.undo(id));

export function toCreateInput(rawText: string, c: Classification): CreateEntryInput {
  return {
    type: c.type,
    rawText,
    amountCents: c.amount_cents ?? null,
    category: c.category ?? null,
    tags: c.tags,
    dueDate: c.due_date ?? null,
    payload: { summary: c.summary, confidence: c.confidence, model: AI_MODEL },
    fuel: c.fuel && {
      totalCents: c.fuel.total_cents,
      liters: c.fuel.liters ?? null,
      odometerKm: c.fuel.odometer_km ?? null,
    },
  };
}

/** Free text → classify → save, or ask for the type when unsure. */
export async function handleCapture(ctx: Context, deps: BotDeps, text: string): Promise<void> {
  await ctx.replyWithChatAction("typing").catch(() => undefined);
  const messageId = ctx.msg?.message_id;

  try {
    const outcome = await deps.classify(text, { now: deps.now(), timeZone: deps.timeZone });

    if (outcome.status === "unsure") {
      logger.info("classification unsure", { reason: outcome.reason });
      await ctx.reply(texts.askType, {
        reply_markup: typeKeyboard(),
        // The question replies to the original message so the button handler can read it back.
        reply_parameters: messageId ? { message_id: messageId } : undefined,
      });
      return;
    }

    const saved = await createEntry(deps.getDb(), toCreateInput(text, outcome.classification));
    logger.info("entry saved", { id: saved.entry.id, type: saved.entry.type });
    await ctx.reply(texts.saved(describeEntry(saved)), { reply_markup: undoKeyboard(saved.entry.id) });
  } catch (err) {
    logger.error("capture failed", err);
    await ctx.reply(texts.error);
  }
}

/** User tapped Gasto/Ideia/Tarefa/Nota on the "não entendi" question. */
export async function handlePick(ctx: Context, deps: BotDeps, type: PickableType): Promise<void> {
  const original = ctx.callbackQuery?.message?.reply_to_message?.text;
  if (!original) {
    await ctx.answerCallbackQuery({ text: texts.originalMissing });
    return;
  }
  await ctx.answerCallbackQuery();

  try {
    const classification = await classifyAs(deps, original, type);
    if (!classification) {
      await ctx.editMessageText(texts.needAmount);
      return;
    }
    const saved = await createEntry(deps.getDb(), toCreateInput(original, classification));
    logger.info("entry saved", { id: saved.entry.id, type: saved.entry.type, picked: true });
    await ctx.editMessageText(texts.saved(describeEntry(saved)), {
      reply_markup: undoKeyboard(saved.entry.id),
    });
  } catch (err) {
    logger.error("pick failed", err);
    await ctx.reply(texts.error);
  }
}

/**
 * Re-classifies with the type fixed by the user. If the AI fails or is unsure,
 * falls back to a minimal entry built locally; null when a spending has no amount.
 */
async function classifyAs(deps: BotDeps, text: string, type: PickableType): Promise<Classification | null> {
  try {
    const outcome = await deps.classify(text, { now: deps.now(), timeZone: deps.timeZone, forcedType: type });
    if (outcome.status === "ok") return outcome.classification;
  } catch (err) {
    logger.warn("forced classification failed, using fallback", { error: String(err) });
  }

  const fallback: Classification = {
    type,
    tags: normalizeTags([], text),
    summary: text.slice(0, 60),
    confidence: 1,
  };
  if (type !== "gasto") return fallback;

  const amount = extractAmountCents(text);
  return amount ? { ...fallback, amount_cents: amount, category: "outros" } : null;
}

export async function handleUndo(ctx: Context, deps: BotDeps, id: number): Promise<void> {
  try {
    const deleted = await deleteEntry(deps.getDb(), id);
    if (!deleted) {
      await ctx.answerCallbackQuery({ text: texts.alreadyUndone });
      await ctx.editMessageReplyMarkup().catch(() => undefined);
      return;
    }
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(texts.undone(describeEntry({ entry: deleted, fuelLog: null })));
  } catch (err) {
    logger.error("undo failed", err);
    await ctx.answerCallbackQuery({ text: texts.error }).catch(() => undefined);
  }
}

export async function handleUndoLast(ctx: Context, deps: BotDeps): Promise<void> {
  try {
    const deleted = await deleteLastEntry(deps.getDb());
    await ctx.reply(
      deleted ? texts.undone(describeEntry({ entry: deleted, fuelLog: null })) : texts.nothingToUndo,
    );
  } catch (err) {
    logger.error("undo last failed", err);
    await ctx.reply(texts.error);
  }
}
