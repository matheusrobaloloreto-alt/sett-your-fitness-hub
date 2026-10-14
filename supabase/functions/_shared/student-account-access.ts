import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { HttpError } from "./tenant-auth.ts";

export type AccountStudent = {
  id: string;
  company_id: string;
  user_id: string | null;
  email: string;
  full_name: string;
};

type AccountIdentity = {
  userId: string;
  hasStudentRole: boolean;
  hasMembership: boolean;
};
const reconciliation = () =>
  new HttpError(
    409,
    "Conta requer reconciliacao manual antes de liberar acesso ao aluno.",
  );
const unavailable = () =>
  new HttpError(
    503,
    "Nao foi possivel validar ou salvar o acesso do aluno. Tente novamente ou solicite reconciliacao manual.",
  );
const normalizedEmail = (value: string) => value.trim().toLowerCase();

async function validateAccountIdentity(
  client: SupabaseClient,
  student: AccountStudent,
  userId: string,
  linked: boolean,
): Promise<AccountIdentity> {
  const [roles, links, memberships] = await Promise.all([
    client.from("user_roles").select("role").eq("user_id", userId),
    client.from("students").select("id, company_id, user_id").eq(
      "user_id",
      userId,
    ),
    client.from("company_members").select("company_id").eq("user_id", userId),
  ]);
  if (
    roles.error || links.error || memberships.error ||
    !Array.isArray(roles.data) || !Array.isArray(links.data) ||
    !Array.isArray(memberships.data)
  ) {
    throw unavailable();
  }

  // Unknown roles are also denied; account recovery must never reclassify staff.
  if (roles.data.some((row) => row.role !== "student")) throw reconciliation();
  if (linked) {
    if (
      student.user_id !== userId || links.data.length !== 1 ||
      links.data[0].id !== student.id ||
      links.data[0].company_id !== student.company_id ||
      links.data[0].user_id !== userId
    ) throw reconciliation();
  } else if (links.data.length !== 0) {
    throw reconciliation();
  }
  if (
    memberships.data.length > 1 ||
    memberships.data.some((row) => row.company_id !== student.company_id)
  ) {
    throw reconciliation();
  }
  return {
    userId,
    hasStudentRole: roles.data.length > 0,
    hasMembership: memberships.data.length === 1,
  };
}

export async function getLinkedStudentAccount(
  client: SupabaseClient,
  student: AccountStudent,
): Promise<AccountIdentity | null> {
  if (!student.user_id) return null;
  const { data, error } = await client.auth.admin.getUserById(student.user_id);
  if (error) {
    // An outage/permission error is not evidence of an orphaned auth identity.
    if (error.status === 404 && error.code === "user_not_found") return null;
    throw unavailable();
  }
  if (!data?.user?.id) throw unavailable();
  if (
    data.user.id !== student.user_id || !data.user.email ||
    normalizedEmail(data.user.email) !== normalizedEmail(student.email)
  ) throw reconciliation();
  return await validateAccountIdentity(client, student, data.user.id, true);
}

export async function ensureStudentAccountMembership(
  client: SupabaseClient,
  student: AccountStudent,
  identity: AccountIdentity,
): Promise<void> {
  // INSERT, never user_id upsert: a conflicting membership must not move tenants.
  if (!identity.hasMembership) {
    const { data, error } = await client.from("company_members").insert({
      user_id: identity.userId,
      company_id: student.company_id,
    }).select("user_id, company_id").single();
    if (error) throw error.code === "23505" ? reconciliation() : unavailable();
    if (
      data?.user_id !== identity.userId ||
      data?.company_id !== student.company_id
    ) throw unavailable();
  }
  if (!identity.hasStudentRole) {
    const { data, error } = await client.from("user_roles").insert({
      user_id: identity.userId,
      role: "student",
    })
      .select("user_id, role").single();
    if (
      error || data?.user_id !== identity.userId || data?.role !== "student"
    ) throw unavailable();
  }
}

export async function createStudentAccount(
  client: SupabaseClient,
  student: AccountStudent,
  password: string,
): Promise<string> {
  const { data, error } = await client.auth.admin.createUser({
    email: student.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: student.full_name },
  });
  if (error) {
    if (
      ["email_exists", "user_already_exists"].includes(error.code || "") ||
      /already (?:been )?registered/i.test(error.message)
    ) throw reconciliation();
    throw unavailable();
  }
  const user = data?.user;
  if (
    !user?.id || !user.email ||
    normalizedEmail(user.email) !== normalizedEmail(student.email)
  ) throw unavailable();
  const identity = await validateAccountIdentity(
    client,
    student,
    user.id,
    false,
  );

  // Compare the original link and tenant, and require a returned row as write evidence.
  let link = client.from("students").update({ user_id: user.id })
    .eq("id", student.id).eq("company_id", student.company_id);
  link = student.user_id
    ? link.eq("user_id", student.user_id)
    : link.is("user_id", null);
  const { data: saved, error: linkError } = await link.select("id, user_id")
    .single();
  if (
    linkError || !saved || saved.id !== student.id || saved.user_id !== user.id
  ) throw unavailable();
  await ensureStudentAccountMembership(client, student, identity);
  return user.id;
}
