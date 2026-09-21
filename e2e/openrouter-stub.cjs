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
    if (prompt.purpose === "chat-triage" || prompt.snapshot) {
      if (prompt.message.includes("provider error"))
        return Response.json(
          { error: { message: "Test provider unavailable" } },
          { status: 503 },
        );
      const output = prompt.snapshot
        ? {
            answer:
              "Electricity has an outstanding balance. Check each roommate’s share before recording a contribution.",
          }
        : {
            mode: /paid \$|total is/i.test(prompt.message)
              ? "activity"
              : /Homeshare|what.*due|who.*owes|settle/i.test(prompt.message)
                ? "answer"
                : "silent",
          };
      return Response.json({
        id: "stub-chat",
        object: "chat.completion",
        created: 1,
        model: "test-model",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: JSON.stringify(output) },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      });
    }
    if (prompt.purpose === "starter-prompts") {
      return Response.json({
        id: "stub-suggestions",
        object: "chat.completion",
        created: 1,
        model: "test-model",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: JSON.stringify({
                suggestions: [
                  { candidate: 0, style: "paid" },
                  { candidate: 1, style: "contributed" },
                  { candidate: 2, style: "put" },
                ],
              }),
            },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      });
    }
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
    } else if (/attached bill/i.test(text) && prompt.sources?.length) {
      intent.total =
        prompt.sources[0].text.match(/\$(\d+(?:\.\d+)?)/)?.[1] ?? null;
      intent.dueDate =
        prompt.sources[0].text.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
    } else if (/total is/i.test(text)) {
      intent.total = text.match(/\$(\d+(?:\.\d+)?)/)?.[1] ?? null;
      intent.dueDate =
        text.match(/\d{4}-\d{2}-\d{2}/)?.[0] ??
        (/Sep 28, 2027/.test(text) ? "2027-09-28" : null);
    } else {
      intent.intent = "unsupported";
    }
    const content = JSON.stringify({
      summary: prompt.sources?.length
        ? "**Review** the contribution details below. Nothing has been recorded."
        : "",
      activity: intent,
    });
    const chunks = content
      .match(/.{1,24}/gs)
      .map(
        (part) =>
          `data: ${JSON.stringify({ id: "stub", choices: [{ index: 0, delta: { content: part }, finish_reason: null }] })}\n\n`,
      );
    chunks.push(
      `data: ${JSON.stringify({ id: "stub", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`,
    );
    return new Response(
      new ReadableStream({
        async start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(new TextEncoder().encode(chunk));
            await new Promise((r) => setTimeout(r, 10));
          }
          controller.close();
        },
      }),
      { headers: { "Content-Type": "text/event-stream" } },
    );
  };
}
