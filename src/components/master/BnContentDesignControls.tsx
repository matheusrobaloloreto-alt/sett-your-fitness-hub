import type { BnDesign } from "@/lib/bnContentStudio";

const selectClass = "h-9 w-full rounded-md border bg-background px-2 text-sm";
export function BnContentDesignControls({ value, onChange, global = false }: { value: BnDesign; onChange: (next: BnDesign) => void; global?: boolean }) {
  const patch = (key: keyof BnDesign, next: string | number | undefined) => {
    const result = { ...value, [key]: next };
    if (next === undefined) delete result[key];
    onChange(result);
  };
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
    <label className="space-y-1 text-xs">Fonte<select className={selectClass} value={value.font || ""} onChange={e => patch("font", e.target.value || undefined)}><option value="">Padrão do layout</option><option value="sans">Sem serifa · Arial</option><option value="serif">Com serifa · Georgia</option><option value="mixed">Títulos Georgia + texto Arial</option></select></label>
    {global && <label className="space-y-1 text-xs">Dimensões<select className={selectClass} value={value.dimensions || ""} onChange={e => patch("dimensions", e.target.value || undefined)}><option value="">Do formato selecionado</option><option value="portrait">1080 × 1350 · Retrato</option><option value="square">1080 × 1080 · Quadrado</option><option value="story">1080 × 1920 · Vertical</option></select></label>}
    {([['background', 'Fundo'], ['textColor', 'Cor das letras'], ['accent', 'Destaques']] as const).map(([key, label]) => <label key={key} className="space-y-1 text-xs">{label}<div className="flex items-center gap-2"><input aria-label={label} type="color" className="h-9 w-12 rounded border" value={value[key] || (key === 'background' ? '#F4F2ED' : key === 'textColor' ? '#111214' : '#C8A876')} onChange={e => patch(key, e.target.value)} /><button type="button" className="text-xs underline" onClick={() => patch(key, undefined)}>Automático</button></div></label>)}
    <label className="space-y-1 text-xs">Alinhamento<select className={selectClass} value={value.align || ""} onChange={e => patch("align", e.target.value || undefined)}><option value="">Automático</option><option value="left">Esquerda</option><option value="center">Centro</option><option value="right">Direita</option></select></label>
    <label className="space-y-1 text-xs">Posição do texto<select className={selectClass} value={value.position || ""} onChange={e => patch("position", e.target.value || undefined)}><option value="">Automática</option><option value="top">Topo</option><option value="center">Centro</option><option value="bottom">Base</option></select></label>
    <label className="space-y-1 text-xs">Área da imagem<select className={selectClass} value={value.imageArea || ""} onChange={e => patch("imageArea", e.target.value || undefined)}><option value="">Do layout</option><option value="background">Fundo inteiro</option><option value="right">Lado direito</option><option value="top">Acima do texto</option><option value="none">Sem imagem</option></select></label>
    {(['focusX', 'focusY'] as const).map(key => <label key={key} className="space-y-1 text-xs">{key === 'focusX' ? 'Enquadramento horizontal' : 'Enquadramento vertical'}<input className="w-full" type="range" min="0" max="100" value={value[key] ?? 50} onChange={e => patch(key, Number(e.target.value))} /></label>)}
    <label className="space-y-1 text-xs">Emojis e símbolos<input className={selectClass} maxLength={100} value={value.symbols || ""} placeholder="Ex. 💬 ♡ ↗" onChange={e => patch("symbols", e.target.value)} /></label>
  </div>;
}
