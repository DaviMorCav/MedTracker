import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../../db';
import { useLiveQuery } from '../../db/useLiveQuery';
import { addQuestionAttempt } from '../../db/operations';
import { getLocalDateString } from '../../core/dates';
import { bankImageUrl, loadBankIndex, loadBankSubject } from '../../core/questionBank';
import {
  filterPool,
  letterOf,
  pickSession,
  poolCounts,
  statsBySubject,
  summarizeAttempts,
  type ConfidenceFilter,
  type PoolMode,
} from '../../core/questionSession';
import type { BankIndex, BankQuestion, BankSubjectMeta } from '../../types/questionBank';
import type { QuestionAttempt } from '../../db/schema';

export interface SessionResult {
  question: BankQuestion;
  chosen: string;
  correct: boolean;
}

type Phase =
  | { name: 'setup' }
  | { name: 'running'; sessionId: number; subject: BankSubjectMeta; questions: BankQuestion[] }
  | { name: 'done'; subject: BankSubjectMeta; results: SessionResult[] };

const SIZE_OPTIONS = [10, 20, 30, 50];

const chipClass = (active: boolean) =>
  `px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
    active
      ? 'bg-indigo-600 border-indigo-600 text-white'
      : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
  }`;

const primaryBtn =
  'py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm';
const secondaryBtn =
  'py-2.5 px-4 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 rounded-lg text-sm font-semibold transition-colors';

// ─── Componente raiz da aba ────────────────────────────────────────────────

export const ResolverTab: React.FC<{ active?: boolean }> = ({ active = true }) => {
  const attempts = useLiveQuery<QuestionAttempt[]>(() => db.questionAttempts.toArray(), [], []);
  const [phase, setPhase] = useState<Phase>({ name: 'setup' });

  const startSession = (subject: BankSubjectMeta, questions: BankQuestion[]) =>
    setPhase({ name: 'running', sessionId: Date.now(), subject, questions });

  if (phase.name === 'running') {
    return (
      <Runner
        key={phase.sessionId}
        subject={phase.subject}
        questions={phase.questions}
        onFinish={(results) => setPhase({ name: 'done', subject: phase.subject, results })}
        active={active}
      />
    );
  }

  if (phase.name === 'done') {
    return (
      <Summary
        subject={phase.subject}
        results={phase.results}
        onNew={() => setPhase({ name: 'setup' })}
        onRetryWrong={(qs) => startSession(phase.subject, qs)}
      />
    );
  }

  return <Setup attempts={attempts} onStart={startSession} />;
};

// ─── 1. Escolha de matéria e filtros ───────────────────────────────────────

