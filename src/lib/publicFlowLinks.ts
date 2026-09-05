function cleanOrigin(origin: string): string {
  return origin.replace(/\/+$/, "");
}

function segment(value: string): string {
  return encodeURIComponent(value.trim());
}

export function preRegistrationPath(slug: string): string {
  if (!slug.trim()) throw new Error("Slug da empresa é obrigatório para o pré-cadastro.");
  return `/cadastro/${segment(slug)}`;
}

export function fiscalRegistrationPath(token: string): string {
  return `/cadastro-fiscal/${segment(token)}`;
}

export function paymentPath(token: string): string {
  return `/pagamento/${segment(token)}`;
}

export function anamnesisInvitePath(token: string): string {
  return `/anamnese-convite/${segment(token)}`;
}

export function publicUrl(origin: string, path: string): string {
  return `${cleanOrigin(origin)}${path.startsWith("/") ? path : `/${path}`}`;
}

export function preRegistrationUrl(origin: string, slug: string): string {
  return publicUrl(origin, preRegistrationPath(slug));
}

export function fiscalRegistrationUrl(origin: string, token: string): string {
  return publicUrl(origin, fiscalRegistrationPath(token));
}

export function paymentUrl(origin: string, token: string): string {
  return publicUrl(origin, paymentPath(token));
}

export function anamnesisInviteUrl(origin: string, token: string): string {
  return publicUrl(origin, anamnesisInvitePath(token));
}
