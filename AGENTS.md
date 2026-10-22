# MedTracker — regras do projeto

App pessoal de estudos para residência médica. Um usuário, sem login, funciona offline.
Leia `PRD.md` só quando a tarefa precisar de detalhe de produto. Não reescreva o que já funciona.

## Stack (não troque)
- Vite + React + TypeScript (strict) + Tailwind CSS
- Dados locais com Dexie (IndexedDB). Nenhum backend, nenhuma chave de API.
- Roteamento: react-router, rotas `/`, `/conteudo`, `/revisoes`, `/questoes`, `/mais`
- Testes: Vitest, apenas para a lógica em `src/core/` (revisão espaçada, fila do dia)
- PWA com `vite-plugin-pwa`
- Interface em português do Brasil, pensada primeiro para celular (largura 375px)

## Estrutura
- `src/core/`     lógica pura, sem React nem Dexie. Aqui ficam `srs.ts` e `todayQueue.ts`.
- `src/db/`       schema Dexie e funções de leitura/escrita
- `src/data/curriculum.json`  currículo semente (matérias, volumes, aulas, bônus, apostila)
- `src/pages/`    uma pasta por aba
- `src/components/` componentes compartilhados

## Regras de dados
- Os IDs de `curriculum.json` são estáveis. Nunca os regere. Ao atualizar o currículo, faça merge por `id` e preserve todo o progresso.
- O currículo é somente leitura. O progresso do usuário fica em tabelas separadas (`progress`, `reviews`, `questionLogs`).
- Datas são guardadas como string `YYYY-MM-DD` no fuso local. Não use UTC para decidir "hoje".
- Toda tela precisa de backup: exportar e importar JSON completo está em Ajustes.

## Regras de código
- Funções de `src/core/` são puras e recebem `today` como parâmetro, para serem testáveis.
- Sem bibliotecas de UI pesadas. Sem dependências novas sem avisar o motivo.
- Mudanças pequenas e focadas: uma funcionalidade por tarefa. Não refatore arquivos que a tarefa não exige.
- Antes de terminar, rode `npm run build` e `npm test`, e corrija erros.
- Não crie documentação, README extra nem arquivos de exemplo que ninguém pediu.

## Revisão espaçada (resumo; detalhe no PRD)
Escada de intervalos em dias: `[1, 7, 15, 30, 60]`. Avaliações: Errei, Difícil, Bom, Fácil.
