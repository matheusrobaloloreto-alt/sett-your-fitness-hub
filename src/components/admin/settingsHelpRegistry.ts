import type { SettingHelpProps } from './SettingHelp';

export const settingsHelpRegistry: Record<string, Omit<SettingHelpProps, 'label'>> = {
  "max_weekly_contacts": {
    "what": "Teto de contatos automáticos de cadência em sete dias.",
    "edits": "Aceita de 1 a 2 contatos.",
    "effect": "Restringe novas tentativas; não garante envio nem inclui toda conversa manual."
  },
  "minimum_interval_hours": {
    "what": "Espaçamento mínimo da cadência automática.",
    "edits": "De 72 a 168 horas.",
    "effect": "Novas tentativas respeitam também janela, opt-out e demais bloqueios."
  },
  "no_workout_days": {
    "what": "Ausência de treino usada na recuperação de alunos.",
    "edits": "De 7 a 90 dias.",
    "effect": "Muda a elegibilidade de próximos contatos, sem enviar ao salvar."
  },
  "no_workout_repeat_days": {
    "what": "Espera para repetir recuperação por ausência.",
    "edits": "De 6 a 90 dias.",
    "effect": "Aplica-se a novas tentativas sujeitas aos demais limites."
  },
  "cart_abandonment_hours": {
    "what": "Espera antes do contato por pagamento abandonado.",
    "edits": "De 2 a 720 horas.",
    "effect": "Muda próximas tentativas elegíveis; não altera cobranças."
  },
  "payment_repeat_hours": {
    "what": "Espera entre lembretes de pagamento.",
    "edits": "De 24 a 720 horas.",
    "effect": "Muda novas tentativas; não cria nem confirma pagamentos."
  },
  "start_hour": {
    "what": "Início da janela de contato automático.",
    "edits": "Hora de 0 a 23 no fuso escolhido.",
    "effect": "Delimita novos envios junto aos dias e ao fim da janela."
  },
  "end_hour": {
    "what": "Fim da janela de contato automático.",
    "edits": "Hora de 1 a 24, posterior ao início.",
    "effect": "Fora da janela, tentativas automáticas aguardam elegibilidade."
  },
  "weekdays": {
    "what": "Dias permitidos na janela de contato.",
    "edits": "Selecione os dias de envio.",
    "effect": "Restringe novas tentativas automáticas; não agenda uma mensagem ao salvar."
  },
  "contact-timezone": {
    "what": "Fuso da janela de contato e do lembrete diário.",
    "edits": "Escolha um dos fusos disponíveis.",
    "effect": "Altera a interpretação local dos horários das próximas execuções."
  },
  "cadence_warning_hours": {
    "what": "Limiar visual de atenção da cadência.",
    "edits": "De 1 a 720 horas.",
    "effect": "Altera a classificação nos painéis; não dispara mensagem."
  },
  "cadence_critical_hours": {
    "what": "Limiar visual crítico da cadência.",
    "edits": "De 1 a 720 horas, acima do limiar de atenção.",
    "effect": "Altera a classificação nos painéis; não dispara mensagem."
  },
  "risk_no_workout_days": {
    "what": "Ausência de treino usada no risco exibido.",
    "edits": "De 1 a 90 dias.",
    "effect": "Muda a sinalização de risco ao consultar os painéis."
  },
  "renewal_notice_days": {
    "what": "Antecedência usada para sinalizar renovação.",
    "edits": "De 1 a 90 dias.",
    "effect": "Muda a janela de próximas renovações; não renova contratos."
  },
  "xp_workout": {
    "what": "Pontos concedidos por treino elegível.",
    "edits": "De 0 a 10000 pontos.",
    "effect": "Vale para novas concessões; não recalcula pontos já registrados."
  },
  "xp_external_activity": {
    "what": "Pontos por atividade externa elegível.",
    "edits": "De 0 a 10000 pontos.",
    "effect": "Vale para novas concessões, sem recalcular o histórico."
  },
  "weekly_consistency_xp": {
    "what": "Bônus de consistência semanal elegível.",
    "edits": "De 0 a 10000 pontos.",
    "effect": "Vale para novas concessões; a elegibilidade continua verificada pelo sistema."
  },
  "gamification-enabled": {
    "what": "Uso da gamificação da empresa.",
    "edits": "Ative ou desative a experiência.",
    "effect": "Novas concessões seguem a política; o histórico de pontos é preservado."
  },
  "assessment_sla_business_days": {
    "what": "Prazo informado para avaliação e treino.",
    "edits": "De 1 a 30 dias úteis.",
    "effect": "Usado no contexto das novas ocorrências e mensagens com {{prazo}}; não garante entrega automática."
  },
  "beginner_max_weekly_sets": {
    "what": "Teto semanal de séries para iniciantes.",
    "edits": "De 1 a 21 séries.",
    "effect": "Limita novas prescrições; limites de segurança mais conservadores prevalecem."
  },
  "first_week_volume_multiplier": {
    "what": "Fator de volume da primeira semana.",
    "edits": "De 0,5 a 1, em passos de 0,05.",
    "effect": "Aplica-se a novas gerações, sem reescrever treinos publicados."
  },
  "endurance_strength_multiplier": {
    "what": "Ajuste da força quando há endurance.",
    "edits": "De 0,5 a 1, em passos de 0,05.",
    "effect": "Aplica-se às novas gerações elegíveis, respeitando limites do motor."
  },
  "default-cadence": {
    "what": "Cadência padrão dos exercícios.",
    "edits": "Informe quatro dígitos.",
    "effect": "Usada em novas prescrições; não altera treinos já publicados."
  },
  "preferred-split": {
    "what": "Preferência de divisão de treino.",
    "edits": "Automática, corpo inteiro, superior/inferior ou empurrar/puxar/pernas.",
    "effect": "Orienta novas prescrições; frequência e segurança podem prevalecer."
  },
  "methodology-notes": {
    "what": "Contexto textual da metodologia.",
    "edits": "Descreva a orientação da empresa.",
    "effect": "Integra o contexto de novas prescrições; não substitui regras de segurança."
  },
  "periodization-notes": {
    "what": "Contexto textual da periodização.",
    "edits": "Descreva a organização dos ciclos.",
    "effect": "Orienta novas prescrições sem reescrever o histórico nem garantir aplicação literal."
  },
  "message-event": {
    "what": "Evento cujo conteúdo será editado.",
    "edits": "Escolha WhatsApp ou push e o evento.",
    "effect": "Trocar o evento preserva os outros rascunhos; salvar não dispara mensagens."
  },
  "event-message": {
    "what": "Texto do evento push selecionado.",
    "edits": "Até 6000 caracteres e variáveis permitidas do evento.",
    "effect": "Usado nas próximas ocorrências elegíveis após salvar; prévia não é envio."
  },
  "daily-reminder-enabled": {
    "what": "Habilitação do lembrete diário por push.",
    "edits": "Ative ou desative os próximos lembretes.",
    "effect": "Depende de execução do serviço, permissão e assinatura push do aluno."
  },
  "daily-reminder-hour": {
    "what": "Hora local do lembrete diário.",
    "edits": "De 0 a 23, no fuso de Contatos.",
    "effect": "Usada nas próximas execuções elegíveis, sem garantia de entrega no dispositivo."
  },
  "new-workout-enabled": {
    "what": "Push de publicação de novo treino.",
    "edits": "Ative ou desative a notificação.",
    "effect": "Vale para próximas publicações elegíveis e depende de assinatura e permissão push."
  },
  "company_name": {
    "what": "Nome público da empresa.",
    "edits": "Edite a identificação textual.",
    "effect": "Usado nas superfícies e mensagens que leem a marca; não muda a razão social fiscal."
  },
  "professional_name": {
    "what": "Nome do profissional responsável.",
    "edits": "Edite o nome apresentado.",
    "effect": "Usado em mensagens e novos documentos que leem esta configuração."
  },
  "professional_registration": {
    "what": "Registro profissional apresentado nos documentos.",
    "edits": "Informe o registro adequado.",
    "effect": "Usado em novos PDFs; não valida habilitação profissional."
  },
  "support_email": {
    "what": "Canal de suporte por e-mail.",
    "edits": "Informe um endereço de e-mail.",
    "effect": "Exibido nas superfícies públicas e contextos que leem a marca; não envia e-mail."
  },
  "support_whatsapp": {
    "what": "Telefone de suporte da empresa.",
    "edits": "Informe o número com código do país e DDD.",
    "effect": "Usado no contato público; não conecta instância nem troca credenciais."
  },
  "terms_url": {
    "what": "Endereço dos termos de uso da empresa.",
    "edits": "Informe uma URL válida.",
    "effect": "Usado por telas públicas que consultam os termos; não publica um documento por si só."
  },
  "privacy_url": {
    "what": "Endereço da política de privacidade.",
    "edits": "Informe uma URL válida.",
    "effect": "Usado por telas públicas que consultam a política; não publica conteúdo ao salvar."
  }
};
