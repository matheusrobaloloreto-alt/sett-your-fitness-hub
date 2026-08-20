import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const BACKENDS = {
  production: {
    projectRef: "zshrcgbyhzxpnlccssyz",
    publishableKeySha256: "3d887e5373f274d113cb3b6dd9f5b654ecce3bcfc3255bcb7d76c21498caf60c",
    defaultPublishableKey: "sb_publishable_8hCHHItU79APt0pt7NrZcw_OPHCUd_d",
  },
  staging: {
    projectRef: "ifymocggowdlqqcxugko",
    publishableKeySha256: "b527094a4d6713e7bce1e82c5d4c4899ba08f9e249518f6aef8d281458673cd8",
  },
};

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const flagValue = (args, name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};

export function resolveVideoIngestConfig({
  args = [],
  env = process.env,
  home = homedir(),
} = {}) {
  const target = env.SETT_DEPLOY_TARGET;
  const backend = BACKENDS[target];
  if (!backend) {
    throw new Error("Defina SETT_DEPLOY_TARGET explicitamente como staging ou production.");
  }

  const confirmedProject = flagValue(args, "confirm-project");
  if (confirmedProject !== backend.projectRef) {
    throw new Error(`Confirme o projeto ${backend.projectRef} com --confirm-project.`);
  }

  const expectedUrl = `https://${backend.projectRef}.supabase.co`;
  const supabaseUrl = target === "staging"
    ? env.VIDEO_INGEST_SUPABASE_URL || env.SUPABASE_URL
    : env.VIDEO_INGEST_SUPABASE_URL || expectedUrl;
  const publishableKey = target === "staging"
    ? env.VIDEO_INGEST_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY
    : env.VIDEO_INGEST_PUBLISHABLE_KEY || backend.defaultPublishableKey;

  if (supabaseUrl !== expectedUrl) {
    throw new Error(`Backend ${target} não corresponde ao projeto confirmado.`);
  }
  if (!publishableKey || sha256(publishableKey) !== backend.publishableKeySha256) {
    throw new Error(`Chave pública inválida para o backend ${target}.`);
  }

  let secret = env.VIDEO_INGEST_SECRET || "";
  if (target === "staging" && !secret) {
    throw new Error("Staging exige VIDEO_INGEST_SECRET explícito; não há fallback local.");
  }
  if (target === "production" && !secret) {
    const secretPath = join(home, ".bn-video-ingest-secret");
    if (existsSync(secretPath)) secret = readFileSync(secretPath, "utf8").trim();
  }
  if (!secret) throw new Error(`Segredo operacional ausente para ${target}.`);

  return {
    target,
    projectRef: backend.projectRef,
    endpoint: `${supabaseUrl}/functions/v1/library-video-ingest`,
    publishableKey,
    secret,
  };
}

export async function requestVideoIngest(config, body, fetchImpl = fetch) {
  const response = await fetchImpl(config.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.publishableKey}`,
      "x-webhook-secret": config.secret,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = payload?.error?.code || "request_failed";
    throw new Error(`${body.action}: HTTP ${response.status} ${code}`);
  }
  return payload;
}

