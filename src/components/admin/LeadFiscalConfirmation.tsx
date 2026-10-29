import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

// Stable ISO 3166-1 alpha-2 values; display names are localized for people, never inferred from a phone.
const COUNTRY_CODES = 'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ');
const countryNames = new Intl.DisplayNames(['pt-BR'], { type: 'region' });
const COUNTRY_OPTIONS = COUNTRY_CODES.map(code => ({ code, name: countryNames.of(code) || code })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

export interface LeadPhoneConfirmation { phoneCountry: string; phoneFormat: 'national' | 'e164'; phoneDigits: string }
function validateLeadPhoneConfirmation(phone: string | null, country: string, format: string): LeadPhoneConfirmation | null {
  const phoneCountry = country.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(phoneCountry) || !['national', 'e164'].includes(format)) return null;
  if (!phone || !/^\+?[\d\s().-]+$/.test(phone.trim())) return null;
  const digits = phone.replace(/\D/g, '');
  if (format === 'national') {
    if (phoneCountry !== 'BR' || !/^[1-9]\d{9,10}$/.test(digits) || phone.trim().startsWith('+')) return null;
    return { phoneCountry, phoneFormat: 'national', phoneDigits: `55${digits}` };
  }
  if (phoneCountry === 'BR' ? !/^55[1-9]\d{9,10}$/.test(digits) : !/^[1-9]\d{7,14}$/.test(digits)) return null;
  return { phoneCountry, phoneFormat: 'e164', phoneDigits: digits };
}

export function LeadFiscalConfirmation({ name, phone, onClose, onConfirm }: {
  name: string; phone: string | null; onClose: () => void;
  onConfirm: (confirmation: LeadPhoneConfirmation, isCurrent: () => boolean) => Promise<void>;
}) {
  const [country, setCountry] = useState(''); const [format, setFormat] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const active = useRef(true); const pending = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const confirmation = validateLeadPhoneConfirmation(phone, country, format);
  const close = () => { active.current = false; onClose(); };
  const submit = async () => {
    if (!confirmation || pending.current || !active.current) return;
    pending.current = true; setBusy(true); setError('');
    try { await onConfirm(confirmation, () => active.current); }
    catch (cause) { if (active.current) setError(cause instanceof Error ? cause.message : 'Não foi possível preparar o cadastro.'); }
    finally { pending.current = false; if (active.current) setBusy(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open) close(); }}><DialogContent className="max-w-lg"><DialogHeader>
    <DialogTitle>Confirmar telefone do Lead</DialogTitle>
    <DialogDescription>Confirme o país e como o telefone foi informado para evitar vincular pessoas diferentes. Preparar o cadastro cria um rascunho e um link fiscal; não ativa o aluno e não envia mensagem.</DialogDescription>
  </DialogHeader>
    <p className="break-words"><strong>{name}</strong><br />Telefone informado: {phone || 'Não informado'}</p>
    <label>País do telefone<select className="block w-full rounded border bg-background p-2" aria-label="País do telefone" value={country} disabled={busy} onChange={event => setCountry(event.target.value)}>
      <option value="">Selecione o país</option>{COUNTRY_OPTIONS.map(option => <option key={option.code} value={option.code}>{option.name}</option>)}
    </select></label>
    <label>Formato do telefone<select className="block w-full rounded border bg-background p-2" aria-label="Formato do telefone" value={format} disabled={busy} onChange={event => setFormat(event.target.value)}>
      <option value="">Selecione o formato</option><option value="national" disabled={country.trim().toUpperCase() !== 'BR'}>Número com DDD</option><option value="e164">Número com código do país</option>
    </select></label>
    <p className="text-sm text-muted-foreground">Número com DDD: somente para o Brasil, com 10 ou 11 dígitos. Número com código do país: Brasil com 55 e 12 ou 13 dígitos; outros países com código internacional e 8 a 15 dígitos. País e formato não são deduzidos pelo tamanho do número.</p>
    {!confirmation && country && format && <p role="status">Confira o país, o formato e o telefone informado. Se o número estiver incorreto, corrija o Lead antes de continuar.</p>}
    {error && <p role="alert">{error}</p>}
    <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={close}>Cancelar</Button><Button type="button" disabled={!confirmation || busy} onClick={() => void submit()}>{busy ? 'Preparando…' : 'Preparar cadastro'}</Button></div>
  </DialogContent></Dialog>;
}
