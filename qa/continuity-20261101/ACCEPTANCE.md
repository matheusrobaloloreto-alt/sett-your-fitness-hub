# Continuidade de prescrição — 01/11/2026

Regra expressa do usuário: o último treino fica visível ao aluno até a publicação do seguinte. Preservar matrículas, datas, histórico e IDs; nenhuma nova prescrição fabricada.

Base: 60fba11. Executor portal: Bernoulli; revisão backend: Pauli; QA independente: Poincare; integração/build: raiz.

Aceite:
- Taís: ciclo anterior com A/B/C até25/10; atualvazio26/10; matrícula vigente => anterior disponível para executar/registrar.
- Novo vazio, bundle sem materialização e troca de dia não escondem última ficha.
- Próximo publicado e iniciado assume seleção; futuro não vaza.
- Não confundir continuidade com coverage atual na agenda do professor; próximo ciclo continua pendente.
- Clear explícito, superseded, inativo e tenant errado não são ressuscitados.
- Sessão em andamento não muda seus IDs quando nova ficha é publicada.
- Nenhuma matrícula, vigência, payment, log ou ciclo real alterado pela seleção.
- Testes de regressão, TSC/build e revisão independente antes de alegar conclusão.

Sem autorização nova de deploy nesta execução. Produção permanece inalterada até publicação expressamente autorizada; não confundir teste local com recuperação no celular da Taís.
