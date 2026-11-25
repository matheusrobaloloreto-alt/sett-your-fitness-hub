import { COUNTRY_OPTIONS, isCountryCode } from "@/lib/countries";
import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, Copy, CreditCard, QrCode, Loader2, Check, ShieldCheck, Lock } from "lucide-react";
import { maxInstallmentsForPlanDuration } from "../../supabase/functions/_shared/payment-installments";
import { DEFAULT_COMPANY_PRODUCT_SETTINGS } from "@/lib/companyProductSettings";
import { safePublicUrl } from "@/lib/platformSettingsClient";
import { applyTheme } from "@/contexts/ThemeContext";
import { formatCEP, formatPhone, formatPhoneForCountry } from "@/lib/masks";
import { billingProfileValidation, billingProfilePayload, internationalCheckoutUrl, paymentFailureMessage, INTERNATIONAL_PAYMENT_UNAVAILABLE } from "@/lib/fiscalRegistration";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

async function callAsaas(checkoutToken: string, action: string, body: Record<string, any>) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/asaas-integration`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_KEY,
    },
    body: JSON.stringify({ action, checkoutToken, ...body }),
  });
  const data = await res.json().catch(() => ({ error: "Resposta inválida do servidor de pagamentos." }));
  if (!res.ok || data.error) throw Object.assign(new Error(data.error || "Erro na operação"), { code: data.code });
  return data;
}

type Step = "select_plan" | "choose" | "pix" | "card" | "pending" | "success";

interface PlanOption {
  id: string;
  name: string;
  price: number;
  duration_weeks: number;
  description: string | null;
}

function formatBRL(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

async function recordRecoveryEvent(
  token: string | undefined,
  eventType: "plan_selected" | "payment_started" | "payment_abandoned" | "payment_completed",
  metadata: Record<string, any> = {},
  planId?: string | null,
  paymentId?: string | null,
) {
  if (!token) return;
  try {
    await supabase.functions.invoke("public-payment-context", {
      body: {
        action: "record-event",
        token,
        eventType,
        planId: planId || null,
        paymentId: paymentId || null,
        metadata,
      },
    });
  } catch {
    // Recovery telemetry must never block checkout.
  }
}

export default function PublicPayment() {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();

  const [student, setStudent] = useState<any>(null);
  const [logoSrc, setLogoSrc] = useState<string | null>(null);
  const [business, setBusiness] = useState(DEFAULT_COMPANY_PRODUCT_SETTINGS.business);
  const [companyName, setCompanyName] = useState("");
  const [companySlug, setCompanySlug] = useState("");
  const [publicLinks, setPublicLinks] = useState({ terms_url: "", privacy_url: "" });
  const [notFound, setNotFound] = useState(false);
  const [step, setStep] = useState<Step>("select_plan");
  const [loading, setLoading] = useState(false);
  const [isRenewal, setIsRenewal] = useState(false);
  const [billingCountryCode, setBillingCountryCode] = useState("");
  const [payerCountryCode, setPayerCountryCode] = useState("");
  const [billingConfirmed, setBillingConfirmed] = useState(false);
  const [billingError, setBillingError] = useState("");
  const [hostedInvoiceUrl, setHostedInvoiceUrl] = useState("");
  const isBrazilianPayer = payerCountryCode === "BR";

  // Plans
  const [availablePlans, setAvailablePlans] = useState<PlanOption[]>([]);
  const [selectedPlanOptionId, setSelectedPlanOptionId] = useState<string | null>(null);
  const [loadingPlans, setLoadingPlans] = useState(true);

  // Pix state
  const [pixImage, setPixImage] = useState("");
  const [pixPayload, setPixPayload] = useState("");
  const [pixPaymentId, setPixPaymentId] = useState("");
  const pollingRef = useRef<number | null>(null);
  const stopPixPolling = useCallback(() => {
    if (pollingRef.current !== null) window.clearInterval(pollingRef.current);
    pollingRef.current = null;
  }, []);

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
    city: "",
    state: "",
    documentType: "TAX_ID",
  });

  const [planValue, setPlanValue] = useState(0);
  const [planName, setPlanName] = useState("");
  const [planDurationWeeks, setPlanDurationWeeks] = useState(0);
  const [installments, setInstallments] = useState(1);
  const abandonedRecordedRef = useRef(false);
  const recoveryStateRef = useRef({
    token,
    step,
    selectedPlanOptionId,
    planName,
    planValue,
    pixPaymentId,
  });

  useEffect(() => {
    recoveryStateRef.current = {
      token,
      step,
      selectedPlanOptionId,
      planName,
      planValue,
      pixPaymentId,
    };
  }, [token, step, selectedPlanOptionId, planName, planValue, pixPaymentId]);

  const recordAbandoned = (reason: string) => {
    const state = recoveryStateRef.current;
    if (abandonedRecordedRef.current || state.step === "success" || !state.selectedPlanOptionId) return;
    abandonedRecordedRef.current = true;
    void recordRecoveryEvent(state.token, "payment_abandoned", {
      reason,
      step: state.step,
      plan_name: state.planName,
      amount: state.planValue,
      asaas_payment_id: state.pixPaymentId || null,
    }, state.selectedPlanOptionId);
  };

  useEffect(() => {
    if (!token) { setNotFound(true); return; }

    const loadAll = async () => {
      setLoadingPlans(true);
      const { data, error } = await supabase.functions.invoke("public-payment-context", {
        body: { action: "context", token },
      });
      if (error || !data?.student) { setNotFound(true); setLoadingPlans(false); return; }
      const s = data.student;
      setBusiness(data.business || DEFAULT_COMPANY_PRODUCT_SETTINGS.business);
      setCompanyName(data.publicBrand?.company_name || data.company?.name || "");
      setCompanySlug(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(data.company?.slug || "") ? data.company.slug : "");
      setPublicLinks({ terms_url: safePublicUrl(data.publicBrand?.terms_url) || "", privacy_url: safePublicUrl(data.publicBrand?.privacy_url) || "" });
      setStudent(s);
      const country = String(s.billing_country_code || s.country_code || "").toUpperCase();
      setBillingCountryCode(country);
      setPayerCountryCode(country);
      setBillingConfirmed(country === "BR");
      const hasBillingProfile = Boolean(s.billing_country_code);
      setCardForm(prev => ({
        ...prev,
        holderName: s.billing_name || s.full_name || "",
        email: s.billing_email || s.email || "",
        // CNPJ has 14 digits: formatCPF would silently truncate it.
        cpfCnpj: s.billing_document_number || s.billing_cpf_cnpj || (!hasBillingProfile ? s.cpf : "") || "",
        documentType: s.billing_document_type || "TAX_ID",
        postalCode: s.billing_postal_code || (!hasBillingProfile ? s.cep : "") || "",
        phone: formatPhoneForCountry(s.billing_phone || (!hasBillingProfile ? (s.whatsapp || s.phone) : "") || "", country),
        address: s.billing_address || (!hasBillingProfile ? s.address : "") || "",
        addressNumber: s.billing_address_number || (!hasBillingProfile ? s.address_number : "") || "",
        province: s.billing_neighborhood || (!hasBillingProfile ? s.neighborhood : "") || "",
        city: s.billing_city || (!hasBillingProfile ? s.city : "") || "",
        state: s.billing_state || (!hasBillingProfile ? s.state : "") || "",
      }));
      if (s.selected_plan_id) setSelectedPlanOptionId(s.selected_plan_id);
      // White-label: aplica logo + tema da empresa (some o logo BN fixo para outras marcas).
      if (data.branding) {
        if (data.branding.logo_url) setLogoSrc(data.branding.logo_url);
        applyTheme(data.branding);
      }
      setIsRenewal(!!data.isRenewal);
      setAvailablePlans((data.plans as PlanOption[]) || []);
      setLoadingPlans(false);
    };

    loadAll();

    return stopPixPolling;
  }, [token, stopPixPolling]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") recordAbandoned("tab_hidden");
    };
    const onBeforeUnload = () => recordAbandoned("before_unload");

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, []);

  useEffect(() => () => recordAbandoned("page_unmounted"), []);

  const handleSelectPlan = async (plan: PlanOption) => {
    if (!token) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("public-payment-context", {
        body: { action: "select-plan", token, planId: plan.id },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message || "Não foi possível selecionar o plano.");
      setSelectedPlanOptionId(plan.id);
      setPlanValue(plan.price);
      setPlanName(plan.name);
      setPlanDurationWeeks(plan.duration_weeks);
      setInstallments(1);
      setHostedInvoiceUrl("");
      setBillingError("");
      setStep("choose");
    } catch (error) {
      toast({
        title: "Não foi possível selecionar o plano",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const maxInstallments = isBrazilianPayer ? maxInstallmentsForPlanDuration(planDurationWeeks, business) : 1;
  useEffect(() => { setInstallments(1); }, [maxInstallments, selectedPlanOptionId]);

  const payerBillingInput = () => ({
    countryCode: payerCountryCode,
    name: cardForm.holderName,
    email: cardForm.email,
    documentType: cardForm.documentType,
    documentNumber: cardForm.cpfCnpj,
    postalCode: cardForm.postalCode,
    phone: cardForm.phone,
    address: cardForm.address,
    addressNumber: cardForm.addressNumber,
    province: cardForm.province,
    city: cardForm.city,
    state: cardForm.state,
  });

  const saveBillingProfile = async () => {
    const issues = billingProfileValidation(payerBillingInput());
    if (!isCountryCode(payerCountryCode)) {
      setBillingError("Selecione o país de cobrança.");
      return;
    }
    if (issues.length) {
      setBillingError(`Confira: ${issues.join(", ")}.`);
      return;
    }
    if (!token) return;
    setLoading(true);
    setBillingError("");
    setHostedInvoiceUrl("");
    setBillingConfirmed(false);
    try {
      const billing = billingProfilePayload(payerBillingInput());
      const { data, error } = await supabase.functions.invoke("public-payment-context", {
        body: {
          action: isBrazilianPayer ? "set-brazilian-billing-profile" : "set-billing-profile",
          token,
          billing: isBrazilianPayer ? { ...billing, cpfCnpj: billing.documentNumber } : billing,
        },
      });
      if (error || data?.error || data?.billingCountryCode !== payerCountryCode) {
        // Supabase puts non-2xx response bodies on FunctionsHttpError.context.
        const failure = data || await error?.context?.json?.().catch(() => null);
        throw Object.assign(new Error(failure?.error || error?.message || "Não foi possível validar os dados de cobrança."), { code: failure?.code });
      }
      setBillingCountryCode(data.billingCountryCode);
      setBillingConfirmed(true);
      toast({ title: "Dados do pagador salvos", description: "O cadastro e o WhatsApp do aluno foram preservados." });
    } catch (error) {
      setBillingError(paymentFailureMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const handleInternationalCard = async () => {
    if (!token || !billingConfirmed || isBrazilianPayer || billingCountryCode !== payerCountryCode) return;
    setLoading(true);
    setBillingError("");
    try {
      const data = await callAsaas(token, "create-foreign-card-payment", {
        planId: selectedPlanOptionId,
        billingType: "CREDIT_CARD",
        installmentCount: 1,
        currency: "BRL",
        checkoutMode: "hosted",
      });
      const url = internationalCheckoutUrl(data);
      if (!url) throw new Error(INTERNATIONAL_PAYMENT_UNAVAILABLE);
      setHostedInvoiceUrl(url);
      await recordRecoveryEvent(token, "payment_started", {
        method: "CARD", currency: "BRL", installments: 1,
        plan_name: planName, amount: planValue,
      }, selectedPlanOptionId, data.paymentId);
      // Opening an invoice is not a payment confirmation or plan activation.
      window.location.assign(url);
    } catch (error) {
      setBillingError(paymentFailureMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const handlePix = async () => {
    if (!isBrazilianPayer || !billingConfirmed || billingCountryCode !== "BR") return;
    setLoading(true);
    try {
      if (!token) throw new Error("Link de pagamento inválido.");
      const { paymentId, status } = await callAsaas(token, "create-payment", {
        billingType: "PIX",
        planId: selectedPlanOptionId,
      });
      setPixPaymentId(paymentId);
      abandonedRecordedRef.current = false;
      await recordRecoveryEvent(token, "payment_started", {
        method: "PIX",
        plan_name: planName,
        amount: planValue,
        asaas_payment_id: paymentId,
      }, selectedPlanOptionId);

      if (status === "RECEIVED" || status === "CONFIRMED") {
        abandonedRecordedRef.current = true;
        await recordRecoveryEvent(token, "payment_completed", {
          method: "PIX",
          status,
          plan_name: planName,
          amount: planValue,
          asaas_payment_id: paymentId,
        }, selectedPlanOptionId, paymentId);
        setStep("success");
        return;
      }

      const { encodedImage, payload } = await callAsaas(token, "get-pix-qrcode", { paymentId });
      setPixImage(encodedImage);
      setPixPayload(payload);
      setStep("pix");

      stopPixPolling();
      let pollAttempts = 0;
      let checkingStatus = false;
      const intervalId = window.setInterval(async () => {
        pollAttempts += 1;
        // Para de pollar após ~15 min (90 × 10s) para não rodar indefinidamente em background.
        if (pollAttempts > 90) {
          stopPixPolling();
          toast({ title: "Tempo de espera esgotado", description: "Se você já pagou, a confirmação chega em instantes. Pode atualizar a página." });
          return;
        }
        if (checkingStatus) return;
        checkingStatus = true;
        try {
          const { status } = await callAsaas(token, "get-payment-status", { paymentId });
          if (pollingRef.current !== intervalId) return;
          if (status === "DELETED") {
            stopPixPolling();
            abandonedRecordedRef.current = true;
            setPixImage("");
            setPixPayload("");
            setPixPaymentId("");
            setStep("choose");
            toast({ title: "Cobrança Pix cancelada", description: "Confira as opções de pagamento ou fale com a equipe." });
            return;
          }
          if (status === "RECEIVED" || status === "CONFIRMED") {
            stopPixPolling();
            abandonedRecordedRef.current = true;
            await recordRecoveryEvent(token, "payment_completed", {
              method: "PIX",
              status,
              plan_name: planName,
              amount: planValue,
              asaas_payment_id: paymentId,
            }, selectedPlanOptionId, paymentId);
            setStep("success");
          }
        } catch {
          // A próxima tentativa de polling reconcilia falhas transitórias.
        } finally {
          checkingStatus = false;
        }
      }, 10000);
      pollingRef.current = intervalId;
    } catch (err: any) {
      toast({ title: "Erro ao gerar Pix", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleCard = async () => {
    if (!isBrazilianPayer || !billingConfirmed || billingCountryCode !== "BR") return;
    const cpfDigits = cardForm.cpfCnpj.replace(/\D/g, "");
    const cepDigits = cardForm.postalCode.replace(/\D/g, "");
    const phoneDigits = cardForm.phone.replace(/\D/g, "");

    if (!cardForm.number || !cardForm.expiryMonth || !cardForm.expiryYear || !cardForm.ccv || !cardForm.holderName) {
      toast({ title: "Preencha todos os dados do cartão", variant: "destructive" });
      return;
    }
    // Valida validade antes de enviar — 3 dígitos no ano viravam recusa genérica do Asaas.
    if (cardForm.expiryYear.length !== 2 && cardForm.expiryYear.length !== 4) {
      toast({ title: "Ano de validade inválido", description: "Use 2 ou 4 dígitos (ex.: 28 ou 2028).", variant: "destructive" });
      return;
    }
    const expMonthNum = parseInt(cardForm.expiryMonth, 10);
    if (!(expMonthNum >= 1 && expMonthNum <= 12)) {
      toast({ title: "Mês de validade inválido", description: "Use um mês entre 01 e 12.", variant: "destructive" });
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
      if (!token) throw new Error("Link de pagamento inválido.");
      await recordRecoveryEvent(token, "payment_started", {
        method: "CARD",
        plan_name: planName,
        amount: planValue,
        installments,
      }, selectedPlanOptionId);
      const payload: Record<string, any> = {
        planId: selectedPlanOptionId,
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
      }
      const { status, paymentId } = await callAsaas(token, "create-card-payment", payload);

      if (status === "CONFIRMED" || status === "RECEIVED") {
        abandonedRecordedRef.current = true;
        await recordRecoveryEvent(token, "payment_completed", {
          method: "CARD",
          status,
          plan_name: planName,
          amount: planValue,
          installments,
        }, selectedPlanOptionId, paymentId);
        setStep("success");
      } else if (status === "PENDING" || status === "AWAITING_RISK_ANALYSIS") {
        toast({ title: "Pagamento em análise", description: "Você receberá a confirmação em breve." });
        abandonedRecordedRef.current = true;
        setStep("pending");
      } else {
        throw new Error(`O pagamento não foi confirmado (status: ${status}).`);
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
            <h2 className="text-2xl text-primary">LINK INDISPONÍVEL</h2>
            <p className="text-muted-foreground font-sans">O link de pagamento é inválido ou expirou. Solicite um novo link ao seu treinador.</p>
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
                : "Recebemos seu pagamento e seu plano já está ativo. As instruções da avaliação de movimento serão enviadas na sua conversa."}
            </p>
            {!isRenewal && (
              <p className="text-xs text-muted-foreground font-sans">
                Após receber o material completo, a equipe tem até 2 dias úteis para avaliar e até {Math.max(2, business.assessment_sla_business_days)} dias úteis para entregar a primeira prescrição.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === "pending") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full bg-card border-border text-center">
          <CardContent className="pt-8 pb-8 space-y-4">
            <Loader2 className="h-16 w-16 text-primary mx-auto animate-spin" />
            <h2 className="text-3xl text-primary">PAGAMENTO EM ANÁLISE</h2>
            <p className="text-muted-foreground font-sans">
              A operadora ainda não confirmou a cobrança. Avisaremos assim que a análise terminar; seu plano só será ativado após a confirmação.
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
          {logoSrc ? <img src={logoSrc} alt={companyName || "Logo"} className="h-16 mx-auto object-contain" /> : <p className="text-xl font-semibold">{companyName}</p>}
          <nav className="flex flex-wrap justify-center gap-4 text-sm">{publicLinks.terms_url ? <a href={publicLinks.terms_url} target="_blank" rel="noopener noreferrer">Termos</a> : companySlug && <Link to={`/empresa/${companySlug}/termos`}>Termos</Link>}{publicLinks.privacy_url ? <a href={publicLinks.privacy_url} target="_blank" rel="noopener noreferrer">Privacidade</a> : companySlug && <Link to={`/empresa/${companySlug}/privacidade`}>Privacidade</Link>}{companySlug && <Link to={`/empresa/${companySlug}/suporte`}>Suporte</Link>}</nav>
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
          <div className="space-y-4">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-primary text-xl text-center">DADOS DO PAGADOR</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">O país de cobrança pode ser diferente do país de residência do aluno.</p>
              <fieldset disabled={loading} className="space-y-3" onChange={() => { setBillingConfirmed(false); setBillingError(""); setHostedInvoiceUrl(""); }}>
                <div>
                  <Label htmlFor="payer-location">Local de cobrança</Label>
                  <select id="payer-location" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={isBrazilianPayer ? "BR" : "FOREIGN"} onChange={e => {
                    setPayerCountryCode(e.target.value === "BR" ? "BR" : "");
                    setInstallments(1);
                    setCardForm(f => ({ ...f, cpfCnpj: "", postalCode: "", phone: "" }));
                  }}>
                    <option value="BR">Brasil</option><option value="FOREIGN">Exterior</option>
                  </select>
                </div>
                {!isBrazilianPayer && <div>
                  <Label htmlFor="payer-country">País de cobrança</Label>
                  <select id="payer-country" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={isCountryCode(payerCountryCode) ? payerCountryCode : ""} onChange={e => {
                    setPayerCountryCode(e.target.value);
                    setInstallments(1);
                    // Selecting a country must not reinterpret the previous payer's document/phone.
                    setCardForm(f => ({ ...f, cpfCnpj: "", postalCode: "", phone: "" }));
                  }}>
                    <option value="">Selecione o país</option>
                    {COUNTRY_OPTIONS.filter(country => country.code !== "BR").map(country => <option key={country.code} value={country.code}>{country.name}</option>)}
                  </select>
                </div>}
                <div><Label htmlFor="payer-name">Nome do pagador</Label><Input id="payer-name" value={cardForm.holderName} onChange={e => setCardForm(f => ({ ...f, holderName: e.target.value }))} /></div>
                <div><Label htmlFor="payer-email">E-mail do pagador</Label><Input id="payer-email" type="email" value={cardForm.email} onChange={e => setCardForm(f => ({ ...f, email: e.target.value }))} /></div>
                {!isBrazilianPayer && <div>
                  <Label htmlFor="payer-document-type">Tipo de documento</Label>
                  <select id="payer-document-type" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={cardForm.documentType} onChange={e => setCardForm(f => ({ ...f, documentType: e.target.value }))}>
                    <option value="TAX_ID">Identificação fiscal local</option><option value="PASSPORT">Passaporte</option><option value="NATIONAL_ID">Documento de identidade</option>
                  </select>
                </div>}
                <div><Label htmlFor="payer-document">{isBrazilianPayer ? "CPF/CNPJ" : "Número do documento"}</Label><Input id="payer-document" value={cardForm.cpfCnpj} maxLength={isBrazilianPayer ? 18 : 80} onChange={e => setCardForm(f => ({ ...f, cpfCnpj: isBrazilianPayer ? e.target.value.replace(/\D/g, "").slice(0, 14) : e.target.value }))} /></div>
                <div><Label htmlFor="payer-postal">{isBrazilianPayer ? "CEP" : "Código postal (se houver)"}</Label><Input id="payer-postal" value={cardForm.postalCode} onChange={e => setCardForm(f => ({ ...f, postalCode: isBrazilianPayer ? formatCEP(e.target.value) : e.target.value }))} /></div>
                <div><Label htmlFor="payer-address">Endereço</Label><Input id="payer-address" value={cardForm.address} onChange={e => setCardForm(f => ({ ...f, address: e.target.value }))} /></div>
                <div><Label htmlFor="payer-number">Número {isBrazilianPayer ? "" : "(se houver)"}</Label><Input id="payer-number" value={cardForm.addressNumber} onChange={e => setCardForm(f => ({ ...f, addressNumber: e.target.value }))} /></div>
                <div><Label htmlFor="payer-district">Bairro {isBrazilianPayer ? "" : "(se houver)"}</Label><Input id="payer-district" value={cardForm.province} onChange={e => setCardForm(f => ({ ...f, province: e.target.value }))} /></div>
                {!isBrazilianPayer && <>
                  <div><Label htmlFor="payer-city">Cidade</Label><Input id="payer-city" value={cardForm.city} onChange={e => setCardForm(f => ({ ...f, city: e.target.value }))} /></div>
                  <div><Label htmlFor="payer-region">Estado / região (se houver)</Label><Input id="payer-region" value={cardForm.state} onChange={e => setCardForm(f => ({ ...f, state: e.target.value }))} /></div>
                </>}
                <div><Label htmlFor="payer-phone">{isBrazilianPayer ? "Telefone do pagador" : "Telefone com + e código do país"}</Label><Input id="payer-phone" type="tel" value={cardForm.phone} onChange={e => setCardForm(f => ({ ...f, phone: formatPhoneForCountry(e.target.value, payerCountryCode) }))} placeholder={isBrazilianPayer ? "(00) 00000-0000" : "+ código do país e número"} /></div>
              </fieldset>
              <Button className="w-full" onClick={saveBillingProfile} disabled={loading}>{loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Confirmar dados do pagador</Button>
              {billingConfirmed && <p className="text-sm" role="status">Dados de cobrança confirmados.</p>}
              {!isBrazilianPayer && <p className="text-sm text-muted-foreground">Pagamento internacional: cartão à vista, em reais (BRL), sujeito à disponibilidade do provedor e aprovação do emissor. Pix e boleto não estão disponíveis neste fluxo. Seu banco pode aplicar câmbio e tarifas.</p>}
              {billingError && <p role="alert" className="text-sm text-destructive">{billingError}</p>}
            </CardContent>
          </Card>
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
              {isBrazilianPayer && <Button
                className="w-full h-14 text-lg gap-3"
                onClick={handlePix}
                disabled={loading || !billingConfirmed || billingCountryCode !== payerCountryCode}
              >
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <QrCode className="h-5 w-5" />}
                Pagar com Pix via Asaas
              </Button>}
              <Button
                variant="outline"
                className="w-full h-14 text-lg gap-3"
                onClick={() => isBrazilianPayer ? setStep("card") : void handleInternationalCard()}
                disabled={loading || !billingConfirmed || billingCountryCode !== payerCountryCode || Boolean(hostedInvoiceUrl)}
              >
                <CreditCard className="h-5 w-5" />
                {isBrazilianPayer ? "Pagar com Cartão" : "Preparar pagamento com cartão em BRL"}
              </Button>
              {hostedInvoiceUrl && !isBrazilianPayer && billingConfirmed && <div className="space-y-2">
                <a className="block rounded-md bg-primary px-4 py-3 text-center text-primary-foreground" href={hostedInvoiceUrl} target="_blank" rel="noopener noreferrer">Continuar no ambiente seguro do Asaas</a>
                <p className="text-xs text-muted-foreground" role="status">Cobrança preparada, ainda não paga. O plano só será ativado após confirmação do pagamento.</p>
              </div>}
              <Button variant="ghost" size="sm" className="w-full" onClick={() => setStep("select_plan")}>
                ← Trocar plano
              </Button>
            </CardContent>
          </Card>
          </div>
        )}

        {step === "pix" && (
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-primary text-xl text-center">PIX VIA ASAAS</CardTitle>
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
              <p className="text-xs text-muted-foreground">
                QR Code dinâmico e cobrança identificada emitidos pelo Asaas.
              </p>
              <Button variant="ghost" size="sm" onClick={() => { stopPixPolling(); setStep("choose"); }}>
                ← Voltar
              </Button>
            </CardContent>
          </Card>
        )}

        {step === "card" && isBrazilianPayer && (
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
                    <p className="text-xs text-primary font-sans font-semibold mt-1">Sem juros para você</p>
                  </div>
                </div>
              )}

              {maxInstallments === 1 && (
                <div className="text-center">
                  <p className="text-xs text-muted-foreground font-sans">
                    Pagamento à vista no cartão
                  </p>
                  <p className="text-xs text-primary font-sans font-semibold mt-1">Sem juros para você</p>
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
                        <Label className="font-sans text-sm">CPF/CNPJ</Label>
                        <Input
                          value={cardForm.cpfCnpj}
                          onChange={e => setCardForm(f => ({ ...f, cpfCnpj: e.target.value.replace(/\D/g, "").slice(0, 14) }))}
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

        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground font-sans">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            Pagamento processado com segurança por <span className="font-medium text-foreground">Asaas</span>
          </div>
          <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground font-sans">
            <Lock className="h-3 w-3" />
            Seus dados de cartão são criptografados e não ficam armazenados conosco
          </div>
        </div>
      </div>
    </div>
  );
}
