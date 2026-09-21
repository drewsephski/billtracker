/* Test-process preload only. Never imported by the application. The normal
 * OpenRouter provider and AI SDK still validate these deterministic responses. */
if (process.env.HOMESHARE_E2E_LLM_STUB === "true") {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async function (input, init) {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    if (!url.startsWith("https://openrouter.ai/api/"))
      return originalFetch(input, init);
    if (process.env.SEED_ALLOWED !== "true")
      throw new Error(
        "LLM stub requires the designated development environment",
      );
    const body = JSON.parse(init.body);
    const prompt = JSON.parse(body.messages.at(-1).content);
    const text = prompt.message;
    if (text.includes("provider error"))
      return Response.json(
        { error: { message: "Test provider unavailable" } },
        { status: 503 },
      );
    const intent = {
      intent: "contribution",
      payer: null,
      amount: null,
      bill: null,
      category: null,
      total: null,
      dueDate: null,
      period: null,
      household: null,
      incomplete: false,
      ...prompt.previous,
    };
    const contribution = text.match(
      /^(I|Allie) paid \$(\d+(?:\.\d+)?) toward (electricity|water|internet)$/i,
    );
    if (contribution) {
      Object.assign(intent, {
        payer: contribution[1],
        amount: contribution[2],
        bill: contribution[3],
        category: {
          electricity: "Electricity",
          water: "Water",
          internet: "Internet",
        }[contribution[3].toLowerCase()],
        total: null,
        dueDate: null,
      });
    } else if (/total is/i.test(text)) {
      intent.total = text.match(/\$(\d+(?:\.\d+)?)/)?.[1] ?? null;
      intent.dueDate = text.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
    } else {
      intent.intent = "unsupported";
    }
    return Response.json({
      id: "stub-completion",
      object: "chat.completion",
      created: 1,
      model: "test-model",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: JSON.stringify(intent) },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
    });
  };
}
