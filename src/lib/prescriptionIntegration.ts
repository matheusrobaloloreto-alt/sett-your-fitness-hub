type AnyRecord = Record<string, any>;

export interface PrescriptionIntegrationInput {
  anamnese?: AnyRecord | null;
  assessment?: AnyRecord | null;
  assessmentId?: string | null;
  assessmentCreatedAt?: string | null;
}

export interface PrescriptionIntegration {
  schema: "bn_prescription_integration_v1";
  sources: {
    has_anamnese: boolean;
    has_assessment: boolean;
    anamnese_id: string | null;
    assessment_id: string | null;
    assessment_created_at: string | null;
  };
  readiness: {
    status: "pronto" | "cautela" | "incompleto";
    reason: string;
    missing_context: string[];
  };
  athlete_profile: {
    objective: string | null;
    level: string | null;
    modality: string | null;
    strength_days: number | null;
    cardio_days: number | null;
    session_duration_min: number | null;
    equipment: string | null;
    endurance_athlete: boolean;
  };
  risk_screening: {
    pain_or_injury_text: string[];
    red_flags: string[];
    yellow_flags: string[];
    pain_regions: string[];
    recovery_alerts: string[];
  };
  functional_findings: {
    protocol: string | null;
    score_summary: string[];
    priorities: string[];
    compensations: string[];
    movement_notes: string[];
    composition_notes: string[];
  };
  prescription_decision: {
    objective_priority: string;
    intensity_guardrails: string[];
    volume_guardrails: string[];
    exercise_selection_rules: string[];
    warmup_protocol: string[];
    blocked_progressions: string[];
    progression_gates: string[];
  };
  ai_instructions: string[];
  coach_summary: string;
}

export interface BnitoOrchestrationPlan {
  schema: "bnito_orchestration_v1";
  duration_weeks: 6;
  block_length_weeks: 2;
  orchestrator: "BNITO";
  source_summary: string;
  agent_contract: {
    strength: string[];
    running: string[];
    nutrition: string[];
  };
  blocks: Array<{
    block: 1 | 2 | 3;
    weeks: [number, number];
    name: string;
    strength_stimulus: string;
    running_stimulus: string;
    nutrition_focus: string;
    advanced_methods: string[];
    safety_gate: string;
  }>;
  synchronization_rules: string[];
}

