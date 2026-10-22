export const texts = {
  start:
    "E aí! 👋 Sou teu segundo cérebro.\n\n" +
    "Me manda qualquer coisa — gasto, abastecimento, ideia, tarefa — que eu entendo e guardo.\n" +
    "Manda /ajuda pra ver o que eu sei fazer.",
  help:
    "<b>Como usar</b>\n" +
    "É só escrever do teu jeito:\n" +
    "• gastei 40 no mercado\n" +
    "• abasteci 150 reais, 45230 km, 26 litros\n" +
    "• ideia pra ASTRO: camiseta com estampa X\n" +
    "• lembrar de pagar o boleto sexta\n\n" +
    "Ou pergunta:\n" +
    "• quanto gastei com uber em outubro?\n" +
    "• quais ideias da astro eu tive?\n\n" +
    "<b>Comandos</b>\n" +
    "/resumo — resumo da semana (/resumo mes pro mês)\n" +
    "/gastos — gastos do mês por categoria\n" +
    "/ideias — últimas ideias (/ideias astro pra filtrar)\n" +
    "/abastecimentos — abastecimentos e km/l\n" +
    "/briefing — manda o briefing do dia agora\n" +
    "/desfazer — apaga o último registro\n" +
    "/ajuda — esta mensagem",
  saved: (description: string) => `✅ ${description}`,
  undone: (description: string) => `↩️ Desfeito: ${description}`,
  nothingToUndo: "Não tem nada pra desfazer.",
  alreadyUndone: "Esse já tinha sido apagado.",
  askType: "Não entendi bem 🤔 Isso é o quê?",
  needAmount: "Não achei o valor 😅 Manda de novo com quanto foi, tipo \"mercado 40\".",
  originalMissing: "Perdi a mensagem original, manda de novo?",
  unknownCommand: "Não conheço esse comando. Manda /ajuda.",
  error: "não consegui salvar agora, tenta de novo",
  briefingStarting: "⏳ Montando o briefing…",
  briefingError: "não consegui montar o briefing agora, tenta de novo",
  queryError: "não consegui consultar agora, tenta de novo",
  summaryUsage: "Usa /resumo (semana) ou /resumo mes.",
  questionNotUnderstood: "Não entendi a pergunta 🤔 Tenta tipo: \"quanto gastei com uber em outubro?\"",
  buttons: {
    undo: "Desfazer",
    gasto: "Gasto",
    ideia: "Ideia",
    tarefa: "Tarefa",
    nota: "Nota",
  },
} as const;
