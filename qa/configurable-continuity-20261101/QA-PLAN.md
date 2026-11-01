> DECISÃO ATUAL DA RAIZ: coluna dedicada expired_workout_behavior; JSON settings legado intacto. Campo virtual somente no contrato frontend. Sem necessidade de edge deploy se persistência/projeção preservarem esse contrato. A observação de edge-first abaixo é histórica para o desenho JSON abandonado.

# QA independente — configuração de continuidade

Base 61ab2c8. Propriedade exclusiva desta pasta. Sem fonte externa, commit, deploy ou escrita em produção.
Contrato aguardado: prescription.expired_workout_behavior; keep_until_replaced (default legado) | hide_on_expiry.

## Preparado
- Normalizador real: default sem registro/campo, dois enums, rejeição de valores explícitos inválidos, input/default imutáveis.
- Cliente real: payload tenant/CAS, save+reload via transporte mockado, conflito sem retry, erro de permissão e envelope inválido. Isso não comprova persistência SQL.

## Aguardar executores
- Hook final/nome/retorno: montagem real com QueryClient, loading/error, tenant A->B, resposta atrasada, refetch keep->hide não pode manter fallback enquanto bloqueado ou depois de hide confirmado. Registro ausente confirmado mantém keep; erro não é ausência.
- Portal: hide bloqueia apenas fallback vencido; treino atual continua disponível em ambos; datas/UUIDs não mudam. Sessão existente não pode ser reassociada.
- UI: salvar na empresa A, desmontar/remontar e carregar valor persistido; rascunho/cancelamento não dispara troca; CAS conflict preserva draft sem celebrar sucesso.
- SQL: allowlist precisa reconhecer campo e restringir enum no servidor, defaults TS/SQL coerentes, save usa validator atualizado sob lock/CAS e histórico; permissões/tenant preservados. Leitura do DDL real quando Pauli entregar; nenhuma migration aplicada por este QA.

## Riscos de desenho já identificados na base
- readCompanyProductSettings transforma tabela ausente (42P01/PGRST205) em default; portal precisa distinguir fallback legado deliberado de falha de validação conforme contrato.
- useCompanyExperiencePolicy retorna default em loading/erro: não copiar esse comportamento permissivo para autorização da continuidade.
- Ao refetch da política, estado digitalContinuation previamente calculado não pode sobreviver como grant independente da nova leitura.
- Chaves de cache devem incluir empresa; salvar política precisa invalidar/refetch o consumidor correto, sem contaminar outra empresa.

Sem gate até contrato/patch e freeze. SQL local/inventário textual não prova migração instalada ou RLS hospedado.

## Aceite dedicado atualizado
- JSON settings e history.settings nunca contêm prescription.expired_workout_behavior.
- RPC wrapper remove o campo virtual antes do validador legado; coluna+histórico compartilham a MESMA versão CAS, atomicamente.
- Leitor antigo 61ab2c8 aceita settings legado com coluna adicional no envelope REST/RPC; enum externo ignorado por leitor antigo sem quebrar brand/business/messages.
- Writer antigo omitindo campo não reverte hide para keep; mantém valor atual também no histórico.
- Leitor frontend novo projeta coluna dedicada em settings.prescription; hook nunca consulta JSON-path alias antigo.
- Enum inválido ou tenant/CAS indevido reverte a transação inteira, sem incrementar versão/histórico.

## RPC mínimo obrigatório (decisão posterior da raiz)
- Aluno proprietário sem company_members lê hide pelo RPC get_company_workout_expiry_policy(_company_id); nunca SELECT direto protegido por RLS retornando null como keep.
- Retorno mínimo company_id/version/expired_workout_behavior; zero settings/messages/brand/templates.
- anon e tenant externo negados; read RPC não concede write. Admin/master/member seguem regras próprias; student sem vínculo é negado.
- Testes de hook atualizados ao contrato RPC; os 13 GREEN anteriores eram do desenho anterior de membership e NÃO são gate do RPC novo.
