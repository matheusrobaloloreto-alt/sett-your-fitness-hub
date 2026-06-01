import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, Copy, CreditCard, QrCode, Loader2, Check } from "lucide-react";
import bnLogo from "@/assets/bn-logo.png";
import { formatCPF, formatCEP, formatPhone } from "@/lib/masks";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

async function callAsaas(action: string, body: Record<string, any>) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/asaas-integration`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_KEY,
    },
    body: JSON.stringify({ action, ...body }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || "Erro na operação");
  return data;
}

type Step = "select_plan" | "choose" | "pix" | "card" | "success";

interface PlanOption {
  id: string;
  name: string;
  price: number;
  duration_weeks: number;
  description: string | null;
}

function getMaxInstallments(durationWeeks: number): number {
  if (durationWeeks <= 6) return 1;
  if (durationWeeks <= 24) return 6;
  return 12;
}

function formatBRL(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

export default function PublicPayment() {
  const { studentId } = useParams<{ studentId: string }>();
  const { toast } = useToast();

  const [student, setStudent] = useState<any>(null);
  const [notFound, setNotFound] = useState(false);
  const [step, setStep] = useState<Step>("select_plan");
  const [loading, setLoading] = useState(false);
  const [isRenewal, setIsRenewal] = useState(false);

  // Plans
  const [availablePlans, setAvailablePlans] = useState<PlanOption[]>([]);
  const [selectedPlanOptionId, setSelectedPlanOptionId] = useState<string | null>(null);
  const [loadingPlans, setLoadingPlans] = useState(true);

  // Pix state
  const [pixImage, setPixImage] = useState("");
  const [pixPayload, setPixPayload] = useState("");
  const [pixPaymentId, setPixPaymentId] = useState("");
  const pollingRef = useRef<number | null>(null);

  // Card state
  const [cardForm, setCardForm] = useState({
    holderName: "",
    number: "",
    expiryMonth: "",
    expiryYear: "",
    ccv: "",
    email: "",
    cpfCnpj: "",
    postalCode: "",
    phone: "",
    address: "",
    addressNumber: "",
    province: "",
  });

  const [planValue, setPlanValue] = useState(0);
  const [planName, setPlanName] = useState("");
  const [planDurationWeeks, setPlanDurationWeeks] = useState(0);
  const [installments, setInstallments] = useState(1);

  useEffect(() => {
    if (!studentId) { setNotFound(true); return; }

    const loadAll = async () => {
      setLoadingPlans(true);
      const { data, error } = await supabase.functions.invoke("public-payment-context", {
        body: { action: "context", studentId },
      });
      if (error || !data?.student) { setNotFound(true); setLoadingPlans(false); return; }
      const s = data.student;
      setStudent(s);
      setCardForm(prev => ({
        ...prev,
        holderName: s.full_name || "",
        email: s.email || "",
        cpfCnpj: formatCPF(s.cpf || ""),
        postalCode: formatCEP(s.cep || ""),
        phone: formatPhone(s.whatsapp || s.phone || ""),
        address: s.address || "",
        addressNumber: s.address_number || "",
        province: s.neighborhood || "",
      }));
      if (s.selected_plan_id) setSelectedPlanOptionId(s.selected_plan_id);
      setIsRenewal(!!data.isRenewal);
      setAvailablePlans((data.plans as PlanOption[]) || []);
      setLoadingPlans(false);
    };

    loadAll();

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [studentId]);

  const handleSelectPlan = async (plan: PlanOption) => {
    setSelectedPlanOptionId(plan.id);
    setPlanValue(plan.price);
    setPlanName(plan.name);
    setPlanDurationWeeks(plan.duration_weeks);
    setInstallments(1);
    setStep("choose");

    if (studentId) {
      await supabase.functions.invoke("public-payment-context", {
        body: { action: "select-plan", studentId, planId: plan.id },
      });
    }
  };

  const maxInstallments = getMaxInstallments(planDurationWeeks);

  const handlePix = async () => {
    setLoading(true);
    try {
      const { paymentId } = await callAsaas("create-payment", {
        studentId,
        billingType: "PIX",
        value: planValue,
        planId: selectedPlanOptionId,
      });
      setPixPaymentId(paymentId);

      const { encodedImage, payload } = await callAsaas("get-pix-qrcode", { paymentId });
      setPixImage(encodedImage);
      setPixPayload(payload);
      setStep("pix");

      pollingRef.current = window.setInterval(async () => {
        try {
          const { status } = await callAsaas("get-payment-status", { paymentId });
          if (status === "RECEIVED" || status === "CONFIRMED") {
            if (pollingRef.current) clearInterval(pollingRef.current);
            setStep("success");
          }
        } catch {}
      }, 10000);
    } catch (err: any) {
      toast({ title: "Erro ao gerar Pix", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleCard = async () => {
    const cpfDigits = cardForm.cpfCnpj.replace(/\D/g, "");
    const cepDigits = cardForm.postalCode.replace(/\D/g, "");
    const phoneDigits = cardForm.phone.replace(/\D/g, "");

    if (!cardForm.number || !cardForm.expiryMonth || !cardForm.expiryYear || !cardForm.ccv || !cardForm.holderName) {
      toast({ title: "Preencha todos os dados do cartão", variant: "destructive" });
      return;
    }
    if (!cardForm.email || !cpfDigits || !cepDigits || !phoneDigits) {
      toast({ title: "Preencha email, CPF, CEP e telefone do titular", variant: "destructive" });
      return;
    }
    if (cpfDigits.length !== 11 && cpfDigits.length !== 14) {
      toast({ title: "CPF inválido", description: "Digite o CPF completo (11 dígitos)", variant: "destructive" });
      return;
    }
    if (cepDigits.length !== 8) {
      toast({ title: "CEP inválido", description: "Digite o CEP completo (8 dígitos)", variant: "destructive" });
      return;
    }
    if (!cardForm.addressNumber.trim()) {
      toast({ title: "Número do endereço obrigatório", description: "Necessário para aprovação antifraude", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      // Captura IP real do cliente (requerido por antifraude do Asaas)
      let remoteIp = "";
      try {
        const ipRes = await fetch("https://api.ipify.org?format=json");
        const ipData = await ipRes.json();
        remoteIp = ipData.ip || "";
      } catch {}

      const payload: Record<string, any> = {
        studentId,
        value: planValue,
        planId: selectedPlanOptionId,
        remoteIp: remoteIp || undefined,
        creditCard: {
          holderName: cardForm.holderName.trim(),
          number: cardForm.number,
          expiryMonth: cardForm.expiryMonth.padStart(2, "0"),
          expiryYear: cardForm.expiryYear.length === 2 ? `20${cardForm.expiryYear}` : cardForm.expiryYear,
          ccv: cardForm.ccv,
        },
        creditCardHolderInfo: {
          name: cardForm.holderName.trim(),
          email: cardForm.email.trim(),
          cpfCnpj: cpfDigits,
          postalCode: cepDigits,
          phone: phoneDigits,
          addressNumber: cardForm.addressNumber.trim(),
          address: cardForm.address.trim() || undefined,
          province: cardForm.province.trim() || undefined,
        },
      };
      if (installments > 1) {
        payload.installmentCount = installments;
        payload.installmentValue = Number((planValue / installments).toFixed(2));
      }
      const { status } = await callAsaas("create-card-payment", payload);

      if (status === "CONFIRMED" || status === "RECEIVED") {
        setStep("success");
      } else if (status === "PENDING" || status === "AWAITING_RISK_ANALYSIS") {
        toast({ title: "Pagamento em análise", description: "Você receberá a confirmação em breve." });
        setStep("success");
      } else {
        toast({ title: "Pagamento processado", description: `Status: ${status}` });
        setStep("success");
      }
    } catch (err: any) {
      toast({
        title: "Pagamento recusado",
        description: err.message || "Verifique os dados do cartão e tente novamente. Se persistir, tente outro cartão ou Pix.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const copyPixCode = () => {
    navigator.clipboard.writeText(pixPayload);
    toast({ title: "Código Pix copiado!" });
  };

  if (notFound) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full bg-card border-border text-center">
          <CardContent className="pt-8 pb-8 space-y-4">
            <h2 className="text-2xl text-primary">ALUNO NÃO ENCONTRADO</h2>
            <p className="text-muted-foreground font-sans">O link de pagamento é inválido.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === "success") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full bg-card border-border text-center">
          <CardContent className="pt-8 pb-8 space-y-4">
            <CheckCircle className="h-16 w-16 text-primary mx-auto" />
            <h2 className="text-3xl text-primary">
              {isRenewal ? "RENOVAÇÃO CONFIRMADA!" : "PAGAMENTO CONFIRMADO!"}
            </h2>
            <p className="text-muted-foreground font-sans">
              {isRenewal
                ? "Seu plano foi renovado com sucesso! Seus novos treinos já estão disponíveis."
                : "Nossa equipe entrará em contato pelo WhatsApp para os próximos passos."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
        <div className="text-center space-y-3">
          <img src={bnLogo} alt="BN Performance Training" className="h-16 mx-auto" />
          <h1 className="text-4xl text-primary">
            {isRenewal ? "RENOVAÇÃO" : "PAGAMENTO"}
          </h1>
          {student && (
            <p className="text-muted-foreground font-sans">
              Aluno: <strong className="text-foreground">{student.full_name}</strong>
            </p>
          )}
          {isRenewal && (
            <p className="text-sm text-primary/80 font-sans">
              ✨ Você já possui uma matrícula ativa. Ao pagar, seu plano será estendido automaticamente.
            </p>
          )}
        </div>

        {/* Step 1: Select Plan */}
        {step === "select_plan" && (
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-primary text-xl text-center">
                {isRenewal ? "RENOVAR PLANO" : "ESCOLHA SEU PLANO"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {loadingPlans ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : availablePlans.length === 0 ? (
                <p className="text-muted-foreground font-sans text-center py-4">Nenhum plano disponível.</p>
              ) : (
                availablePlans.map((plan) => {
                  const isPreSelected = plan.id === selectedPlanOptionId;
                  return (
                    <button
                      key={plan.id}
                      onClick={() => handleSelectPlan(plan)}
                      className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                        isPreSelected
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50 bg-card"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-sans font-semibold text-foreground">{plan.name}</p>
                          <p className="text-xs text-muted-foreground font-sans mt-0.5">
                            {plan.duration_weeks} semanas
                            {plan.description && ` • ${plan.description}`}
                          </p>
                        </div>
                        <div className="text-right flex items-center gap-2">
                          <p className="text-lg font-bold text-primary font-sans">
                            R$ {formatBRL(plan.price)}
                          </p>
                          {isPreSelected && <Check className="h-5 w-5 text-primary" />}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 2: Choose payment method */}
        {step === "choose" && (
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-primary text-xl text-center">ESCOLHA A FORMA DE PAGAMENTO</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center mb-4">
                <p className="text-sm text-muted-foreground font-sans">{planName}</p>
                <p className="text-3xl font-sans font-bold text-foreground">
                  R$ {planValue.toFixed(2).replace(".", ",")}
                </p>
              </div>
              <Button
                className="w-full h-14 text-lg gap-3"
                onClick={handlePix}
                disabled={loading}
              >
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <QrCode className="h-5 w-5" />}
                Pagar com Pix
              </Button>
              <Button
                variant="outline"
                className="w-full h-14 text-lg gap-3"
                onClick={() => setStep("card")}
                disabled={loading}
              >
                <CreditCard className="h-5 w-5" />
                Pagar com Cartão
              </Button>
              <Button variant="ghost" size="sm" className="w-full" onClick={() => setStep("select_plan")}>
                ← Trocar plano
              </Button>
            </CardContent>
          </Card>
        )}

        {step === "pix" && (
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-primary text-xl text-center">PIX</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-center">
              {pixImage && (
                <img
                  src={`data:image/png;base64,${pixImage}`}
                  alt="QR Code Pix"
                  className="mx-auto w-56 h-56 rounded-lg border border-border"
                />
              )}
              <div className="space-y-2">
                <Label className="font-sans text-sm text-muted-foreground">Código Pix (Copia e Cola)</Label>
                <div className="flex gap-2">
                  <Input value={pixPayload} readOnly className="text-xs font-mono" />
                  <Button variant="outline" size="icon" onClick={copyPixCode}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-2 justify-center text-sm text-muted-foreground font-sans">
                <Loader2 className="h-4 w-4 animate-spin" />
                Aguardando confirmação do pagamento...
              </div>
              <Button variant="ghost" size="sm" onClick={() => { if (pollingRef.current) clearInterval(pollingRef.current); setStep("choose"); }}>
                ← Voltar
              </Button>
            </CardContent>
          </Card>
        )}

        {step === "card" && (
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-primary text-xl text-center">CARTÃO DE CRÉDITO</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center mb-2">
                <p className="text-sm text-muted-foreground font-sans">{planName}</p>
                <p className="text-2xl font-sans font-bold text-foreground">
                  R$ {formatBRL(planValue)}
                </p>
              </div>

              {maxInstallments > 1 && (
                <div className="space-y-2">
                  <Label className="font-sans text-sm">Parcelas</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {Array.from({ length: maxInstallments }, (_, i) => i + 1).map((n) => {
                      const parcelaValue = planValue / n;
                      return (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setInstallments(n)}
                          className={`p-2 rounded-md border text-center text-sm font-sans transition-colors ${
                            installments === n
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-card text-muted-foreground hover:border-primary/50"
                          }`}
                        >
                          <span className="font-bold">{n}x</span>
                          <br />
                          <span className="text-xs">
                            R$ {formatBRL(parcelaValue)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground font-sans">
                      {installments}x de R$ {formatBRL(planValue / installments)} = <strong className="text-foreground">R$ {formatBRL(planValue)}</strong>
                    </p>
                  </div>
                </div>
              )}

              {maxInstallments === 1 && (
                <div className="text-center">
                  <p className="text-xs text-muted-foreground font-sans">
                    Pagamento à vista no cartão
                  </p>
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <Label className="font-sans text-sm">Nome no cartão</Label>
                  <Input
                    value={cardForm.holderName}
                    onChange={e => setCardForm(f => ({ ...f, holderName: e.target.value }))}
                    placeholder="Nome impresso no cartão"
                  />
                </div>
                <div>
                  <Label className="font-sans text-sm">Número do cartão</Label>
                  <Input
                    value={cardForm.number}
                    onChange={e => setCardForm(f => ({ ...f, number: e.target.value.replace(/\D/g, "").slice(0, 16) }))}
                    placeholder="0000 0000 0000 0000"
                    maxLength={16}
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="font-sans text-sm">Mês</Label>
                    <Input
                      value={cardForm.expiryMonth}
                      onChange={e => setCardForm(f => ({ ...f, expiryMonth: e.target.value.replace(/\D/g, "").slice(0, 2) }))}
                      placeholder="MM"
                      maxLength={2}
                    />
                  </div>
                  <div>
                    <Label className="font-sans text-sm">Ano</Label>
                    <Input
                      value={cardForm.expiryYear}
                      onChange={e => setCardForm(f => ({ ...f, expiryYear: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
                      placeholder="AAAA"
                      maxLength={4}
                    />
                  </div>
                  <div>
                    <Label className="font-sans text-sm">CVV</Label>
                    <Input
                      value={cardForm.ccv}
                      onChange={e => setCardForm(f => ({ ...f, ccv: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
                      placeholder="000"
                      maxLength={4}
                      type="password"
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-border">
                  <p className="text-xs text-muted-foreground font-sans mb-3">Dados do titular</p>
                  <div className="space-y-3">
                    <div>
                      <Label className="font-sans text-sm">Email</Label>
                      <Input
                        value={cardForm.email}
                        onChange={e => setCardForm(f => ({ ...f, email: e.target.value }))}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="font-sans text-sm">CPF</Label>
                        <Input
                          value={cardForm.cpfCnpj}
                          onChange={e => setCardForm(f => ({ ...f, cpfCnpj: formatCPF(e.target.value) }))}
                          placeholder="000.000.000-00"
                          inputMode="numeric"
                        />
                      </div>
                      <div>
                        <Label className="font-sans text-sm">CEP</Label>
                        <Input
                          value={cardForm.postalCode}
                          onChange={e => setCardForm(f => ({ ...f, postalCode: formatCEP(e.target.value) }))}
                          placeholder="00000-000"
                          inputMode="numeric"
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="font-sans text-sm">Telefone</Label>
                      <Input
                        value={cardForm.phone}
                        onChange={e => setCardForm(f => ({ ...f, phone: formatPhone(e.target.value) }))}
                        placeholder="(00) 00000-0000"
                        inputMode="tel"
                      />
                    </div>
                    <div className="grid grid-cols-[1fr_100px] gap-3">
                      <div>
                        <Label className="font-sans text-sm">Endereço (rua)</Label>
                        <Input
                          value={cardForm.address}
                          onChange={e => setCardForm(f => ({ ...f, address: e.target.value }))}
                          placeholder="Rua / Avenida"
                        />
                      </div>
                      <div>
                        <Label className="font-sans text-sm">Número *</Label>
                        <Input
                          value={cardForm.addressNumber}
                          onChange={e => setCardForm(f => ({ ...f, addressNumber: e.target.value }))}
                          placeholder="123"
                          inputMode="numeric"
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="font-sans text-sm">Bairro</Label>
                      <Input
                        value={cardForm.province}
                        onChange={e => setCardForm(f => ({ ...f, province: e.target.value }))}
                        placeholder="Bairro"
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground font-sans">
                      * Número do endereço é obrigatório para aprovação antifraude do cartão.
                    </p>
                  </div>
                </div>
              </div>

              <Button className="w-full h-12 text-lg" onClick={handleCard} disabled={loading}>
                {loading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <CreditCard className="h-5 w-5 mr-2" />}
                {installments > 1
                  ? `Pagar ${installments}x de R$ ${formatBRL(planValue / installments)}`
                  : `Pagar R$ ${formatBRL(planValue)}`}
              </Button>
              <Button variant="ghost" size="sm" className="w-full" onClick={() => setStep("choose")}>
                ← Voltar
              </Button>
            </CardContent>
          </Card>
        )}

        <p className="text-center text-xs text-muted-foreground font-sans">
          Pagamento processado com segurança
        </p>
      </div>
    </div>
  );
}
