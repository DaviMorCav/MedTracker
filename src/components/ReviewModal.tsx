import React, { useEffect, useState } from 'react';
import type { LessonReview, ReviewRating } from '../db/schema';
import { lessonById } from '../data/curriculum';
import { addQuestionLog } from '../db/operations';
import {
  LADDER,
  clampStep,
  evaluateReview,
  isLeeched,
  previewReview,
  reviewEase,
  reviewLapses,
  suggestRating,
} from '../core/srs';
import { getLocalDateString, formatDateBr } from '../core/dates';
import {
  PostLessonQuestionsModal,
  type PostLessonQuestionsSaveData,
} from './PostLessonQuestionsModal';

interface ReviewModalProps {
  review: LessonReview | null;
  isOpen: boolean;
  onClose: () => void;
  onEvaluate: (evaluatedReview: LessonReview) => Promise<void> | void;
  onToggleMastered?: (lessonId: string, mastered: boolean) => Promise<void> | void;
  today: string;
}

type QuestionsMode = 'app' | 'manual';

interface Suggestion {
  rating: ReviewRating;
  correct: number;
  total: number;
}

const RATING_LABEL: Record<ReviewRating, string> = {
  errei: 'Errei',
  dificil: 'Difícil',
  bom: 'Bom',
  facil: 'Fácil',
};

