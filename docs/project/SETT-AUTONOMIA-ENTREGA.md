# SETT — entrega de autonomia

Meta: configurar e operar o produto dentro do SETT, sem Codex para as tarefas
de negocio. Codigo local e homologacao isolada em infraestrutura ja contratada autorizados; producao depende do teste e aceite do Matheus.
Base: `codex/sett-self-service-local-20261026`, HEAD inicial `45b6c3a`.

Atualizacao de28/10: candidato instalado SOMENTE no SETT Staging Free existente,
com QA de schema/RLS/RPC e preservacao do ledger e registros antigos. Auth de
fixtures novas, aceite funcional e preview conectado aprovados no escopo abaixo.
Studio empresarial foi desativado no candidato; Master BN canonico preservado.
Preparacao de tokens por empresa implementada, sem ativacao de provedores.

Esta e a fila corrente. Relatorios anteriores sao evidencia historica, nao filas
concorrentes. Bloqueio de um item nao suspende os itens independentes.

## Decisoes do Matheus — 28/10/2026

1. Homologacao separada autorizada em infraestrutura existente, sem dados reais nem custo adicional. Reaproveitar SETT Staging Free; nao comprar servidor/branch.
2. Testes controlados de mensagens autorizados SOMENTE no contato de teste ja indicado pelo usuario; nunca alunos. Confirmar destino e recibo antes de marcar envio aprovado.
3. Manter os papeis atuais. Papeis arbitrarios por modulo retirados desta entrega.
4. Titularidade financeira/legal fica para a comercializacao. Preparar configuracao segura dos tokens proprios por empresa, sem trocar contas ou movimentar dinheiro agora.
5. Concluir apenas agenda operacional existente. Reservas, capacidade e novidades retiradas desta entrega.
6. Studio pertence exclusivamente ao menu Master da BN; clientes/empresas nao devem acessa-lo. Corrigir a ampliacao local indevida para empresas, preservando o Master existente. Nao ampliar para geracao paga/publicacao social.
7. Nenhuma regra tecnica adicional solicitada. Manter o contrato tipado e as regras anteriores; regras clinicas livres retiradas da fila.
8. Disponibilizar candidato para Matheus testar; nao publicar em producao automaticamente.

Plano desta rodada: corrigir exposicao do Studio; concluir configuracao segura de integracoes e agenda no escopo; recuperar homologacao gratuita isolada; aplicar somente apos preflight/backup de teste e QA; validar conversao/isolamento/concorrencia/UI; entregar link e lista honesta do que falta. As confirmacoes de regra de negocio estao resolvidas e nao devem ser reabertas como pendencias tecnicas.

## Matriz unica A01–A33

