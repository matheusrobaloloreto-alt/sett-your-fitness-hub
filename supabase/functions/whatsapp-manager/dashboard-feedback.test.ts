import { deepStrictEqual, rejects, strictEqual } from "node:assert";
import { acknowledgeDashboardFeedback } from "./dashboard-feedback.ts";

function harness(mode: "ok" | "missing_receipt" | "db_error") {
  let attempted = false;
  let reviewed = false;
  let providerCalls = 0;
  const remoteJid = "5511999999999@s.whatsapp.net";
  const key = { id: "origin-key", remoteJid, fromMe: false };
  const providerFetch: typeof fetch = async (_url, options) => {
    providerCalls += 1;
    deepStrictEqual(JSON.parse(String(options?.body)), { key, reaction: "👍" });
    await Promise.resolve();
    return Response.json(mode === "missing_receipt" ? { success: true } : {
      key: { id: "reaction-key", remoteJid, fromMe: true },
      message: { reactionMessage: { key, text: "👍" } },
    });
  };
  const db = { from: () => ({
    update: (patch: Record<string, unknown>) => {
      const chain = {
        eq: () => chain,
        is: () => chain,
        select: () => chain,
        maybeSingle: async () => {
          if (patch.reaction_attempted_at) {
            if (attempted) return { data: null, error: null };
            attempted = true;
          } else {
            strictEqual(patch.reaction_provider_id, "reaction-key");
            if (mode === "db_error") return { data: null, error: { code: "db_error" } };
            reviewed = true;
          }
          return { data: { feedback_id: "feedback" }, error: null };
        },
      };
      return chain;
    },
  }) };
  const run = (eligible = true) => acknowledgeDashboardFeedback({
    db: db as unknown as Parameters<typeof acknowledgeDashboardFeedback>[0]["db"],
    binding: { origin: { company_id: "company", message_id: "message", chat_id: "chat", student_id: "student",
      instance_id: "instance", remote_jid: remoteJid, provider_message_id: key.id,
      reviewed_at: null, reaction_attempted_at: null }, eligible },
    userId: "staff", feedbackId: "feedback", providerUrl: "http://127.0.0.1:1/provider", headers: {}, providerFetch,
  });
  return { run, state: () => ({ attempted, reviewed, providerCalls }) };
}

Deno.test("concurrent OK calls acquire one durable claim and record review only after the exact receipt", async () => {
  const test = harness("ok");
  const result = await Promise.allSettled([test.run(), test.run()]);
  strictEqual(result.filter(value => value.status === "fulfilled").length, 1);
  deepStrictEqual(test.state(), { attempted: true, reviewed: true, providerCalls: 1 });
});

Deno.test("a generic provider response or failed confirmation write keeps review pending and blocks resend", async () => {
  for (const mode of ["missing_receipt", "db_error"] as const) {
    const test = harness(mode);
    await rejects(test.run(), /Confirmação da curtida pendente/);
    await rejects(test.run(), /Confirmação da curtida pendente/);
    deepStrictEqual(test.state(), { attempted: true, reviewed: false, providerCalls: 1 });
  }
});

Deno.test("feedback requiring adjustment never claims or calls the provider", async () => {
  const test = harness("ok");
  await rejects(test.run(false), /precisa de acompanhamento/);
  deepStrictEqual(test.state(), { attempted: false, reviewed: false, providerCalls: 0 });
});