export function buildPrescriptionIntegration({
  anamnese,
  assessment,
  assessmentId,
  assessmentCreatedAt,
}: PrescriptionIntegrationInput): PrescriptionIntegration {
  const a = anamnese || {};
  const ax = assessment || {};
  const textCorpus = normalizeText([
    a.injuries,
    a.current_pain,
    a.notes,
    a.extra_comments,
    ax.report_text,
    ax.resumo_para_prescricao,
    ax.direcionamento_protocolo?.motivo,
    ax.criterios_progressao_bn?.motivo,
    ...stringifyArray(ax.red_yellow_flags),
    ...extractCompensations(ax),
  ].filter(Boolean).join(" "));

  const redFlags = extractFlags(ax.red_yellow_flags, "red");
  const yellowFlags = extractFlags(ax.red_yellow_flags, "yellow");
  const painOrInjuryText = uniqueStrings([
    a.injuries,
    a.current_pain,
    a.diseases,
    a.historico_lesoes,
    ax.historico_lesoes,
    ax.queixa_principal,
  ].filter(Boolean).map(String));
  const painRegions = detectPainRegions(textCorpus);
  const recoveryAlerts = buildRecoveryAlerts(a);
  const priorities = buildFunctionalPriorities(ax, textCorpus);
  const compensations = extractCompensations(ax);
  const movementNotes = buildMovementNotes(ax);
  const compositionNotes = buildCompositionNotes(ax, a);
  const missingContext = [
    !hasUsefulAnamnese(a) ? "anamnese" : null,
    !hasUsefulAssessment(ax) ? "avaliacao_funcional" : null,
  ].filter(Boolean) as string[];
  const hasHardFlag = redFlags.length > 0 || textCorpus.includes("eva 4") || textCorpus.includes("eva 5") || textCorpus.includes("eva 6") || textCorpus.includes("eva 7") || textCorpus.includes("eva 8") || textCorpus.includes("eva 9") || textCorpus.includes("eva 10");
  const status = missingContext.length
    ? "incompleto"
    : hasHardFlag || yellowFlags.length || painRegions.length || recoveryAlerts.length
      ? "cautela"
      : "pronto";

  const athleteProfile = {
    objective: textValue(a.objective || a.goals || ax.objetivo || null),
    level: textValue(a.activity_level || a.nivel || ax.nivel || null),
    modality: textValue(a.training_modality || a.modalidade || a.sport || ax.modalidade || null),
    strength_days: numberValue(a.days_per_week_strength ?? a.available_days),
    cardio_days: numberValue(a.days_per_week_cardio),
    session_duration_min: numberValue(a.session_duration_min),
    equipment: textValue(a.equipment || a.available_equipment || null),
    endurance_athlete: Boolean(a.is_endurance_athlete || /corrida|triathlon|ciclismo|natacao|endurance/.test(textCorpus)),
  };

  const intensityGuardrails = buildIntensityGuardrails({ a, textCorpus, painRegions, recoveryAlerts, hasHardFlag });
  const volumeGuardrails = buildVolumeGuardrails({ a, painRegions, recoveryAlerts, athleteProfile });
  const exerciseSelectionRules = buildExerciseSelectionRules({ textCorpus, painRegions, priorities, compensations });
  const warmupProtocol = buildWarmupProtocol({ textCorpus, priorities, painRegions });
  const blockedProgressions = buildBlockedProgressions({ ax, textCorpus, hasHardFlag });
  const progressionGates = buildProgressionGates(ax, blockedProgressions);

  const objectivePriority = buildObjectivePriority(athleteProfile, a);
  const aiInstructions = uniqueStrings([
    "Use este contexto integrado como fonte principal antes de montar sessoes, volumes e exercicios.",
    "Se houver conflito entre objetivo estetico e seguranca funcional, priorize seguranca, tecnica e progressao.",
    "A prescricao deve citar no biomechanical_notes como anamnese e avaliacao funcional mudaram as escolhas.",
    "Use somente exercicios da biblioteca do app quando a funcao fornecer catalogo.",
    ...exerciseSelectionRules,
    ...intensityGuardrails,
    ...blockedProgressions,
  ]).slice(0, 18);

  const integration: PrescriptionIntegration = {
    schema: "bn_prescription_integration_v1",
    sources: {
      has_anamnese: hasUsefulAnamnese(a),
      has_assessment: hasUsefulAssessment(ax),
      anamnese_id: textValue(a.id),
      assessment_id: assessmentId || textValue(ax.id),
      assessment_created_at: assessmentCreatedAt || textValue(ax.created_at),
    },
    readiness: {
      status,
      reason: buildReadinessReason(status, missingContext, redFlags, yellowFlags, painRegions, recoveryAlerts),
      missing_context: missingContext,
    },
    athlete_profile: athleteProfile,
    risk_screening: {
      pain_or_injury_text: painOrInjuryText,
      red_flags: redFlags,
      yellow_flags: yellowFlags,
      pain_regions: painRegions,
      recovery_alerts: recoveryAlerts,
    },
    functional_findings: {
      protocol: textValue(ax.direcionamento_protocolo?.protocolo),
      score_summary: buildScoreSummary(ax),
      priorities,
      compensations,
      movement_notes: movementNotes,
      composition_notes: compositionNotes,
    },
    prescription_decision: {
      objective_priority: objectivePriority,
      intensity_guardrails: intensityGuardrails,
      volume_guardrails: volumeGuardrails,
      exercise_selection_rules: exerciseSelectionRules,
      warmup_protocol: warmupProtocol,
      blocked_progressions: blockedProgressions,
      progression_gates: progressionGates,
    },
    ai_instructions: aiInstructions,
    coach_summary: "",
  };
  integration.coach_summary = formatPrescriptionIntegrationSummary(integration);
  return integration;
}

