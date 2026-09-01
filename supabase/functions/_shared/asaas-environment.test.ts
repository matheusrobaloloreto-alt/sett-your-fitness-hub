import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  asaasApiUrl,
  resolveAsaasApiConfig,
} from "./asaas-environment.ts";

Deno.test("aceita somente as bases oficiais de producao e sandbox", () => {
  assertEquals(resolveAsaasApiConfig("https://api.asaas.com/v3"), {
    baseUrl: "https://api.asaas.com/v3",
    environment: "production",
  });
  assertEquals(resolveAsaasApiConfig("https://api-sandbox.asaas.com/v3"), {
    baseUrl: "https://api-sandbox.asaas.com/v3",
    environment: "sandbox",
  });
});

Deno.test("falha fechado quando ASAAS_BASE_URL esta ausente ou fora da allowlist", () => {
  for (const value of [
    undefined,
    "",
    "https://api.asaas.com",
    "https://api.asaas.com/v3/",
    "http://api.asaas.com/v3",
    "https://api.asaas.com.evil.example/v3",
    "https://api-sandbox.asaas.com/v3?target=production",
  ]) {
    assertThrows(() => resolveAsaasApiConfig(value));
  }
});

Deno.test("constroi somente paths relativos a API configurada", () => {
  const config = resolveAsaasApiConfig("https://api-sandbox.asaas.com/v3");
  assertEquals(
    asaasApiUrl(config, "/customers?limit=1&offset=0"),
    "https://api-sandbox.asaas.com/v3/customers?limit=1&offset=0",
  );
  assertThrows(() => asaasApiUrl(config, "customers"));
  assertThrows(() => asaasApiUrl(config, "//attacker.example/payments"));
  assertThrows(() => asaasApiUrl(config, "https://attacker.example/payments"));
});
