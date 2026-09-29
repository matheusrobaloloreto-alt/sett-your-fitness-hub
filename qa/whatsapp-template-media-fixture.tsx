/* eslint-disable react-refresh/only-export-components */
import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes, Link } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "../src/hooks/useAuth";
import { MasterProvider, useMaster } from "../src/contexts/MasterContext";
import { ThemeProvider } from "../src/contexts/ThemeContext";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { Toaster } from "../src/components/ui/sonner";
import WhatsAppTemplates from "../src/pages/admin/WhatsAppTemplates";
import WhatsAppChat from "../src/pages/admin/WhatsAppChat";
import { supabase } from "../src/integrations/supabase/client";
import "../src/index.css";

const companyId = "20000000-0000-4000-8000-000000000001";
const otherCompanyId = "20000000-0000-4000-8000-000000000002";
const userId = "10000000-0000-4000-8000-000000000001";
const now = "2026-09-29T12:00:00.000Z";
const params = new URLSearchParams(location.search);
const companies = [companyId, otherCompanyId].map((id, index) => ({ id, name: `Empresa QA ${index + 1}`, tier: "advanced", slug: `qa-${index}` }));
const templateId = "media-template";
const media = [
  { name: "foto.png", mimeType: "image/png", size: 100 },
  { name: "video.mp4", mimeType: "video/mp4", size: 100 },
  { name: "audio.wav", mimeType: "audio/wav", size: 100 },
  { name: "manual.pdf", mimeType: "application/pdf", size: 100 },
].map((item, index) => ({ ...item, path: `${companyId}/templates/${templateId}/part-${index}.bin` }));
const saved = sessionStorage.getItem("template-media-qa-rows");
const rows: Record<string, any[]> = {
  company_members: [{ company_id: companyId, user_id: userId, companies: companies[0] }],
  companies,
  profiles: [{ user_id: userId, full_name: "Profissional QA" }],
  platform_settings: [],
  students: [{ id: "student-qa", company_id: companyId, full_name: "Contato QA sintetico", whatsapp: "5548999990001", status: "active" }],
  whatsapp_chats: [
    { id: "chat-qa", company_id: companyId, remote_jid: "5548999990001@s.whatsapp.net", student_id: "student-qa", contact_name: "Contato QA sintetico", unread_count: 0, last_message_at: now, is_archived: false },
    { id: "chat-second", company_id: companyId, remote_jid: "5548999990002@s.whatsapp.net", student_id: null, contact_name: "Segundo QA sintetico", unread_count: 0, last_message_at: now, is_archived: false },
    { id: "chat-other", company_id: otherCompanyId, remote_jid: "5548999990003@s.whatsapp.net", student_id: null, contact_name: "Outra empresa QA", unread_count: 0, last_message_at: now, is_archived: false },
  ],
  whatsapp_messages: [],
  message_templates: saved ? JSON.parse(saved) : [
    { id: templateId, company_id: companyId, name: "Multimidia QA", title: "Multimidia QA", content: "Ola {{primeiro_nome}}", shortcut: "midia", attachments: media },
    { id: "legacy-template", company_id: companyId, name: "Texto legado QA", title: "Texto legado QA", content: "Texto legado sem anexos", shortcut: "texto" },
    { id: "invalid-template", company_id: companyId, name: "Invalido QA", title: "Invalido QA", content: "Nao enviar", shortcut: "invalido", attachments: [{ ...media[0], path: `${otherCompanyId}/templates/invalid-template/part.png` }] },
    { id: "other-template", company_id: otherCompanyId, name: "Outra empresa QA", title: "Outra empresa QA", content: "Privado", attachments: [] },
  ],
};
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const log = { uploads: [] as string[], removals: [] as string[], writes: [] as any[], reads: [] as any[] };
const files: Record<string, string> = JSON.parse(sessionStorage.getItem("template-media-qa-files") || "{}");
let activeCompanyId = companyId;
let releaseUpload: (() => void) | null = null;
let holdNextUpload = false;
let loseNextSaveAck = false;
let failReconciliationReads = 0;

