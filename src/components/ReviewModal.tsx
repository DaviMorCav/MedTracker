import React, { useEffect } from 'react';
import type { LessonReview, ReviewRating } from '../db/schema';
import { lessonById } from '../data/curriculum';
import {
  LADDER,
  clampStep,
  evaluateReview,
  isLeeched,
  previewReview,
  reviewEase,
  reviewLapses,
} from '../core/srs';
import { formatDateBr } from '../core/dates';

interface ReviewModalProps {
  review: LessonReview | null;
  isOpen: boolean;
  onClose: () => void;
  onEvaluate: (evaluatedReview: LessonReview) => Promise<void> | void;
  onToggleMastered?: (lessonId: string, mastered: boolean) => Promise<void> | void;
  today: string;
  /** Abre a sessão de questões desta aula (quando o pai suporta). */
  onReviewWithQuestions?: () => void;
  /** Falso quando a aula não tem questões no banco. */
  canReviewWithQuestions?: boolean;
}

export const ReviewModal: React.FC<ReviewModalProps> = ({
  review,
  isOpen,
  onClose,
  onEvaluate,
  onToggleMastered,
  today,
  onReviewWithQuestions,
  canReviewWithQuestions = true,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
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
          await onEvaluate(evaluateReview(review, rating, today));
          onClose();
        })();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, review, today, onEvaluate]);

  if (!isOpen || !review) return null;

  const lesson = lessonById.get(review.lessonId);
  const currentStep = clampStep(review.step);
  const ease = reviewEase(review);
  const lapses = reviewLapses(review);
  const leeched = isLeeched(review);

  // Mesma conta usada ao salvar: a data mostrada é exatamente a data gravada.
  const previews = previewReview(review, today);

  const handleSelectRating = async (rating: ReviewRating) => {
    const updated = evaluateReview(review, rating, today);
    await onEvaluate(updated);
    onClose();
  };

  return (
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
            className="p-3 rounded-xl bg-slate-950/80 border border-rose-900/40 hover:border-rose-600 hover:bg-rose-950/30 transition-all text-center group active:scale-[0.98]"
          >
            <span className="block text-sm font-bold text-rose-400 group-hover:text-rose-300">
              Errei
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
            className="p-3 rounded-xl bg-slate-950/80 border border-amber-900/40 hover:border-amber-600 hover:bg-amber-950/30 transition-all text-center group active:scale-[0.98]"
          >
            <span className="block text-sm font-bold text-amber-400 group-hover:text-amber-300">
              Difícil
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
            className="p-3 rounded-xl bg-slate-950/80 border border-blue-900/40 hover:border-blue-600 hover:bg-blue-950/30 transition-all text-center group active:scale-[0.98]"
          >
            <span className="block text-sm font-bold text-blue-400 group-hover:text-blue-300">
              Bom
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
            className="p-3 rounded-xl bg-slate-950/80 border border-emerald-900/40 hover:border-emerald-600 hover:bg-emerald-950/30 transition-all text-center group active:scale-[0.98]"
          >
            <span className="block text-sm font-bold text-emerald-400 group-hover:text-emerald-300">
              Fácil
            </span>
            <span className="block text-[11px] text-slate-400 mt-1">
              Avança 2 (Passo {previews.facil.nextStep})
            </span>
            <span className="block text-xs font-semibold text-emerald-400 mt-0.5">
              {formatDateBr(previews.facil.dueDate)} ({previews.facil.intervalDays}d)
            </span>
          </button>
        </div>

        {/* Revisar com questões */}
        {onReviewWithQuestions && (
          <div className="space-y-1">
            <button
              type="button"
              onClick={onReviewWithQuestions}
              disabled={!canReviewWithQuestions}
              title={
                canReviewWithQuestions
                  ? 'Responder questões desta aula antes de avaliar'
                  : 'Sem questões desta aula no banco'
              }
              className="w-full py-2.5 rounded-xl text-xs font-semibold border border-indigo-800/70 bg-indigo-950/40 text-indigo-300 hover:bg-indigo-900/50 disabled:opacity-40 disabled:hover:bg-indigo-950/40 disabled:cursor-not-allowed transition-colors"
            >
              Revisar com questões
            </button>
            {!canReviewWithQuestions && (
              <p className="text-[10px] text-slate-500 text-center">
                Sem questões desta aula no banco.
              </p>
            )}
          </div>
        )}

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
  );
};