| Item | Funcao | Estado atual / proxima entrega |
|---|---|---|
| A01 | Mensagem semanal | ✅ Configuracao consumida e recovery local validado |
| A02 | Cadencia semanal | ✅ Politica empresarial persistida e consumida |
| A03 | Boas-vindas/onboarding | ✅ Templates por evento e SLA consumidos |
| A04 | Rascunhos do atendimento | ✅ Templates empresariais e convite de pre-cadastro consumidos; link/empresa revalidados, sem envio automatico |
| A05 | Condicoes/acoes/conexoes | ✅ Contratos tipados; combinacoes sem executor rejeitadas |
| A06 | Esperas/retomada | ✅ Ledger/fencing/ACK e revisao de incerteza; identidade revalidada no webhook e cron antes do envio; testes sinteticos, sem provedor real |
| A07 | Recuperacao de ausencia/pagamento | ✅ Parametros consumidos; sem envio financeiro real |
| A08 | Contexto BNITO | ✅ Toggle/contexto empresarial; modelo externo nao exercitado |
| A09 | Push | ✅ Textos/horario/eventos configuraveis; provedor externo nao exercitado |
| A10 | Pre-cadastro | ✅ Definicao publicada e consumidor versionado |
| A11 | Anamnese inicial | ✅ Campos canonicos governados e extras editaveis |
| A12 | Extras/versoes | ✅ Publicacoes imutaveis e mapeamento enumerado de extras da anamnese inicial versionada para quatro parametros suportados |
| A13 | Interciclos | ✅ Definicao empresarial, snapshot e submissao atomica |
| A14 | Politica interciclos | ✅ Janela/validade e geracao manual; scheduler hospedado nao exercitado |
| A15 | Respostas para prescricao | ✅ Campos canonicos e extras governados consumidos pelo motor; interciclos valido prevalece |
| A16 | Check-in/feedbacks | ✅ Definicoes empresariais e submissao Auth/HTTP/DB |
| A17 | Respostas professor/aluno | ✅ UI compilada desktop/mobile e historico validados |
| A18 | Protocolo de avaliacao | ✅ Parametros governados; protecoes clinicas preservadas |
| A19 | Contexto metodologico | ✅ Contexto consumido; parametros executaveis apenas tipados |
| A20 | Metodologia executavel | ✅ Editor semanal de fase/RIR/volume/metodos e progressao consumidos no motor deterministico; guardas clinicas e historico preservados |
| A21 | Biblioteca/mapeamentos | ✅ Objetivo, dias, duracao e equipamento por correspondencia enumerada; regras clinicas/texto arbitrario fora do escopo confirmado pelo usuario |
| A22 | Identidade/PDFs | ✅ Empresa/profissional corretos; arquivos antigos preservados |
| A23 | Empresa/titularidade | ✅ Titular cadastral por convite nominal/aceite/validade/CAS/auditoria; titular financeiro/legal adiado pelo usuario para a comercializacao; ✅ preparacao de tokens Asaas/Evolution por empresa implementada e ensaiada com Vault real/rollback; ativacao financeira adiada, sem alteracao de conta atual |
| A24 | Catalogo SaaS | ✅ Catalogo unico e consumidores; cobranca real nao exercitada |
| A25 | Modulos comerciais | ✅ Gates locais, Storage/auxiliares e schema ampliado validados |
| A26 | Parcelamento/limites | ✅ Politicas tipadas, opt-in e ciclo financeiro preservados |
| A27 | Funil | ✅ Configuracao anterior preservada; conversao/link em RPC transacional e confirmacao de pais/formato implementados; ✅ concorrencia real de duas sessoes, replay e rollback apos insert aprovados no staging isolado/QA independente |
| A28 | Indicadores/agenda | ✅ Contagens/participacoes por status e disponibilidade semanal/excecoes com consumidor na agenda; reservas/capacidade fora do escopo confirmado pelo usuario |
| A29 | Papeis/suporte | ✅ Perfis nomeados para permissao existente company_dashboard_full, coexistindo com concessoes manuais; papeis arbitrarios por modulo fora do escopo confirmado pelo usuario |
| A30 | CMS global | ✅ Master edita/publica campos suportados da landing/rodape/suporte, com consumidor real e historico; sem HTML arbitrario |
| A31 | Gamificacao global | ✅ Defaults Master e adocao explicita empresarial de XP/conquistas; sem recalculo do historico |
| A32 | Studio Master BN | ✅ Restricao implementada e conferida no staging: rota/menu empresarial removidos, RPCs e Storage empresariais negados; Master BN existente preservado. ✅ Verificacao de interface apos rebuild: sem link Studio em menu/configuracoes; geracao paga/postagem social fora desta entrega |
| A33 | Operacao tecnica | ✅ Console restrito; credenciais/reparos sensiveis permanecem tecnicos |

✅ significa implementado e validado no escopo local documentado, nao publicado
nem certificado com provedores reais. Uma capacidade com lacuna explicita nao
conta como fechamento integral do item.

## Encerramento por lote

Salvar → recarregar → confirmar no consumidor; empresa correta, papel correto,
historico preservado e revisao independente. Repetir testes so por fonte nova,
falha nova ou risco concreto ainda sem cobertura. Build final apos integracao.

## Consolidacao

