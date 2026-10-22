import React, { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { curriculum, allLessons, subjectById, type LessonKind } from '../../data/curriculum';
import { db } from '../../db';
import { useLiveQuery } from '../../db/useLiveQuery';
import {
  DEFAULT_SETTINGS,
  toggleApostilaPage,
  setAllApostilaPages,
} from '../../db/operations';
import type {
  LessonProgress,
  LessonReview,
  QuestionLog,
  ApostilaProgress,
  VolumeLink,
  UserSettings,
  LessonStatus,
} from '../../db/schema';
import {
  calculateSubjectProgress,
  calculateAccuracy,
  isReviewOverdue,
} from '../../core/content';
import { getLocalDateString } from '../../core/dates';
import { SubjectDetail } from './SubjectDetail';
import { LessonDetailSheet } from './LessonDetailSheet';

export const ConteudoPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Navigation state via search params
  const selectedSubjectId = searchParams.get('materia');
  const selectedLessonId = searchParams.get('aula');

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | LessonStatus>('todos');
  const [kindFilter, setKindFilter] = useState<'todos' | LessonKind>('todos');

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

  const volumeLinksList = useLiveQuery<VolumeLink[]>(
    () => db.volumeLinks.toArray(),
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

  const volumeLinksMap = useMemo(() => {
    const map = new Map<string, VolumeLink>();
    for (const vl of volumeLinksList) {
      map.set(vl.volumeId, vl);
    }
    return map;
  }, [volumeLinksList]);

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

  // Global search filtering across all lessons
  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];

    return allLessons.filter((lesson) => {
      const matchesTitle = lesson.title.toLowerCase().includes(query);
      const status = progressMap.get(lesson.id)?.status || 'nao_vista';
      const matchesStatus = statusFilter === 'todos' || status === statusFilter;
      const matchesKind = kindFilter === 'todos' || lesson.kind === kindFilter;
      return matchesTitle && matchesStatus && matchesKind;
    });
  }, [searchQuery, statusFilter, kindFilter, progressMap]);

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

  const selectedSubject = selectedSubjectId
    ? subjectById.get(selectedSubjectId)
    : undefined;

  const isSearchActive = searchQuery.trim().length > 0;

  return (
    <div className="py-2 space-y-4">
      {/* Barra de Pesquisa e Filtros */}
      <div className="space-y-2.5">
        {/* Campo de Busca por título */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar aula por título em todo o MEDCURSO..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-9 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all shadow-inner"
          />

          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200"
              title="Limpar busca"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Barra de Filtros: Status e Tipo */}
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
      </div>

      {/* Conteúdo Principal */}
      {isSearchActive ? (
        /* VISÃO DE RESULTADOS DA BUSCA */
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs px-1">
            <span className="font-semibold text-slate-400 uppercase tracking-wider">
              Resultados da busca ({searchResults.length})
            </span>
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="text-xs text-indigo-400 hover:text-indigo-300"
            >
              Limpar busca
            </button>
          </div>

          {searchResults.length > 0 ? (
            <div className="divide-y divide-slate-800/80 rounded-2xl overflow-hidden border border-slate-800 bg-slate-900 shadow-sm">
              {searchResults.map((lesson) => {
                const prog = progressMap.get(lesson.id);
                const rev = reviewsMap.get(lesson.id);
                const logs = questionLogsMap.get(lesson.id) || [];
                const status = prog?.status || 'nao_vista';
                const accuracy = calculateAccuracy(logs);
                const isOverdue =
                  rev && !rev.mastered && isReviewOverdue(rev.dueDate, today);

                return (
                  <div
                    key={lesson.id}
                    onClick={() => handleSelectLesson(lesson.id)}
                    className="p-3.5 flex items-center justify-between gap-3 hover:bg-slate-800/60 cursor-pointer transition-colors group select-none"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Ícone de status */}
                      <div className="shrink-0">
                        {status === 'concluida' ? (
                          <div className="w-6 h-6 rounded-full bg-emerald-950 border border-emerald-600 flex items-center justify-center text-emerald-400">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        ) : status === 'assistindo' ? (
                          <div className="w-6 h-6 rounded-full bg-blue-950 border border-blue-500 flex items-center justify-center text-blue-400">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          </div>
                        ) : (
                          <div className="w-6 h-6 rounded-full border border-slate-700 bg-slate-800/60" />
                        )}
                      </div>

                      {/* Info da aula */}
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-200 group-hover:text-white truncate">
                          {lesson.title}
                        </p>
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">
                          {lesson.subjectName} • {lesson.volumeName}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span
                            className={`text-[10px] font-semibold px-1.5 py-0.2 rounded ${
                              lesson.kind === 'bonus'
                                ? 'bg-purple-950 text-purple-300 border border-purple-800'
                                : 'bg-slate-800 text-slate-300 border border-slate-700'
                            }`}
                          >
                            {lesson.kind === 'bonus' ? 'Bônus' : 'Aula'}
                          </span>
                          {accuracy.isWeak && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-rose-950 text-rose-300 border border-rose-800">
                              Fraca
                            </span>
                          )}
                          {(prog?.mastered || rev?.mastered) && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800">
                              Dominada
                            </span>
                          )}
                          {isOverdue && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-rose-950 text-rose-300 border border-rose-800">
                              Rev. Atrasada
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <svg
                      className="w-4 h-4 text-slate-500 group-hover:text-slate-300 shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-400 space-y-2">
              <svg className="w-8 h-8 mx-auto text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm font-medium text-slate-300">Nenhuma aula encontrada</p>
              <p className="text-xs text-slate-500">
                Tente buscar por outro termo ou ajuste os filtros acima.
              </p>
            </div>
          )}
        </div>
      ) : selectedSubject ? (
        /* VISÃO DA MATÉRIA SELECIONADA */
        <SubjectDetail
          subject={selectedSubject}
          onBack={handleBackToSubjects}
          today={today}
          progressMap={progressMap}
          reviewsMap={reviewsMap}
          questionLogsMap={questionLogsMap}
          apostilaMap={apostilaMap}
          volumeLinksMap={volumeLinksMap}
          settings={settings}
          statusFilter={statusFilter}
          kindFilter={kindFilter}
          searchQuery={searchQuery}
          onSelectLesson={handleSelectLesson}
          onToggleApostilaPage={handleToggleApostilaPage}
          onSetAllApostila={handleSetAllApostila}
        />
      ) : (
        /* VISÃO DE TODAS AS MATÉRIAS EM CARTÕES */
        <div className="space-y-4">
          {/* Card Resumo Geral */}
          <div className="bg-gradient-to-br from-indigo-950/60 to-slate-900 border border-indigo-900/40 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
                  Progresso Geral
                </span>
                <h1 className="text-lg font-bold text-slate-100 mt-0.5">
                  Conteúdo MEDCURSO
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
              <span>{curriculum.subjects.length} matérias no currículo</span>
              <span>
                {settings?.activeSubjects?.length || 0} matéria(s) ativa(s)
              </span>
            </div>
          </div>

          {/* Lista de Matérias em Cartões (PRD seção 4) */}
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

              // Contagem de revisões vencidas desta matéria (PRD seção 4)
              const overdueCount = allLessonsOfSub.filter((l) => {
                const r = reviewsMap.get(l.id);
                return r && !r.mastered && isReviewOverdue(r.dueDate, today);
              }).length;

              return (
                <div
                  key={subject.id}
                  onClick={() => handleSelectSubject(subject.id)}
                  className="bg-slate-900 border border-slate-800/90 hover:border-slate-700 rounded-2xl p-4 shadow-sm hover:bg-slate-850 cursor-pointer transition-all active:scale-[0.99] group select-none"
                >
                  <div className="flex items-start justify-between gap-3 mb-2.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {/* Selo "Ativa" (PRD seção 4) */}
                        {isActive && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-950/90 text-emerald-300 border border-emerald-700/80">
                            Ativa
                          </span>
                        )}

                        {/* Contagem de revisões vencidas (PRD seção 4) */}
                        {overdueCount > 0 && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-950 text-rose-300 border border-rose-800 animate-pulse">
                            {overdueCount} vencida{overdueCount > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>

                      {/* Nome da matéria */}
                      <h2 className="text-base font-bold text-slate-100 group-hover:text-indigo-300 transition-colors truncate">
                        {subject.name}
                      </h2>
                    </div>

                    {/* Porcentagem e contagem de aulas */}
                    <div className="text-right shrink-0">
                      <span className="text-sm font-bold text-slate-100">
                        {subProgress.percentAulas}%
                      </span>
                      <span className="block text-[11px] text-slate-400">
                        {subProgress.completedAulas}/{subProgress.totalAulas} aulas
                      </span>
                    </div>
                  </div>

                  {/* Barra de Progresso da Matéria (PRD seção 4) */}
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

                  {/* Rodapé do cartão com volumes e chevron */}
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

      {/* Folha Deslizante de Detalhes da Aula (PRD seção 4) */}
      {selectedLessonId && (
        <LessonDetailSheet
          lessonId={selectedLessonId}
          onClose={handleCloseLessonSheet}
          today={today}
          progressMap={progressMap}
          reviewsMap={reviewsMap}
          questionLogsMap={questionLogsMap}
          volumeLinksMap={volumeLinksMap}
          settings={settings}
        />
      )}
    </div>
  );
};

export default ConteudoPage;
