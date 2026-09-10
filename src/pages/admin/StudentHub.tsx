// Visão 360 do aluno: o painel central (linha do tempo + pasta + contato semanal).
// Junta a fundação do Claude num só lugar, por aluno.
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { StudentTimeline } from "@/components/admin/StudentTimeline";
import { StudentFilesPanel } from "@/components/admin/StudentFilesPanel";
import { WeeklyContactToggle } from "@/components/admin/WeeklyContactToggle";

interface StudentRow {
  id: string;
  full_name: string;
  company_id: string;
  weekly_contact_enabled: boolean;
  phone: string | null;
  whatsapp: string | null;
  country_code: string | null;
}

export default function StudentHub() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [student, setStudent] = useState<StudentRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let on = true;
    (async () => {
      if (!id) { setLoading(false); return; }
      const { data } = await (supabase as any)
        .from("students")
        .select("id, full_name, company_id, weekly_contact_enabled, phone, whatsapp, country_code")
        .eq("id", id)
        .maybeSingle();
      if (on) { setStudent(data ?? null); setLoading(false); }
    })();
    return () => { on = false; };
  }, [id]);

  if (loading) return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!student) return <p className="text-muted-foreground py-12 text-center">Aluno não encontrado.</p>;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-5 w-5" /></Button>
        <div>
          <p className="text-eyebrow">Visão 360</p>
          <h1 className="font-display text-2xl text-foreground leading-tight">{student.full_name}</h1>
        </div>
      </div>
      <WeeklyContactToggle
        studentId={student.id}
        initial={student.weekly_contact_enabled}
        phone={student.whatsapp || student.phone}
        countryCode={student.country_code}
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <StudentTimeline studentId={student.id} />
        <StudentFilesPanel studentId={student.id} companyId={student.company_id} />
      </div>
    </div>
  );
}
