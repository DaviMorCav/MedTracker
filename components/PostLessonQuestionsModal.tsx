import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Lesson } from '../types/curriculum';
import type { BankQuestion, BankSubjectMeta } from '../types/questionBank';
import type { QuestionAttempt } from '../db/schema';
import { resolveQuestionsUrl } from '../core/content';
import { summarizeAttempts } from '../core/questionSession';
import {
  buildLessonSession,
  loadLessonQuestions,
  type LessonMatch,
} from '../core/lessonQuestions';
import { db } from '../db';
import { useLiveQuery } from '../db/useLiveQuery';
import { Runner, type SessionResult } from '../pages/Questoes/Resolver';

export interface PostLessonQuestionsSaveData {
  total: number;
  correct: number;
  note?: string;
}

interface PostLessonQuestionsModalProps {
  isOpen: boolean;
  onClose: () => void; // "Fazer depois"
  onSave: (data: PostLessonQuestionsSaveData) => Promise<void> | void;
  lesson: Lesson & {
    subjectId?: string;
    subjectName?: string;
    volumeName?: string;
    lessonUrl?: string;
    volumeUrl?: string;
  };
  globalQuestionsTemplate?: string;
}

/** Quantas questões por rodada ao resolver dentro do app. */
const SESSION_SIZE = 10;

interface LoadedBank {
  subject: BankSubjectMeta;
  match: LessonMatch;
  all: BankQuestion[];
}

type LoadState = 'idle' | 'loading' | 'ready' | 'sem-materia' | 'erro';

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Diz ao usuário o que foi encontrado, para ele poder conferir se casou certo. */
function describeMatch(match: LessonMatch): string {
  const count = plural(match.questions.length, 'questão', 'questões');
  if (match.via === 'tema') {
    const extra = match.fromText > 0 ? ` (+${match.fromText} achadas pelo texto)` : '';
    return `${count} · tema ${match.temas.join(', ')}${extra}`;
  }
  return `${count} que citam o assunto no enunciado`;
}

