import { useState, useEffect, CSSProperties } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMaster } from "@/contexts/MasterContext";
import { useTheme, applyTheme } from "@/contexts/ThemeContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Palette, Sparkles, Upload, RotateCcw, Save } from "lucide-react";
import { prepareLogoImage, type PreparedLogo } from "@/lib/logoImage";

// Alinhado ao default canônico do ThemeContext (evita uma academia nova ver o tema
// escuro BN antigo e o "Resetar" voltar pra marca errada).
const DEFAULTS = {
  primary_color: "#1D2D5C",
  background_color: "#FAFAF7",
  card_color: "#F2F0EA",
  text_color: "#0A0A0A",
  platform_title: "Set Training App",
};

// Layouts (skins) — mudam a FORMA do app (cantos, sombras, superfície, tipografia).
// As cores continuam vindo do editor abaixo. Os ids batem com o CSS [data-layout] em index.css.
type LayoutOption = { id: string; name: string; desc: string };
const LAYOUTS: LayoutOption[] = [
  { id: "classico", name: "Clássico", desc: "Visual atual — títulos serifados, cantos discretos." },
  { id: "moderno", name: "Moderno", desc: "Cantos arredondados, sombras suaves, tipografia limpa." },
  { id: "minimal", name: "Minimalista", desc: "Plano e clean, sem sombras, foco no conteúdo." },
  { id: "futurista", name: "Futurista", desc: "Efeito vidro, brilho e tipografia técnica." },
  { id: "compacto", name: "Compacto", desc: "Denso e eficiente — menos espaçamento, cabe mais na tela." },
  { id: "editorial", name: "Editorial", desc: "Espaçoso e elegante — mais respiro e leitura confortável." },
  { id: "industrial", name: "Industrial", desc: "Reto e marcante — bordas fortes e tipografia mono." },
];

