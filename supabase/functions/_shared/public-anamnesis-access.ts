import { HttpError, isUuid } from "./tenant-auth.ts";

export interface AnamnesisInviteAccess {
  id: string;
  student_id: string;
  company_id: string;
  expires_at?: string | null;
}

interface AccessDependencies<TClaims> {
  findInvite(token: string): Promise<AnamnesisInviteAccess | null>;
  getAuthenticatedClaims(): Promise<TClaims | null>;
  assertStudentAccess(claims: TClaims, studentId: string): Promise<{ companyId: string }>;
}

export interface ResolvedAnamnesisAccess {
  studentId: string;
  companyId: string;
  invite: AnamnesisInviteAccess | null;
  source: "invite" | "authenticated";
}

/**
 * Resolve o alvo antes de qualquer leitura com service role. Um token opaco de
 * convite pode abrir o fluxo público; UUID puro exige sessão e posse/empresa.
 */
export async function resolvePublicAnamnesisAccess<TClaims>(
  body: Record<string, unknown>,
  deps: AccessDependencies<TClaims>,
): Promise<ResolvedAnamnesisAccess> {
  const accessKey = typeof body.accessKey === "string"
    ? body.accessKey.trim()
    : typeof body.token === "string"
      ? body.token.trim()
      : "";

  if (accessKey) {
    const invite = await deps.findInvite(accessKey);
    if (invite) {
      if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
        throw new HttpError(410, "Convite expirado.");
      }
      return {
        studentId: invite.student_id,
        companyId: invite.company_id,
        invite,
        source: "invite",
      };
    }
  }

  const requestedStudentId = isUuid(accessKey)
    ? accessKey
    : isUuid(body.studentId)
      ? body.studentId
      : null;
  if (!requestedStudentId) {
    throw new HttpError(accessKey ? 404 : 400, accessKey ? "Convite não encontrado." : "Link inválido.");
  }

  const claims = await deps.getAuthenticatedClaims();
  if (!claims) throw new HttpError(401, "Autenticação necessária para acessar este aluno.");
  const tenant = await deps.assertStudentAccess(claims, requestedStudentId);
  return {
    studentId: requestedStudentId,
    companyId: tenant.companyId,
    invite: null,
    source: "authenticated",
  };
}
