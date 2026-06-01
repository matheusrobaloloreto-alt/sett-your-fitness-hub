## Objetivo

Tornar a navegação entre páginas mais leve e fluida, replicando o padrão do projeto Party Planner Hub: um fade + slide curto em cada troca de rota, mais um indicador animado na sidebar que desliza entre os itens ativos.

## O que será feito

### 1. Instalar `framer-motion`
Única dependência nova. Já é usada no projeto de referência.

### 2. Criar `src/components/RouteTransition.tsx`
Wrapper baseado em `AnimatePresence` (mode `wait`) + `motion.div`, com `key={location.pathname}`. Respeita `useReducedMotion`. Animação curta (180ms, easing `[0.22, 1, 0.36, 1]`): opacidade 0→1 + translateY 6→0 na entrada, e 0→-4 na saída. Igual ao Party Planner Hub.

### 3. Envolver o conteúdo das rotas em `AppLayout.tsx`
O `RouteTransition` entra dentro do `<div className="flex-1 overflow-auto …">` envolvendo `{children}`. Assim toda página renderizada dentro do layout autenticado ganha a transição, sem precisar mexer em cada página.

### 4. Adicionar transição também onde não há AppLayout
- `StudentPortal` (mobile) — embrulhar o conteúdo interno entre as views (`treino`/`stats`/`calendario`/etc.) com um `AnimatePresence` por `activeView`, para que a troca entre seções do portal do aluno também fique suave.
- Páginas públicas (`Landing`, `Auth`, `PublicRegistration`, etc.) ficam de fora — não precisam.

### 5. Indicador ativo animado na sidebar (`AppSidebar.tsx`)
Adicionar um `motion.span` com `layoutId="sidebar-active"` posicionado absoluto atrás do item ativo (background). Quando o usuário troca de rota, o framer-motion desliza esse pill entre os itens com spring (`stiffness: 380, damping: 32`), exatamente como no Party Planner Hub. O texto/ícone continuam com `transition-colors` do Tailwind.

### 6. Melhorar o `PageLoader` do Suspense
Trocar o spinner por um fade-in sutil para que a primeira carga de chunks lazy não pareça um "flash". Pequeno ajuste estético.

## Detalhes técnicos

- Sem mudanças de roteamento, sem mudar lógica de auth, sem mexer em dados.
- `AnimatePresence mode="wait"` garante que a página de saída termina antes da entrada começar — evita sobreposição visual.
- `initial={false}` no `AnimatePresence` raiz da sidebar evita animação no primeiro render.
- Tudo respeita `prefers-reduced-motion` via `useReducedMotion()`.

## Arquivos afetados

- `package.json` — adiciona `framer-motion`
- `src/components/RouteTransition.tsx` — novo
- `src/components/AppLayout.tsx` — envolve `children` com `RouteTransition`
- `src/components/AppSidebar.tsx` — adiciona `motion.span` com `layoutId` no item ativo
- `src/pages/student/StudentPortal.tsx` — `AnimatePresence` entre as sub-views
- `src/App.tsx` — `PageLoader` com fade
