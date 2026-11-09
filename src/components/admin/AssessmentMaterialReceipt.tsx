import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export function AssessmentMaterialReceipt({ studentId, companyId, onboarding }: {
  studentId: string;
  companyId: string;
  onboarding: boolean;
}) {
  const [receivedOn, setReceivedOn] = useState("");
  const [materialReference, setMaterialReference] = useState("");
  const queryClient = useQueryClient();
  const queryKey = ["assessment-material-receipt", companyId, studentId];
  const receipt = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase.from("assessment_material_receipts")
        .select("received_on, material_reference, assessment_due_on, first_prescription_due_on")
        .eq("company_id", companyId).eq("student_id", studentId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const record = useMutation({
    mutationFn: async ({ date, reference }: { date: string; reference: string }) => {
      const { data, error } = await supabase.rpc("record_assessment_material_receipt", {
        _company_id: companyId, _student_id: studentId, _received_on: date, _material_reference: reference,
      }).single();
      if (error) throw error;
      if (!data || data.company_id !== companyId || data.student_id !== studentId
        || data.received_on !== date || data.material_reference !== reference) {
        throw new Error("Não foi possível confirmar o recebimento. Atualize e confira a data.");
      }
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, data);
      void queryClient.invalidateQueries({ queryKey: ["dashboard-assessment-queue"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard-first-training"] });
    },
    onError: () => { void queryClient.invalidateQueries({ queryKey }); },
  });

  if (!onboarding && !receipt.data) return null;
  if (receipt.isPending) return <p role="status">Consultando recebimento do material…</p>;
  if (receipt.data) {
    const date = (value: string) => format(parseISO(value), "dd/MM/yyyy");
    return <div className="mt-3 space-y-1 text-sm">
      <p>Material recebido em {date(receipt.data.received_on)}</p>
      <p>Referência do material: {receipt.data.material_reference}</p>
      <p>Avaliação até {date(receipt.data.assessment_due_on)}</p>
      <p>Primeira prescrição até {date(receipt.data.first_prescription_due_on)}</p>
      {record.error && <p role="alert" className="text-destructive">{record.error.message}</p>}
    </div>;
  }
  if (receipt.error) return <p role="alert" className="text-destructive">Não foi possível consultar o recebimento do material.</p>;
  return <form className="mt-3 space-y-2" onSubmit={(event) => {
    event.preventDefault();
    if (receivedOn && materialReference.trim().length >= 3 && !record.isPending) {
      record.mutate({ date: receivedOn, reference: materialReference.trim() });
    }
  }}>
    <Label htmlFor="assessment-material-received-on">Data em que o material completo foi recebido</Label>
    <Input id="assessment-material-received-on" className="w-auto" type="date" required value={receivedOn}
      onChange={(event) => setReceivedOn(event.target.value)} disabled={record.isPending} />
    <Label htmlFor="assessment-material-reference">Referência do envio</Label>
    <Input id="assessment-material-reference" required maxLength={200} value={materialReference}
      onChange={(event) => setMaterialReference(event.target.value)} disabled={record.isPending}
      placeholder="Ex.: vídeos recebidos pelo WhatsApp" />
    <Button type="submit" size="sm" variant="outline" disabled={!receivedOn || materialReference.trim().length < 3 || record.isPending}>
      {record.isPending ? "Registrando…" : "Registrar recebimento"}
    </Button>
    {record.error && <p role="alert" className="text-destructive">{record.error.message}</p>}
  </form>;
}