export function formatPrescriptionIntegrationSummary(integration: PrescriptionIntegration) {
  const pieces = [
    `Status: ${integration.readiness.status} (${integration.readiness.reason})`,
    integration.athlete_profile.objective ? `Objetivo: ${integration.athlete_profile.objective}` : null,
    integration.functional_findings.protocol ? `Protocolo: ${integration.functional_findings.protocol}` : null,
    integration.functional_findings.priorities.length ? `Prioridades: ${integration.functional_findings.priorities.slice(0, 5).join("; ")}` : null,
    integration.risk_screening.pain_regions.length ? `Atencao: ${integration.risk_screening.pain_regions.join(", ")}` : null,
    integration.prescription_decision.blocked_progressions.length ? `Bloqueios: ${integration.prescription_decision.blocked_progressions.slice(0, 3).join("; ")}` : null,
    integration.prescription_decision.exercise_selection_rules.length ? `Regras: ${integration.prescription_decision.exercise_selection_rules.slice(0, 4).join("; ")}` : null,
  ].filter(Boolean);
  return pieces.join("\n");
}

export function buildBnitoOrchestrationPlan(integration: PrescriptionIntegration): BnitoOrchestrationPlan {
  const objective = integration.athlete_profile.objective || "objetivo geral";
  const isEndurance = integration.athlete_profile.endurance_athlete;
  const readiness = integration.readiness.status;
  const hasPain = integration.risk_screening.pain_regions.length > 0 || integration.risk_screening.red_flags.length > 0;
  const cautiousLoad = readiness !== "pronto" || hasPain;
  const sourceSummary = formatPrescriptionIntegrationSummary(integration);

  return {
    schema: "bnito_orchestration_v1",
    duration_weeks: 6,
    block_length_weeks: 2,
    orchestrator: "BNITO",
    source_summary: sourceSummary,
    agent_contract: {
      strength: [
        "Gerar exatamente 6 semanas de prescricao.",
        "Trocar estimulo a cada 2 semanas mantendo a biblioteca de exercicios do app.",
        "Usar tecnicas avancadas apenas quando o bloco e o nivel permitirem.",
        "Sincronizar MMII com corrida/endurance e respeitar flags da avaliacao funcional.",
      ],
      running: [
        "Gerar exatamente 6 semanas de corrida/endurance.",
        "Mudar foco a cada 2 semanas sem quebrar a regra de progressao conservadora.",
        "Evitar tiros/Z4-Z5 perto de MMII pesado.",
        "Deload ou reducao planejada quando o bloco de forca ou a recuperacao pedirem.",
      ],
      nutrition: [
        "Gerar dicas nutricionais periodizadas por bloco de 2 semanas.",
        "Carboidrato e hidratacao devem acompanhar o maior dia de carga da semana.",
        "Nao montar cardapio fechado; entregar timing, porcoes praticas e substituicoes.",
        "Ajustar pela rotina alimentar, preferencia, restricao, sono e estresse.",
      ],
    },
    blocks: [
      {
        block: 1,
        weeks: [1, 2],
        name: "Base tecnica e tolerancia",
        strength_stimulus: cautiousLoad
          ? "tecnica, amplitude segura, controle motor, RIR 3-4 e volume conservador"
          : "base de volume, controle motor, RIR 2-3 e consolidacao dos padroes principais",
        running_stimulus: isEndurance
          ? "base aerobica Z1-Z2, tecnica e volume controlado"
          : "cardio leve opcional para recuperacao e aderencia",
        nutrition_focus: "regularidade de refeicoes, hidratacao, proteina diaria e pre-treino simples",
        advanced_methods: ["sem metodos avancados no bloco 1"],
        safety_gate: "so avancar se dor <= 3/10, RPE controlado e tecnica mantida",
      },
      {
        block: 2,
        weeks: [3, 4],
        name: "Progressao de estimulo",
        strength_stimulus: cautiousLoad
          ? "progressao leve de volume ou densidade sem falha e sem padrao doloroso"
          : "progressao de volume/intensidade com piramide, up-set ou cluster leve em exercicios seguros",
        running_stimulus: isEndurance
          ? "manter predominio Z2 e inserir qualidade moderada se nao conflitar com MMII"
          : "cardio moderado conforme objetivo estetico ou saude",
        nutrition_focus: "carb cycling simples: mais carboidrato nos dias de maior carga e menos nos descansos",
        advanced_methods: cautiousLoad ? ["up-set tecnico opcional"] : ["up-set", "piramide crescente", "cluster-set conservador"],
        safety_gate: "se sono/estresse piorarem ou dor subir, manter bloco 1 e reduzir 10-20% do volume",
      },
      {
        block: 3,
        weeks: [5, 6],
        name: "Consolidacao e refinamento",
        strength_stimulus: cautiousLoad
          ? "consolidar padroes, testar progresso sem carga maxima e preparar nova avaliacao"
          : "estimulo final do ciclo com drop-set seletivo, cluster-set ou piramide apenas em exercicios estaveis",
        running_stimulus: isEndurance
          ? "consolidar volume e qualidade sem exceder recuperacao; semana 6 pode reduzir carga para fechar o ciclo"
          : "ajustar cardio para preservar objetivo principal",
        nutrition_focus: "refinar timing pre/intra/pos-treino e plano de recuperacao para fechar o ciclo",
        advanced_methods: cautiousLoad ? ["piramide leve se tecnica estiver estavel"] : ["drop-set seletivo", "cluster-set", "piramide", "up-set"],
        safety_gate: "sem falha sistematica; liberar novo ciclo apenas com feedback, logs e reavaliacao do professor",
      },
    ],
    synchronization_rules: [
      "Todas as IAs recebem o mesmo resultado integrado de anamnese + avaliacao funcional.",
      "Musculacao, corrida e nutricao devem obedecer ao mesmo calendario de 6 semanas.",
      "As semanas 1-2, 3-4 e 5-6 mudam o estimulo, mas nao ignoram restricoes funcionais.",
      "MMII pesado nao deve ficar no mesmo dia nem na vespera de tiro, longo ou Z4-Z5.",
      "Nutricao deve calcular orientacoes pelo somatorio de carga de musculacao + endurance.",
      "Bnito e o orquestrador: se houver conflito entre agentes, vence seguranca, recuperacao e tecnica.",
    ],
  };
}

