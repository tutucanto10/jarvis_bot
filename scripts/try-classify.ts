/**
 * Usage: pnpm ai:try "gastei 40 no mercado" "uber 23,50" ...
 * Runs the real classifier (calls the configured AI, does NOT save) — handy for tuning the prompt.
 */
import { classify } from "../src/ai/classify";

async function main(): Promise<void> {
  const inputs = process.argv.slice(2);
  if (inputs.length === 0) throw new Error('Passe uma ou mais mensagens: pnpm ai:try "gastei 40 no mercado"');

  for (const text of inputs) {
    const outcome = await classify(text);
    console.log(`\n> ${text}`);
    console.log(JSON.stringify(outcome, null, 2));
  }
}

main().catch((err: unknown) => {
  console.error("❌", err instanceof Error ? err.message : err);
  process.exit(1);
});