export const PostLessonQuestionsModal: React.FC<PostLessonQuestionsModalProps> = ({
  isOpen,
  onClose,
  onSave,
  lesson,
  globalQuestionsTemplate,
}) => {
  const navigate = useNavigate();

  // Contadores
  const [fiz, setFiz] = useState(10);
  const [acertei, setAcertei] = useState(10);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  // Resolver as questões do assunto dentro do app
  const attempts = useLiveQuery<QuestionAttempt[]>(() => db.questionAttempts.toArray(), [], []);
  const summaries = useMemo(() => summarizeAttempts(attempts), [attempts]);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [loadError, setLoadError] = useState('');
  const [bank, setBank] = useState<LoadedBank | null>(null);
  const [running, setRunning] = useState<{ sessionId: number; questions: BankQuestion[] } | null>(null);
  const [solved, setSolved] = useState<{ total: number; correct: number; ids: string[] }>({
    total: 0,
    correct: 0,
    ids: [],
  });
  const [exhausted, setExhausted] = useState<'assunto' | 'materia' | null>(null);

  // Reset counters when opened for a new lesson
  useEffect(() => {
    if (isOpen) {
      setFiz(10);
      setAcertei(10);
      setNote('');
      setSaving(false);
      setLoadState('idle');
      setLoadError('');
      setBank(null);
      setRunning(null);
      setSolved({ total: 0, correct: 0, ids: [] });
      setExhausted(null);
    }
  }, [isOpen, lesson.id]);

  if (!isOpen) return null;

  const effectiveQuestionsUrl = resolveQuestionsUrl({
    lessonUrl: lesson.lessonUrl,
    volumeUrl: lesson.volumeUrl,
    template: globalQuestionsTemplate,
    subjectName: lesson.subjectName,
    volumeName: lesson.volumeName,
    lessonTitle: lesson.title,
  });

  const handleFizChange = (val: number) => {
    const nextFiz = Math.max(0, val);
    setFiz(nextFiz);
    if (acertei > nextFiz) {
      setAcertei(nextFiz);
    }
  };

  const handleAcerteiChange = (val: number) => {
    const clamped = Math.max(0, Math.min(fiz, val));
    setAcertei(clamped);
  };

  const percentage = fiz > 0 ? Math.round((acertei / fiz) * 100) : 0;
  const isWeak = fiz > 0 && percentage < 60;

  const handleSave = async () => {
    if (fiz <= 0) return;
    setSaving(true);
    try {
      await onSave({
        total: fiz,
        correct: acertei,
        note: note.trim() || undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const startSession = (b: LoadedBank, scope: 'assunto' | 'materia', doneIds: string[]) => {
    const pool = scope === 'assunto' ? b.match.questions : b.all;
    const picked = buildLessonSession(pool, summaries, SESSION_SIZE, new Set(doneIds));
    if (picked.length === 0) {
      setExhausted(scope);
      return;
    }
    setExhausted(null);
    setRunning({ sessionId: Date.now(), questions: picked });
  };

  const handleSolve = async (scope: 'assunto' | 'materia') => {
    if (bank) {
      startSession(bank, scope, solved.ids);
      return;
    }
    if (!lesson.subjectId) return;

    setLoadState('loading');
    try {
      const res = await loadLessonQuestions({
        id: lesson.id,
        title: lesson.title,
        subjectId: lesson.subjectId,
        subjectName: lesson.subjectName ?? '',
      });
      if (res.status === 'sem-materia') {
        setLoadState('sem-materia');
        return;
      }
      const loaded: LoadedBank = { subject: res.subject, match: res.match, all: res.all };
      setBank(loaded);
      setLoadState('ready');
      // Nada encontrado para o assunto: não começa sozinho, avisa e oferece a matéria toda
      if (scope === 'assunto' && loaded.match.questions.length === 0) return;
      startSession(loaded, scope, solved.ids);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Erro desconhecido');
      setLoadState('erro');
    }
  };

  // Ao terminar (ou encerrar) a rodada, preenche o registro com o que foi respondido
  const handleRunnerFinish = (results: SessionResult[]) => {
    setRunning(null);
    if (results.length === 0) return;
    const hits = results.filter((r) => r.correct).length;
    const next = {
      total: solved.total + results.length,
      correct: solved.correct + hits,
      ids: [...solved.ids, ...results.map((r) => r.question.id)],
    };
    setSolved(next);
    setFiz(next.total);
    setAcertei(next.correct);
  };

  const topicQuestions = bank ? bank.match.questions.length : 0;
  const showTopicButton =
    loadState !== 'sem-materia' && !(bank && topicQuestions === 0) && exhausted !== 'assunto';
  const showSubjectButton = !!bank && (topicQuestions === 0 || exhausted === 'assunto');

  const handleGoToSettings = () => {
    onClose();
    navigate('/mais');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 dark:bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
        {/* Cabeçalho */}
        <div className="bg-slate-900/95 px-5 py-4 border-b border-slate-800 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5 text-xs text-indigo-400 font-semibold mb-1">
              <span>🎯</span>
              <span>QUESTÕES DESTA AULA</span>
            </div>
            <h2 className="text-base sm:text-lg font-bold text-slate-100 leading-snug">
              {lesson.title}
            </h2>
            {(lesson.subjectName || lesson.volumeName) && (
              <p className="text-xs text-slate-400 mt-0.5 truncate">
                {lesson.subjectName} • {lesson.volumeName}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition-colors"
            title="Fazer depois"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {running && bank ? (
          <div className="p-5 overflow-y-auto flex-1">
            <Runner
              key={running.sessionId}
              subject={bank.subject}
              questions={running.questions}
              onFinish={handleRunnerFinish}
            />
          </div>
        ) : (
          <>
            {/* Conteúdo com rolagem */}
            <div className="p-5 space-y-5 overflow-y-auto flex-1">
            {/* Resolver as questões do assunto aqui mesmo */}
            {lesson.subjectId && (
              <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-3">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
                  1. Resolver aqui no app
                </span>

                {solved.total > 0 && (
                  <div className="bg-emerald-950/40 border border-emerald-800/60 p-3 rounded-lg text-xs text-emerald-200 leading-relaxed">
                    Você respondeu {plural(solved.total, 'questão', 'questões')} agora:{' '}
                    {plural(solved.correct, 'acerto', 'acertos')}. O registro abaixo já está preenchido.
                  </div>
                )}

                {bank && topicQuestions > 0 && (
                  <p className="text-xs text-slate-400">{describeMatch(bank.match)}</p>
                )}

                {loadState === 'sem-materia' && (
                  <div className="bg-amber-950/40 border border-amber-800/60 p-3 rounded-lg text-xs text-amber-200 leading-relaxed">
                    Esta matéria ainda não está no banco de questões do app.
                  </div>
                )}

                {loadState === 'erro' && (
                  <div className="bg-rose-950/60 border border-rose-800 p-3 rounded-lg text-xs text-rose-200 leading-relaxed space-y-1">
                    <p>Não consegui carregar o banco de questões.</p>
                    <p className="text-rose-300/80">{loadError}</p>
                  </div>
                )}

                {bank && topicQuestions === 0 && (
                  <div className="bg-amber-950/40 border border-amber-800/60 p-3 rounded-lg text-xs text-amber-200 leading-relaxed">
                    Não achei questões específicas de “{lesson.title}” no banco.
                  </div>
                )}

                {exhausted === 'assunto' && (
                  <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg text-xs text-slate-300 leading-relaxed">
                    Você já resolveu todas as questões encontradas deste assunto.
                  </div>
                )}

                {exhausted === 'materia' && (
                  <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg text-xs text-slate-300 leading-relaxed">
                    Você já resolveu todas as questões desta matéria.
                  </div>
                )}

                {showTopicButton && (
                  <button
                    type="button"
                    disabled={loadState === 'loading'}
                    onClick={() => handleSolve('assunto')}
                    className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.99] disabled:opacity-60 text-white rounded-lg text-xs sm:text-sm font-semibold transition-all shadow-md shadow-indigo-950"
                  >
                    {loadState === 'loading'
                      ? 'Procurando questões…'
                      : loadState === 'erro'
                      ? 'Tentar de novo'
                      : solved.total > 0
                      ? `Resolver mais ${SESSION_SIZE}`
                      : `Resolver ${SESSION_SIZE} questões deste assunto`}
                  </button>
                )}

                {showSubjectButton && bank && (
                  <button
                    type="button"
                    onClick={() => handleSolve('materia')}
                    className="w-full py-3 px-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 rounded-lg text-xs sm:text-sm font-semibold transition-colors"
                  >
                    Resolver questões de {bank.subject.nome}
                  </button>
                )}
              </div>
            )}

              {/* Botão Abrir Questões (PRD seção 5) */}
              <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
                  2. Ou abrir as questões na plataforma
                </span>

                {effectiveQuestionsUrl ? (
                  <a
                    href={effectiveQuestionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.99] text-white rounded-lg text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-all shadow-md shadow-indigo-950"
                  >
                    <span>Abrir questões</span>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                ) : (
                  <div className="bg-amber-950/40 border border-amber-800/60 p-3 rounded-lg text-xs space-y-2">
                    <p className="text-amber-200 leading-relaxed">
                      ⚠️ Nenhum link de questões configurado para esta aula, volume ou modelo global.
                    </p>
                    <button
                      type="button"
                      onClick={handleGoToSettings}
                      className="inline-flex items-center gap-1.5 text-xs text-amber-300 hover:text-amber-100 font-semibold underline"
                    >
                      <span>Ir para Ajustes configurar o modelo</span>
                      <span>⚙️</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Registro rápido: Contadores Fiz e Acertei (PRD seção 5) */}
              <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    3. Registro rápido de desempenho
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        isWeak
                          ? 'bg-rose-950 text-rose-300 border border-rose-800'
                          : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      }`}
                    >
                      {acertei}/{fiz} ({percentage}%)
                    </span>
                    {isWeak && (
                      <span className="text-[10px] font-bold text-rose-400">
                        Tema Fraco
                      </span>
                    )}
                  </div>
                </div>

                {/* Grid dos dois contadores */}
                <div className="grid grid-cols-2 gap-3">
                  {/* Contador FIZ */}
                  <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 flex flex-col items-center">
                    <span className="text-xs text-slate-400 font-semibold mb-1">
                      Questões Feitas
                    </span>
                    <div className="flex items-center gap-2 my-1">
                      <button
                        type="button"
                        onClick={() => handleFizChange(fiz - 1)}
                        disabled={fiz <= 1}
                        className="w-8 h-8 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:opacity-40 font-bold text-base flex items-center justify-center transition-colors"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min={0}
                        value={fiz}
                        onChange={(e) => handleFizChange(parseInt(e.target.value, 10) || 0)}
                        className="w-14 text-center bg-slate-950 border border-slate-700 rounded-lg py-1 font-bold text-base text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={() => handleFizChange(fiz + 1)}
                        className="w-8 h-8 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 font-bold text-base flex items-center justify-center transition-colors"
                      >
                        +
                      </button>
                    </div>
                    {/* Presets rápidos */}
                    <div className="flex gap-1 mt-1">
                      {[5, 10, 15, 20].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => handleFizChange(n)}
                          className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                            fiz === n
                              ? 'bg-indigo-600 text-white border-indigo-500'
                              : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:text-slate-50'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Contador ACERTEI */}
                  <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 flex flex-col items-center">
                    <span className="text-xs text-slate-400 font-semibold mb-1">
                      Acertos
                    </span>
                    <div className="flex items-center gap-2 my-1">
                      <button
                        type="button"
                        onClick={() => handleAcerteiChange(acertei - 1)}
                        disabled={acertei <= 0}
                        className="w-8 h-8 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:opacity-40 font-bold text-base flex items-center justify-center transition-colors"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min={0}
                        max={fiz}
                        value={acertei}
                        onChange={(e) => handleAcerteiChange(parseInt(e.target.value, 10) || 0)}
                        className="w-14 text-center bg-slate-950 border border-slate-700 rounded-lg py-1 font-bold text-base text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={() => handleAcerteiChange(acertei + 1)}
                        disabled={acertei >= fiz}
                        className="w-8 h-8 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:opacity-40 font-bold text-base flex items-center justify-center transition-colors"
                      >
                        +
                      </button>
                    </div>
                    {/* Presets rápidos */}
                    <div className="flex gap-1 mt-1">
                      <button
                        type="button"
                        onClick={() => handleAcerteiChange(fiz)}
                        className="text-[10px] px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-700 hover:bg-emerald-900"
                      >
                        100%
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAcerteiChange(Math.round(fiz * 0.8))}
                        className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700"
                      >
                        80%
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Campo Opcional de Observação (PRD seção 5) */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400 block">
                  Observação (o que errei, tema fraco)
                </label>
                <textarea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ex.: errei duas questões de conduta em flutter atrial..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
                />
              </div>
            </div>

            {/* Rodapé com Botões Salvar e Fazer depois (PRD seção 5) */}
            <div className="bg-slate-900/95 px-5 py-4 border-t border-slate-800 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={onClose}
                className="py-2.5 px-4 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              >
                Fazer depois
              </button>

              <button
                type="button"
                disabled={fiz <= 0 || saving}
                onClick={handleSave}
                className="py-2.5 px-6 rounded-lg text-xs sm:text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 transition-all shadow-md shadow-indigo-950"
              >
                {saving ? 'Gravando...' : 'Salvar registro'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
