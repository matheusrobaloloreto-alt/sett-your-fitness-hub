# Recuperacao de senha - 14/09/2026

## Entrega local

- Login possui "Esqueci minha senha", sem exigir a senha antiga.
- Supabase Auth envia o link para `/auth/reset-password`; confirmacao neutra evita revelar se uma conta existe.
- Nova senha exige confirmacao e pelo menos 8 caracteres; updateUser so e chamado apos validacao da sessao com getUser.
- Links expirados, sessao invalida, limite de tentativas e erros de rede possuem estados proprios, sem mensagem falsa de sucesso.
- Callback PASSWORD_RECOVERY leva a tela de troca mesmo quando o provedor redireciona para a raiz. Conclusao ou logout limpa esse modo.
- Senhas nao sao registradas em logs nem manipuladas administrativamente; nenhuma conta real teve sua senha alterada.

## Validacoes

- Vitest: 14 testes em 6 arquivos de recuperacao e regressao de autenticacao.
- TypeScript: `npx tsc -p tsconfig.app.json --noEmit` aprovado.
- ESLint dos arquivos alterados: zero erros; um aviso preexistente de Fast Refresh em useAuth.
- Build completo com gates de backend e bundle aprovado.
- Navegador local: login do aluno, abertura de recuperacao e tratamento de link expirado conferidos. Sem envio real de e-mail.
- Revisao de diff e reexecucao realizadas nesta tarefa; nao houve revisor independente.

## Pendencias e limites

- Configuracao Auth remota: bloqueada por login no dashboard Supabase. Conferir Site URL, allowlist das URLs de reset com/sem www e SMTP/template de recuperacao antes da publicacao.
- Teste de entrega real: pendente; utilizar conta de teste e destinatario autorizado, nunca enviar para aluna sem identificacao/consentimento.
- Push, staging e producao: nao realizados. Publicacao exige autorizacao atual; a implementacao usa o fluxo oficial, mas a entrega de e-mail nao foi comprovada.
- Pacote anterior de calendario, cargas e aquecimento em `5d513b2` permanece local, aguardando publicacao.
- Rollback: reverter apenas o commit de recuperacao. Nao ha migration, alteracao de permissoes ou escrita em dados de alunos nesta entrega.

Referencia primaria: https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail
