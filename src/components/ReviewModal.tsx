import React, { useEffect } from 'react';
import type { LessonReview, ReviewRating } from '../db/schema';
import { lessonById } from '../data/curriculum';
import { LADDER, evaluateReview } from '../core/srs';
import { addDays, formatDateBr } from '../core/dates';

interface ReviewModalProps {
  review: LessonReview | null;
  isOpen: boolean;
  onClose: () => void;
  onEvaluate: (evaluatedReview: LessonReview) => Promise<void> | void;
  onToggleMastered?: (lessonId: string, mastered: boolean) => Promise<void> | void;
  today: string;
}

export const ReviewModal: React.FC<ReviewModalProps> = ({
  review,
  isOpen,
  onClose,
  onEvaluate,
  onToggleMastered,
  today,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !review) return null;

  const lesson = lessonById.get(review.lessonId);
  const currentStep = review.step;

  // Calcula para cada nota o próximo vencimento previsto (PRD seções 3 e 7)
  const previews: Record<ReviewRating, { nextStep: number; days: number; dueDate: string; label: string }> = {
    errei: (() => {
      const days = 1;
      const dueDate = addDays(today, days);
      return { nextStep: 0, days, dueDate, label: '1 dia' };
    })(),
    dificil: (() => {
      const days = Math.max(1, Math.floor(LADDER[currentStep] / 2));
      const dueDate = addDays(today, days);
      return { nextStep: currentStep, days, dueDate, label: `${days}d` };
    })(),
    bom: (() => {
      const nextStep = Math.min(currentStep + 1, 4);
      const days = LADDER[nextStep];
      const dueDate = addDays(today, days);
      return { nextStep, days, dueDate, label: `${days}d` };
    })(),
    facil: (() => {
      const nextStep = Math.min(currentStep + 2, 4);
      const days = LADDER[nextStep];
      const dueDate = addDays(today, days);
      return { nextStep, days, dueDate, label: `${days}d` };
    })(),
  };

  const handleSelectRating = async (rating: ReviewRating) => {
    const updated = evaluateReview(review, rating, today);
    await onEvaluate(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="fixed inset-0"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl z-10 space-y-5">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800">
                Passo {currentStep} de 4
              </span>
              <span className="text-xs text-slate-400">
                Intervalo atual: {LADDER[currentStep]}d
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-bold text-slate-100 leading-snug">
              {lesson?.title || review.lessonId}
            </h2>
            {lesson && (
              <p className="text-xs text-slate-400 mt-0.5">
                {lesson.subjectName} • {lesson.volumeName}
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
        <div className="text-center py-1">
          <p className="text-sm font-semibold text-slate-200">
            Como foi lembrar deste conteúdo?
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            Selecione uma nota para agendar a próxima revisão
          </p>
        </div>

        {/* Os 4 Botões: Errei, Difícil, Bom, Fácil com data prevista embaixo */}
        <div className="grid grid-cols-2 gap-2.5">
          {/* ERREI */}
          <button
            type="button"
            onClick={() => handleSelectRating('errei')}
            className="p-3 rounded-2xl bg-slate-950/80 border border-rose-900/40 hover:border-rose-600 hover:bg-rose-950/30 transition-all text-center group active:scale-[0.98]"
          >
            <span className="block text-sm font-bold text-rose-400 group-hover:text-rose-300">
              Errei
            </span>
            <span className="block text-[11px] text-slate-400 mt-1">
              Reinicia (Passo 0)
            </span>
            <span className="block text-xs font-semibold text-rose-400 mt-0.5">
              {formatDateBr(previews.errei.dueDate)} ({previews.errei.label})
            </span>
          </button>

          {/* DIFÍCIL */}
          <button
            type="button"
            onClick={() => handleSelectRating('dificil')}
            className="p-3 rounded-2xl bg-slate-950/80 border border-amber-900/40 hover:border-amber-600 hover:bg-amber-950/30 transition-all text-center group active:scale-[0.98]"
          >
            <span className="block text-sm font-bold text-amber-400 group-hover:text-amber-300">
              Difícil
            </span>
            <span className="block text-[11px] text-slate-400 mt-1">
              Repete (Passo {previews.dificil.nextStep})
            </span>
            <span className="block text-xs font-semibold text-amber-400 mt-0.5">
              {formatDateBr(previews.dificil.dueDate)} ({previews.dificil.label})
            </span>
          </button>

          {/* BOM */}
          <button
            type="button"
            onClick={() => handleSelectRating('bom')}
            className="p-3 rounded-2xl bg-slate-950/80 border border-blue-900/40 hover:border-blue-600 hover:bg-blue-950/30 transition-all text-center group active:scale-[0.98]"
          >
            <span className="block text-sm font-bold text-blue-400 group-hover:text-blue-300">
              Bom
            </span>
            <span className="block text-[11px] text-slate-400 mt-1">
              Avança (Passo {previews.bom.nextStep})
            </span>
            <span className="block text-xs font-semibold text-blue-400 mt-0.5">
              {formatDateBr(previews.bom.dueDate)} ({previews.bom.label})
            </span>
          </button>

          {/* FÁCIL */}
          <button
            type="button"
            onClick={() => handleSelectRating('facil')}
            className="p-3 rounded-2xl bg-slate-950/80 border border-emerald-900/40 hover:border-emerald-600 hover:bg-emerald-950/30 transition-all text-center group active:scale-[0.98]"
          >
            <span className="block text-sm font-bold text-emerald-400 group-hover:text-emerald-300">
              Fácil
            </span>
            <span className="block text-[11px] text-slate-400 mt-1">
              Avança 2 (Passo {previews.facil.nextStep})
            </span>
            <span className="block text-xs font-semibold text-emerald-400 mt-0.5">
              {formatDateBr(previews.facil.dueDate)} ({previews.facil.label})
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
              className="text-amber-400 hover:text-amber-300 font-medium flex items-center gap-1.5"
            >
              <span>🏆</span>
              <span>Marcar como Dominada</span>
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
