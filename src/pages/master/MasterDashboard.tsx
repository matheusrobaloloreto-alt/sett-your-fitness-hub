import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Users, DollarSign, Activity, HardDrive, Info, LogOut } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { useMaster } from "@/contexts/MasterContext";

interface CompanyRow {
  id: string;
  name: string;
  tier: string;
  is_active: boolean;
  slug: string | null;
  created_at: string;
  subscription_status: string | null;
}

interface Metrics {
  totalCompanies: number;
  activeCompanies: number;
  totalStudents: number;
  monthlyRevenue: number;
}

interface StorageInfo {
  companyName: string;
  videoCount: number;
}

const TIER_MONTHLY_PRICE: Record<string, number> = {
  basic: 49.90,
  intermediate: 400,
  advanced: 799,
};

export default function MasterDashboard() {
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [metrics, setMetrics] = useState<Metrics>({ totalCompanies: 0, activeCompanies: 0, totalStudents: 0, monthlyRevenue: 0 });
  const [storageInfo, setStorageInfo] = useState<StorageInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { viewingCompany, exitCompanyView } = useMaster();

  useEffect(() => {
    const fetchData = async () => {
      const [companiesRes, studentsRes, exercisesRes] = await Promise.all([
        supabase.from("companies").select("*").order("created_at", { ascending: false }),
        supabase.from("students").select("id, status"),
        supabase.from("exercise_library").select("company_id, video_path"),
      ]);

      const companiesList = (companiesRes.data || []) as CompanyRow[];
      setCompanies(companiesList);

      const activeCompanies = companiesList.filter(c => c.is_active);
      const activeStudents = (studentsRes.data || []).filter((s: any) => s.status === "active").length;

      const monthlyRevenue = activeCompanies.reduce((sum, c) => {
        return sum + (TIER_MONTHLY_PRICE[c.tier] || 0);
      }, 0);

      setMetrics({
        totalCompanies: companiesList.length,
        activeCompanies: activeCompanies.length,
        totalStudents: activeStudents,
        monthlyRevenue,
      });

      // Storage usage per company
      const exercises = exercisesRes.data || [];
      const withVideo = exercises.filter((e: any) => e.video_path);
      const countByCompany: Record<string, number> = {};
      withVideo.forEach((e: any) => {
        const key = e.company_id || "global";
        countByCompany[key] = (countByCompany[key] || 0) + 1;
      });

      const storageList: StorageInfo[] = Object.entries(countByCompany).map(([companyId, count]) => {
        const company = companiesList.find(c => c.id === companyId);
        return {
          companyName: company?.name || (companyId === "global" ? "Base Global" : "Desconhecida"),
          videoCount: count,
        };
      }).sort((a, b) => b.videoCount - a.videoCount);

      setStorageInfo(storageList);
      setLoading(false);
    };
    fetchData();
  }, []);

  const tierLabel: Record<string, string> = { basic: "Básico", intermediate: "Intermediário", advanced: "Avançado" };
  const tierColor: Record<string, string> = { basic: "secondary", intermediate: "default", advanced: "destructive" };
  const totalVideos = storageInfo.reduce((s, i) => s + i.videoCount, 0);

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <h1 className="text-3xl font-bold text-foreground">Painel Master</h1>
        <p className="text-muted-foreground font-sans">Visão global de todas as instâncias da plataforma.</p>

        {viewingCompany ? (
          <Card className="border-primary/40 bg-primary/5">
            <CardContent className="flex items-center justify-between gap-4 py-4">
              <div className="flex items-start gap-3">
                <Building2 className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Visualizando como: <span className="text-primary">{viewingCompany.name}</span>
                  </p>
                  <p className="text-xs text-muted-foreground font-sans">
                    Ao acessar áreas administrativas, você verá apenas dados desta empresa. Saia do contexto para voltar à visão global.
                  </p>
                </div>
              </div>
              <button
                onClick={exitCompanyView}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-background border border-border rounded-md hover:bg-muted transition-colors"
              >
                <LogOut className="h-4 w-4" /> Sair do contexto
              </button>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-dashed border-muted-foreground/30 bg-muted/30">
            <CardContent className="flex items-start gap-3 py-4">
              <Info className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">Nenhuma empresa selecionada</p>
                <p className="text-xs text-muted-foreground font-sans">
                  Para acessar áreas operacionais (admin, coordenação ou treinador), entre no contexto de uma empresa em{" "}
                  <button onClick={() => navigate("/master/companies")} className="text-primary hover:underline">
                    Empresas
                  </button>
                  . As métricas abaixo permanecem globais.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            { label: "Empresas", value: metrics.totalCompanies, sub: `${metrics.activeCompanies} ativas`, icon: Building2 },
            { label: "Alunos Ativos", value: metrics.totalStudents, sub: "em todas as instâncias", icon: Users },
            { label: "Faturamento Mensal", value: `R$ ${metrics.monthlyRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, sub: "receita de assinaturas", icon: DollarSign },
            { label: "Status", value: metrics.activeCompanies, sub: "instâncias ativas", icon: Activity },
            { label: "Vídeos Armazenados", value: totalVideos, sub: `em ${storageInfo.length} origens`, icon: HardDrive },
          ].map((m) => (
            <Card key={m.label}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{m.label}</CardTitle>
                <m.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{m.value}</div>
                <p className="text-xs text-muted-foreground font-sans">{m.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Storage Usage */}
        {storageInfo.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <HardDrive className="h-5 w-5" />Uso de Armazenamento
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {storageInfo.map((s) => (
                  <div key={s.companyName} className="flex items-center justify-between p-2 rounded-md bg-secondary">
                    <span className="text-sm font-sans text-foreground">{s.companyName}</span>
                    <Badge variant="outline">{s.videoCount} vídeo{s.videoCount !== 1 ? "s" : ""}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Companies Quick List */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Empresas</CardTitle>
            <button
              onClick={() => navigate("/master/companies")}
              className="text-sm text-primary hover:underline font-sans"
            >
              Ver todas →
            </button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : companies.length === 0 ? (
              <p className="text-muted-foreground text-sm font-sans text-center py-8">Nenhuma empresa cadastrada.</p>
            ) : (
              <div className="space-y-3">
                {companies.slice(0, 5).map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/master/companies`)}
                  >
                    <div className="flex items-center gap-3">
                      <Building2 className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium text-foreground">{c.name}</p>
                        <p className="text-xs text-muted-foreground font-sans">{c.slug || "sem slug"}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={tierColor[c.tier] as any || "secondary"}>
                        {tierLabel[c.tier] || c.tier}
                      </Badge>
                      <Badge variant={c.is_active ? "default" : "secondary"}>
                        {c.is_active ? "Ativa" : "Inativa"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
