# MedTracker — especificação do produto

## 1. Objetivo
Reunir em um só lugar o estudo para residência: ver o que fazer hoje, navegar por todo o conteúdo do MEDCURSO, revisar no tempo certo e registrar questões logo depois de cada aula.

Premissas:
- Um único usuário, sem login, dados no próprio aparelho (backup por arquivo JSON).
- O app **não tem banco de questões próprio**. Ele abre o link de questões que o usuário configurar e registra o resultado (feitas e acertos).
- O currículo vem de `src/data/curriculum.json`: 19 matérias, 51 volumes, 302 aulas, 196 bônus e 1.081 itens de apostila.

## 2. Navegação
Barra inferior no celular, com cinco abas:

| Aba | Rota | Fase |
|---|---|---|
| Hoje | `/` | MVP |
| Conteúdo | `/conteudo` | MVP |
| Revisões | `/revisoes` | MVP |
| Questões | `/questoes` | MVP |
| Mais | `/mais` | MVP (só Ajustes); Desempenho, Plano e Provas entram depois |

## 3. Aba Hoje (hub)
Responde "o que eu tenho que fazer agora?". Ordem fixa das seções:

1. **Cabeçalho**: data de hoje, sequência de dias com atividade, anel de progresso do dia (feitas / total de tarefas de hoje).
2. **Revisões**: atrasadas primeiro (mais antigas no topo), depois as de hoje. Mostra no máximo `dailyReviewCap`; o resto aparece como "+N na fila". Tocar abre a revisão com os botões Errei, Difícil, Bom e Fácil.
3. **Questões pendentes**: aulas concluídas que ainda não têm registro de questões. Tocar abre a tela de questões da aula.
4. **Aulas novas**: sugestão de `dailyNewLessons` aulas (veja 3.1). Botão "Começar" abre a aula; botão "Concluir" dispara o fluxo pós-aula.
5. **Próximos 7 dias**: mini gráfico de barras com a carga de revisões por dia.

Estado vazio: se não há nada para hoje, mostrar "Dia livre" e atalho para adiantar uma aula.

### 3.1 Como o app sugere aulas novas
- O usuário marca matérias como **ativas** em Ajustes e define a ordem.
- A fila percorre as matérias ativas em rodízio. Em cada uma, pega a próxima aula (`kind = "aula"`) não concluída, na ordem do JSON (volume 1 antes do 2, etc.).
- Bônus só entram na sugestão se `includeBonus` estiver ligado, e sempre depois das aulas do mesmo volume.
- Aulas sugeridas e ainda não concluídas hoje permanecem as mesmas até o fim do dia (não trocar a cada abertura).

## 4. Aba Conteúdo
- Lista de matérias em cartões: nome, barra de progresso (aulas concluídas / total), contagem de revisões vencidas, selo "ativa".
- Busca por título de aula, em todas as matérias.
- Filtros: status (não vista, assistindo, concluída) e tipo (aula, bônus).
- Dentro da matéria: volumes em acordeão, cada um com Aulas, Bônus e Apostila.
- **Apostila**: grade de números que o usuário marca como lida. É um acompanhamento de leitura e não gera revisão.
- **Detalhe da aula** (folha deslizante):
  - status em três estados: não vista, assistindo, concluída;
  - anotações em texto livre;
  - campo "link das questões" (sobrescreve o do volume e o modelo global);
  - histórico de questões da aula;
  - data da próxima revisão e botão "Dominado" (encerra as revisões desta aula).

## 5. Fluxo pós-aula (requisito principal)
Ao marcar uma aula como **concluída** (em qualquer lugar do app):

1. Gravar `status = concluida` e `completedOn = hoje`.
2. Criar a revisão da aula (seção 7) com vencimento em hoje + 1 dia.
3. Abrir **imediatamente** a tela cheia "Questões desta aula":
   - Botão **Abrir questões**: abre em nova aba o link, escolhido nesta ordem: link da aula, link do volume, modelo global. Se nenhum existir, mostrar aviso com atalho para Ajustes.
   - Registro rápido: contadores "Fiz" e "Acertei" (não permitir acertos maiores que feitas) e campo opcional de observação (o que errei, tema fraco).
   - **Salvar** grava o registro e fecha. **Fazer depois** fecha sem registrar e a aula passa a aparecer em "Questões pendentes".
4. Desmarcar uma aula concluída pede confirmação e remove a revisão criada.

Modelo global de link: texto com marcadores `{materia}`, `{volume}` e `{aula}`, substituídos pelos nomes codificados para URL.

## 6. Aba Revisões
- Visões: Hoje, Atrasadas, Próximos 7 dias, Próximos 30 dias.
- Botão **Espalhar atrasadas**: distribui as revisões atrasadas em rodízio pelos próximos 3 dias (o mais atrasado primeiro), sem passar de `dailyReviewCap` por dia. Se 3 dias não bastarem, usa mais dias.
- Cada item mostra aula, matéria, passo atual na escada e data prevista.