function hasUsefulAnamnese(a: AnyRecord) {
  return Boolean(a?.id || a?.objective || a?.goals || a?.injuries || a?.days_per_week_strength || a?.training_modality);
}

function hasUsefulAssessment(ax: AnyRecord) {
  return Boolean(
    ax?.id ||
    ax?.schema === "bn_functional_assessment_v1" ||
    ax?.assessment_contract_version ||
    ax?.prescription_context?.contract === "bn_functional_assessment_v1" ||
    ax?.report_sections ||
    Array.isArray(ax?.ohs_compensations) ||
    Array.isArray(ax?.postural_compensations) ||
    ax?.total_compensacoes === 0 ||
    ax?.resumo_para_prescricao ||
    ax?.direcionamento_protocolo ||
    ax?.sequencia_bn_video ||
    ax?.analise_tecnica_movimento ||
    ax?.vistas ||
    ax?.total_compensacoes,
  );
}

function buildReadinessReason(
  status: PrescriptionIntegration["readiness"]["status"],
  missing: string[],
  redFlags: string[],
  yellowFlags: string[],
  painRegions: string[],
  recoveryAlerts: string[],
) {
  if (missing.length) return `faltam: ${missing.join(", ")}`;
  if (redFlags.length) return "ha red flags na avaliacao";
  if (yellowFlags.length || painRegions.length || recoveryAlerts.length) return "prescrever com ajustes de seguranca";
  if (status === "pronto") return "anamnese e avaliacao aptas para prescricao";
  return "prescrever com cautela";
}

function buildObjectivePriority(profile: PrescriptionIntegration["athlete_profile"], a: AnyRecord) {
  const objective = profile.objective || "objetivo nao informado";
  const modality = profile.modality || a.sport || "modalidade geral";
  if (profile.endurance_athlete) return `${objective} com prioridade para transferencia e recuperacao em ${modality}`;
  return `${objective} com prioridade para tecnica, aderencia e progressao por bloco`;
}

