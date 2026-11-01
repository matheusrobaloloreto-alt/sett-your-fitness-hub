# Preferência de vencimento de treino — 01/11/2026

Estado: implementada localmente e validada com Auth/REST/banco reais de homologação. **Não publicada em produção.**

## Uso

Configurações → Prescrição → Após o vencimento do treino:

- Manter o último treino até o próximo ser publicado (padrão que preserva a versão em produção).
- Ocultar automaticamente ao vencer.

O ícone de ajuda explica a consequência. A escolha é por empresa, salva somente ao usar Salvar, com versão e histórico. Mantém matrículas, suas vigências, datas dos ciclos, prescrições e cargas. Continua respeitando os controles de acesso e elegibilidade da matrícula; não renova serviço automaticamente. Ocultar remove a disponibilidade de execução, sem apagar a consulta histórica.

## Implementação e compatibilidade

A preferência fica em coluna dedicada nas configurações e no histórico. O JSON legado de configurações não recebe uma chave desconhecida. Isso evita quebrar abas antigas, mensagens, checkout e serviços publicados que usam validadores estritos. O campo é projetado em memória para a tela. Cliente antigo que salva sem informar a preferência preserva o valor já escolhido, inclusive no histórico.

Migration aditiva: 20261101223102_company_expired_workout_behavior.sql, SHA256 a5d09feca803492dc82b35add8a252d44e13c0b263679cb9a8104f5fd65a9964. Guarda o save anterior em schema privado e mantém assinatura pública e autorização/CAS. Um RPC mínimo permite ao aluno ler apenas a preferência da própria empresa, sem liberar acesso ao JSON administrativo. Nenhuma permissão ampla de tabela foi adicionada.

O portal distingue falha de leitura de ausência real de configuração. Não usa erro como autorização de continuidade. Troca de empresa/identidade, resposta atrasada, refetch, treino futuro, exclusão e arquivamento são tratados pelos testes. Ao ocultar uma ficha vencida, uma sessão própria já resolvida pode ser finalizada sem habilitar novo início.

## Evidências

- Native homologação: migration aplicada uma vez, com intenção e baseline registrados, somente no projeto ifymocggowdlqqcxugko. Nenhuma mudança em produção.
- Corpo e dono do save legado, RLS e grants conferidos após instalação. Helper privado indisponível a clientes; leitura anônima negada.
- Auth/REST reais: admin salvou hide; aluno sem membership administrativo recebeu hide pelo RPC mínimo. Empresa externa não lê; aluno, treinador e empresa externa não salvam. Enum inválido e versão concorrente não alteraram versão/histórico. Writer antigo manteve hide. JSON anterior permaneceu exatamente igual.
- Navegador: seletor com as duas opções; Salvar confirmou versão12; recarregar manteve hide; login de aluno sintético ocultou o treino vencido. Preferência restaurada para keep com versão13, preservando JSON. Ao recarregar, o treino anterior e botão de início voltaram. Nenhuma sessão ou carga foi gravada pelo navegador.
- QA independente final: 49 testes e cinco sondas semânticas passaram; 13 checks SQL locais. Hashes raiz10/10 e portal4/4 conferidos. Testes SQL locais não substituem o teste nativo acima.
- Integração final: 90 testes de portal/hook/helper passaram; extraSets passou separadamente com variáveis sintéticas corretas. A regressão ampla anterior registrou 438 pass e uma falha de tempo na navegação de Integrações; o teste de Integrações passou isoladamente sem mudança de código ou asserções. Não representar isso como uma execução ampla integralmente verde.
- TypeScript final: exit0. Build final: exit0 e fontes estáveis; bundle inicial864.895 bytes abaixo do teto875.000.
- Um build anterior foi descartado por detectar mudança de fonte durante compilação. Os recibos finais correspondem ao freeze posterior, após encerrar os executores.

## Publicação futura

Aplicar a migration validada antes do frontend. O JSON legado continua compatível, portanto não é necessário republicar os serviços de mensagens ou pagamentos apenas por esta preferência. Confirmar owner/grants/contratos nativos antes e depois; não reaplicar DDL não idempotente sem readback. Manter colunas e wrapper compatíveis se precisar voltar ao frontend anterior.

## Checklist acumulado deste escopo

- ✅ Opção editável, ajuda, persistência versionada e padrão manter.
- ✅ Aplicação das duas escolhas no portal, sem alterar datas ou apagar histórico.
- ✅ Homologação nativa, teste de navegador e QA independente.
- ✅ Correção anterior de continuidade permanece em produção; esta preferência não a substituiu em produção ainda.
- ❌ Publicação desta preferência (aguardando): inclui migration e frontend, ainda não autorizada/publicada neste pedido.
- ❌ Confirmação em dispositivos reais após publicação (aguardando): homologação usa apenas identidades sintéticas.
- ❌ Casos de matrícula vencida, login ausente e outras exceções anteriores (aguardando): preservados como pendências separadas; esta configuração não os regulariza.