class Query {
  private filters: Array<(row: any) => boolean> = [];
  private scope: string | null = null;
  private one = false;
  private mutation: { action: string; payload?: any } | null = null;
  constructor(private table: string) {}
  select() { return this; }
  eq(column: string, value: any) { if (column === "company_id") this.scope = value; this.filters.push((row) => row[column] === value); return this; }
  neq(column: string, value: any) { this.filters.push((row) => row[column] !== value); return this; }
  is(column: string, value: any) { this.filters.push((row) => (row[column] ?? null) === value); return this; }
  in(column: string, value: any[]) { this.filters.push((row) => value.includes(row[column])); return this; }
  not() { return this; }
  or() { return this; }
  order() { return this; }
  limit() { return this; }
  range() { return this; }
  lt() { return this; }
  lte() { return this; }
  gte() { return this; }
  insert(payload: any) { this.mutation = { action: "insert", payload }; return this; }
  update(payload: any) { this.mutation = { action: "update", payload }; return this; }
  delete() { this.mutation = { action: "delete" }; return this; }
  single() { this.one = true; return this.execute(); }
  maybeSingle() { this.one = true; return this.execute(); }
  then(resolve: any, reject: any) { return this.execute().then(resolve, reject); }
  private async execute() {
    log.reads.push({ table: this.table, scope: this.scope });
    if (this.table === "message_templates" && !this.mutation && this.one && failReconciliationReads > 0) {
      failReconciliationReads--;
      throw new Error("Reconciliacao QA indisponivel");
    }
    let result = (rows[this.table] || []).filter((row) => this.filters.every((filter) => filter(row)));
    if (this.mutation) {
      const { action, payload } = this.mutation;
      log.writes.push({ table: this.table, action, payload: clone(payload || {}), scope: this.scope });
      if (this.table === "message_templates") {
        if (action === "insert") { result = [clone(payload)]; rows[this.table].push(...result); }
        if (action === "update") result.forEach((row) => Object.assign(row, clone(payload)));
        if (action === "delete") rows[this.table] = rows[this.table].filter((row) => !result.includes(row));
        sessionStorage.setItem("template-media-qa-rows", JSON.stringify(rows[this.table]));
        if (loseNextSaveAck) { loseNextSaveAck = false; throw new Error("ACK de salvamento QA perdido"); }
      }
    }
    if (this.table === "whatsapp_chats") result = result.map((row) => ({ ...row, student: rows.students.find((student) => student.id === row.student_id) || null }));
    return { data: clone(this.one ? result[0] || null : result), error: null, count: result.length };
  }
}

const session = { access_token: "mock-template-media-session", user: { id: userId, app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: now } };
(supabase as any).auth = {
  getSession: async () => ({ data: { session }, error: null }),
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  signOut: async () => ({ error: null }),
};
Object.defineProperty(supabase, "from", { configurable: true, value: (table: string) => new Query(table) });
Object.defineProperty(supabase, "rpc", { configurable: true, value: async (name: string) => ({ data: name === "get_user_role" ? "master" : true, error: null }) });
Object.defineProperty(supabase, "functions", { configurable: true, value: { invoke: async () => ({ data: { ok: true }, error: null }) } });
Object.defineProperty(supabase, "channel", { configurable: true, value: () => { const channel = { on: () => channel, subscribe: () => channel, unsubscribe() {} }; return channel; } });
Object.defineProperty(supabase, "removeChannel", { configurable: true, value: () => {} });
Object.defineProperty(supabase, "storage", { configurable: true, value: { from: (bucket: string) => ({
  upload: async (path: string, file: File) => {
    if (bucket !== "whatsapp-media" || !path.startsWith(`${activeCompanyId}/templates/`)) throw new Error("Upload fora do escopo QA");
    log.uploads.push(path);
    if (holdNextUpload) { holdNextUpload = false; await new Promise<void>((resolve) => { releaseUpload = resolve; }); }
    files[path] = await new Promise<string>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(file); });
    sessionStorage.setItem("template-media-qa-files", JSON.stringify(files));
    return { data: { path }, error: null };
  },
  remove: async (paths: string[]) => { log.removals.push(...paths); paths.forEach((path) => { delete files[path]; }); return { data: [], error: null }; },
  createSignedUrl: async (path: string) => ({ data: { signedUrl: files[path] || "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=" }, error: null }),
  getPublicUrl: () => ({ data: { publicUrl: "" } }),
}) } });

(window as any).__templateMediaQA = {
  getLog: () => clone(log),
  getTemplates: () => clone(rows.message_templates),
  getFilePaths: () => Object.keys(files),
  loseSaveAck: () => { loseNextSaveAck = true; failReconciliationReads = 1; },
  holdUpload: () => { holdNextUpload = true; },
  releaseUpload: () => { releaseUpload?.(); releaseUpload = null; },
  addMessage: (message: any) => rows.whatsapp_messages.push({ ...message, company_id: activeCompanyId }),
};
localStorage.setItem("master_viewing_company", JSON.stringify(companies[0]));

function Ready() {
  const { loading } = useAuth();
  const { contextLoading, setViewingCompany } = useMaster();
  if (loading || contextLoading) return <div>Carregando QA...</div>;
  return (
    <MemoryRouter initialEntries={[params.get("route") || "/admin/whatsapp-templates"]}>
      <nav className="flex flex-wrap gap-3 p-2 text-xs" aria-label="Navegacao QA">
        <Link to="/admin/whatsapp-templates">Templates QA</Link>
        <Link to="/admin/whatsapp-chat">Chat QA</Link>
        <button onClick={() => { activeCompanyId = activeCompanyId === companyId ? otherCompanyId : companyId; setViewingCompany(companies.find((company) => company.id === activeCompanyId)!); }}>Trocar empresa QA</button>
      </nav>
      <Routes>
        <Route path="/admin/whatsapp-templates" element={<main className="px-3"><WhatsAppTemplates /></main>} />
        <Route path="/admin/whatsapp-chat" element={<WhatsAppChat embedded />} />
      </Routes>
    </MemoryRouter>
  );
}
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById("root")!).render(
  <React.StrictMode><QueryClientProvider client={client}><TooltipProvider><AuthProvider><MasterProvider><ThemeProvider><Ready /><Toaster /></ThemeProvider></MasterProvider></AuthProvider></TooltipProvider></QueryClientProvider></React.StrictMode>,
);