function buildRecoveryAlerts(a: AnyRecord) {
  const alerts: string[] = [];
  const stress = numberValue(a.stress_score);
  const sleep = numberValue(a.sleep_quality);
  if (stress !== null && stress >= 7) alerts.push(`estresse alto (${stress}/10)`);
  if (sleep !== null && sleep <= 5) alerts.push(`sono baixo (${sleep}/10)`);
  return alerts;
}

function buildFunctionalPriorities(ax: AnyRecord, textCorpus: string) {
  const priorities: string[] = [];
  if (ax.resumo_para_prescricao) priorities.push(textValue(ax.resumo_para_prescricao));
  if (ax.direcionamento_protocolo?.motivo) priorities.push(textValue(ax.direcionamento_protocolo.motivo));
  for (const item of asArray(ax.sequencia_bn_video)) {
    const movimento = textValue(item?.movimento);
    const achados = stringifyArray(item?.achados || item?.compensacoes);
    if (movimento && achados.length) priorities.push(`${movimento}: ${achados.slice(0, 3).join("; ")}`);
  }
  if (textCorpus.includes("joelho")) priorities.push("controlar alinhamento de joelho e progressao de MMII");
  if (textCorpus.includes("lombar")) priorities.push("proteger controle lombo-pelvico antes de carga axial");
  if (textCorpus.includes("ombro")) priorities.push("ajustar amplitude e estabilidade escapular em empurrar/puxar");
  if (textCorpus.includes("tornozelo") || textCorpus.includes("dorsiflex")) priorities.push("priorizar mobilidade de tornozelo e controle do agachamento");
  return uniqueStrings(priorities).slice(0, 10);
}

function extractCompensations(ax: AnyRecord) {
  const values: string[] = [];
  const structuredSources = [
    ax.ohs_compensations,
    ax.postural_compensations,
    ax.prescription_context?.ohs_compensations,
    ax.prescription_context?.postural_compensations,
  ];
  for (const source of structuredSources) {
    for (const comp of asArray(source)) {
      if (comp?.presente === false) continue;
      const label = comp?.compensacao || comp?.label || comp?.key;
      const severity = comp?.severidade || comp?.gravidade;
      const implication = comp?.implicacao_treino || comp?.impacto;
      const value = [severity, label, implication].filter(Boolean).join(": ");
      if (value) values.push(value);
    }
  }
  for (const item of asArray(ax.sequencia_bn_video)) {
    for (const comp of asArray(item?.compensacoes || item?.achados)) {
      values.push(typeof comp === "string" ? comp : [comp?.gravidade, comp?.descricao, comp?.lado].filter(Boolean).join(" "));
    }
  }
  for (const view of asArray(ax.vistas)) {
    const vista = textValue(view?.vista);
    for (const comp of asArray(view?.compensacoes)) {
      values.push(`${vista ? `${vista}: ` : ""}${[comp?.gravidade, comp?.descricao].filter(Boolean).join(" ")}`);
    }
  }
  for (const item of asArray(ax.analise_tecnica_movimento)) {
    values.push([item?.movimento, item?.achado, item?.cue_ou_ajuste || item?.impacto].filter(Boolean).join(": "));
  }
  return uniqueStrings(values.filter(Boolean).map(String)).slice(0, 16);
}

function buildMovementNotes(ax: AnyRecord) {
  return uniqueStrings([
    ...extractCompensations(ax),
    ...asArray(ax.analise_tecnica_movimento).map((item) =>
      [item?.movimento, item?.achado, item?.cue_ou_ajuste || item?.impacto].filter(Boolean).join(": "),
    ),
    ...asArray(ax.sequencia_bn_video).map((item) =>
      [item?.movimento, item?.score != null ? `score ${item.score}/10` : null, item?.cue_ou_teste].filter(Boolean).join(" - "),
    ),
  ].filter(Boolean)).slice(0, 10);
}

function buildCompositionNotes(ax: AnyRecord, a: AnyRecord) {
  const comp = ax.composicao_corporal || {};
  return uniqueStrings([
    comp.peso_kg ? `peso ${comp.peso_kg} kg` : null,
    comp.imc ? `IMC ${comp.imc}` : null,
    comp.cintura_cm ? `cintura ${comp.cintura_cm} cm` : null,
    comp.leitura_tecnica,
    a.body_fat_percent ? `% gordura ${a.body_fat_percent}` : null,
  ].filter(Boolean).map(String)).slice(0, 8);
}