export default function AppearanceSettings() {
  const { user, companyId, role } = useAuth();
  const { viewingCompany, isViewingCompany } = useMaster();
  const effectiveCompanyId = role === "master" ? (isViewingCompany ? viewingCompany?.id : null) : companyId;
  const { refetch } = useTheme();
  const queryClient = useQueryClient();

  const [primaryColor, setPrimaryColor] = useState(DEFAULTS.primary_color);
  const [backgroundColor, setBackgroundColor] = useState(DEFAULTS.background_color);
  const [cardColor, setCardColor] = useState(DEFAULTS.card_color);
  const [textColor, setTextColor] = useState(DEFAULTS.text_color);
  const [platformTitle, setPlatformTitle] = useState(DEFAULTS.platform_title);
  const [layoutStyle, setLayoutStyle] = useState("classico");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [currentLogoUrl, setCurrentLogoUrl] = useState<string | null>(null);
  const [isProcessingLogo, setIsProcessingLogo] = useState(false);
  const [preparedLogo, setPreparedLogo] = useState<PreparedLogo | null>(null);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["platform-settings-admin", effectiveCompanyId],
    queryFn: async () => {
      let query = supabase.from("platform_settings").select("*");
      if (effectiveCompanyId) {
        query = query.eq("company_id", effectiveCompanyId);
      } else {
        query = query.is("company_id", null);
      }
      const { data, error } = await query.limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (settings) {
      setPrimaryColor(settings.primary_color);
      setBackgroundColor(settings.background_color);
      setCardColor(settings.card_color);
      setTextColor(settings.text_color);
      setPlatformTitle(settings.platform_title);
      setLayoutStyle((settings as { layout_style?: string }).layout_style || "classico");
      setCurrentLogoUrl(settings.logo_url);
    }
  }, [settings]);

  // Pré-visualização ao vivo: aplica cor + layout no app inteiro enquanto o usuário edita.
  useEffect(() => {
    applyTheme({
      primary_color: primaryColor,
      background_color: backgroundColor,
      card_color: cardColor,
      text_color: textColor,
    });
  }, [primaryColor, backgroundColor, cardColor, textColor]);

  useEffect(() => {
    document.documentElement.dataset.layout = layoutStyle;
  }, [layoutStyle]);

  useEffect(() => () => {
    if (logoPreview) URL.revokeObjectURL(logoPreview);
  }, [logoPreview]);

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setIsProcessingLogo(true);
    try {
      const prepared = await prepareLogoImage(file);
      setLogoFile(prepared.file);
      setPreparedLogo(prepared);
      setLogoPreview(URL.createObjectURL(prepared.file));
      if (prepared.backgroundRemoved) {
        toast.success("Fundo uniforme removido. Confira a prévia e salve.");
      } else if (prepared.reason === "already-transparent") {
        toast.success("A logo já possui transparência e foi preservada.");
      } else {
        toast.info("Fundo complexo preservado para não recortar a marca incorretamente.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível preparar a logo.");
    } finally {
      setIsProcessingLogo(false);
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      let logoUrl = currentLogoUrl;

      if (logoFile) {
        const version = Date.now();
        const path = effectiveCompanyId
          ? `${effectiveCompanyId}/logo-${version}.png`
          : `logo-${version}.png`;
        const { error: uploadError } = await supabase.storage
          .from("platform-assets")
          .upload(path, logoFile, { upsert: true });
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage
          .from("platform-assets")
          .getPublicUrl(path);
        logoUrl = urlData.publicUrl;
      }

      const payload = {
        primary_color: primaryColor,
        background_color: backgroundColor,
        card_color: cardColor,
        text_color: textColor,
        platform_title: platformTitle,
        logo_url: logoUrl,
        layout_style: layoutStyle,
        updated_at: new Date().toISOString(),
        company_id: effectiveCompanyId,
      };

      if (settings?.id) {
        const { error } = await supabase
          .from("platform_settings")
          .update(payload)
          .eq("id", settings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("platform_settings")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      // Revalida AS DUAS famílias de query (a do admin e a do tema global), independente do id.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["platform-settings"] }),
        queryClient.invalidateQueries({ queryKey: ["platform-settings-admin"] }),
      ]);
      await refetch();
      if (logoPreview) URL.revokeObjectURL(logoPreview);
      setLogoPreview(null);
      setLogoFile(null);
      setPreparedLogo(null);
      toast.success("Aparência salva com sucesso!");
    },
    onError: (err: Error) => {
      toast.error("Erro ao salvar: " + err.message);
    },
  });

  const handleRestore = () => {
    setPrimaryColor(DEFAULTS.primary_color);
    setBackgroundColor(DEFAULTS.background_color);
    setCardColor(DEFAULTS.card_color);
    setTextColor(DEFAULTS.text_color);
    setPlatformTitle(DEFAULTS.platform_title);
    setLayoutStyle("classico");
    setLogoFile(null);
    setLogoPreview(null);
    setPreparedLogo(null);
  };

  if (isLoading) {
    return (
      <>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  const displayLogo = logoPreview || currentLogoUrl;

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl text-primary flex items-center gap-2">
              <Palette className="h-8 w-8" /> APARÊNCIA
            </h1>
            <p className="text-muted-foreground font-sans text-sm mt-1">
              Personalize as cores, logo e título da plataforma
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleRestore} className="font-sans">
              <RotateCcw className="h-4 w-4 mr-2" /> Restaurar Padrões
            </Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="font-sans">
              <Save className="h-4 w-4 mr-2" /> {saveMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>

        {/* Layout / skin do app */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Layout</CardTitle>
            <p className="text-muted-foreground font-sans text-sm">
              Muda o <strong>estilo visual</strong> do app (cantos, sombras, superfície e tipografia) — as cores ficam no editor abaixo. A prévia aplica na hora; clique em <strong>Salvar</strong> para fixar.
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {LAYOUTS.map((l) => {
                const active = layoutStyle === l.id;
                const radius =
                  l.id === "moderno" ? 14 : l.id === "futurista" ? 10 : l.id === "editorial" ? 8
                  : l.id === "minimal" || l.id === "compacto" ? 5 : l.id === "industrial" ? 0 : 4;
                const cardStyle: CSSProperties =
                  l.id === "moderno"
                    ? { backgroundColor: cardColor, boxShadow: "0 6px 16px -8px rgba(0,0,0,0.3)", border: "none" }
                    : l.id === "minimal" || l.id === "compacto"
                    ? { backgroundColor: cardColor, border: "1px solid rgba(0,0,0,0.12)", boxShadow: "none" }
                    : l.id === "futurista"
                    ? { backgroundColor: cardColor, border: `1px solid ${primaryColor}`, boxShadow: `0 0 12px -2px ${primaryColor}` }
                    : l.id === "industrial"
                    ? { backgroundColor: cardColor, border: `1.5px solid ${textColor}`, boxShadow: `4px 4px 0 0 ${textColor}33` }
                    : l.id === "editorial"
                    ? { backgroundColor: cardColor, border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }
                    : { backgroundColor: cardColor, border: "1px solid rgba(0,0,0,0.08)" };
                const labelFont =
                  l.id === "futurista" || l.id === "industrial" ? "'JetBrains Mono', monospace"
                  : l.id === "classico" || l.id === "editorial" ? "'Fraunces', Georgia, serif"
                  : "'Inter', system-ui, sans-serif";
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => setLayoutStyle(l.id)}
                    className={`rounded-xl border p-2 text-left transition ${active ? "border-primary ring-2 ring-primary/40" : "border-border hover:border-primary/50"}`}
                  >
                    {/* mini-mockup do layout (usa as cores atuais da empresa) */}
                    <div className="overflow-hidden rounded-lg p-2" style={{ backgroundColor }}>
                      <div className="mb-1.5 h-2 w-10" style={{ backgroundColor: primaryColor, borderRadius: radius / 2 }} />
                      <div className="p-2" style={{ ...cardStyle, borderRadius: radius }}>
                        <div className="h-1.5 w-14 rounded-full" style={{ backgroundColor: textColor, opacity: 0.6 }} />
                        <div className="mt-1 h-1.5 w-9 rounded-full" style={{ backgroundColor: textColor, opacity: 0.3 }} />
                        <div className="mt-2 h-4 w-12" style={{ backgroundColor: primaryColor, borderRadius: radius }} />
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-sm font-medium" style={{ fontFamily: labelFont }}>{l.name}</span>
                      {active && <span className="text-xs font-bold text-primary">✓</span>}
                    </div>
                    <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{l.desc}</p>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Colors */}
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Cores</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="font-sans">Cor Primária</Label>
                <div className="flex items-center gap-3">
                  <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="w-12 h-10 rounded cursor-pointer border border-border" />
                  <Input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="font-mono" maxLength={7} />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="font-sans">Cor de Fundo</Label>
                <div className="flex items-center gap-3">
                  <input type="color" value={backgroundColor} onChange={(e) => setBackgroundColor(e.target.value)} className="w-12 h-10 rounded cursor-pointer border border-border" />
                  <Input value={backgroundColor} onChange={(e) => setBackgroundColor(e.target.value)} className="font-mono" maxLength={7} />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="font-sans">Cor dos Cards</Label>
                <div className="flex items-center gap-3">
                  <input type="color" value={cardColor} onChange={(e) => setCardColor(e.target.value)} className="w-12 h-10 rounded cursor-pointer border border-border" />
                  <Input value={cardColor} onChange={(e) => setCardColor(e.target.value)} className="font-mono" maxLength={7} />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="font-sans">Cor do Texto</Label>
                <div className="flex items-center gap-3">
                  <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} className="w-12 h-10 rounded cursor-pointer border border-border" />
                  <Input value={textColor} onChange={(e) => setTextColor(e.target.value)} className="font-mono" maxLength={7} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Logo & Title */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Identidade</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="font-sans">Título da Plataforma</Label>
                  <Input value={platformTitle} onChange={(e) => setPlatformTitle(e.target.value)} placeholder="Nome da sua empresa" />
                </div>
                <div className="space-y-2">
                  <Label className="font-sans">Logo</Label>
                  <div className="flex flex-wrap items-center gap-4">
                    {displayLogo && <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-border">
                      <div className="flex h-20 w-20 items-center justify-center bg-background p-2">
                        <img src={displayLogo} alt="Logo em fundo claro" className="max-h-full max-w-full object-contain" />
                      </div>
                      <div className="flex h-20 w-20 items-center justify-center bg-primary p-2">
                        <img src={displayLogo} alt="Logo em fundo da marca" className="max-h-full max-w-full object-contain" />
                      </div>
                    </div>}
                    <label className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border px-4 py-2 cursor-pointer hover:bg-muted/50 transition-colors font-sans text-sm">
                      {isProcessingLogo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      {isProcessingLogo ? "Preparando..." : displayLogo ? "Trocar logo" : "Enviar logo"}
                      <input
                        type="file"
                        accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                        onChange={handleLogoChange}
                        disabled={isProcessingLogo}
                        className="hidden"
                      />
                    </label>
                  </div>
                  <div className="flex items-start gap-2 rounded-md border border-border bg-background/60 p-3 text-xs text-muted-foreground">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <p>
                      PNG, JPG ou WebP até 12 MB. Fundos uniformes são removidos automaticamente;
                      logos transparentes são preservadas. A prévia mostra o resultado em superfícies clara e escura.
                      {preparedLogo?.backgroundRemoved ? " Fundo removido nesta imagem." : ""}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Live Preview */}
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Preview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg p-4 space-y-3 border" style={{ backgroundColor: backgroundColor, color: textColor, borderColor: cardColor }}>
                  <div className="flex items-center gap-3">
                    {displayLogo && <img src={displayLogo} alt="Preview logo" className="h-8 w-8 object-contain" />}
                    <span className="font-display text-lg" style={{ color: primaryColor }}>
                      {platformTitle}
                    </span>
                  </div>
                  <div className="rounded-md p-3" style={{ backgroundColor: cardColor }}>
                    <p className="text-sm font-sans" style={{ color: textColor }}>Exemplo de card com as cores selecionadas</p>
                    <button className="mt-2 px-3 py-1 rounded text-sm text-white font-sans" style={{ backgroundColor: primaryColor }}>Botão Primário</button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
