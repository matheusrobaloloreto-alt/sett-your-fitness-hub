export const commercialStageKeys = ["interested","contacted","fiscal_registration_pending","payment_pending","active_onboarding","active","lost"] as const;
export const publicPageKeys = ["sobre","termos","privacidade"] as const;
export type PublicPageKey = typeof publicPageKeys[number];
export interface PublicTextPage { title: string; sections: { heading: string; body: string }[] }
export interface CompanyCommercialSettings {
  funnel_labels: Partial<Record<typeof commercialStageKeys[number],string>>;
  pre_registration_invite: string;
  influencer: { enabled: boolean; max_active_students: number };
  pages: Record<PublicPageKey,PublicTextPage>;
}
export const DEFAULT_COMPANY_COMMERCIAL_SETTINGS: CompanyCommercialSettings = {
  funnel_labels:{}, pre_registration_invite:"Oi! Para conhecer o acompanhamento da {{empresa}}, preencha o pré-cadastro: {{link}}",
  influencer:{enabled:true,max_active_students:0},
  pages:{sobre:{title:"",sections:[]},termos:{title:"",sections:[]},privacidade:{title:"",sections:[]}},
};
function object(value: unknown): value is Record<string,unknown> { return !!value && typeof value==="object" && !Array.isArray(value); }
function fail(): never { throw new Error("Configuração comercial inválida."); }
function allow(value: Record<string,unknown>,keys: readonly string[]) { if (Object.keys(value).some(key=>!keys.includes(key))) fail(); }
export function plainCommercialText(value: unknown,max: number): string {
  if (typeof value!=="string" || value.length>max || value.includes(String.fromCharCode(0)) || /<\/?[a-z][^>]*>|javascript:/i.test(value) || /(?:\bBearer\s+\S+|\bsk[_-][A-Za-z0-9_-]{8,}|(?:api[_ -]?key|secret|password|senha|token)\s*[:=]\s*\S+)/i.test(value)) fail();
  return value.trim();
}
export function normalizeCompanyCommercialSettings(input: unknown): CompanyCommercialSettings {
  if (!object(input)) fail(); allow(input,["funnel_labels","pre_registration_invite","influencer","pages"]);
  const value: CompanyCommercialSettings=JSON.parse(JSON.stringify(DEFAULT_COMPANY_COMMERCIAL_SETTINGS));
  if (input.funnel_labels!==undefined) {
    if (!object(input.funnel_labels)) fail(); allow(input.funnel_labels,commercialStageKeys);
    for (const [key,label] of Object.entries(input.funnel_labels)) { const text=plainCommercialText(label,60); if (!text) fail(); value.funnel_labels[key as typeof commercialStageKeys[number]]=text; }
  }
  if (input.pre_registration_invite!==undefined) {
    value.pre_registration_invite=plainCommercialText(input.pre_registration_invite,2000);
    if (!/\{\{\s*link\s*\}\}/.test(value.pre_registration_invite) || /[{}]/.test(value.pre_registration_invite.replace(/\{\{\s*(empresa|link)\s*\}\}/g,""))) fail();
  }
  if (input.influencer!==undefined) {
    if (!object(input.influencer)) fail(); allow(input.influencer,["enabled","max_active_students"]);
    if (input.influencer.enabled!==undefined) { if (typeof input.influencer.enabled!=="boolean") fail(); value.influencer.enabled=input.influencer.enabled; }
    if (input.influencer.max_active_students!==undefined) { const cap=input.influencer.max_active_students; if (typeof cap!=="number" || !Number.isInteger(cap) || cap<0 || cap>1000) fail(); value.influencer.max_active_students=cap; }
  }
  if (input.pages!==undefined) {
    if (!object(input.pages)) fail(); allow(input.pages,publicPageKeys);
    for (const key of publicPageKeys) {
      const page=input.pages[key]; if (page===undefined) continue;
      if (!object(page)) fail(); allow(page,["title","sections"]);
      if (!Array.isArray(page.sections) || page.sections.length>12) fail();
      value.pages[key]={ title:plainCommercialText(page.title,120),sections:page.sections.map(section=>{ if (!object(section)) fail(); allow(section,["heading","body"]); return {heading:plainCommercialText(section.heading,120),body:plainCommercialText(section.body,8000)}; }) };
    }
  }
  return value;
}
export function renderPreRegistrationInvite(settings: CompanyCommercialSettings,companyName: string,link: string) {
  return settings.pre_registration_invite.replace(/\{\{\s*(empresa|link)\s*\}\}/g,(_,key:string)=>key==="empresa" ? companyName : link);
}
