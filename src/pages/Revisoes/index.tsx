import React, { useState, useMemo } from 'react';
import { db } from '../../db';
import { useLiveQuery } from '../../db/useLiveQuery';
import { lessonById } from '../../data/curriculum';
import { getLocalDateString, formatDateBr, addDays } from '../../core/dates';
import { spreadOverdueReviews } from '../../core/srs';
import { DEFAULT_SETTINGS, setLessonMastered } from '../../db/operations';
import { ReviewModal } from '../../components/ReviewModal';
import { ConfirmModal } from '../../components/ConfirmModal';
import type { LessonReview, UserSettings } from '../../db/schema';

type ReviewView = 'hoje' | 'atrasadas' | 'proximos_7' | 'proximos_30';

export const RevisoesPage: React.FC = () => {
  const today = useMemo(() => getLocalDateString(), []);

  // Live queries
  const settings = useLiveQuery<UserSettings>(
    async () => {
      const s = await db.settings.get('default');
      return s || DEFAULT_SETTINGS;
    },
    [],
    DEFAULT_SETTINGS
  );

  const reviewsList = useLiveQuery<LessonReview[]>(
    () => db.reviews.toArray(),
    [],
    []
  );

  // States
  const [activeView, setActiveView] = useState<ReviewView>('hoje');
  const [activeReview, setActiveReview] = useState<LessonReview | null>(null);
  const [showSpreadConfirm, setShowSpreadConfirm] = useState(false);
  const [spreadSuccessMessage, setSpreadSuccessMessage] = useState<string | null>(null);

  // Filtros das 4 visões (PRD seção 6)
  const activeReviews = useMemo(() => {
    return reviewsList.filter((r) => !r.mastered);
  }, [reviewsList]);

  // Atrasadas (dueDate < today)
  const atrasadasReviews = useMemo(() => {
    return activeReviews
      .filter((r) => r.dueDate < today)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.lessonId.localeCompare(b.lessonId));
  }, [activeReviews, today]);

  // Hoje (dueDate === today)
  const hojeReviews = useMemo(() => {
    return activeReviews
      .filter((r) => r.dueDate === today)
      .sort((a, b) => a.lessonId.localeCompare(b.lessonId));
  }, [activeReviews, today]);

  // Próximos 7 dias (today < dueDate <= today + 7)
  const limit7Days = useMemo(() => addDays(today, 7), [today]);
  const proximos7Reviews = useMemo(() => {
    return activeReviews
      .filter((r) => r.dueDate > today && r.dueDate <= limit7Days)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.lessonId.localeCompare(b.lessonId));
  }, [activeReviews, today, limit7Days]);

  // Próximos 30 dias (today < dueDate <= today + 30)
  const limit30Days = useMemo(() => addDays(today, 30), [today]);
  const proximos30Reviews = useMemo(() => {
    return activeReviews
      .filter((r) => r.dueDate > today && r.dueDate <= limit30Days)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.lessonId.localeCompare(b.lessonId));
  }, [activeReviews, today, limit30Days]);

  // Lista da visão ativa
  const currentViewList = useMemo(() => {
    switch (activeView) {
      case 'hoje':
        return hojeReviews;
      case 'atrasadas':
        return atrasadasReviews;
      case 'proximos_7':
        return proximos7Reviews;
      case 'proximos_30':
        return proximos30Reviews;
    }
  }, [activeView, hojeReviews, atrasadasReviews, proximos7Reviews, proximos30Reviews]);

  // Handler de avaliação
  const handleEvaluateReview = async (updatedReview: LessonReview) => {
    await db.reviews.put(updatedReview);
    setActiveReview(null);
  };

  const handleToggleMastered = async (lessonId: string, mastered: boolean) => {
    await setLessonMastered(lessonId, mastered);
  };

  // Botão Espalhar Atrasadas (PRD seção 6 e 7)
  const handleConfirmSpreadOverdue = async () => {
    if (atrasadasReviews.length === 0) return;

    const cap = settings?.dailyReviewCap || 20;
    const spread = spreadOverdueReviews(atrasadasReviews, cap, today);
    await db.reviews.bulkPut(spread);

    setShowSpreadConfirm(false);
    setSpreadSuccessMessage(
      `${spread.length} revisões atrasadas foram redistribuídas com sucesso pelos próximos dias.`
    );
    setTimeout(() => setSpreadSuccessMessage(null), 5000);
  };

  return (
    <div className="py-2 space-y-4 md:max-w-3xl md:mx-auto">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Revisões</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Revisão espaçada por escada fixa [1, 7, 15, 30, 60]
          </p>
        </div>
      </div>

      {/* Notificação de sucesso ao espalhar */}
      {spreadSuccessMessage && (
        <div className="bg-emerald-950/80 border border-emerald-700 p-3 rounded-xl text-xs text-emerald-200 flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <span>✓</span>
            <span>{spreadSuccessMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setSpreadSuccessMessage(null)}
            className="text-emerald-400 hover:text-slate-50"
          >
            ✕
          </button>
        </div>
      )}

      {/* As 4 Visões: Hoje, Atrasadas, Próximos 7 dias, Próximos 30 dias (PRD seção 6) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-xl">
        <button
          type="button"
          onClick={() => setActiveView('hoje')}
          className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
            activeView === 'hoje'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <span>Hoje</span>
          <span className="text-[11px] opacity-80">({hojeReviews.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveView('atrasadas')}
          className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
            activeView === 'atrasadas'
              ? 'bg-rose-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <span>Atrasadas</span>
          {atrasadasReviews.length > 0 && (
            <span
              className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                activeView === 'atrasadas'
                  ? 'bg-white text-rose-600'
                  : 'bg-rose-950 text-rose-300 border border-rose-800'
              }`}
            >
              {atrasadasReviews.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveView('proximos_7')}
          className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
            activeView === 'proximos_7'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <span>7 dias</span>
          <span className="text-[11px] opacity-80">({proximos7Reviews.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveView('proximos_30')}
          className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
            activeView === 'proximos_30'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <span>30 dias</span>
          <span className="text-[11px] opacity-80">({proximos30Reviews.length})</span>
        </button>
      </div>

      {/* Botão Espalhar Atrasadas (visível na aba Atrasadas ou quando há atrasadas) */}
      {activeView === 'atrasadas' && atrasadasReviews.length > 0 && (
        <div className="bg-gradient-to-r from-rose-950/40 via-slate-900 to-slate-900 p-4 rounded-xl border border-rose-900/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
          <div>
            <h3 className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
              <span>⚠️</span>
              <span>{atrasadasReviews.length} revisões acumuladas</span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Distribui em rodízio pelos próximos dias sem passar de {settings?.dailyReviewCap || 20} por dia.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowSpreadConfirm(true)}
            className="py-2 px-4 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-950 transition-all shrink-0 active:scale-95"
          >
            Espalhar atrasadas
          </button>
        </div>
      )}

      {/* Lista de Revisões da Visão Ativa (PRD seção 6) */}
      <div className="space-y-2">
        <div className="px-1 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-400">
          <span>
            {activeView === 'hoje'
              ? 'Revisões para hoje'
              : activeView === 'atrasadas'
              ? 'Revisões atrasadas'
              : activeView === 'proximos_7'
              ? 'Previstas para os próximos 7 dias'
              : 'Previstas para os próximos 30 dias'}
          </span>
          <span>{currentViewList.length} aula(s)</span>
        </div>

        {currentViewList.length > 0 ? (
          <div className="divide-y divide-slate-800/80 rounded-xl overflow-hidden border border-slate-800 bg-slate-900 shadow-sm">
            {currentViewList.map((review) => {
              const lesson = lessonById.get(review.lessonId);
              const isOverdue = review.dueDate < today;
              const isToday = review.dueDate === today;

              return (
                <div
                  key={review.lessonId}
                  onClick={() => setActiveReview(review)}
                  className="p-3.5 flex items-center justify-between gap-3 hover:bg-slate-850/60 cursor-pointer transition-colors group select-none"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {lesson && (
                        <span className="text-[10px] font-semibold px-2 py-0.2 rounded-full bg-slate-800 text-slate-300">
                          {lesson.subjectName}
                        </span>
                      )}
                      <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
                        Passo {review.step}/4
                      </span>
                      {isOverdue && (
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-rose-950 text-rose-300 border border-rose-800">
                          Atrasada
                        </span>
                      )}
                      {isToday && (
                        <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                          Hoje
                        </span>
                      )}
                    </div>

                    <h3 className="text-xs font-bold text-slate-200 group-hover:text-slate-50 truncate">
                      {lesson?.title || review.lessonId}
                    </h3>
                    {lesson?.volumeName && (
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">
                        {lesson.volumeName}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <span className="block text-xs font-bold text-slate-200">
                        {formatDateBr(review.dueDate)}
                      </span>
                      <span className="block text-[10px] text-slate-400">
                        Prevista
                      </span>
                    </div>

                    <button
                      type="button"
                      className="py-1.5 px-3 bg-indigo-600 group-hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm"
                    >
                      Avaliar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-400 space-y-2">
            <span className="text-3xl block">✓</span>
            <p className="text-sm font-semibold text-slate-200">
              {activeView === 'hoje'
                ? 'Nenhuma revisão agendada para hoje!'
                : activeView === 'atrasadas'
                ? 'Nenhuma revisão atrasada. Tudo em dia!'
                : 'Nenhuma revisão programada para este período.'}
            </p>
          </div>
        )}
      </div>

      {/* Modal de Avaliação de Revisão (Errei, Difícil, Bom, Fácil com datas) */}
      {activeReview && (
        <ReviewModal
          isOpen={true}
          review={activeReview}
          today={today}
          onClose={() => setActiveReview(null)}
          onEvaluate={handleEvaluateReview}
          onToggleMastered={handleToggleMastered}
        />
      )}

      {/* Confirmação para Espalhar Atrasadas */}
      <ConfirmModal
        isOpen={showSpreadConfirm}
        title="Espalhar revisões atrasadas?"
        message={`Deseja distribuir as ${atrasadasReviews.length} revisões atrasadas pelos próximos dias (respeitando o limite diário de ${settings?.dailyReviewCap || 20})?`}
        confirmText="Sim, espalhar"
        cancelText="Cancelar"
        variant="warning"
        onConfirm={handleConfirmSpreadOverdue}
        onCancel={() => setShowSpreadConfirm(false)}
      />
    </div>
  );
};

export default RevisoesPage;