## 7. Revisão espaçada

Escada fixa em dias: `LADDER = [1, 7, 15, 30, 60]` (passos 0 a 4).

Existe no máximo **uma revisão ativa por aula**. Ao concluir a aula, ela nasce em `step = 0`, com `dueDate = hoje + 1`.

Ao avaliar uma revisão no passo `s`, na data `hoje`:

| Avaliação | Novo passo | Próximo vencimento |
|---|---|---|
| Errei | 0 | hoje + 1 |
| Difícil | s (igual) | hoje + max(1, floor(LADDER[s] / 2)) |
| Bom | min(s + 1, 4) | hoje + LADDER[novo passo] |
| Fácil | min(s + 2, 4) | hoje + LADDER[novo passo] |

Regras:
- No último passo, Bom e Fácil repetem a cada 60 dias até o usuário marcar "Dominado".
- O intervalo conta a partir da data da avaliação, não da data original de vencimento.
- Cada avaliação é gravada em `history` com data e nota.
- O desempenho em questões **não altera** o agendamento. Ele só destaca temas fracos: acerto abaixo de 60% marca a aula com o selo "Fraca" em Conteúdo e Questões.

Casos de teste obrigatórios (Vitest, `today = 2026-10-22`):
1. Aula concluída hoje, passo 0, vence 2026-10-23.
2. Passo 0, Bom, vence 2026-10-29 (passo 1, 7 dias).
3. Passo 1, Fácil, vence 2026-11-21 (passo 3, 30 dias).
4. Passo 3, Errei, vence 2026-10-23 (passo 0).
5. Passo 2, Difícil, vence 2026-10-29 (passo 2, metade de 15, arredondada para baixo).
6. Passo 4, Bom, vence 2026-12-21 (permanece no passo 4).
7. Espalhar 7 atrasadas com cap 3 por dia: 3 em +1, 2 em +2, 2 em +3. Com 10 atrasadas e cap 3: usa 4 dias (3, 3, 2, 2).

## 8. Aba Questões (MVP)
- Resumo: total feitas, acertos, percentual geral.
- Acerto por matéria, em barras, ordenado do menor para o maior.
- Lista de registros por data, com aula, matéria, resultado e observação.
- Atalho para "Questões pendentes".

## 9. Mais
- **Ajustes (MVP)**:
  - aulas novas por dia (padrão 2);
  - limite de revisões por dia (padrão 20);
  - matérias ativas e ordem;
  - incluir bônus nas sugestões (padrão desligado);
  - modelo global de link de questões;
  - exportar e importar backup JSON completo.
- Fases seguintes:
  - **Desempenho**: aulas por semana, acerto por matéria ao longo do tempo, calendário de atividade.
  - **Plano**: data da prova, contagem regressiva, meta semanal por matéria.
  - **Provas**: simulados e provas feitas, com nota e áreas fracas.
  - **Caderno de erros**: tudo que foi anotado nas observações das questões, filtrável por matéria.

## 10. Modelo de dados (Dexie)
- `settings` (linha única): `dailyNewLessons`, `dailyReviewCap`, `activeSubjects: string[]` (ordenado), `includeBonus`, `questionsUrlTemplate`.
- `progress` (chave `lessonId`): `status`, `completedOn?`, `notes?`, `questionsUrl?`, `mastered?`.
- `volumeLinks` (chave `volumeId`): `questionsUrl`.
- `apostila` (chave composta `[volumeId, page]`): marca de leitura.
- `reviews` (chave `lessonId`): `step`, `dueDate`, `mastered`, `history: {date, rating}[]`.
- `questionLogs` (id automático): `lessonId`, `date`, `total`, `correct`, `note?`.
- A sequência de dias é **derivada** das datas de conclusão, avaliações e registros. Não tem tabela própria.

Formato de `curriculum.json`: `subjects[] → volumes[] → { lessons[] (id, title, kind: "aula" | "bonus"), apostila[] }`, mais `pdf` por volume.

Observações sobre os dados:
- Neurologia, Oftalmologia, Ortopedia e Psiquiatria vêm sem divisão em volumes e foram tratadas como um volume único com o nome da matéria.
- Oftalmologia tem só 1 aula e nenhum item de apostila.
- A lista não diz se os números da apostila são páginas ou blocos. O app os trata como "itens da apostila".
- Os nomes vêm exatamente da lista (por exemplo, "Gastrologia"). Dá para corrigir no JSON sem mexer nos `id`.

## 11. Fora do escopo do MVP
Login, sincronização entre aparelhos, banco de questões próprio, geração de questões por IA, flashcards, notificações push.
