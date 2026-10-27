import React, { useEffect, useState } from 'react';
import type { FlatLesson } from '../data/curriculum';
import type { LessonReview, ReviewRating } from '../db/schema';
import { db } from '../db';
import { buildLessonSession, loadLessonQuestions } from '../core/lessonQuestions';
import { summarizeAttempts } from '../core/questionSession';
import { evaluateReview, previewReview, suggestRating } from '../core/srs';
import { getLocalDateString, formatDateBr } from '../core/dates';
import { Runner, type SessionResult } from '../pages/Questoes/Resolver';
import type { BankQuestion, BankSubjectMeta } from '../types/questionBank';

const QUESTION_COUNT = 10;

interface ReviewQuestionsModalProps {
  isOpen: boolean;
  lesson: FlatLesson;
  review: LessonReview;
  onClose: () => void;
  onEvaluate: (updatedReview: LessonReview) => Promise<void> | void;
}

type Phase =
  | { name: 'loading' }
  | { name: 'error'; message: string }
  | { name: 'running'; subject: BankSubjectMeta; questions: BankQuestion[]; temas: string[] }
  | { name: 'result'; total: number; correct: number };

const RATING_OPTIONS: {
  rating: ReviewRating;
  label: string;
  selected: string;
  idle: string;
}[] = [
  {
    rating: 'errei',
    label: 'Errei',
    selected: 'border-rose-500 bg-rose-950/60 text-rose-200 ring-2 ring-rose-500/60',
    idle: 'border-rose-900/40 bg-slate-950/80 text-rose-400 hover:border-rose-700',
  },
  {
    rating: 'dificil',
    label: 'Difícil',
    selected: 'border-amber-500 bg-amber-950/60 text-amber-200 ring-2 ring-amber-500/60',
    idle: 'border-amber-900/40 bg-slate-950/80 text-amber-400 hover:border-amber-700',
  },
  {
    rating: 'bom',
    label: 'Bom',
    selected: 'border-blue-500 bg-blue-950/60 text-blue-200 ring-2 ring-blue-500/60',
    idle: 'border-blue-900/40 bg-slate-950/80 text-blue-400 hover:border-blue-700',
  },
  {
    rating: 'facil',
    label: 'Fácil',
    selected: 'border-emerald-500 bg-emerald-950/60 text-emerald-200 ring-2 ring-emerald-500/60',
    idle: 'border-emerald-900/40 bg-slate-950/80 text-emerald-400 hover:border-emerald-700',
  },
];

