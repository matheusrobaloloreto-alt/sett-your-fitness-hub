import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { safePublicUrl } from "@/lib/platformSettingsClient";
import type { PublicTextPage } from "@/lib/companyCommercialSettings";

type PublicCompany = { name: string; slug: string; documents?:Record<string,PublicTextPage & {version:number}>; brand: { company_name?: string; terms_url?: string; privacy_url?: string; support_email?: string; support_whatsapp?: string } };
// Routes: /empresa/:slug/:page; page is termos, privacidade or suporte.
export default function PublicCompanyInformation() {
  const { slug, page } = useParams<{ slug: string; page: string }>();
  const [company, setCompany] = useState<PublicCompany | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setCompany(null); setError(""); setLoading(true);
    if (!slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) { setLoading(false); setError("Empresa não encontrada."); return; }
    void supabase.rpc("get_public_company_information" as never, { _slug: slug } as never).then(({ data, error }) => {
      if (!active) return;
      if (error || !data) setError("Empresa não encontrada ou indisponível.");
      else setCompany(data as unknown as PublicCompany);
      setLoading(false);
    }, () => { if (active) { setLoading(false); setError("Empresa indisponível."); } });
    return () => { active = false; };
  }, [slug]);
  if (!["sobre","termos", "privacidade", "suporte"].includes(page || "")) return <main className="p-6"><p role="alert">Página não encontrada.</p></main>;
  const document=company?.documents?.[page || ""];
  const title = document?.title || (page === "sobre" ? "Apresentação" : page === "termos" ? "Termos de uso" : page === "privacidade" ? "Privacidade" : "Suporte");
  const url = safePublicUrl(page === "termos" ? company?.brand.terms_url : company?.brand.privacy_url);
  const email = company?.brand.support_email || "";
  const safeEmail = /^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(email) ? email : "";
  const phone = (company?.brand.support_whatsapp || "").replace(/[^0-9]/g, "");
  return <main className="max-w-3xl mx-auto px-4 py-10 space-y-6">
    {loading && <p role="status">Carregando...</p>}{error && <p role="alert">{error}</p>}
    {company && <><p className="text-lg font-semibold">{company.brand.company_name || company.name}</p><h1 className="text-2xl font-semibold">{title}</h1><nav className="flex flex-wrap gap-4 text-sm">{["sobre","termos", "privacidade", "suporte"].map(item => <Link key={item} to={`/empresa/${encodeURIComponent(company.slug)}/${item}`}>{item === "sobre" ? "Apresentação" : item === "termos" ? "Termos" : item === "privacidade" ? "Privacidade" : "Suporte"}</Link>)}</nav>
      {page === "suporte" ? <div className="space-y-4">{safeEmail && <p><a href={`mailto:${safeEmail}`}>{safeEmail}</a></p>}{/^[1-9][0-9]{7,14}$/.test(phone) && <p><a href={`https://wa.me/${phone}`} target="_blank" rel="noopener noreferrer">WhatsApp da empresa</a></p>}{!safeEmail && !/^[1-9][0-9]{7,14}$/.test(phone) && <p>Canal de suporte ainda não informado pela empresa.</p>}</div> : document ? <article className="space-y-6">{document.sections.map((section,index)=><section key={index} className="space-y-2 break-words">{section.heading&&<h2 className="text-lg font-semibold">{section.heading}</h2>}<p className="whitespace-pre-wrap">{section.body}</p></section>)}<p className="text-xs text-muted-foreground">Versão {document.version}</p></article> : url ? <a className="underline" href={url} target="_blank" rel="noopener noreferrer">Consultar documento fornecido por {company.name}</a> : <p>Documento ainda não informado pela empresa.</p>}
    </>}
  </main>;
}