const Setup: React.FC<{
  attempts: QuestionAttempt[];
  onStart: (subject: BankSubjectMeta, questions: BankQuestion[]) => void;
}> = ({ attempts, onStart }) => {
  const [index, setIndex] = useState<BankIndex | null>(null);
  const [indexError, setIndexError] = useState<string | null>(null);
  const [selected, setSelected] = useState<BankSubjectMeta | null>(null);
  const [questions, setQuestions] = useState<BankQuestion[] | null>(null);
  const [subjectError, setSubjectError] = useState<string | null>(null);
  const [tema, setTema] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<ConfidenceFilter>('certas_altas');
  const [mode, setMode] = useState<PoolMode>('novas');
  const [size, setSize] = useState(20);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIndexError(null);
    loadBankIndex()
      .then((i) => !cancelled && setIndex(i))
      .catch((e: Error) => !cancelled && setIndexError(e.message));
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setQuestions(null);
    setSubjectError(null);
    loadBankSubject(selected.arquivo)
      .then((qs) => !cancelled && setQuestions(qs))
      .catch((e: Error) => !cancelled && setSubjectError(e.message));
    return () => {
      cancelled = true;
    };
  }, [selected, reloadKey]);

  const summaries = useMemo(() => summarizeAttempts(attempts), [attempts]);
  const subjectStats = useMemo(() => statsBySubject(attempts), [attempts]);

  const counts = useMemo(
    () => (questions ? poolCounts(questions, tema, confidence, summaries) : null),
    [questions, tema, confidence, summaries]
  );
  const available = counts ? counts[mode] : 0;

  const handleStart = () => {
    if (!selected || !questions) return;
    const pool = filterPool(questions, { tema, confidence, mode }, summaries);
    const picked = pickSession(pool, size);
    if (picked.length > 0) onStart(selected, picked);
  };

  // Pacote não encontrado ou corrompido
  if (indexError) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
        <h1 className="text-lg font-bold text-slate-100">Banco de questões não encontrado</h1>
        <p className="text-sm text-slate-400">
          O app não achou a pasta <code className="text-slate-200">public/questoes</code>. Rode o
          <code className="text-slate-200"> gerar_pacote.py</code> com o destino apontando para ela e
          recarregue a página.
        </p>
        <p className="text-xs text-slate-500">Detalhe: {indexError}</p>
        <button type="button" className={primaryBtn} onClick={() => setReloadKey((k) => k + 1)}>
          Tentar de novo
        </button>
      </div>
    );
  }

  if (!index) {
    return <p className="text-sm text-slate-400 py-6 text-center">Carregando banco de questões…</p>;
  }

  // Lista de matérias
  if (!selected) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Resolver questões</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {index.total.toLocaleString('pt-BR')} questões. Escolha a matéria.
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
          {index.materias.map((m) => {
            const st = subjectStats.get(m.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setTema(null);
                  setSelected(m);
                }}
                className="text-left bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl p-3 transition-colors"
              >
                <span className="block text-sm font-semibold text-slate-100">{m.nome}</span>
                <span className="block text-[11px] text-slate-400 mt-0.5">
                  {m.total.toLocaleString('pt-BR')} questões
                </span>
                <span className="block text-[11px] mt-1 text-slate-500">
                  {st ? `${st.total} respondidas · ${st.percentage}% de acerto` : 'Nenhuma respondida'}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Filtros da matéria escolhida
  return (
    <div className="space-y-5">
      <div>
        <button
          type="button"
          onClick={() => setSelected(null)}
          className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
        >
          ← Trocar matéria
        </button>
        <h1 className="text-xl font-bold text-slate-100 mt-1">{selected.nome}</h1>
      </div>

      {subjectError ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
          <p className="text-sm text-slate-300">Não consegui carregar as questões desta matéria.</p>
          <p className="text-xs text-slate-500">{subjectError}</p>
          <button type="button" className={secondaryBtn} onClick={() => setReloadKey((k) => k + 1)}>
            Tentar de novo
          </button>
        </div>
      ) : !questions || !counts ? (
        <p className="text-sm text-slate-400 py-4">Carregando {selected.nome}…</p>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-5">
          {selected.temas.length > 0 && (
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-300">Tema</span>
              <select
                value={tema ?? ''}
                onChange={(e) => setTema(e.target.value || null)}
                className="w-full rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-100 px-3 py-2"
              >
                <option value="">Todos os temas</option>
                {selected.temas.map((t) => (
                  <option key={t.nome} value={t.nome}>
                    {t.nome} ({t.total})
                  </option>
                ))}
              </select>
              <span className="block text-[11px] text-slate-500">
                Só as questões do banco por matéria têm tema.
              </span>
            </label>
          )}

          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-300">Classificação da matéria</span>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['certas', 'Só certas'],
                  ['certas_altas', 'Certas + prováveis'],
                  ['todas', 'Todas'],
                ] as [ConfidenceFilter, string][]
              ).map(([v, label]) => (
                <button key={v} type="button" className={chipClass(confidence === v)} onClick={() => setConfidence(v)}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-300">Quais questões</span>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['novas', 'Novas'],
                  ['erradas', 'Que errei'],
                  ['todas', 'Todas'],
                ] as [PoolMode, string][]
              ).map(([v, label]) => (
                <button key={v} type="button" className={chipClass(mode === v)} onClick={() => setMode(v)}>
                  {label} ({counts[v].toLocaleString('pt-BR')})
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-300">Quantidade</span>
            <div className="flex flex-wrap gap-2">
              {SIZE_OPTIONS.map((n) => (
                <button key={n} type="button" className={chipClass(size === n)} onClick={() => setSize(n)}>
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-1 space-y-2">
            <button type="button" className={`${primaryBtn} w-full`} disabled={available === 0} onClick={handleStart}>
              {available === 0 ? 'Nenhuma questão com esses filtros' : `Começar (${Math.min(size, available)} questões)`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── 2. Resolvendo uma questão por vez ─────────────────────────────────────

export const Runner: React.FC<{
  subject: BankSubjectMeta;
  questions: BankQuestion[];
  onFinish: (results: SessionResult[]) => void;
  /** false quando a aba está escondida: desliga os atalhos de teclado. */
  active?: boolean;
}> = ({ subject, questions, onFinish, active = true }) => {
  const [idx, setIdx] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [results, setResults] = useState<SessionResult[]>([]);
  const topRef = useRef<HTMLDivElement>(null);

  const q = questions[idx];
  const isLast = idx === questions.length - 1;

  useEffect(() => {
    topRef.current?.scrollIntoView({ block: 'start' });
  }, [idx]);

  const answer = useCallback(
    (letter: string) => {
      if (chosen !== null) return;
      const correct = letter === q.g;
      setChosen(letter);
      setResults((r) => [...r, { question: q, chosen: letter, correct }]);
      addQuestionAttempt({
        questionId: q.id,
        materia: subject.id,
        tema: q.t?.[0],
        date: getLocalDateString(),
        answeredAt: Date.now(),
        chosen: letter,
        correct,
      }).catch((e) => console.error('Falha ao salvar resposta:', e));
    },
    [chosen, q, subject.id]
  );

  const next = useCallback(() => {
    if (chosen === null) return;
    if (isLast) {
      onFinish(results);
    } else {
      setIdx((i) => i + 1);
      setChosen(null);
    }
  }, [chosen, isLast, onFinish, results]);

  // Atalhos de teclado: A–E responde, Enter ou seta direita avança
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA')) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      // Com o foco num botão, o Enter já aciona o botão: não avançar duas vezes
      if (e.key === 'Enter' && el?.tagName === 'BUTTON') return;
      const key = e.key.toUpperCase();
      const i = key.length === 1 ? key.charCodeAt(0) - 65 : -1;
      if (i >= 0 && i < q.a.length) {
        answer(letterOf(i));
      } else if (e.key === 'Enter' || e.key === 'ArrowRight') {
        next();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, answer, next, q.a.length]);

  const answered = chosen !== null;
  const correct = chosen === q.g;
  const otherSubjects = q.ms?.filter((m) => m.toLowerCase() !== subject.nome.toLowerCase()) ?? [];

  return (
    <div className="space-y-4" ref={topRef}>
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="font-semibold text-slate-300">
            {subject.nome} · {idx + 1} de {questions.length}
          </span>
          <button
            type="button"
            onClick={() => onFinish(results)}
            className="text-indigo-400 hover:text-indigo-300 font-medium"
          >
            Encerrar
          </button>
        </div>
        <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-500 rounded-full transition-all duration-300"
            style={{ width: `${(idx / questions.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {q.p?.slice(0, 2).map((p) => (
            <span key={p} className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
              {p}
            </span>
          ))}
          {q.t?.map((t) => (
            <span key={t} className="text-[10px] font-semibold px-2 py-0.5 rounded bg-indigo-950 text-indigo-300">
              {t}
            </span>
          ))}
          {q.c !== 'certa' && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-950 text-amber-300">
              Matéria provável
            </span>
          )}
          {q.rv && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-950 text-amber-300">
              Texto pode ter falhas
            </span>
          )}
        </div>

        <p className="text-sm leading-relaxed text-slate-100 whitespace-pre-line">{q.e}</p>
        <QuestionImages paths={q.i} />
      </div>

      <div className="space-y-2">
        {q.a.map((text, i) => {
          const letter = letterOf(i);
          const isRight = letter === q.g;
          const isChosen = letter === chosen;
          let style = 'border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-100';
          if (answered && isRight) style = 'border-emerald-700 bg-emerald-950 text-emerald-200';
          else if (answered && isChosen) style = 'border-rose-700 bg-rose-950 text-rose-200';
          else if (answered) style = 'border-slate-800 bg-slate-900 text-slate-400 opacity-70';
          return (
            <button
              key={letter}
              type="button"
              disabled={answered}
              onClick={() => answer(letter)}
              className={`w-full flex items-start gap-3 text-left rounded-xl border p-3 text-sm transition-colors ${style}`}
            >
              <span className="shrink-0 w-6 h-6 rounded-full border border-current flex items-center justify-center text-xs font-bold">
                {letter}
              </span>
              <span className="leading-relaxed">{text}</span>
            </button>
          );
        })}
      </div>

      <QuestionImages paths={q.ia} />

      {answered && (
        <div className="space-y-3">
          <p className={`text-sm font-semibold ${correct ? 'text-emerald-400' : 'text-rose-400'}`}>
            {correct ? 'Acertou!' : `Errou. O gabarito é ${q.g}.`}
          </p>
          {otherSubjects.length > 0 && (
            <p className="text-[11px] text-slate-500">Esta questão também aparece em {otherSubjects.join(', ')}.</p>
          )}
          <button type="button" className={`${primaryBtn} w-full md:w-auto`} onClick={next}>
            {isLast ? 'Ver resultado' : 'Próxima'}
          </button>
        </div>
      )}
    </div>
  );
};

const QuestionImages: React.FC<{ paths?: string[] }> = ({ paths }) => {
  if (!paths || paths.length === 0) return null;
  return (
    <div className="space-y-2">
      {paths.map((p) => (
        <a key={p} href={bankImageUrl(p)} target="_blank" rel="noreferrer" className="block">
          <img
            src={bankImageUrl(p)}
            alt="Imagem da questão"
            loading="lazy"
            className="max-w-full h-auto mx-auto rounded-lg border border-slate-800 bg-white"
          />
        </a>
      ))}
    </div>
  );
};

// ─── 3. Resultado da sessão ────────────────────────────────────────────────

const Summary: React.FC<{
  subject: BankSubjectMeta;
  results: SessionResult[];
  onNew: () => void;
  onRetryWrong: (questions: BankQuestion[]) => void;
}> = ({ subject, results, onNew, onRetryWrong }) => {
  const total = results.length;
  const hits = results.filter((r) => r.correct).length;
  const pct = total > 0 ? Math.round((hits / total) * 100) : 0;
  const wrong = results.filter((r) => !r.correct);

  if (total === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
        <p className="text-sm text-slate-300">Nenhuma questão respondida nesta sessão.</p>
        <button type="button" className={primaryBtn} onClick={onNew}>
          Voltar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">{subject.nome}</span>
        <div className="flex items-end justify-between">
          <h1 className="text-xl font-bold text-slate-100">Sessão concluída</h1>
          <div className="text-right">
            <span className="text-3xl font-black text-indigo-400">{pct}%</span>
            <span className="block text-[11px] text-slate-400">
              {hits}/{total} acertos
            </span>
          </div>
        </div>
        <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${pct < 60 ? 'bg-rose-500' : pct < 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {wrong.length > 0 && (
          <button
            type="button"
            className={primaryBtn}
            onClick={() => onRetryWrong(wrong.map((r) => r.question))}
          >
            Refazer as {wrong.length} erradas
          </button>
        )}
        <button type="button" className={secondaryBtn} onClick={onNew}>
          Nova sessão
        </button>
      </div>

      {wrong.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
          <h2 className="text-sm font-bold text-slate-100">Para rever</h2>
          <div className="divide-y divide-slate-800/80">
            {wrong.map((r) => (
              <div key={r.question.id} className="py-2.5 space-y-0.5">
                <p className="text-xs text-slate-200 line-clamp-2">{r.question.e}</p>
                <p className="text-[11px] text-slate-400">
                  {r.question.t?.[0] ? `${r.question.t[0]} · ` : ''}
                  Você marcou {r.chosen}, gabarito {r.question.g}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
