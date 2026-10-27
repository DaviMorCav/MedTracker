import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../db';
import { useLiveQuery } from '../../db/useLiveQuery';
import { curriculum, allLessons, lessonById } from '../../data/curriculum';
import {
  calculateTodayReviewsQueue,
  getPendingQuestions,
  suggestNewLessons,
  calculateStreak,
  calculateNext7DaysForecast,
} from '../../core/todayQueue';
import { getLocalDateString, formatDateBr } from '../../core/dates';
import {
  DEFAULT_SETTINGS,
  completeLesson,
  addQuestionLog,
  setLessonMastered,
} from '../../db/operations';
import { ReviewModal } from '../../components/ReviewModal';
import { ReviewQuestionsModal } from '../../components/ReviewQuestionsModal';
import { useLessonQuestionsAvailability } from '../../components/useLessonQuestionsAvailability';
import { PostLessonQuestionsModal } from '../../components/PostLessonQuestionsModal';
import type {
  LessonReview,
  LessonProgress,
  QuestionLog,
  UserSettings,
  LessonMedia,
} from '../../db/schema';

export const HojePage: React.FC = () => {
  const navigate = useNavigate();
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

  const progressList = useLiveQuery<LessonProgress[]>(
    () => db.progress.toArray(),
    [],
    []
  );

  const questionLogsList = useLiveQuery<QuestionLog[]>(
    () => db.questionLogs.toArray(),
    [],
    []
  );

  const lessonMediaList = useLiveQuery<LessonMedia[]>(
    () => db.lessonMedia.toArray(),
    [],
    []
  );

  // States para modais
  const [activeReview, setActiveReview] = useState<LessonReview | null>(null);
  const [questionsReview, setQuestionsReview] = useState<LessonReview | null>(null);
  const [activeQuestionsLessonId, setActiveQuestionsLessonId] = useState<string | null>(null);

  // Maps
  const progressMap = useMemo(() => {
    const map = new Map<string, LessonProgress>();
    for (const p of progressList) {
      map.set(p.lessonId, p);
    }
    return map;
  }, [progressList]);

  const lessonMediaMap = useMemo(() => {
    const map = new Map<string, LessonMedia>();
    for (const m of lessonMediaList) {
      map.set(m.lessonId, m);
    }
    return map;
  }, [lessonMediaList]);

  // Sequência de atividade (Streak)
  const activeDates = useMemo(() => {
    const dates = new Set<string>();
    for (const p of progressList) {
      if (p.completedOn) dates.add(p.completedOn);
    }
    for (const r of reviewsList) {
      for (const h of r.history || []) {
        if (h.date) dates.add(h.date);
      }
    }
    for (const q of questionLogsList) {
      if (q.date) dates.add(q.date);
    }
    return dates;
  }, [progressList, reviewsList, questionLogsList]);

  const streak = useMemo(() => calculateStreak(activeDates, today), [activeDates, today]);

  // Seção 2: Revisões de hoje
  const todayReviewsData = useMemo(() => {
    return calculateTodayReviewsQueue({
      reviews: reviewsList,
      today,
      dailyReviewCap: settings?.dailyReviewCap || 20,
    });
  }, [reviewsList, today, settings?.dailyReviewCap]);

  // Se a aula tem questões no banco (checagem barata pelo index.json)
  const reviewLessonIds = useMemo(
    () => todayReviewsData.queue.map((r) => r.lessonId),
    [todayReviewsData.queue]
  );
  const questionAvailability = useLessonQuestionsAvailability(reviewLessonIds);

  // Seção 3: Questões pendentes
  const pendingQuestions = useMemo(() => {
    return getPendingQuestions({
      progressList,
      questionLogs: questionLogsList,
    });
  }, [progressList, questionLogsList]);

  // Seção 4: Aulas novas sugeridas
  const suggestedLessons = useMemo(() => {
    return suggestNewLessons({
      subjects: curriculum.subjects,
      activeSubjects: settings?.activeSubjects || [],
      progressMap,
      dailyNewLessons: settings?.dailyNewLessons || 2,
      includeBonus: settings?.includeBonus || false,
    });
  }, [settings, progressMap]);

  // Seção 5: Próximos 7 dias
  const forecast7Days = useMemo(() => {
    return calculateNext7DaysForecast(reviewsList, today);
  }, [reviewsList, today]);

  const maxForecastCount = useMemo(() => {
    return Math.max(1, ...forecast7Days.map((d) => d.count));
  }, [forecast7Days]);

  // Cálculo do anel de progresso do dia (feitas / total de tarefas de hoje)
  const dailyProgress = useMemo(() => {
    // Feitas hoje:
    const reviewsEvaluatedToday = reviewsList.filter((r) =>
      r.history?.some((h) => h.date === today)
    ).length;
    const lessonsCompletedToday = progressList.filter(
      (p) => p.completedOn === today
    ).length;
    const questionsLoggedToday = questionLogsList.filter(
      (q) => q.date === today
    ).length;

    const feitas = reviewsEvaluatedToday + lessonsCompletedToday + questionsLoggedToday;
    const pendentes =
      todayReviewsData.totalDueCount +
      suggestedLessons.length +
      pendingQuestions.length;

    const total = feitas + pendentes;
    const percentage = total > 0 ? Math.round((feitas / total) * 100) : 100;

    return { feitas, pendentes, total, percentage };
  }, [
    reviewsList,
    progressList,
    questionLogsList,
    today,
    todayReviewsData.totalDueCount,
    suggestedLessons.length,
    pendingQuestions.length,
  ]);

  // Formatação da data de hoje para o cabeçalho
  const formattedTodayHeader = useMemo(() => {
    const [y, m, d] = today.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    return dateObj.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  }, [today]);

  const isDayEmpty =
    todayReviewsData.totalDueCount === 0 &&
    pendingQuestions.length === 0 &&
    suggestedLessons.length === 0;

  // Handlers
  const handleEvaluateReview = async (updatedReview: LessonReview) => {
    await db.reviews.put(updatedReview);
    setActiveReview(null);
  };

  const handleToggleMastered = async (lessonId: string, mastered: boolean) => {
    await setLessonMastered(lessonId, mastered);
  };

  const handleConcludeLesson = async (lessonId: string) => {
    await completeLesson(lessonId, today);
    setActiveQuestionsLessonId(lessonId);
  };

  const handleSaveQuestions = async (data: {
    total: number;
    correct: number;
    note?: string;
  }) => {
    if (!activeQuestionsLessonId) return;
    await addQuestionLog({
      lessonId: activeQuestionsLessonId,
      date: today,
      total: data.total,
      correct: data.correct,
      note: data.note,
    });
    setActiveQuestionsLessonId(null);
  };

  // SVG ring constants
  const radius = 24;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset =
    circumference - (dailyProgress.percentage / 100) * circumference;

  return (
    <div className="py-2 space-y-6 lg:space-y-0 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:grid-rows-[auto_1fr] lg:gap-x-6 lg:gap-y-6 lg:items-start">
      {/* 1. CABEÇALHO: data de hoje, sequência de dias, anel de progresso (PRD seção 3) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm lg:col-start-2 lg:row-start-1">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-indigo-400 capitalize">
              {formattedTodayHeader}
            </p>
            <h1 className="text-xl sm:text-2xl font-black text-slate-100 mt-0.5">
              Hoje
            </h1>

            {/* Sequência de dias */}
            {streak > 0 && (
              <div className="flex items-center gap-1.5 mt-2">
                <span className="text-xs font-semibold text-amber-400">
                  {streak} {streak === 1 ? 'dia consecutivo' : 'dias consecutivos'}
                </span>
              </div>
            )}
          </div>

          {/* Anel de Progresso do Dia */}
          <div className="flex flex-col items-center shrink-0">
            <div className="relative w-16 h-16 flex items-center justify-center">
              <svg className="w-16 h-16 transform -rotate-90">
                <circle
                  cx="32"
                  cy="32"
                  r={radius}
                  stroke="currentColor"
                  strokeWidth="5"
                  className="text-slate-800"
                  fill="transparent"
                />
                <circle
                  cx="32"
                  cy="32"
                  r={radius}
                  stroke="currentColor"
                  strokeWidth="5"
                  className="text-indigo-500 transition-all duration-500"
                  fill="transparent"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                />
              </svg>
              <span className="absolute text-xs font-bold text-slate-100">
                {dailyProgress.percentage}%
              </span>
            </div>
            <span className="text-[10px] text-slate-400 mt-1 font-medium">
              {dailyProgress.feitas}/{dailyProgress.total} tarefas
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-6 min-w-0 lg:col-start-1 lg:row-start-1 lg:row-span-2">
      {/* ESTADO VAZIO: Dia Livre */}
      {isDayEmpty && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center space-y-3">
          <h2 className="text-base font-bold text-slate-100">Tudo em dia</h2>
          <p className="text-xs text-slate-400 max-w-xs mx-auto">
            Você não tem revisões pendentes nem novas aulas programadas para hoje.
          </p>
          <button
            type="button"
            onClick={() => navigate('/conteudo')}
            className="py-2 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
          >
            Ver conteúdo
          </button>
        </div>
      )}

      {/* 2. REVISÕES */}
      {todayReviewsData.totalDueCount > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Revisões ({todayReviewsData.totalDueCount})
            </h2>
            {todayReviewsData.overdueCount > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-950 text-rose-300 border border-rose-800">
                {todayReviewsData.overdueCount} atrasada{todayReviewsData.overdueCount > 1 ? 's' : ''}
              </span>
            )}
          </div>

          <div className="divide-y divide-slate-800/80 rounded-xl overflow-hidden border border-slate-800 bg-slate-900 shadow-sm">
            {todayReviewsData.queue.map((review) => {
              const lesson = lessonById.get(review.lessonId);
              const isOverdue = review.dueDate < today;
              const availability = questionAvailability[review.lessonId] ?? 'checking';
              const questionsDisabled =
                availability === 'checking' || availability === 'no';
              const questionsTitle =
                availability === 'no'
                  ? 'Sem questões desta aula no banco'
                  : availability === 'checking'
                  ? 'Verificando questões…'
                  : 'Responder questões desta aula antes de avaliar';

              return (
                <div
                  key={review.lessonId}
                  onClick={() => setActiveReview(review)}
                  className="p-3.5 hover:bg-slate-800/60 cursor-pointer transition-colors group select-none"
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
                      {isOverdue ? (
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-rose-950 text-rose-300 border border-rose-800">
                          Venceu {formatDateBr(review.dueDate)}
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                          Hoje
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-bold text-slate-200 group-hover:text-slate-50 truncate">
                      {lesson?.title || review.lessonId}
                    </p>
                  </div>

                  <div
                    className="mt-2.5 grid grid-cols-2 gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => setActiveReview(review)}
                      className="py-1.5 px-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] sm:text-xs font-semibold transition-colors shadow-sm"
                    >
                      Revisar
                    </button>
                    <button
                      type="button"
                      disabled={questionsDisabled}
                      title={questionsTitle}
                      onClick={() => setQuestionsReview(review)}
                      className="py-1.5 px-2.5 rounded-lg border border-slate-700 bg-slate-950/60 text-slate-200 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-slate-950/60 text-[11px] sm:text-xs font-semibold transition-colors"
                    >
                      Revisar com questões
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* +N na fila */}
          {todayReviewsData.remainingCount > 0 && (
            <p className="text-center text-xs text-slate-500 italic">
              +{todayReviewsData.remainingCount} na fila (limite diário de {settings?.dailyReviewCap || 20})
            </p>
          )}
        </div>
      )}

      {/* 3. QUESTÕES PENDENTES */}
      {pendingQuestions.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Questões pendentes ({pendingQuestions.length})
            </h2>
          </div>

          <div className="divide-y divide-slate-800/80 rounded-xl overflow-hidden border border-slate-800 bg-slate-900 shadow-sm">
            {pendingQuestions.map((p) => {
              const lesson = lessonById.get(p.lessonId);
              if (!lesson) return null;

              return (
                <div
                  key={p.lessonId}
                  onClick={() => setActiveQuestionsLessonId(p.lessonId)}
                  className="p-3.5 flex items-center justify-between gap-3 hover:bg-slate-800/60 cursor-pointer transition-colors group select-none"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-200 group-hover:text-slate-50 truncate">
                      {lesson.title}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate mt-0.5">
                      {lesson.subjectName} • {lesson.volumeName}
                      {p.completedOn && ` • Concluída em ${formatDateBr(p.completedOn)}`}
                    </p>
                  </div>

                  <button
                    type="button"
                    className="py-1.5 px-3 bg-amber-600/90 group-hover:bg-amber-500 text-white rounded-lg text-xs font-semibold shrink-0 transition-colors shadow-sm"
                  >
                    Resolver
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. AULAS NOVAS */}
      {suggestedLessons.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Aulas sugeridas ({suggestedLessons.length})
            </h2>
            <span className="text-[11px] text-slate-500">
              {settings?.activeSubjects?.length || 0} ativas
            </span>
          </div>

          <div className="divide-y divide-slate-800/80 rounded-xl overflow-hidden border border-slate-800 bg-slate-900 shadow-sm">
            {suggestedLessons.map((lesson) => {
              return (
                <div
                  key={lesson.id}
                  className="p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:bg-slate-800/40 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-semibold px-2 py-0.2 rounded-full bg-slate-800 text-slate-300">
                        {lesson.subjectName}
                      </span>
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.2 rounded ${
                          lesson.kind === 'bonus'
                            ? 'bg-purple-950 text-purple-300 border border-purple-800'
                            : 'bg-indigo-950 text-indigo-300 border border-indigo-800'
                        }`}
                      >
                        {lesson.kind === 'bonus' ? 'Bônus' : 'Aula'}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-slate-100 truncate">
                      {lesson.title}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate mt-0.5">
                      {lesson.volumeName}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 pt-2 sm:pt-0">
                    {lessonMediaMap.has(lesson.id) ? (
                      <button
                        type="button"
                        onClick={() => {
                          const media = lessonMediaMap.get(lesson.id);
                          if (media?.driveVideoId) {
                            window.open(
                              `https://drive.google.com/file/d/${media.driveVideoId}/view`,
                              '_blank',
                              'noopener,noreferrer'
                            );
                          }
                        }}
                        title="Abrir aula diretamente no Google Drive"
                        className="flex-1 sm:flex-initial py-1.5 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>Assistir</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => navigate(`/conteudo?materia=${lesson.subjectId}&aula=${lesson.id}`)}
                        className="flex-1 sm:flex-initial py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
                      >
                        Começar
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleConcludeLesson(lesson.id)}
                      className="flex-1 sm:flex-initial py-1.5 px-3.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors shadow-sm"
                    >
                      Concluir
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      </div>

      {/* 5. PRÓXIMOS 7 DIAS (mini gráfico de barras) (PRD seção 3) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm space-y-3 lg:col-start-2 lg:row-start-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Próximos 7 dias
          </h2>
          <span className="text-[11px] text-slate-500">
            {forecast7Days.reduce((acc, d) => acc + d.count, 0)} revisões
          </span>
        </div>

        {/* Mini gráfico de barras */}
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2 pt-2 items-end h-28">
          {forecast7Days.map((item) => {
            const heightPercent =
              item.count > 0
                ? Math.max(12, Math.round((item.count / maxForecastCount) * 100))
                : 6;

            return (
              <div
                key={item.date}
                className="flex flex-col items-center justify-end h-full gap-1 group"
                title={`${item.dayLabel} (${formatDateBr(item.date)}): ${item.count} revisão(ões)`}
              >
                <span className="text-[10px] font-bold text-slate-400 group-hover:text-indigo-400 transition-colors">
                  {item.count}
                </span>
                <div className="w-full bg-slate-800/80 rounded-t-lg overflow-hidden h-16 flex items-end">
                  <div
                    className={`w-full rounded-t-lg transition-all duration-300 ${
                      item.count > 0
                        ? 'bg-indigo-500 group-hover:bg-indigo-400'
                        : 'bg-slate-800'
                    }`}
                    style={{ height: `${heightPercent}%` }}
                  />
                </div>
                <span className="text-[10px] font-semibold text-slate-400 truncate max-w-full">
                  {item.dayLabel}
                </span>
              </div>
            );
          })}
        </div>
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
          onReviewWithQuestions={() => {
            setQuestionsReview(activeReview);
            setActiveReview(null);
          }}
          canReviewWithQuestions={
            questionAvailability[activeReview.lessonId] !== 'no' &&
            questionAvailability[activeReview.lessonId] !== 'checking'
          }
        />
      )}

      {/* Sessão de questões antes de avaliar a revisão */}
      {questionsReview && (() => {
        const lesson = lessonById.get(questionsReview.lessonId);
        if (!lesson) return null;

        return (
          <ReviewQuestionsModal
            isOpen={true}
            lesson={lesson}
            review={questionsReview}
            onClose={() => setQuestionsReview(null)}
            onEvaluate={handleEvaluateReview}
          />
        );
      })()}

      {/* Modal Tela Cheia de Registro de Questões */}
      {activeQuestionsLessonId && (() => {
        const lesson = allLessons.find((l) => l.id === activeQuestionsLessonId);
        if (!lesson) return null;

        return (
          <PostLessonQuestionsModal
            isOpen={true}
            lesson={lesson}
            onClose={() => setActiveQuestionsLessonId(null)}
            onSave={handleSaveQuestions}
          />
        );
      })()}
    </div>
  );
};

export default HojePage;
