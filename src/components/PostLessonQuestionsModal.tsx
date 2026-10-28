import React, { useState, useEffect } from 'react';
import type { Lesson } from '../types/curriculum';
import { loadLessonQuestions, buildLessonSession } from '../core/lessonQuestions';
import { Runner, type SessionResult } from '../pages/Questoes/Resolver';
import type { BankSubjectMeta, BankQuestion } from '../types/questionBank';

export interface PostLessonQuestionsSaveData {
  total: number;
  correct: number;
  note?: string;
}

interface PostLessonQuestionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: PostLessonQuestionsSaveData) => Promise<void> | void;
  lesson: Lesson & {
    subjectName?: string;
    volumeName?: string;
  };
  /** Aba inicial: praticar no app ou registrar questões externas. */
  initialMode?: 'app' | 'manual';
}

type ModalMode = 'app' | 'manual';

type InnerPhase =
  | { name: 'form' }
  | { name: 'loading' }
  | { name: 'error'; message: string }
  | { name: 'running'; subject: BankSubjectMeta; questions: BankQuestion[]; via: string; temas: string[] }
  | { name: 'done'; total: number; correct: number };

const COUNT_OPTIONS = [5, 10, 15, 20];

export const PostLessonQuestionsModal: React.FC<PostLessonQuestionsModalProps> = ({
  isOpen,
  onClose,
  onSave,
  lesson,
  initialMode = 'app',
}) => {
  // Modo ativo: 'app' (resolver no MedTracker) ou 'manual' (registro de feitas/acertos)
  const [mode, setMode] = useState<ModalMode>('app');
  const [questionCount, setQuestionCount] = useState(10);

  // Contadores do registro manual
  const [fiz, setFiz] = useState(10);
  const [acertei, setAcertei] = useState(10);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  // Fase do runner interno
  const [phase, setPhase] = useState<InnerPhase>({ name: 'form' });

  // Quantas questões o banco tem para o assunto desta aula
  const [bankCount, setBankCount] = useState<number | null>(null);
  const [bankCountError, setBankCountError] = useState<string | null>(null);

  const subjectId = lesson.id.split('-')[0];
  const subjectName = lesson.subjectName ?? subjectId;

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setQuestionCount(10);
      setFiz(10);
      setAcertei(10);
      setNote('');
      setSaving(false);
      setPhase({ name: 'form' });
      setBankCount(null);
      setBankCountError(null);
    }
  }, [isOpen, lesson.id, initialMode]);

  useEffect(() => {
    if (!isOpen || mode !== 'app') return;
    let cancelled = false;
    setBankCount(null);
    setBankCountError(null);

    loadLessonQuestions({ id: lesson.id, title: lesson.title, subjectId, subjectName })
      .then((result) => {
        if (cancelled) return;
        if (result.status === 'sem-materia') {
          setBankCountError(`Matéria "${subjectName}" não encontrada no banco de questões.`);
          return;
        }
        setBankCount(result.match.questions.length);
      })
      .catch((e) => {
        if (!cancelled) {
          setBankCountError(
            e instanceof Error ? e.message : 'Falha ao consultar o banco de questões.'
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, mode, lesson.id, lesson.title, subjectId, subjectName]);

  if (!isOpen) return null;

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

  const handleManualSave = async () => {
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

  // ── Iniciar sessão de questões do app ─────────────────────────────────────
  const handleStartRunner = async () => {
    setPhase({ name: 'loading' });
    try {
      const result = await loadLessonQuestions({
        id: lesson.id,
        title: lesson.title,
        subjectId,
        subjectName,
      });

      if (result.status === 'sem-materia') {
        setPhase({
          name: 'error',
          message: `Matéria "${subjectName}" não encontrada no banco de questões.`,
        });
        return;
      }

      if (result.match.via === 'nenhum' || result.match.questions.length === 0) {
        setPhase({
          name: 'error',
          message: 'Nenhuma questão encontrada para este tema no banco de dados.',
        });
        return;
      }

      const picked = buildLessonSession(result.match.questions, new Map(), questionCount);
      setPhase({
        name: 'running',
        subject: result.subject,
        questions: picked,
        via: result.match.via,
        temas: result.match.temas,
      });
    } catch (e) {
      setPhase({
        name: 'error',
        message: e instanceof Error ? e.message : 'Falha ao carregar questões.',
      });
    }
  };

  const handleRunnerFinish = async (results: SessionResult[]) => {
    const total = results.length;
    const correct = results.filter((r) => r.correct).length;
    setPhase({ name: 'done', total, correct });
    setFiz(total);
    setAcertei(correct);
    await onSave({ total, correct });
  };

  // ── 1. Runner em execução ────────────────────────────────────────────────
  if (phase.name === 'running') {
    const temaLabel = phase.temas.length > 0 ? phase.temas.join(', ') : null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
        <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
          <div className="bg-slate-900/95 px-5 py-3 border-b border-slate-800 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-[11px] font-semibold text-indigo-400 truncate block">
                {lesson.title}
              </span>
              {temaLabel && (
                <p className="text-[10px] text-slate-400 truncate mt-0.5">Tema: {temaLabel}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setPhase({ name: 'form' })}
              className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1 rounded hover:bg-slate-800 transition-colors shrink-0"
            >
              Cancelar
            </button>
          </div>
          <div className="p-4 overflow-y-auto flex-1">
            <Runner
              subject={phase.subject}
              questions={phase.questions}
              onFinish={handleRunnerFinish}
            />
          </div>
        </div>
      </div>
    );
  }

  // ── 2. Conclusão do Runner ────────────────────────────────────────────────
  if (phase.name === 'done') {
    const pct = phase.total > 0 ? Math.round((phase.correct / phase.total) * 100) : 0;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
        <div className="relative w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl text-center space-y-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Sessão Concluída
            </span>
            <div className="text-3xl font-black text-indigo-400 mt-2">{pct}%</div>
            <p className="text-xs text-slate-400 mt-1">
              {phase.correct} de {phase.total} acertos · Registro salvo
            </p>
          </div>

          <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${
                pct < 60 ? 'bg-rose-500' : pct < 80 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors shadow-sm"
          >
            Fechar
          </button>
        </div>
      </div>
    );
  }

  // ── 3. Modal Principal ───────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Cabeçalho minimalista */}
        <div className="px-5 py-4 border-b border-slate-800/80 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">
              Questões da aula
            </span>
            <h2 className="text-base font-bold text-slate-100 leading-snug mt-0.5 truncate">
              {lesson.title}
            </h2>
            {(lesson.subjectName || lesson.volumeName) && (
              <p className="text-xs text-slate-400 mt-0.5 truncate">
                {lesson.subjectName}
                {lesson.volumeName && ` • ${lesson.volumeName}`}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition-colors shrink-0"
            title="Fechar"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Corpo com rolagem */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Seletor de modo em abas */}
          <div className="flex p-1 bg-slate-950 border border-slate-800/80 rounded-xl">
            <button
              type="button"
              onClick={() => setMode('app')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                mode === 'app'
                  ? 'bg-slate-850 text-slate-100 shadow-sm border border-slate-700/60'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Praticar no app
            </button>
            <button
              type="button"
              onClick={() => setMode('manual')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                mode === 'manual'
                  ? 'bg-slate-850 text-slate-100 shadow-sm border border-slate-700/60'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Registrar externas
            </button>
          </div>

          {/* ── MODO APP: Resolver questões do banco ── */}
          {mode === 'app' && (
            <div className="space-y-4 pt-1">
              <div className="px-0.5">
                {bankCount !== null ? (
                  <p className="text-[11px] text-slate-400">
                    <span className="font-bold text-slate-200">{bankCount}</span> questões no banco
                    para esta aula
                  </p>
                ) : bankCountError ? (
                  <p className="text-[11px] text-rose-400 leading-relaxed">{bankCountError}</p>
                ) : (
                  <p className="text-[11px] text-slate-500">Procurando questões no banco…</p>
                )}
              </div>

              {phase.name === 'loading' ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  Carregando questões do assunto…
                </div>
              ) : phase.name === 'error' ? (
                <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-900/60 space-y-2">
                  <p className="text-xs text-rose-300 leading-relaxed">{phase.message}</p>
                  <button
                    type="button"
                    onClick={() => setMode('manual')}
                    className="text-xs text-indigo-400 hover:text-indigo-300 underline font-medium"
                  >
                    Fazer registro manual de questões
                  </button>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-300">
                      Quantidade de questões
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {COUNT_OPTIONS.map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setQuestionCount(n)}
                          className={`py-2 rounded-lg text-xs font-bold border transition-colors ${
                            questionCount === n
                              ? 'bg-indigo-600 border-indigo-500 text-white'
                              : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleStartRunner}
                    className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition-all shadow-md shadow-indigo-950/40"
                  >
                    Iniciar sessão ({questionCount} questões)
                  </button>
                </>
              )}
            </div>
          )}

          {/* ── MODO MANUAL: Registro de questões feitas ── */}
          {mode === 'manual' && (
            <div className="space-y-4 pt-1">
              {/* Contadores */}
              <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-300">Desempenho</span>
                  <span
                    className={`font-bold px-2 py-0.5 rounded-full text-[11px] ${
                      isWeak
                        ? 'bg-rose-950 text-rose-300 border border-rose-800'
                        : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                    }`}
                  >
                    {acertei}/{fiz} ({percentage}%)
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  {/* Feitas */}
                  <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800 flex flex-col items-center">
                    <span className="text-[11px] text-slate-400 mb-1">Feitas</span>
                    <div className="flex items-center gap-1.5 my-0.5">
                      <button
                        type="button"
                        onClick={() => handleFizChange(fiz - 1)}
                        disabled={fiz <= 1}
                        className="w-7 h-7 rounded bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:opacity-30 font-bold text-sm flex items-center justify-center transition-colors"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min={0}
                        value={fiz}
                        onChange={(e) => handleFizChange(parseInt(e.target.value, 10) || 0)}
                        className="w-12 text-center bg-slate-950 border border-slate-700 rounded py-0.5 font-bold text-sm text-slate-100 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleFizChange(fiz + 1)}
                        className="w-7 h-7 rounded bg-slate-800 text-slate-200 hover:bg-slate-700 font-bold text-sm flex items-center justify-center transition-colors"
                      >
                        +
                      </button>
                    </div>
                    <div className="flex gap-1 mt-1">
                      {[5, 10, 15, 20].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => handleFizChange(n)}
                          className={`text-[9px] px-1 py-0.2 rounded border ${
                            fiz === n
                              ? 'bg-indigo-600 text-white border-indigo-500'
                              : 'bg-slate-800/60 text-slate-400 border-slate-700'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Acertos */}
                  <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800 flex flex-col items-center">
                    <span className="text-[11px] text-slate-400 mb-1">Acertos</span>
                    <div className="flex items-center gap-1.5 my-0.5">
                      <button
                        type="button"
                        onClick={() => handleAcerteiChange(acertei - 1)}
                        disabled={acertei <= 0}
                        className="w-7 h-7 rounded bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:opacity-30 font-bold text-sm flex items-center justify-center transition-colors"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min={0}
                        max={fiz}
                        value={acertei}
                        onChange={(e) => handleAcerteiChange(parseInt(e.target.value, 10) || 0)}
                        className="w-12 text-center bg-slate-950 border border-slate-700 rounded py-0.5 font-bold text-sm text-slate-100 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleAcerteiChange(acertei + 1)}
                        disabled={acertei >= fiz}
                        className="w-7 h-7 rounded bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:opacity-30 font-bold text-sm flex items-center justify-center transition-colors"
                      >
                        +
                      </button>
                    </div>
                    <div className="flex gap-1 mt-1">
                      <button
                        type="button"
                        onClick={() => handleAcerteiChange(fiz)}
                        className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-800"
                      >
                        100%
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAcerteiChange(Math.round(fiz * 0.8))}
                        className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700"
                      >
                        80%
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Observação opcional */}
              <div className="space-y-1">
                <label className="text-[11px] text-slate-400 block font-medium">
                  Observações (opcional)
                </label>
                <textarea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Dificuldades ou pontos de atenção…"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* Rodapé */}
        <div className="px-5 py-3 border-t border-slate-800/80 flex items-center justify-between gap-3 bg-slate-900/95">
          <button
            type="button"
            onClick={onClose}
            className="py-2 px-3 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors"
          >
            Fazer depois
          </button>

          {mode === 'manual' && (
            <button
              type="button"
              disabled={fiz <= 0 || saving}
              onClick={handleManualSave}
              className="py-2 px-4 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 transition-all shadow-sm"
            >
              {saving ? 'Gravando…' : 'Salvar registro'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