function buildScoreSummary(ax: AnyRecord) {
  const summary: string[] = [];
  if (ax.score_postural?.total != null) summary.push(`postural ${ax.score_postural.total}/100`);
  if (ax.score_funcional?.total != null) summary.push(`funcional ${ax.score_funcional.total}/100`);
  for (const item of asArray(ax.sequencia_bn_video)) {
    if (item?.score != null && item?.movimento) summary.push(`${item.movimento}: ${item.score}/10`);
  }
  return uniqueStrings(summary).slice(0, 10);
}

function buildIntensityGuardrails({ a, textCorpus, painRegions, recoveryAlerts, hasHardFlag }: {
  a: AnyRecord;
  textCorpus: string;
  painRegions: string[];
  recoveryAlerts: string[];
  hasHardFlag: boolean;
}) {
  const rules = ["usar RIR 2-3 como padrao inicial ate validar tecnica"];
  if (hasHardFlag || painRegions.length) rules.push("evitar falha muscular e cargas maximas enquanto houver dor/flag ativa");
  if (recoveryAlerts.length) rules.push("reduzir intensidade media e manter deload mais cedo se RPE subir");
  if (a.is_endurance_athlete || /corrida|triathlon|endurance/.test(textCorpus)) rules.push("evitar RIR 0-1 em MMII para preservar corrida/endurance");
  return uniqueStrings(rules);
}

function buildVolumeGuardrails({ a, painRegions, recoveryAlerts, athleteProfile }: {
  a: AnyRecord;
  painRegions: string[];
  recoveryAlerts: string[];
  athleteProfile: PrescriptionIntegration["athlete_profile"];
}) {
  const rules = ["progressao de volume por bloco, nao por treino isolado"];
  if (painRegions.length) rules.push("comecar com volume conservador no segmento doloroso e aumentar apenas sem piora 24-48h");
  if (recoveryAlerts.length) rules.push("reduzir volume total 10-20% ate sono/estresse melhorarem");
  if (athleteProfile.endurance_athlete) rules.push("reduzir volume de MMII quando houver corrida/ciclismo intenso na semana");
  if (numberValue(a.days_per_week_strength) && numberValue(a.days_per_week_strength)! >= 5) rules.push("distribuir volume para evitar alta densidade por grupo muscular");
  return uniqueStrings(rules);
}

function buildExerciseSelectionRules({ textCorpus, painRegions, priorities, compensations }: {
  textCorpus: string;
  painRegions: string[];
  priorities: string[];
  compensations: string[];
}) {
  const source = normalizeText([...priorities, ...compensations, textCorpus].join(" "));
  const rules: string[] = [];
  if (source.includes("joelho") || painRegions.includes("joelho")) rules.push("para joelho: controlar valgo, amplitude sem dor e priorizar quadril/gluteo antes de carga axial alta");
  if (source.includes("lombar") || source.includes("tronco") || painRegions.includes("lombar")) rules.push("para lombar/tronco: preferir goblet/front/hack/leg press antes de back squat pesado");
  if (source.includes("ombro") || source.includes("escap") || painRegions.includes("ombro")) rules.push("para ombro: priorizar escapula/manguito, evitar amplitude dolorosa em press");
  if (source.includes("tornozelo") || source.includes("dorsiflex")) rules.push("para tornozelo: iniciar com mobilidade e usar elevacao de calcanhar provisoria se melhorar padrao");
  if (source.includes("valgo")) rules.push("incluir abdutores/rotadores externos e feedback de joelho alinhado");
  if (source.includes("butt wink") || source.includes("retrovers")) rules.push("limitar amplitude de agachamento ao ponto de pelve neutra");
  if (!rules.length) rules.push("selecionar exercicios pela biblioteca respeitando tecnica observada e objetivo");
  return uniqueStrings(rules).slice(0, 10);
}

