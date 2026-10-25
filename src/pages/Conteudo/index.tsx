import React, { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { curriculum, allLessons, subjectById, type LessonKind } from '../../data/curriculum';
import { db } from '../../db';
import { useLiveQuery } from '../../db/useLiveQuery';
import {
  DEFAULT_SETTINGS,
  toggleApostilaPage,
  setAllApostilaPages,
  addQuestionLog,
} from '../../db/operations';
import { PostLessonQuestionsModal } from '../../components/PostLessonQuestionsModal';
import type {
  LessonProgress,
  LessonReview,
  QuestionLog,
  ApostilaProgress,
  UserSettings,
  LessonStatus,
} from '../../db/schema';
import {
  calculateSubjectProgress,
  isReviewOverdue,
} from '../../core/content';
import { getLocalDateString } from '../../core/dates';
import { SubjectDetail } from './SubjectDetail';
import { LessonDetailSheet } from './LessonDetailSheet';
import { useMediaQuery } from '../../hooks/useMediaQuery';

export const ConteudoPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  // Navigation state via search params
  const selectedSubjectId = searchParams.get('materia');
  const selectedLessonId = searchParams.get('aula');

  // Filters state (barra de busca removida conforme Item 1)
  const [statusFilter, setStatusFilter] = useState<'todos' | LessonStatus>('todos');
  const [kindFilter, setKindFilter] = useState<'todos' | LessonKind>('todos');
  const [activeQuestionsLessonId, setActiveQuestionsLessonId] = useState<string | null>(null);

  const today = useMemo(() => getLocalDateString(), []);

  // Live queries from IndexedDB
  const settings = useLiveQuery<UserSettings>(
    async () => {
      const s = await db.settings.get('default');
      return s || DEFAULT_SETTINGS;
    },
    [],
    DEFAULT_SETTINGS
  );

  const progressList = useLiveQuery<LessonProgress[]>(
    () => db.progress.toArray(),
    [],
    []
  );

  const reviewsList = useLiveQuery<LessonReview[]>(
    () => db.reviews.toArray(),
    [],
    []
  );

  const questionLogsList = useLiveQuery<QuestionLog[]>(
    () => db.questionLogs.toArray(),
    [],
    []
  );

  const apostilaList = useLiveQuery<ApostilaProgress[]>(
    () => db.apostila.toArray(),
    [],
    []
  );

  // Indexed maps for O(1) lookups
  const progressMap = useMemo(() => {
    const map = new Map<string, LessonProgress>();
    for (const p of progressList) {
      map.set(p.lessonId, p);
    }
    return map;
  }, [progressList]);

  const reviewsMap = useMemo(() => {
    const map = new Map<string, LessonReview>();
    for (const r of reviewsList) {
      map.set(r.lessonId, r);
    }
    return map;
  }, [reviewsList]);

  const questionLogsMap = useMemo(() => {
    const map = new Map<string, QuestionLog[]>();
    for (const log of questionLogsList) {
      const existing = map.get(log.lessonId);
      if (existing) {
        existing.push(log);
      } else {
        map.set(log.lessonId, [log]);
      }
    }
    return map;
  }, [questionLogsList]);

  const apostilaMap = useMemo(() => {
    const map = new Map<string, Set<number>>();
    for (const item of apostilaList) {
      if (item.completed) {
        let set = map.get(item.volumeId);
        if (!set) {
          set = new Set<number>();
          map.set(item.volumeId, set);
        }
        set.add(item.page);
      }
    }
    return map;
  }, [apostilaList]);

  // Overall statistics
  const overallStats = useMemo(() => {
    const allAulas = allLessons.filter((l) => l.kind === 'aula');
    const completedAulas = allAulas.filter(
      (l) => progressMap.get(l.id)?.status === 'concluida'
    ).length;
    const percentage =
      allAulas.length > 0 ? Math.round((completedAulas / allAulas.length) * 100) : 0;
    return {
      total: allAulas.length,
      completed: completedAulas,
      percentage,
    };
  }, [progressMap]);

  // Navigation handlers
  const handleSelectSubject = (subjectId: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('materia', subjectId);
      next.delete('aula');
      return next;
    });
  };

  const handleBackToSubjects = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('materia');
      next.delete('aula');
      return next;
    });
  };

  const handleSelectLesson = (lessonId: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('aula', lessonId);
      return next;
    });
  };

  const handleCloseLessonSheet = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('aula');
      return next;
    });
  };

  const handleToggleApostilaPage = async (volumeId: string, page: number) => {
    await toggleApostilaPage(volumeId, page, today);
  };

  const handleSetAllApostila = async (
    volumeId: string,
    pages: number[],
    completed: boolean
  ) => {
    await setAllApostilaPages(volumeId, pages, completed, today);
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

  const selectedSubject = selectedSubjectId
    ? subjectById.get(selectedSubjectId)
    : undefined;

  const subjectDetailEl = selectedSubject ? (
    <SubjectDetail
      subject={selectedSubject}
      onBack={handleBackToSubjects}
      hideBack={isDesktop}
      today={today}
      progressMap={progressMap}
      reviewsMap={reviewsMap}
      questionLogsMap={questionLogsMap}
      apostilaMap={apostilaMap}
      settings={settings}
      statusFilter={statusFilter}
      kindFilter={kindFilter}
      onSelectLesson={handleSelectLesson}
      onOpenQuestionsModal={(id) => setActiveQuestionsLessonId(id)}
      onToggleApostilaPage={handleToggleApostilaPage}
      onSetAllApostila={handleSetAllApostila}
    />
  ) : null;

  return (
    <div className="py-2 space-y-4">
      {/* Barra de Filtros: Status e Tipo (sem barra de busca) */}
      <div className="flex flex-col sm:flex-row gap-2 pt-0.5">
        {/* Filtro de Status */}
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mr-1 shrink-0">
            Status:
          </span>
          {(
            [
              { label: 'Todos', value: 'todos' },
              { label: 'Não vista', value: 'nao_vista' },
              { label: 'Assistindo', value: 'assistindo' },
              { label: 'Concluída', value: 'concluida' },
            ] as const
          ).map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setStatusFilter(item.value)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                statusFilter === item.value
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Filtro de Tipo */}
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mr-1 shrink-0">
            Tipo:
          </span>
          {(
            [
              { label: 'Todos', value: 'todos' },
              { label: 'Aulas', value: 'aula' },
              { label: 'Bônus', value: 'bonus' },
            ] as const
          ).map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setKindFilter(item.value)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                kindFilter === item.value
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Conteúdo Principal */}
      {isDesktop ? (
        /* VISÃO EM COLUNAS (computador): lista de matérias à esquerda, matéria aberta à direita */
        <div className="grid grid-cols-[300px_minmax(0,1fr)] gap-5 items-start">
          <aside
            aria-label="Matérias"
            className="sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto rounded-xl border border-slate-800 bg-slate-900 p-2"
          >
            <div className="px-2.5 pt-1.5 pb-2.5">
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Matérias
                </span>
                <span className="text-[11px] text-slate-400 tabular-nums">
                  {overallStats.completed}/{overallStats.total} aulas
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                  style={{ width: `${overallStats.percentage}%` }}
                />
              </div>
            </div>

            {curriculum.subjects.map((subject) => {
              const lessonsOfSub = subject.volumes.flatMap((v) => v.lessons);
              const prog = calculateSubjectProgress(lessonsOfSub, progressMap);
              const overdue = lessonsOfSub.filter((l) => {
                const r = reviewsMap.get(l.id);
                return r && !r.mastered && isReviewOverdue(r.dueDate, today);
              }).length;
              const selected = subject.id === selectedSubjectId;

              return (
                <button
                  key={subject.id}
                  type="button"
                  onClick={() => handleSelectSubject(subject.id)}
                  aria-current={selected ? 'true' : undefined}
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                    selected ? 'bg-indigo-600 text-white' : 'text-slate-100 hover:bg-slate-800'
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate">{subject.name}</span>
                  {overdue > 0 && (
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${selected ? 'bg-white' : 'bg-rose-500'}`}
                      title={`${overdue} revisão(ões) vencida(s)`}
                    />
                  )}
                  <span
                    className={`shrink-0 text-[11px] tabular-nums ${
                      selected ? 'text-white/90' : 'text-slate-400'
                    }`}
                  >
                    {prog.completedAulas}/{prog.totalAulas}
                  </span>
                  <svg
                    className={`h-3 w-3 shrink-0 ${selected ? 'text-white/90' : 'text-slate-500'}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              );
            })}
          </aside>

          <section className="min-w-0">
            {selectedSubject ? (
              subjectDetailEl
            ) : (
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-10 text-center space-y-1.5">
                <p className="text-sm font-semibold text-slate-100">Selecione uma matéria</p>
                <p className="text-xs text-slate-400">
                  Escolha uma matéria na lista para ver volumes, aulas, bônus e apostila.
                </p>
              </div>
            )}
          </section>
        </div>
      ) : selectedSubject ? (
        /* VISÃO DA MATÉRIA SELECIONADA */
        subjectDetailEl
      ) : (
        /* VISÃO DE TODAS AS MATÉRIAS EM CARTÕES */
        <div className="space-y-4">
          {/* Card Resumo Geral */}
          <div className="bg-gradient-to-br from-indigo-950/60 to-slate-900 border border-indigo-900/40 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
                  Progresso Geral
                </span>
                <h1 className="text-lg font-bold text-slate-100 mt-0.5">
                  Conteúdo
                </h1>
              </div>
              <div className="text-right">
                <span className="text-2xl font-black text-indigo-400">
                  {overallStats.percentage}%
                </span>
                <span className="block text-[11px] text-slate-400">
                  {overallStats.completed}/{overallStats.total} aulas
                </span>
              </div>
            </div>

            <div className="w-full bg-slate-800/80 h-2 rounded-full overflow-hidden">
              <div
                className="bg-indigo-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${overallStats.percentage}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-xs text-slate-400 mt-2.5 pt-2 border-t border-slate-800/60">
              <span>{curriculum.subjects.length} matérias</span>
              <span>
                {settings?.activeSubjects?.length || 0} ativas
              </span>
            </div>
          </div>

          {/* Lista de Matérias em Cartões */}
          <div className="space-y-2.5">
            <div className="px-1 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-400">
              <span>Matérias</span>
              <span>Conclusão</span>
            </div>

            {curriculum.subjects.map((subject) => {
              const allLessonsOfSub = subject.volumes.flatMap((v) => v.lessons);
              const subProgress = calculateSubjectProgress(
                allLessonsOfSub,
                progressMap
              );
              const isActive = Boolean(
                settings?.activeSubjects?.includes(subject.id)
              );

              const overdueCount = allLessonsOfSub.filter((l) => {
                const r = reviewsMap.get(l.id);
                return r && !r.mastered && isReviewOverdue(r.dueDate, today);
              }).length;

              return (
                <div
                  key={subject.id}
                  onClick={() => handleSelectSubject(subject.id)}
                  className="bg-slate-900 border border-slate-800/90 hover:border-slate-700 rounded-xl p-4 shadow-sm hover:bg-slate-850 cursor-pointer transition-all active:scale-[0.99] group select-none"
                >
                  <div className="flex items-start justify-between gap-3 mb-2.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {isActive && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-950/90 text-emerald-300 border border-emerald-700/80">
                            Ativa
                          </span>
                        )}

                        {overdueCount > 0 && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-950 text-rose-300 border border-rose-800 animate-pulse">
                            {overdueCount} vencida{overdueCount > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>

                      <h2 className="text-base font-bold text-slate-100 group-hover:text-indigo-300 transition-colors truncate">
                        {subject.name}
                      </h2>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-sm font-bold text-slate-100">
                        {subProgress.percentAulas}%
                      </span>
                      <span className="block text-[11px] text-slate-400">
                        {subProgress.completedAulas}/{subProgress.totalAulas} aulas
                      </span>
                    </div>
                  </div>

                  <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden mb-2">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        subProgress.percentAulas === 100
                          ? 'bg-emerald-500'
                          : 'bg-indigo-500'
                      }`}
                      style={{ width: `${subProgress.percentAulas}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                    <span>{subject.volumes.length} volume(s)</span>
                    <span className="text-indigo-400 group-hover:translate-x-1 transition-transform inline-flex items-center gap-1 font-medium">
                      Ver volumes
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Folha Deslizante de Detalhes da Aula */}
      {selectedLessonId && (
        <LessonDetailSheet
          lessonId={selectedLessonId}
          onClose={handleCloseLessonSheet}
          today={today}
          progressMap={progressMap}
          reviewsMap={reviewsMap}
          questionLogsMap={questionLogsMap}
          onOpenQuestionsModal={(id) => setActiveQuestionsLessonId(id)}
        />
      )}

      {/* Modal Tela Cheia de Questões Desta Aula */}
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

export default ConteudoPage;
