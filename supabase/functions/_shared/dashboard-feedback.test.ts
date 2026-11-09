import { strictEqual as assertEquals } from "node:assert";

import { hasReactionReceipt, isFeedbackOrigin, mayAcknowledgeFeedback } from "./dashboard-feedback.ts";

const origin = { message_id: "message", chat_id: "chat", company_id: "company", student_id: "student",
  instance_id: "instance", remote_jid: "5511999999999@s.whatsapp.net", provider_message_id: "external" };
const message = { id: "message", chat_id: "chat", company_id: "company", source: "incoming",
  is_from_me: false, origin: "provider_live", message_id_external: "external", sender_id: origin.remote_jid };
const chat = { id: "chat", company_id: "company", student_id: "student",
  instance_id: "instance", remote_jid: origin.remote_jid };

Deno.test("accepts only the pinned provider inbound message in the original student's conversation", () => {
  assertEquals(isFeedbackOrigin(origin, message, chat), true);
  assertEquals(isFeedbackOrigin(origin, { ...message, message_id_external: null }, chat), false);
  assertEquals(isFeedbackOrigin(origin, { ...message, origin: "manual" }, chat), false);
  assertEquals(isFeedbackOrigin(origin, { ...message, is_from_me: true }, chat), false);
  assertEquals(isFeedbackOrigin(origin, { ...message, company_id: "elsewhere" }, chat), false);
  assertEquals(isFeedbackOrigin(origin, message, { ...chat, student_id: "other" }), false);
  assertEquals(isFeedbackOrigin(origin, message, { ...chat, instance_id: "replacement" }), false);
});

Deno.test("rejects a provider key recorded under a different or absent inbound JID", () => {
  for (const senderId of [null, "5511999999999@lid", "5511999999998@s.whatsapp.net", "11999999999@s.whatsapp.net"]) {
    const candidate = { ...message, sender_id: senderId };
    assertEquals(isFeedbackOrigin(origin, candidate, chat), false);
  }
});

Deno.test("requires an exact provider reaction receipt", () => {
  const target = { id: "external", fromMe: false, remoteJid: origin.remote_jid };
  const ack = { key: { id: "reaction", fromMe: true, remoteJid: origin.remote_jid },
    message: { reactionMessage: { key: target, text: "👍" } } };
  assertEquals(hasReactionReceipt(ack, target), "reaction");
  assertEquals(hasReactionReceipt({ success: true }, target), null);
  assertEquals(hasReactionReceipt(ack, { ...target, id: "different" }), null);
  assertEquals(hasReactionReceipt(ack, { ...target, remoteJid: "5511888888888@s.whatsapp.net" }), null);
});

Deno.test("a feedback with adjustment, discomfort, or a reply is ineligible", () => {
  assertEquals(mayAcknowledgeFeedback({ needs_adjustment: false, trainer_replied_at: null, pain_areas: [] }), true);
  assertEquals(mayAcknowledgeFeedback({ needs_adjustment: true, trainer_replied_at: null, pain_areas: [] }), false);
  assertEquals(mayAcknowledgeFeedback({ needs_adjustment: false, trainer_replied_at: null, pain_areas: ["joelho"] }), false);
  assertEquals(mayAcknowledgeFeedback({ needs_adjustment: false, trainer_replied_at: "2026-11-09", pain_areas: [] }), false);
});