export const ReviewQuestionsModal: React.FC<ReviewQuestionsModalProps> = ({
  isOpen,
  lesson,
  review,
  onClose,
  onEvaluate,
}) => {
  const [phase, setPhase] = useState<Phase>({ name: 'loading' });
  const [selected, setSelected] = useState<ReviewRating | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    setPhase({ name: 'loading' });
    setSelected(null);
    setSaving(false);
    setSaveError(null);

    (async () => {
      try {
        const result = await loadLessonQuestions({
          id: lesson.id,
          title: lesson.title,
          subjectId: lesson.subjectId,
          subjectName: lesson.subjectName,
        });
        if (cancelled) return;

        if (result.status === 'sem-materia') {
          setPhase({
            name: 'error',
            message: `Matéria "${lesson.subjectName}" não encontrada no banco de questões.`,
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

        // Prioriza questões novas e depois as que já errou.
        const attempts = await db.questionAttempts.toArray();
        if (cancelled) return;

        const picked = buildLessonSession(
          result.match.questions,
          summarizeAttempts(attempts),
          QUESTION_COUNT
        );
        if (picked.length === 0) {
          setPhase({
            name: 'error',
            message: 'Não há questões disponíveis para esta aula agora.',
          });
          return;
        }

        setPhase({
          name: 'running',
          subject: result.subject,
          questions: picked,
          temas: result.match.temas,
        });
      } catch (e) {
        if (cancelled) return;
        setPhase({
          name: 'error',
          message: e instanceof Error ? e.message : 'Falha ao carregar questões.',
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, lesson.id, lesson.title, lesson.subjectId, lesson.subjectName]);

  const handleFinish = (results: SessionResult[]) => {
    const total = results.length;
    const correct = results.filter((r) => r.correct).length;
    setSelected(suggestRating(correct, total));
    setPhase({ name: 'result', total, correct });
  };

  const handleSave = async () => {
    if (!selected || saving) return;
    setSaving(true);
    setSaveError(null);

    // Calculado no momento de salvar: a sessão pode atravessar a meia-noite.
    const today = getLocalDateString();

    try {
      await onEvaluate(evaluateReview(review, selected, today));
      onClose();
    } catch {
      setSaveError('Não foi possível salvar a avaliação. Tente de novo.');
      setSaving(false);
    }
  };

  if (!isOpen) return null;

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
              onClick={onClose}
              className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1 rounded hover:bg-slate-800 transition-colors shrink-0"
            >
              Cancelar
            </button>
          </div>
          <div className="p-4 overflow-y-auto flex-1">
            <Runner
              subject={phase.subject}
              questions={phase.questions}
              onFinish={handleFinish}
            />
          </div>
        </div>
      </div>
    );
  }

  // ── 2. Resultado + sugestão de nota ──────────────────────────────────────
  if (phase.name === 'result') {
    const total = phase.total;
    const pct = total > 0 ? Math.round((phase.correct / total) * 100) : 0;
    const suggested = suggestRating(phase.correct, total);
    const previews = previewReview(review, getLocalDateString());

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
        <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
          <div className="px-5 py-4 border-b border-slate-800/80">
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">
              Revisão com questões
            </span>
            <h2 className="text-base font-bold text-slate-100 leading-snug mt-0.5 truncate">
              {lesson.title}
            </h2>
          </div>

          <div className="p-5 space-y-4 overflow-y-auto flex-1">
            {total > 0 ? (
              <>
                <div className="text-center">
                  <div className="text-3xl font-black text-indigo-400">{pct}%</div>
                  <p className="text-xs text-slate-400 mt-1">
                    {phase.correct} de {total} acertos
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

                {suggested && (
                  <p className="text-[11px] text-slate-400 text-center">
                    Sugestão pelo desempenho:{' '}
                    <span className="font-bold text-slate-200">
                      {RATING_OPTIONS.find((o) => o.rating === suggested)?.label}
                    </span>
                    . Você pode ajustar abaixo.
                  </p>
                )}

                {total < 5 && (
                  <p className="text-[10px] text-amber-400/90 text-center">
                    Poucas questões nesta sessão: a sugestão pode não ser precisa.
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-slate-300 text-center leading-relaxed">
                Nenhuma questão respondida nesta sessão.
                <br />
                Escolha uma nota para continuar.
              </p>
            )}

            <div className="grid grid-cols-2 gap-2.5">
              {RATING_OPTIONS.map((option) => {
                const isSelected = selected === option.rating;
                const preview = previews[option.rating];
                return (
                  <button
                    key={option.rating}
                    type="button"
                    onClick={() => setSelected(option.rating)}
                    className={`p-3 rounded-xl border text-center transition-all active:scale-[0.98] ${
                      isSelected ? option.selected : option.idle
                    }`}
                  >
                    <span className="flex items-center justify-center gap-1.5">
                      <span className="text-sm font-bold">{option.label}</span>
                      {suggested === option.rating && (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-200">
                          sugestão
                        </span>
                      )}
                    </span>
                    <span className="block text-[10px] text-slate-400 mt-1">
                      Passo {preview.nextStep} · {preview.intervalDays}d
                    </span>
                    <span className="block text-[11px] font-semibold mt-0.5">
                      {formatDateBr(preview.dueDate)}
                    </span>
                  </button>
                );
              })}
            </div>

            {saveError && (
              <p className="text-[11px] text-rose-300 leading-relaxed text-center">{saveError}</p>
            )}
          </div>

          <div className="px-5 py-3 border-t border-slate-800/80 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="py-2 px-3 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors"
            >
              Fechar sem avaliar
            </button>
            <button
              type="button"
              disabled={!selected || saving}
              onClick={handleSave}
              className="py-2 px-4 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 transition-all shadow-sm"
            >
              {saving ? 'Gravando…' : 'Salvar avaliação'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── 3. Carregando / erro ─────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">
            Revisão com questões
          </span>
          <h2 className="text-sm font-bold text-slate-100 leading-snug mt-0.5">
            {lesson.title}
          </h2>
        </div>

        {phase.name === 'loading' ? (
          <p className="text-xs text-slate-400 py-4 text-center">
            Carregando questões do assunto…
          </p>
        ) : (
          <p className="text-xs text-rose-300 leading-relaxed bg-rose-950/40 border border-rose-900/60 rounded-xl p-3">
            {phase.message}
          </p>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="py-2 px-3 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors"
          >
            Fechar
          </button>
          {phase.name === 'error' && (
            <button
              type="button"
              onClick={() => {
                setSelected(null);
                setPhase({ name: 'result', total: 0, correct: 0 });
              }}
              className="py-2 px-3 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 transition-colors"
            >
              Avaliar manualmente
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
