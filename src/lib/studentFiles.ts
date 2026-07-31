// Pasta automática por aluno: salva arquivos (relatórios de avaliação, mídias do WhatsApp
// que o professor escolher baixar) no bucket "student-files" + registra em student_files.
// Convenção de path: {company_id}/{student_id}/{timestamp-arquivo}.
import { supabase } from "@/integrations/supabase/client";

export type StudentFileKind = "assessment_report" | "whatsapp_media" | "other";

export interface StudentFile {
  id: string;
  student_id: string;
  company_id: string;
  file_path: string;
  file_name: string;
  kind: StudentFileKind;
  source: string;
  created_at: string;
}

const BUCKET = "student-files";

function buildPath(companyId: string, studentId: string, fileName: string, stampMs: number, stableName?: boolean): string {
  const safe = fileName.replace(/[^\w.-]+/g, "_");
  // stableName: path determinístico por aluno → o upsert sobrescreve (ex.: 1 laudo atual por aluno).
  // Sem ele, prefixa o timestamp → mantém histórico (ex.: mídias do WhatsApp).
  return stableName ? `${companyId}/${studentId}/${safe}` : `${companyId}/${studentId}/${stampMs}-${safe}`;
}

/**
 * Salva um arquivo (Blob/File) na pasta do aluno e registra em student_files.
 * `stampMs` é passado de fora (Date.now()) para manter a função previsível.
 */
export async function saveStudentFile(opts: {
  studentId: string;
  companyId: string;
  data: Blob | File;
  fileName: string;
  kind?: StudentFileKind;
  source?: string;
  contentType?: string;
  stampMs: number;
  stableName?: boolean;
  metadata?: Record<string, unknown>;
}): Promise<{ error: string | null; path?: string }> {
  const path = buildPath(opts.companyId, opts.studentId, opts.fileName, opts.stampMs, opts.stableName);

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, opts.data, { contentType: opts.contentType, upsert: true });
  if (upErr) return { error: `upload: ${upErr.message}` };

  const { error: dbErr } = await (supabase as any).from("student_files").upsert(
    {
      student_id: opts.studentId,
      company_id: opts.companyId,
      file_path: path,
      file_name: opts.fileName,
      kind: opts.kind ?? "other",
      source: opts.source ?? "app",
      metadata: opts.metadata ?? {},
    },
    { onConflict: "student_id,file_path" },
  );
  if (dbErr) return { error: `registro: ${dbErr.message}` };

  return { error: null, path };
}

/** Lista os arquivos da pasta de um aluno (mais recentes primeiro). */
export async function listStudentFiles(studentId: string): Promise<StudentFile[]> {
  const { data } = await (supabase as any)
    .from("student_files")
    .select("id, student_id, company_id, file_path, file_name, kind, source, created_at")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });
  return (data as StudentFile[]) ?? [];
}

/** URL assinada temporária para abrir/baixar um arquivo da pasta. */
export async function signStudentFile(path: string, expiresSec = 3600): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresSec);
  return data?.signedUrl ?? null;
}
