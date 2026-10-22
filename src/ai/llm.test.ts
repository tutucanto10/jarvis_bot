import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { RawClassificationSchema } from "./classify";
import { anthropicProvider, geminiProvider, toGeminiSchema } from "./llm";

const Schema = z.object({ type: z.enum(["gasto", "nota"]), amount_text: z.string().nullable() });
const req = { task: "test", system: "sys", user: "gastei 40", schema: Schema };

/** Shape of a @google/genai GenerateContentResponse (only the fields we read). */
const geminiResponse = (text: string | undefined, finishReason = "STOP") =>
  ({ text, candidates: [{ finishReason }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } }) as never;

describe("toGeminiSchema", () => {
  it("emits the JSON Schema subset Gemini accepts, keeping enums and nullables", () => {
    const schema = toGeminiSchema(RawClassificationSchema);
    expect(schema).not.toHaveProperty("$schema");
    expect(JSON.stringify(schema)).toContain('"enum":["gasto","abastecimento","ideia","tarefa","nota"]');
    expect(schema).toMatchObject({ type: "object", additionalProperties: false });
    expect((schema.required as string[]).sort()).toEqual(
      ["amount_text", "category", "confidence", "due_date", "fuel", "summary", "tags", "type"].sort(),
    );
  });
});

describe("geminiProvider", () => {
  it("sends system prompt + JSON schema and validates the answer", async () => {
    const generate = vi.fn().mockResolvedValue(geminiResponse('{"type":"gasto","amount_text":"40"}'));
    const result = await geminiProvider("gemini-test", generate).generateJson(req);

    expect(result).toEqual({ ok: true, data: { type: "gasto", amount_text: "40" } });
    const params = generate.mock.calls[0]![0];
    expect(params).toMatchObject({
      model: "gemini-test",
      contents: "gastei 40",
      config: { systemInstruction: "sys", responseMimeType: "application/json" },
    });
    expect(params.config.responseJsonSchema).toMatchObject({ type: "object" });
  });

  it("returns ok:false (never throws) for bad JSON, schema mismatch, or truncated output", async () => {
    const run = (text: string | undefined, finish?: string) =>
      geminiProvider("m", vi.fn().mockResolvedValue(geminiResponse(text, finish))).generateJson(req);
    expect(await run("not json")).toEqual({ ok: false, reason: "invalid JSON" });
    expect(await run('{"type":"outro","amount_text":null}')).toEqual({ ok: false, reason: "schema mismatch" });
    expect(await run('{"type":"gasto"', "MAX_TOKENS")).toEqual({ ok: false, reason: "finishReason=MAX_TOKENS" });
    expect(await run(undefined, "SAFETY")).toEqual({ ok: false, reason: "finishReason=SAFETY" });
  });

  it("lets API errors (rate limit, auth) propagate", async () => {
    const generate = vi.fn().mockRejectedValue(new Error("429 RESOURCE_EXHAUSTED"));
    await expect(geminiProvider("m", generate).generateJson(req)).rejects.toThrow("429");
  });
});

describe("anthropicProvider", () => {
  const client = (response: object) => ({ messages: { parse: vi.fn().mockResolvedValue(response) } }) as never;
  const usage = { input_tokens: 10, output_tokens: 5 };

  it("validates parsed_output and reports refusals as ok:false", async () => {
    const ok = await anthropicProvider("claude-haiku-5-5", client({ stop_reason: "end_turn", parsed_output: { type: "nota", amount_text: null }, usage })).generateJson(req);
    expect(ok).toEqual({ ok: true, data: { type: "nota", amount_text: null } });

    const refused = await anthropicProvider("claude-haiku-5-5", client({ stop_reason: "refusal", parsed_output: null, usage })).generateJson(req);
    expect(refused).toEqual({ ok: false, reason: "stop_reason=refusal" });
  });
});
