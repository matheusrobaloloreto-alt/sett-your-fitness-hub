import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMaster } from "@/contexts/MasterContext";
import { useTheme } from "@/contexts/ThemeContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Palette, Upload, RotateCcw, Save } from "lucide-react";

const DEFAULTS = {
  primary_color: "#1d4ed8",
  background_color: "#121212",
  card_color: "#1a1a1a",
  text_color: "#ebebeb",
  platform_title: "BN PERFORMANCE",
};

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
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [currentLogoUrl, setCurrentLogoUrl] = useState<string | null>(null);

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
      setCurrentLogoUrl(settings.logo_url);
    }
  }, [settings]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      setLogoPreview(URL.createObjectURL(file));
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      let logoUrl = currentLogoUrl;

      if (logoFile) {
        const ext = logoFile.name.split(".").pop();
        const path = effectiveCompanyId ? `${effectiveCompanyId}/logo.${ext}` : `logo.${ext}`;
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
        updated_by: user?.id,
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-settings-admin", companyId] });
      refetch();
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
    setLogoFile(null);
    setLogoPreview(null);
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </AppLayout>
    );
  }

  const displayLogo = logoPreview || currentLogoUrl;

  return (
    <AppLayout>
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
                  <div className="flex items-center gap-4">
                    {displayLogo && (
                      <img src={displayLogo} alt="Logo" className="h-16 w-16 object-contain rounded-lg border border-border bg-card p-1" />
                    )}
                    <label className="flex items-center gap-2 px-4 py-2 rounded-md border border-border cursor-pointer hover:bg-muted/50 transition-colors font-sans text-sm">
                      <Upload className="h-4 w-4" />
                      {displayLogo ? "Trocar Logo" : "Enviar Logo"}
                      <input type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
                    </label>
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
                    <span className="text-lg tracking-wider" style={{ color: primaryColor, fontFamily: "'Bebas Neue', sans-serif" }}>
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
    </AppLayout>
  );
}