function buildWarmupProtocol({ textCorpus, priorities, painRegions }: {
  textCorpus: string;
  priorities: string[];
  painRegions: string[];
}) {
  const source = normalizeText([...priorities, textCorpus].join(" "));
  const warmup = ["mobilidade especifica + ativacao core antes de forca global"];
  if (source.includes("tornozelo") || source.includes("dorsiflex")) warmup.push("tornozelo: mobilidade ativa e teste de agachamento antes da carga");
  if (source.includes("joelho") || painRegions.includes("joelho")) warmup.push("joelho: ativacao de gluteo medio e padrao de joelho alinhado");
  if (source.includes("ombro") || painRegions.includes("ombro")) warmup.push("ombro: manguito, serratil e controle escapular antes de press/remada");
  if (source.includes("lombar") || painRegions.includes("lombar")) warmup.push("lombar: anti-extensao/anti-rotacao e padrao de hinge leve");
  return uniqueStrings(warmup);
}

function buildBlockedProgressions({ ax, textCorpus, hasHardFlag }: { ax: AnyRecord; textCorpus: string; hasHardFlag: boolean }) {
  const blocks: string[] = [];
  if (hasHardFlag) blocks.push("bloquear progressao de carga em padrao doloroso ate dor <= 3/10");
  if (ax.criterios_progressao_bn && ax.criterios_progressao_bn.liberado_para_pliometria === false) blocks.push("manter pliometria bloqueada neste bloco");
  if (textCorpus.includes("butt wink") || textCorpus.includes("retrovers")) blocks.push("bloquear agachamento profundo com carga ate pelve neutra");
  if (textCorpus.includes("instabilidade")) blocks.push("bloquear exercicios instaveis complexos ate controle motor basico");
  return uniqueStrings(blocks);
}

function buildProgressionGates(ax: AnyRecord, blocked: string[]) {
  const gates = stringifyArray(ax.criterios_progressao_bn?.criterios || ax.criterios_progressao_bn?.gates);
  if (ax.criterios_progressao_bn?.motivo) gates.unshift(String(ax.criterios_progressao_bn.motivo));
  if (!gates.length && blocked.length) gates.push("liberar progressao apenas sem dor, com tecnica estavel e recuperacao adequada por 2 semanas");
  if (!gates.length) gates.push("progredir carga/volume se tecnica, dor e recuperacao permanecerem estaveis");
  return uniqueStrings(gates).slice(0, 8);
}

function extractFlags(flags: any, type: "red" | "yellow") {
  return asArray(flags)
    .filter((flag) => normalizeText(flag?.tipo || flag?.type || flag?.gravidade || "").includes(type))
    .map((flag) => [flag?.tipo || flag?.type, flag?.descricao || flag?.description || flag?.motivo].filter(Boolean).join(": "))
    .filter(Boolean)
    .map(String);
}

function detectPainRegions(text: string) {
  const regions: Array<[string, string[]]> = [
    ["joelho", ["joelho", "patelar"]],
    ["lombar", ["lombar", "coluna", "ciatico", "ciatica"]],
    ["ombro", ["ombro", "manguito"]],
    ["tornozelo", ["tornozelo", "aquiles"]],
    ["quadril", ["quadril", "virilha"]],
    ["cervical", ["cervical", "pescoco"]],
  ];
  return regions.filter(([, terms]) => terms.some((term) => text.includes(term))).map(([label]) => label);
}

function stringifyArray(value: any): string[] {
  return asArray(value).map((item) => {
    if (typeof item === "string") return item;
    if (!item) return "";
    return [item.tipo || item.type || item.gravidade, item.descricao || item.description || item.achado || item.motivo || item.movimento]
      .filter(Boolean)
      .join(": ");
  }).filter(Boolean);
}

function asArray(value: any): any[] {
  return Array.isArray(value) ? value : [];
}

function textValue(value: any): string | null {
  if (value == null || value === "") return null;
  return String(value);
}

function numberValue(value: any): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const cleanValue = String(value || "").trim();
    if (!cleanValue) continue;
    const key = normalizeText(cleanValue);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cleanValue);
  }
  return result;
}

function normalizeText(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
