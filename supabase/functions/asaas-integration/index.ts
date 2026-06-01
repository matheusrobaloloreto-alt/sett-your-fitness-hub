import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ASAAS_API_KEY = Deno.env.get("ASAAS_API_KEY")!;
const ASAAS_BASE_URL = "https://api.asaas.com/v3";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

async function asaasFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${ASAAS_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      access_token: ASAAS_API_KEY,
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) {
    console.error("Asaas API error:", res.status, JSON.stringify(data));
    const firstErr = data.errors?.[0];
    const msg = firstErr
      ? `${firstErr.description || "Erro"}${firstErr.code ? ` (${firstErr.code})` : ""}`
      : data.message || `Erro na API do Asaas (HTTP ${res.status})`;
    throw new Error(msg);
  }
  return data;
}

async function createCustomer(body: any) {
  const { studentId, name, email, cpfCnpj, mobilePhone, postalCode, address, addressNumber, province, cityName, state } = body;
  if (!studentId || !name || !cpfCnpj) {
    throw new Error("studentId, name e cpfCnpj são obrigatórios");
  }

  // Check if student already has asaas_customer_id
  const { data: student } = await supabaseAdmin
    .from("students")
    .select("asaas_customer_id")
    .eq("id", studentId)
    .single();

  if (student?.asaas_customer_id) {
    return { customerId: student.asaas_customer_id };
  }

  const customerPayload: any = {
    name,
    email: email || undefined,
    cpfCnpj: cpfCnpj.replace(/\D/g, ""),
    mobilePhone: mobilePhone?.replace(/\D/g, "") || undefined,
    externalReference: studentId,
  };

  if (postalCode) customerPayload.postalCode = postalCode.replace(/\D/g, "");
  if (address) customerPayload.address = address;
  if (addressNumber) customerPayload.addressNumber = addressNumber;
  if (province) customerPayload.province = province;

  const customer = await asaasFetch("/customers", {
    method: "POST",
    body: JSON.stringify(customerPayload),
  });

  // Save asaas_customer_id on student
  await supabaseAdmin
    .from("students")
    .update({ asaas_customer_id: customer.id })
    .eq("id", studentId);

  return { customerId: customer.id };
}

