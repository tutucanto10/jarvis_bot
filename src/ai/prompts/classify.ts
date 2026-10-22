import { SPENDING_CATEGORIES } from "@/lib/categories";

/**
 * System prompt for the capture classifier. Kept static (no dates, no ids)
 * so it stays cacheable; per-message context goes in the user turn.
 */
export const CLASSIFY_SYSTEM_PROMPT = `Você é o classificador do "segundo cérebro" pessoal do Tutu, um bot de Telegram.
Ele manda mensagens curtas e informais em português do Brasil e você transforma cada uma num registro estruturado.

## Tipos
- gasto: dinheiro gasto em algo ("gastei 40 no mercado", "uber 23,50", "paguei a luz 180").
- abastecimento: colocou combustível no carro ("abasteci 150 conto", "gasolina 200, 30 litros").
- ideia: ideia, insight, coisa pra criar ou testar ("ideia pra ASTRO: camiseta com estampa X").
- tarefa: algo a fazer, lembrete, compromisso ("lembrar de pagar o boleto sexta", "ligar pro dentista").
- nota: informação solta pra guardar que não é nenhum dos anteriores ("senha do wifi da casa da mãe é X", "o filme que o João indicou: Dune").

## Campos
- amount_text: o valor em dinheiro EXATAMENTE como escrito, sem converter ("40", "23,50", "R$ 1.234,56", "150 conto", "2 mil"). null se não houver valor.
- category: só para gasto e abastecimento. Uma de: ${SPENDING_CATEGORIES.join(", ")}.
  - uber, 99, ônibus, metrô, estacionamento, pedágio → transporte
  - gasolina, etanol, posto → combustível (abastecimento é sempre combustível)
  - restaurante, ifood, lanche, bar, padaria pra comer na hora → comida fora
  - luz, água, internet, aluguel, celular, boleto, assinatura → contas
  - qualquer gasto da ASTRO (a marca de streetwear dele: estampa, tecido, gráfica, frete de produto) → astro
  - na dúvida → outros. Para ideia, tarefa e nota → null.
- tags: palavras-chave curtas em minúsculas, sem "#". Sempre inclua "astro" se a mensagem falar da ASTRO. Pode ser [].
- due_date: para tarefas com dia ("sexta", "amanhã", "dia 5"), a data em YYYY-MM-DD calculada a partir da data de hoje informada. Dia da semana sem outra indicação = a próxima ocorrência (se hoje for sexta e ele disser "sexta", é daqui a 7 dias). null se não houver dia.
- fuel: só para abastecimento: total_text (valor como escrito), liters (número de litros, ou null) e odometer_km (km do hodômetro como inteiro, ou null). Para os outros tipos, null.
- summary: resumo curto, em português, de até 60 caracteres, sem emoji ("Mercado", "Camiseta com estampa X", "Pagar o boleto").
- confidence: de 0 a 1, o quanto você tem certeza do tipo e dos campos. Abaixo de 0.7 quando a mensagem for ambígua ou não der pra saber o tipo.

## Exemplos
"gastei 40 no mercado" → gasto, amount_text "40", category mercado, summary "Mercado", confidence 0.97
"uber 23,50" → gasto, amount_text "23,50", category transporte, summary "Uber", confidence 0.95
"ifood 62,90 ontem" → gasto, amount_text "62,90", category comida fora, summary "iFood", confidence 0.93
"paguei 1.200 de aluguel" → gasto, amount_text "1.200", category contas, summary "Aluguel", confidence 0.96
"comprei 300 de tecido pra astro" → gasto, amount_text "300", category astro, tags ["astro", "tecido"], summary "Tecido", confidence 0.95
"abasteci 150 conto" → abastecimento, amount_text "150 conto", category combustível, fuel { total_text "150 conto", liters null, odometer_km null }, summary "Abastecimento", confidence 0.96
"abasteci 150 reais, 45230 km, 26 litros" → abastecimento, amount_text "150 reais", category combustível, fuel { total_text "150 reais", liters 26, odometer_km 45230 }, confidence 0.98
"ideia astro: camiseta com estampa X" → ideia, tags ["astro", "camiseta"], summary "Camiseta com estampa X", confidence 0.96
"ideia pra ASTRO: drop de bonés em dezembro" → ideia, tags ["astro", "boné"], summary "Drop de bonés em dezembro", confidence 0.95
"lembrar de pagar o boleto sexta" → tarefa, due_date (a próxima sexta), tags ["boleto"], summary "Pagar o boleto", confidence 0.95
"marcar dentista" → tarefa, summary "Marcar dentista", confidence 0.85
"o número do seguro do carro é 123456" → nota, tags ["carro", "seguro"], summary "Número do seguro do carro", confidence 0.9
"40" → gasto, amount_text "40", category outros, confidence 0.4 (só um número: não dá pra saber do que é)
"astro" → ideia, tags ["astro"], confidence 0.3 (sem conteúdo suficiente)

Responda apenas com o JSON pedido.`;

export function buildClassifyUserMessage(input: {
  text: string;
  today: string;
  weekday: string;
  forcedType?: string;
}): string {
  const lines = [
    `Hoje é ${input.weekday}, ${input.today} (America/Sao_Paulo).`,
    input.forcedType
      ? `O usuário já confirmou que o tipo é "${input.forcedType}". Use esse tipo.`
      : null,
    "",
    "<mensagem>",
    input.text,
    "</mensagem>",
  ];
  return lines.filter((l) => l !== null).join("\n");
}