- ✅ Candidato anterior a90213bb preservado em `output/self-service-local-candidate/checkpoint.json`. Novo checkpoint de IMPLEMENTACAO LOCAL, sem aceite nativo, em `output/self-service-next-candidate/checkpoint.json`; manifesto/hashes e sigilo revisados, sem alterar HEAD/indice, sem push/deploy.
- ✅ Homologacao do candidato ANTERIOR a90213bb: sete fluxos Auth/REST, 2.086 testes gerais e doze aceites unicos de browser aprovados, nove opcionais nao executados. Evidencia historica, nao aceite das novas imagens/conversao. Preview anterior indisponivel apos falha de transporte/encerramento controlado.
- ❌ Homologacao hospedada (em andamento): SETT Staging Free saudavel; Auth/Storage HTTP200, cofre real e compatibilidade minima ensaiados com rollback; candidato instalado apos ensaio e QA, aceite funcional com fixtures novas aprovado (core30/30, aliases16/16, Lead concorrente16/16; suites diferentes). Teste controlado WhatsApp autorizado no contato indicado; cobranca/IA paga nao fazem parte deste aceite.
- ❌ Diagnostico historico PostgreSQL (bloqueado): causa nao demonstrada e rota
  anterior restrita; nao e uma frente executora desta entrega.
- ❌ Producao (aguardando): entregar homologacao para Matheus testar e aguardar aceite; sem promocao automatica.

## Rodada seguinte — fila executavel

- ✅ Conversao/link atomicos e preservacao de perfis existentes: codigo local e revisao independente; pais/formato explicitos, telefone ambiguo recusado e nenhum envio automatico.
- ✅ Imagens/logo privados por empresa, preview e PNG/ZIP: codigo local, validacao de arquivos, isolamento, testes e SQL PGlite em memoria.
- ✅ Aceite nativo final/concorrencia: staging gratuito saudavel, duas sessoes reais, contagens unicas, rollback/retry e QA independente. Studio empresarial proibido no candidato; Master BN preservado, sem ampliar produto para clientes.
- ✅ Limpeza: containers, redes e servicos dos dois runtimes ficticios desta frente ausentes, verificados por identidade; banco compartilhado57422 preservado.
- ✅ Preview novo conectado: http://127.0.0.1:57650/admin/settings neste Mac; login/salvar/recarregar reais, quatro aliases isoladas, sem publicacao em producao. Acessos ficticios no arquivo privado local; roteiro em SETT-ROTEIRO-TESTE-AUTONOMIA.md.
- ✅ Escopo de papeis/clinica/agenda/Social resolvido: extras recusados pelo usuario retirados da fila; titularidade financeira fica para a comercializacao. ✅ Configuracao segura de tokens implementada localmente, ensaiada em Vault real/rollback e instalada no staging: campos protegidos por empresa, sem mudar conta ativa. ✅ Validacao pela interface: preparar/recarregar/ocultar/remover sentinela ficticia no Vault real.

## Evidencias

- `docs/superpowers/2026-10-26-self-service-validation.md`: base A01–A33.
- `docs/superpowers/2026-10-26-recovery-entitlements-validation.md`: recovery.
- `docs/superpowers/2026-10-27-commercial-permissions-validation.md`: comerciais.
- `docs/superpowers/2026-10-27-complete-runtime-validation.md`: aceite ampliado.
- Novos lotes: `docs/superpowers/2026-10-28-*-delivery.md` (apenas apos conclusao).

## Limites que nao devem virar promessas comerciais

- Transferencia cadastral nao troca conta financeira/legal, `owner_user_id` de checkout nem remove administradores existentes.
- Extras sem snapshot inicial versionado e mapeamentos clinicos arbitrarios permanecem fora do motor; usar formulario versionado ou prescricao profissional manual.
- Disponibilidade e informativa, sem criacao de reservas, calculo de capacidade ou cobranca.
- Conversao de lead agora usa RPC atomica; aceite nativo final e concorrencia foram aprovados nesta rodada para o hash atual, sem transferir o PASS de revisao anterior.
- Sessao antiga de automacao sem identidade registrada deve ser revisada/reiniciada; nao associar automaticamente ao aluno atual. ACK incerto nao autoriza reenvio automatico; reconciliar com evidencia do provedor.
- Nenhum envio real, cobranca, scheduler hospedado, IA paga ou publicacao em producao foi exercitado nesta rodada. ❌ Teste de provedor externo (aguardando): staging sem conexao dedicada; proxima acao e conectar homologacao dedicada ou teste controlado de release apos aceite, sem copiar credenciais nem competir com sessao de producao.

Relatorio consolidado desta rodada: `docs/project/SETT-AUTONOMIA-RELATORIO-FINAL.md`.