async function updateCustomer(body: any) {
  const { studentId, name, email, mobilePhone, postalCode, address, addressNumber, province } = body;
  if (!studentId) throw new Error("studentId é obrigatório");

  const { data: student } = await supabaseAdmin
    .from("students")
    .select("asaas_customer_id")
    .eq("id", studentId)
    .single();

  if (!student?.asaas_customer_id) {
    throw new Error("Cliente Asaas não encontrado para este aluno.");
  }

  const payload: any = {};
  if (name) payload.name = name;
  if (email) payload.email = email;
  if (mobilePhone) payload.mobilePhone = mobilePhone.replace(/\D/g, "");
  if (postalCode) payload.postalCode = postalCode.replace(/\D/g, "");
  if (address) payload.address = address;
  if (addressNumber) payload.addressNumber = addressNumber;
  if (province) payload.province = province;

  const customer = await asaasFetch(`/customers/${student.asaas_customer_id}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return { customerId: customer.id, updated: true };
}


async function createPayment(body: any) {
  const { studentId, billingType, value, dueDate, description, planId } = body;
  if (!studentId || !billingType || !value) {
    throw new Error("studentId, billingType e value são obrigatórios");
  }

  // Get customer id
  const { data: student } = await supabaseAdmin
    .from("students")
    .select("asaas_customer_id, company_id, full_name, email, cpf, phone, whatsapp, cep, address, address_number, neighborhood, city, state")
    .eq("id", studentId)
    .single();

  if (!student) {
    throw new Error("Aluno não encontrado.");
  }

  // Auto-create Asaas customer if missing
  if (!student.asaas_customer_id) {
    console.log(`[PAYMENT] Auto-creating Asaas customer for student ${studentId}`);
    const { customerId } = await createCustomer({
      studentId,
      name: student.full_name,
      email: student.email || undefined,
      cpfCnpj: student.cpf || "",
      mobilePhone: (student.whatsapp || student.phone || "").replace(/\D/g, ""),
      postalCode: (student.cep || "").replace(/\D/g, ""),
      address: student.address || undefined,
      addressNumber: student.address_number || undefined,
      province: student.neighborhood || undefined,
      cityName: student.city || undefined,
      state: student.state || undefined,
    });
    student.asaas_customer_id = customerId;
  }

  const payment = await asaasFetch("/payments", {
    method: "POST",
    body: JSON.stringify({
      customer: student.asaas_customer_id,
      billingType,
      value: Number(value),
      dueDate: dueDate || new Date().toISOString().split("T")[0],
      description: description || "Plano BN Performance Training",
      externalReference: studentId,
    }),
  });

  // Save to payments table
  await supabaseAdmin.from("payments").insert({
    student_id: studentId,
    company_id: student.company_id || null,
    asaas_customer_id: student.asaas_customer_id,
    asaas_payment_id: payment.id,
    billing_type: billingType,
    value: Number(value),
    status: payment.status || "PENDING",
    due_date: payment.dueDate || null,
    invoice_url: payment.invoiceUrl || null,
    installment_count: 1,
  });

  // Ativar aluno automaticamente se pagamento já confirmado
  if (["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(payment.status)) {
    await applyPaymentStatusEffects(studentId, payment.status, payment.id, planId);
  }

  return {
    paymentId: payment.id,
    status: payment.status,
    invoiceUrl: payment.invoiceUrl,
  };
}

async function getPixQrCode(body: any) {
  const { paymentId } = body;
  if (!paymentId) throw new Error("paymentId é obrigatório");

  const data = await asaasFetch(`/payments/${paymentId}/pixQrCode`);
  return {
    encodedImage: data.encodedImage,
    payload: data.payload,
    expirationDate: data.expirationDate,
  };
}

async function createCardPayment(body: any) {
  const {
    studentId,
    value,
    dueDate,
    description,
    creditCard,
    creditCardHolderInfo,
    remoteIp,
    installmentCount,
    installmentValue,
    planId,
  } = body;

  if (!studentId || !value || !creditCard || !creditCardHolderInfo) {
    throw new Error("Dados incompletos para pagamento com cartão");
  }

  const { data: student } = await supabaseAdmin
    .from("students")
    .select("asaas_customer_id, company_id, full_name, email, cpf, phone, whatsapp, cep, address, address_number, neighborhood, city, state")
    .eq("id", studentId)
    .single();

  if (!student) {
    throw new Error("Aluno não encontrado.");
  }

  // Auto-create Asaas customer if missing
  if (!student.asaas_customer_id) {
    console.log(`[CARD] Auto-creating Asaas customer for student ${studentId}`);
    const { customerId } = await createCustomer({
      studentId,
      name: student.full_name,
      email: student.email || undefined,
      cpfCnpj: student.cpf || "",
      mobilePhone: (student.whatsapp || student.phone || "").replace(/\D/g, ""),
      postalCode: (student.cep || "").replace(/\D/g, ""),
      address: student.address || undefined,
      addressNumber: student.address_number || undefined,
      province: student.neighborhood || undefined,
    });
    student.asaas_customer_id = customerId;
  }

  const paymentPayload: any = {
    customer: student.asaas_customer_id,
    billingType: "CREDIT_CARD",
    value: Number(value),
    dueDate: dueDate || new Date().toISOString().split("T")[0],
    description: description || "Plano BN Performance Training",
    externalReference: studentId,
    creditCard: {
      holderName: creditCard.holderName,
      number: creditCard.number.replace(/\D/g, ""),
      expiryMonth: creditCard.expiryMonth,
      expiryYear: creditCard.expiryYear,
      ccv: creditCard.ccv,
    },
    creditCardHolderInfo: {
      name: creditCardHolderInfo.name,
      email: creditCardHolderInfo.email,
      cpfCnpj: creditCardHolderInfo.cpfCnpj?.replace(/\D/g, ""),
      postalCode: creditCardHolderInfo.postalCode?.replace(/\D/g, ""),
      addressNumber: (creditCardHolderInfo.addressNumber || "").toString().trim() || undefined,
      address: creditCardHolderInfo.address || undefined,
      province: creditCardHolderInfo.province || undefined,
      phone: creditCardHolderInfo.phone?.replace(/\D/g, "") || undefined,
    },
    remoteIp: remoteIp || undefined,
  };

  if (installmentCount && installmentCount > 1) {
    paymentPayload.installmentCount = installmentCount;
    paymentPayload.installmentValue = installmentValue || Number((Number(value) / installmentCount).toFixed(2));
  }

  const payment = await asaasFetch("/payments", {
    method: "POST",
    body: JSON.stringify(paymentPayload),
  });

  await supabaseAdmin.from("payments").insert({
    student_id: studentId,
    company_id: student.company_id || null,
    asaas_customer_id: student.asaas_customer_id,
    asaas_payment_id: payment.id,
    billing_type: "CREDIT_CARD",
    value: Number(value),
    status: payment.status || "PENDING",
    due_date: payment.dueDate || null,
    invoice_url: payment.invoiceUrl || null,
    installment_count: installmentCount && installmentCount > 1 ? installmentCount : 1,
  });

  // Ativar aluno automaticamente se pagamento já confirmado
  if (["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(payment.status)) {
    await applyPaymentStatusEffects(studentId, payment.status, payment.id, planId);
  }

  return {
    paymentId: payment.id,
    status: payment.status,
    invoiceUrl: payment.invoiceUrl,
  };
}

async function createInvoice(body: any) {
  const { paymentId } = body;
  if (!paymentId) throw new Error("paymentId é obrigatório");

  const { data: localPayment } = await supabaseAdmin
    .from("payments")
    .select("student_id")
    .eq("asaas_payment_id", paymentId)
    .single();

  if (localPayment?.student_id) {
    const { data: student } = await supabaseAdmin
      .from("students")
      .select("id, asaas_customer_id, full_name, email, phone, whatsapp, cpf, cep, address, address_number, neighborhood")
      .eq("id", localPayment.student_id)
      .single();

    if (student?.asaas_customer_id) {
      const normalizedCep = (student.cep || "").replace(/\D/g, "");
      const normalizedPhone = (student.whatsapp || student.phone || "").replace(/\D/g, "");

      if (!student.address || !student.address_number || !student.neighborhood || normalizedCep.length !== 8) {
        throw new Error(
          "Dados de endereço incompletos para emissão de nota. Preencha Rua, Número, Bairro e CEP válido (8 dígitos)."
        );
      }

      await updateCustomer({
        studentId: student.id,
        name: student.full_name,
        email: student.email || undefined,
        mobilePhone: normalizedPhone || undefined,
        postalCode: normalizedCep,
        address: student.address,
        addressNumber: student.address_number,
        province: student.neighborhood,
      });
    }
  }

  const invoice = await asaasFetch("/invoices", {
    method: "POST",
    body: JSON.stringify({
      payment: paymentId,
      serviceDescription: "Consultoria em educação física",
      observations: "Nota fiscal referente ao plano BN Performance Training",
      effectiveDate: new Date().toISOString().split("T")[0],
      municipalServiceId: "8446",
      municipalServiceCode: "8599-6/04",
      municipalServiceName: "8.02 - TREINAMENTO EM DESENVOLVIMENTO PROFISSIONAL E GERENCIAL",
      taxes: {
        retainIss: false,
        iss: 0,
        cofins: 0,
        csll: 0,
        inss: 0,
        ir: 0,
        pis: 0,
      },
    }),
  });

  // Save invoice status on the payment record
  await supabaseAdmin
    .from("payments")
    .update({ invoice_status: invoice.status || "SCHEDULED" })
    .eq("asaas_payment_id", paymentId);

  return {
    invoiceId: invoice.id,
    status: invoice.status,
  };
}

async function ensureEnrollmentExists(studentId: string, planId?: string) {
  const { data: existing } = await supabaseAdmin
    .from("enrollments")
    .select("id, end_date, plan_id")
    .eq("student_id", studentId)
    .eq("status", "active")
    .maybeSingle();

  // Get student data
  const { data: student } = await supabaseAdmin
    .from("students")
    .select("selected_plan_id, assigned_trainer_id, company_id")
    .eq("id", studentId)
    .single();

  const effectivePlanId = planId || student?.selected_plan_id;

  if (!effectivePlanId) {
    console.error(`Student ${studentId} has no plan_id for enrollment`);
    return null;
  }

  const { data: plan } = await supabaseAdmin
    .from("plans")
    .select("duration_weeks, duration_days, company_id, cycle_duration_days")
    .eq("id", effectivePlanId)
    .single();

  if (!plan) return null;

  const planDays = plan.duration_days || (plan.duration_weeks ? plan.duration_weeks * 7 : 90);
  const companyId = student?.company_id || plan.company_id || null;

  // --- RENEWAL: active enrollment exists → extend it ---
  if (existing) {
    const currentEnd = existing.end_date ? new Date(existing.end_date) : new Date();
    const today = new Date();
    // Start extension from whichever is later: today or current end_date
    const extensionStart = currentEnd > today ? currentEnd : today;
    const newEnd = new Date(extensionStart);
    newEnd.setDate(newEnd.getDate() + planDays);

    const newEndStr = newEnd.toISOString().split("T")[0];

    console.log(`[RENEWAL] Extending enrollment ${existing.id} from ${existing.end_date} to ${newEndStr} (+${planDays} days)`);

    // Update enrollment end_date and plan
    await supabaseAdmin
      .from("enrollments")
      .update({
        end_date: newEndStr,
        plan_id: effectivePlanId,
        payment_status: "paid",
      })
      .eq("id", existing.id);

    // Generate new cycles for the extended period
    // We need to find the last cycle to continue numbering
    const { data: lastCycle } = await supabaseAdmin
      .from("training_cycles")
      .select("cycle_number, end_date")
      .eq("enrollment_id", existing.id)
      .order("cycle_number", { ascending: false })
      .limit(1)
      .single();

    const cycleDays = plan.cycle_duration_days || 42;
    let cycleNum = (lastCycle?.cycle_number || 0) + 1;
    // New cycles start after the last cycle ends (or from extensionStart+1 if no cycles)
    let cycleStart = lastCycle?.end_date
      ? new Date(new Date(lastCycle.end_date).getTime() + 86400000)
      : new Date(extensionStart.getTime() + 86400000);

    while (cycleStart <= newEnd) {
      let cycleEnd = new Date(cycleStart);
      cycleEnd.setDate(cycleEnd.getDate() + cycleDays - 1);
      if (cycleEnd > newEnd) cycleEnd = newEnd;

      await supabaseAdmin.from("training_cycles").insert({
        enrollment_id: existing.id,
        cycle_number: cycleNum,
        start_date: cycleStart.toISOString().split("T")[0],
        end_date: cycleEnd.toISOString().split("T")[0],
        status: "pending",
        company_id: companyId,
      });

      console.log(`[RENEWAL] Created cycle ${cycleNum}: ${cycleStart.toISOString().split("T")[0]} → ${cycleEnd.toISOString().split("T")[0]}`);

      cycleNum++;
      cycleStart = new Date(cycleEnd);
      cycleStart.setDate(cycleStart.getDate() + 1);
    }

    return existing.id;
  }

  // --- FIRST ENROLLMENT: create new ---

  const today = new Date();
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + planDays - 1);

  const { data: enrollment, error } = await supabaseAdmin
    .from("enrollments")
    .insert({
      student_id: studentId,
      plan_id: effectivePlanId,
      trainer_id: student?.assigned_trainer_id || null,
      start_date: today.toISOString().split("T")[0],
      end_date: endDate.toISOString().split("T")[0],
      payment_status: "paid",
      payment_date: today.toISOString().split("T")[0],
      status: "active",
      company_id: companyId,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Error auto-creating enrollment:", error);
    return null;
  }

  console.log(`Auto-created enrollment ${enrollment.id} for student ${studentId} (company: ${companyId})`);
  return enrollment.id;
}

async function applyPaymentStatusEffects(studentId: string, paymentStatus: string, asaasPaymentId?: string, planId?: string) {
  console.log(`[PAYMENT] Aplicando status ${paymentStatus} para aluno ${studentId} (planId: ${planId || 'none'})`);

  if (
    paymentStatus === "RECEIVED" ||
    paymentStatus === "CONFIRMED" ||
    paymentStatus === "RECEIVED_IN_CASH"
  ) {
    const { error: studentError } = await supabaseAdmin
      .from("students")
      .update({ status: "active" })
      .eq("id", studentId);

    if (studentError) {
      console.error("Erro ao ativar aluno:", studentError);
    }

    // Ensure enrollment exists or extend existing one (renewal)
    await ensureEnrollmentExists(studentId, planId || undefined);

    const { error: enrollmentError } = await supabaseAdmin
      .from("enrollments")
      .update({
        payment_status: "paid",
        payment_date: new Date().toISOString().split("T")[0],
      })
      .eq("student_id", studentId)
      .eq("status", "active");

    if (enrollmentError) {
      console.error("Erro ao atualizar matrícula:", enrollmentError);
    }

    if (asaasPaymentId) {
      try {
        await createInvoice({ paymentId: asaasPaymentId });
      } catch (error) {
        console.error("Erro ao emitir NFS-e:", error);
      }
    }

    return;
  }

  if (paymentStatus === "OVERDUE") {
    const { error } = await supabaseAdmin
      .from("enrollments")
      .update({ payment_status: "overdue" })
      .eq("student_id", studentId)
      .eq("status", "active");

    if (error) {
      console.error("Erro ao marcar matrícula como overdue:", error);
    }

    return;
  }

  if (
    paymentStatus === "REFUNDED" ||
    paymentStatus === "DELETED" ||
    paymentStatus === "REFUND_REQUESTED"
  ) {
    const { error: studentError } = await supabaseAdmin
      .from("students")
      .update({ status: "pending" })
      .eq("id", studentId);

    if (studentError) {
      console.error("Erro ao desativar aluno:", studentError);
    }

    const { error: enrollmentError } = await supabaseAdmin
      .from("enrollments")
      .update({ payment_status: "refunded" })
      .eq("student_id", studentId)
      .eq("status", "active");

    if (enrollmentError) {
      console.error("Erro ao atualizar matrícula para refunded:", enrollmentError);
    }
  }
}

async function getPaymentStatus(body: any) {
  const { paymentId } = body;
  if (!paymentId) throw new Error("paymentId é obrigatório");

  const payment = await asaasFetch(`/payments/${paymentId}`);

  // Update local payment status + installment count if available
  const updateData: any = { status: payment.status };
  if (payment.installmentCount && payment.installmentCount > 1) {
    updateData.installment_count = payment.installmentCount;
  }
  const { data: localPayment, error: paymentError } = await supabaseAdmin
    .from("payments")
    .update(updateData)
    .eq("asaas_payment_id", paymentId)
    .select("student_id")
    .single();

  if (paymentError) {
    console.error("Erro ao atualizar pagamento no fallback:", paymentError);
  } else if (localPayment?.student_id) {
    await applyPaymentStatusEffects(localPayment.student_id, payment.status, paymentId);
  }

  return {
    status: payment.status,
    value: payment.value,
    billingType: payment.billingType,
    invoiceUrl: payment.invoiceUrl,
  };
}

async function syncPayments(body: any) {
  const { companyId, syncAll } = body;

  // Get all students with asaas_customer_id for this company
  let studentsQuery = supabaseAdmin.from("students").select("id, asaas_customer_id, full_name, company_id");
  if (companyId) studentsQuery = studentsQuery.eq("company_id", companyId);
  const { data: students } = await studentsQuery.not("asaas_customer_id", "is", null);

  if (!students || students.length === 0) {
    return { synced: 0, message: "Nenhum aluno com cadastro no Asaas encontrado." };
  }

  let synced = 0;

  // Calculate 6 months ago date for syncAll
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const dateFilter = syncAll ? `&dateCreated[ge]=${sixMonthsAgo.toISOString().split("T")[0]}` : "";

  for (const student of students) {
    try {
      // Fetch payments from Asaas with pagination
      let allAsaasPayments: any[] = [];
      let offset = 0;
      const limit = 100;
      let hasMore = true;

      while (hasMore) {
        const data = await asaasFetch(`/payments?customer=${student.asaas_customer_id}&limit=${limit}&offset=${offset}${dateFilter}`);
        const page = data.data || [];
        allAsaasPayments = allAsaasPayments.concat(page);
        hasMore = data.hasMore === true && page.length === limit;
        offset += limit;
        // Safety: stop if not syncAll and we already got first page
        if (!syncAll) break;
      }

      const asaasPayments = allAsaasPayments;

      // Group by installment ID to calculate installment count
      const installmentGroups: Record<string, number> = {};
      for (const ap of asaasPayments) {
        if (ap.installment) {
          installmentGroups[ap.installment] = (installmentGroups[ap.installment] || 0) + 1;
        }
      }

      for (const ap of asaasPayments) {
        // Determine correct installment_count:
        // If payment belongs to an installment group, count how many in the group
        // Otherwise it's a single payment (à vista)
        const installmentCount = ap.installment
          ? (installmentGroups[ap.installment] || 1)
          : 1;

        // Check if already exists locally
        const { data: existing } = await supabaseAdmin
          .from("payments")
          .select("id")
          .eq("asaas_payment_id", ap.id)
          .maybeSingle();

        if (existing) {
          // Update status + correct installment_count
          await supabaseAdmin
            .from("payments")
            .update({
              status: ap.status,
              invoice_url: ap.invoiceUrl || null,
              installment_count: installmentCount,
            })
            .eq("id", existing.id);
        } else {
          // Insert new
          await supabaseAdmin.from("payments").insert({
            student_id: student.id,
            company_id: student.company_id || null,
            asaas_customer_id: student.asaas_customer_id,
            asaas_payment_id: ap.id,
            billing_type: ap.billingType || null,
            value: Number(ap.value) || 0,
            status: ap.status || "PENDING",
            due_date: ap.dueDate || null,
            invoice_url: ap.invoiceUrl || null,
            installment_count: installmentCount,
          });
        }
        synced++;
      }
    } catch (err) {
      console.error(`Error syncing payments for student ${student.id}:`, err);
    }
  }

  return { synced, message: `${synced} cobranças sincronizadas do Asaas.` };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, ...body } = await req.json();

    let result;
    switch (action) {
      case "create-customer":
        result = await createCustomer(body);
        break;
      case "create-payment":
        result = await createPayment(body);
        break;
      case "get-pix-qrcode":
        result = await getPixQrCode(body);
        break;
      case "create-card-payment":
        result = await createCardPayment(body);
        break;
      case "get-payment-status":
        result = await getPaymentStatus(body);
        break;
      case "create-invoice":
        result = await createInvoice(body);
        break;
      case "update-customer":
        result = await updateCustomer(body);
        break;
      case "sync-payments":
        result = await syncPayments(body);
        break;
      default:
        throw new Error(`Ação desconhecida: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Edge function error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro interno" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
