import { useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { normalizeSearchText } from "@/lib/normalizeSearchText";
import { readPages } from "@/lib/pagedRead";

interface Props {
  companyId: string;
  userId: string;
  role: string;
  paused?: boolean;
}

export function PanelStudentSearch({ companyId, userId, role, paused }: Props) {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const resultsId = useId();
  const navigate = useNavigate();
  const prefix = role === "master" ? "admin" : role;
  const studentPath = (id: string) => `/${prefix}/students/${encodeURIComponent(id)}`;
  const term = normalizeSearchText(value);
  const showResults = open && !paused && term.length >= 2;

  const students = useQuery({
    queryKey: ["panel-student-search", companyId, userId, role],
    enabled: showResults,
    staleTime: 0,
    retry: false,
    queryFn: async () => {
      const rows = await readPages((from, to) => supabase.from("students")
        .select("id, full_name, company_id").eq("company_id", companyId)
        .order("full_name").order("id").range(from, to));
      if (rows.some(row => row.company_id !== companyId)) throw new Error("Aluno fora da empresa consultada.");
      return rows.map(row => ({ id: row.id, name: row.full_name, searchName: normalizeSearchText(row.full_name) }));
    },
  });
  const matches = showResults && !students.isFetching && !students.isError
    ? (students.data ?? []).filter(student => student.searchName.includes(term)).slice(0, 8)
    : [];

  return (
    <form role="search" aria-label="Busca de alunos" className="relative min-w-0 w-full max-w-md justify-self-center"
      onSubmit={event => {
        event.preventDefault();
        if (matches[0]) navigate(studentPath(matches[0].id));
      }}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={event => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          input.current?.focus();
          setOpen(false);
        }
      }}>
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input ref={input} type="search" aria-label="Pesquisar alunos" aria-controls={showResults ? resultsId : undefined}
        placeholder="Pesquisar alunos" autoComplete="off" value={value} maxLength={120}
        className="h-9 rounded-full bg-background/70 pl-9"
        onFocus={() => setOpen(true)} onChange={event => { setValue(event.target.value); setOpen(true); }} />
      {showResults && (
        <div id={resultsId} className="absolute inset-x-0 top-full z-40 mt-2 max-h-64 overflow-auto rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg">
          {students.isFetching ? <p role="status" className="px-3 py-2 text-sm">Buscando alunos…</p>
            : students.isError ? <p role="alert" className="px-3 py-2 text-sm">Não foi possível buscar os alunos.</p>
            : matches.length === 0 ? <p role="status" className="px-3 py-2 text-sm">Nenhum aluno encontrado.</p>
            : <ul aria-label="Alunos encontrados">
              {matches.map(student => (
                <li key={student.id}>
                  <Link to={studentPath(student.id)} onMouseDown={event => event.preventDefault()}
                    className="block break-words rounded-lg px-3 py-2 text-sm hover:bg-accent focus-visible:bg-accent">
                    {student.name}
                  </Link>
                </li>
              ))}
            </ul>}
        </div>
      )}
    </form>
  );
}
