// push-send — Web Push (VAPID) do SETT/BN.
// Ações:
//  - notify: { action:"notify", student_ids:[...], title, body, url? } → professor (company member)
//    notifica alunos da SUA empresa; aluno só pode notificar a si mesmo.
//  - daily_reminder: { action:"daily_reminder" } → SÓ service role (pg_cron): lembra alunos com
//    ciclo ativo + assinatura push do treino do dia.
// verify_jwt fica LIGADO (default) — o caller manda JWT do usuário ou a service key.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import webpush from "npm:web-push@3.6.7";
import { getCompanyProductSettings } from '../_shared/company-product-settings.ts';
import { eventMessage, messageValues, reminderSlot } from '../_shared/communication-policy.ts';

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });

function sendPush(subscription: any, payload: string) {
  webpush.setVapidDetails(
    Deno.env.get("VAPID_SUBJECT") || "mailto:contato@bnperformance.com.br",
    Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!,
  );
  return webpush.sendNotification(subscription, payload);
}

export async function handlePushRequest(req: Request, overrides: { admin?: any; send?: typeof sendPush } = {}) {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const admin = overrides.admin ?? createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const isServiceRole = token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "notify");
    if (!['notify', 'daily_reminder'].includes(action) || (body.event != null && body.event !== 'new_workout')) return json({ error: 'unsupported_push_event' }, 400);

    // Resolve destinatários → [{user_id, endpoint, p256dh, auth}]
    let targets: Array<{ user_id: string; company_id: string; full_name?: string }> = [];
    const perUserPayload = new Map<string, { title: string; body: string; url: string }>();
    const dailyReceipts = new Map<string, { company_id: string; user_id: string; local_date: string }>();
    let payload = { title: String(body?.title || "SETT"), body: String(body?.body || ""), url: String(body?.url || "/aluno") };

    if (action === "daily_reminder") {
      const cronOk = !!Deno.env.get("PUSH_CRON_SECRET") && req.headers.get("x-cron-secret") === Deno.env.get("PUSH_CRON_SECRET");
      if (!isServiceRole && !cronOk) return json({ error: "forbidden" }, 403);
      const { data: activeCycleRows } = await admin.from("training_cycles").select("student_id, enrollment_id").eq("status", "active");
      const enrollmentIds = [...new Set((activeCycleRows || []).map((cycle: any) => cycle.enrollment_id).filter(Boolean))];
      let openEnrollmentIds = new Set<string>();
      if (enrollmentIds.length > 0) {
        const { data: openEnrollments } = await admin.from("enrollments")
          .select("id, status")
          .in("id", enrollmentIds)
          .neq("status", "completed");
        openEnrollmentIds = new Set((openEnrollments || []).map((enrollment: any) => enrollment.id).filter(Boolean));
      }
      const cycles = (activeCycleRows || []).filter((cycle: any) =>
        !cycle.enrollment_id || openEnrollmentIds.has(cycle.enrollment_id)
      );
      const studentIds = [...new Set(cycles.map((c: any) => c.student_id).filter(Boolean))];
      if (!studentIds.length) return json({ sent: 0 });
      const { data: studs } = await admin.from("students").select("user_id,company_id,full_name").in("id", studentIds).not("user_id", "is", null);
      targets = (studs || []) as any[];
      payload = { title: "Seu treino de hoje te espera 💪", body: "Bora manter a sequência? Abra o app e registre seu treino.", url: "/aluno" };
      const eligible: typeof targets = [];
      const settingsByCompany = new Map<string, Awaited<ReturnType<typeof getCompanyProductSettings>>>();
      for (const student of targets) {
        if (!settingsByCompany.has(student.company_id)) settingsByCompany.set(student.company_id, await getCompanyProductSettings(admin, student.company_id));
        const settings = settingsByCompany.get(student.company_id)!;
        const localDate = reminderSlot(new Date(), settings.notifications.daily_reminder_enabled, settings.notifications.daily_reminder_hour, settings.contact_policy.timezone);
        if (!localDate) continue;
        if (dailyReceipts.has(student.user_id) && dailyReceipts.get(student.user_id)!.company_id !== student.company_id) throw new Error('push_user_company_ambiguous');
        const values = messageValues({ nome: student.full_name || '', link: '/aluno', data: localDate, profissional: settings.brand.professional_name, email: settings.brand.support_email }, settings.brand.company_name);
        perUserPayload.set(student.user_id, {
          title: eventMessage(settings.messages, 'daily_reminder_title', values, payload.title),
          body: eventMessage(settings.messages, 'daily_reminder_body', values, payload.body), url: '/aluno',
        });
        dailyReceipts.set(student.user_id, { company_id: student.company_id, user_id: student.user_id, local_date: localDate });
        eligible.push(student);
      }
      targets = eligible;
    } else {
      const studentIds: string[] = Array.isArray(body?.student_ids) ? body.student_ids.filter(Boolean) : [];
      if (!studentIds.length) return json({ error: "student_ids required" }, 400);
      const { data: studs } = await admin.from("students").select("id, user_id, company_id, full_name").in("id", studentIds).not("user_id", "is", null);
      const rows = (studs || []) as any[];
      if (!rows.length) return json({ sent: 0 });
      if (!isServiceRole) {
        // Autorização: caller precisa ser membro da empresa dos alunos, OU o próprio aluno.
        const caller = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
        const { data: u } = await caller.auth.getUser();
        const uid = u?.user?.id;
        if (!uid) return json({ error: "unauthorized" }, 401);
        const companies = [...new Set(rows.map((r) => r.company_id).filter(Boolean))];
        const { data: member } = await admin.from("company_members").select("company_id").eq("user_id", uid).in("company_id", companies);
        const memberOf = new Set((member || []).map((m: any) => m.company_id));
        const allowed = rows.every((r) => memberOf.has(r.company_id) || r.user_id === uid);
        if (!allowed) return json({ error: "forbidden" }, 403);
      }
      targets = rows;
      if (body.event === 'new_workout') {
        const eligible: typeof targets = [];
        for (const student of targets) {
          const settings = await getCompanyProductSettings(admin, student.company_id);
          if (!settings.notifications.new_workout_enabled) continue;
          const values = messageValues({ nome: student.full_name || '' }, settings.brand.company_name);
          perUserPayload.set(student.user_id, {
            title: eventMessage(settings.messages, 'new_workout_push_title', values, payload.title),
            body: eventMessage(settings.messages, 'new_workout_push_body', values, payload.body), url: payload.url,
          });
          eligible.push(student);
        }
        targets = eligible;
      }
    }

    const userIds = [...new Set(targets.map((t) => t.user_id))];
    if (!userIds.length) return json({ sent: 0 });
    const { data: subs } = await admin.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").in("user_id", userIds);
    const claimedUsers = new Set<string>();
    for (const uid of [...new Set<string>((subs || []).map((s: any) => String(s.user_id)))]) {
      const receipt = dailyReceipts.get(uid);
      if (!receipt) { claimedUsers.add(uid); continue; }
      const claimed = await admin.from('company_push_reminder_receipts').insert(receipt);
      if (!claimed.error) claimedUsers.add(uid);
      else if (claimed.error.code !== '23505') throw new Error('push_receipt_unavailable');
    }
    let sent = 0;
    const deliveredUsers = new Set<string>();
    const dead: string[] = [];
    await Promise.all((subs || []).map(async (s: any) => {
      if (!claimedUsers.has(s.user_id)) return;
      try {
        await (overrides.send || sendPush)(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(perUserPayload.get(s.user_id) || payload),
        );
        sent++;
        deliveredUsers.add(s.user_id);
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) dead.push(s.id); // assinatura morta → limpa
      }
    }));
    for (const uid of claimedUsers) {
      const receipt = dailyReceipts.get(uid);
      if (receipt && !deliveredUsers.has(uid)) await admin.from('company_push_reminder_receipts').delete().eq('company_id', receipt.company_id).eq('user_id', uid).eq('local_date', receipt.local_date);
    }
    if (dead.length) await admin.from("push_subscriptions").delete().in("id", dead);
    return json({ sent, pruned: dead.length });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
}
if (import.meta.main) Deno.serve(req => handlePushRequest(req));