export const ReviewModal: React.FC<ReviewModalProps> = ({
  review,
  isOpen,
  onClose,
  onEvaluate,
  onToggleMastered,
  today,
}) => {
  const [questionsMode, setQuestionsMode] = useState<QuestionsMode | null>(null);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);

  useEffect(() => {
    if (isOpen) {
      setQuestionsMode(null);
      setSuggestion(null);
    }
  }, [isOpen, review?.lessonId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen || questionsMode) return;
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      // Atalhos de teclado (computador): 1 Errei, 2 Difícil, 3 Bom, 4 Fácil
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      const keyToRating: Record<string, ReviewRating> = {
        '1': 'errei',
        '2': 'dificil',
        '3': 'bom',
        '4': 'facil',
      };
      const rating = keyToRating[e.key];
      if (rating && review) {
        void (async () => {
          await onEvaluate(evaluateReview(review, rating, getLocalDateString()));
          onClose();
        })();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, review, onEvaluate, questionsMode]);

  if (!isOpen || !review) return null;

  const lesson = lessonById.get(review.lessonId);
  const currentStep = clampStep(review.step);
  const ease = reviewEase(review);
  const lapses = reviewLapses(review);
  const leeched = isLeeched(review);

  // Mesma conta usada ao salvar: a data mostrada é exatamente a data gravada.
  const previews = previewReview(review, today);

  const handleSelectRating = async (rating: ReviewRating) => {
    const updated = evaluateReview(review, rating, getLocalDateString());
    await onEvaluate(updated);
    onClose();
  };

  // Toda questão respondida (no app ou por fora) vira registro do dia.
  const handleQuestionsSave = async (data: PostLessonQuestionsSaveData) => {
    await addQuestionLog({
      lessonId: review.lessonId,
      date: getLocalDateString(),
      total: data.total,
      correct: data.correct,
      note: data.note,
    });

    const rating = suggestRating(data.correct, data.total);
    if (rating) {
      setSuggestion({ rating, correct: data.correct, total: data.total });
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 dark:bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
        <div
          className="fixed inset-0"
          onClick={onClose}
          aria-hidden="true"
        />

        <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl z-10 space-y-5 max-h-[92vh] overflow-y-auto">
          {/* Cabeçalho */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800">
                  Passo {currentStep} de 4
                </span>
                <span className="text-xs text-slate-400">
                  Intervalo base: {LADDER[currentStep]}d
                </span>
                {ease !== 2.5 && (
                  <span
                    className="text-xs text-slate-400"
                    title="Fator de facilidade desta revisão"
                  >
                    Facilidade {ease.toFixed(2)}
                  </span>
                )}
              </div>
              <h2 className="text-base sm:text-lg font-bold text-slate-100 leading-snug">
                {lesson?.title || review.lessonId}
              </h2>
              {lesson && (
                <p className="text-xs text-slate-400 mt-0.5">
                  {lesson.subjectName} • {lesson.volumeName}
                </p>
              )}
              {leeched && (
                <p className="text-[11px] font-semibold text-amber-400 mt-1.5">
                  Ponto fraco: {lapses} erro{lapses > 1 ? 's' : ''}. Considere rever a aula ou
                  fazer questões.
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Questões antes de avaliar */}
          {lesson && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-medium text-slate-400">
                  Revisar com questões (opcional)
                </p>
                {suggestion && (
                  <span className="text-[10px] text-slate-500">
                    Último resultado: {suggestion.correct}/{suggestion.total}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setQuestionsMode('app')}
                  className="p-3 rounded-xl bg-slate-950/80 border border-indigo-900/50 hover:border-indigo-600 hover:bg-indigo-950/30 transition-all text-center group active:scale-[0.98]"
                >
                  <span className="block text-sm font-bold text-indigo-300 group-hover:text-indigo-200">
                    Questões no app
                  </span>
                  <span className="block text-[11px] text-slate-400 mt-1">
                    Responder aqui
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setQuestionsMode('manual')}
                  className="p-3 rounded-xl bg-slate-950/80 border border-indigo-900/50 hover:border-indigo-600 hover:bg-indigo-950/30 transition-all text-center group active:scale-[0.98]"
                >
                  <span className="block text-sm font-bold text-indigo-300 group-hover:text-indigo-200">
                    Registrar externas
                  </span>
                  <span className="block text-[11px] text-slate-400 mt-1">
                    Feitas por fora
                  </span>
                </button>
              </div>

              {suggestion && (
                <p className="text-[11px] text-slate-300 text-center">
                  Sugestão pelo desempenho:{' '}
                  <span className="font-bold text-slate-100">
                    {RATING_LABEL[suggestion.rating]}
                  </span>
                  . Toque na nota para salvar.
                </p>
              )}
            </div>
          )}

          {/* Divisor */}
          <div className="flex items-center gap-2">
            <span className="h-px flex-1 bg-slate-800" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              {suggestion ? 'Confirmar nota' : 'Avaliar revisão'}
            </span>
            <span className="h-px flex-1 bg-slate-800" />
          </div>

          {/* Pergunta de avaliação */}
          <div className="text-center py-0.5">
            <p className="text-xs text-slate-400">
              Qual foi o nível de facilidade ao revisar?
            </p>
          </div>

          {/* Os 4 Botões: Errei, Difícil, Bom, Fácil com data prevista embaixo */}
          <div className="grid grid-cols-2 gap-2.5">
            {/* ERREI */}
            <button
              type="button"
              onClick={() => handleSelectRating('errei')}
              className={`p-3 rounded-xl bg-slate-950/80 border border-rose-900/40 hover:border-rose-600 hover:bg-rose-950/30 transition-all text-center group active:scale-[0.98]${
                suggestion?.rating === 'errei' ? ' ring-2 ring-rose-400/70' : ''
              }`}
            >
              <span className="flex items-center justify-center gap-1.5">
                <span className="text-sm font-bold text-rose-400 group-hover:text-rose-300">
                  Errei
                </span>
                {suggestion?.rating === 'errei' && (
                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-rose-500 text-white">
                    sugestão
                  </span>
                )}
              </span>
              <span className="block text-[11px] text-slate-400 mt-1">
                Reinicia (Passo 0)
              </span>
              <span className="block text-xs font-semibold text-rose-400 mt-0.5">
                {formatDateBr(previews.errei.dueDate)} ({previews.errei.intervalDays}d)
              </span>
            </button>

            {/* DIFÍCIL */}
            <button
              type="button"
              onClick={() => handleSelectRating('dificil')}
              className={`p-3 rounded-xl bg-slate-950/80 border border-amber-900/40 hover:border-amber-600 hover:bg-amber-950/30 transition-all text-center group active:scale-[0.98]${
                suggestion?.rating === 'dificil' ? ' ring-2 ring-amber-400/70' : ''
              }`}
            >
              <span className="flex items-center justify-center gap-1.5">
                <span className="text-sm font-bold text-amber-400 group-hover:text-amber-300">
                  Difícil
                </span>
                {suggestion?.rating === 'dificil' && (
                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-amber-500 text-white">
                    sugestão
                  </span>
                )}
              </span>
              <span className="block text-[11px] text-slate-400 mt-1">
                Repete (Passo {previews.dificil.nextStep})
              </span>
              <span className="block text-xs font-semibold text-amber-400 mt-0.5">
                {formatDateBr(previews.dificil.dueDate)} ({previews.dificil.intervalDays}d)
              </span>
            </button>

            {/* BOM */}
            <button
              type="button"
              onClick={() => handleSelectRating('bom')}
              className={`p-3 rounded-xl bg-slate-950/80 border border-blue-900/40 hover:border-blue-600 hover:bg-blue-950/30 transition-all text-center group active:scale-[0.98]${
                suggestion?.rating === 'bom' ? ' ring-2 ring-blue-400/70' : ''
              }`}
            >
              <span className="flex items-center justify-center gap-1.5">
                <span className="text-sm font-bold text-blue-400 group-hover:text-blue-300">
                  Bom
                </span>
                {suggestion?.rating === 'bom' && (
                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-blue-500 text-white">
                    sugestão
                  </span>
                )}
              </span>
              <span className="block text-[11px] text-slate-400 mt-1">
                Avança (Passo {previews.bom.nextStep})
              </span>
              <span className="block text-xs font-semibold text-blue-400 mt-0.5">
                {formatDateBr(previews.bom.dueDate)} ({previews.bom.intervalDays}d)
              </span>
            </button>

            {/* FÁCIL */}
            <button
              type="button"
              onClick={() => handleSelectRating('facil')}
              className={`p-3 rounded-xl bg-slate-950/80 border border-emerald-900/40 hover:border-emerald-600 hover:bg-emerald-950/30 transition-all text-center group active:scale-[0.98]${
                suggestion?.rating === 'facil' ? ' ring-2 ring-emerald-400/70' : ''
              }`}
            >
              <span className="flex items-center justify-center gap-1.5">
                <span className="text-sm font-bold text-emerald-400 group-hover:text-emerald-300">
                  Fácil
                </span>
                {suggestion?.rating === 'facil' && (
                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-emerald-500 text-white">
                    sugestão
                  </span>
                )}
              </span>
              <span className="block text-[11px] text-slate-400 mt-1">
                Avança 2 (Passo {previews.facil.nextStep})
              </span>
              <span className="block text-xs font-semibold text-emerald-400 mt-0.5">
                {formatDateBr(previews.facil.dueDate)} ({previews.facil.intervalDays}d)
              </span>
            </button>
          </div>

          {/* Rodapé: Marcar como dominado ou fechar */}
          <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
            {onToggleMastered && (
              <button
                type="button"
                onClick={async () => {
                  await onToggleMastered(review.lessonId, true);
                  onClose();
                }}
                className="text-amber-400 hover:text-amber-300 font-medium"
              >
                Marcar como dominada
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-200 ml-auto"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>

      {/* Questões no app / registro externo, no mesmo padrão do pós-aula */}
      {questionsMode && lesson && (
        <PostLessonQuestionsModal
          isOpen={true}
          lesson={lesson}
          initialMode={questionsMode}
          onClose={() => setQuestionsMode(null)}
          onSave={handleQuestionsSave}
        />
      )}
    </>
  );
};
