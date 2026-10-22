import React, { useState, useMemo } from 'react';
import { db } from '../../db';
import { useLiveQuery } from '../../db/useLiveQuery';
import { curriculum, allLessons, lessonById } from '../../data/curriculum';
import {
  calculateSubjectAccuracyRankings,
  calculateOverallQuestionsStats,
} from '../../core/content';
import { getPendingQuestions } from '../../core/todayQueue';
import { formatDateBr, getLocalDateString } from '../../core/dates';
import {
  addQuestionLog,
  deleteQuestionLog,
  DEFAULT_SETTINGS,
} from '../../db/operations';
import { PostLessonQuestionsModal } from '../../components/PostLessonQuestionsModal';
import { ConfirmModal } from '../../components/ConfirmModal';
import type {
  QuestionLog,
  LessonProgress,
  VolumeLink,
  UserSettings,
} from '../../db/schema';

export const QuestoesPage: React.FC = () => {
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

  const questionLogs = useLiveQuery<QuestionLog[]>(
    () => db.questionLogs.toArray(),
    [],
    []
  );

  const progressList = useLiveQuery<LessonProgress[]>(
    () => db.progress.toArray(),
    [],
    []
  );

  const volumeLinksList = useLiveQuery<VolumeLink[]>(
    () => db.volumeLinks.toArray(),
    [],
    []
  );

  // States
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>('todos');
  const [activeQuestionsLessonId, setActiveQuestionsLessonId] = useState<string | null>(null);
  const [logToDelete, setLogToDelete] = useState<QuestionLog | null>(null);
  const [showPendingSection, setShowPendingSection] = useState(true);

  // Maps
  const progressMap = useMemo(() => {
    const map = new Map<string, LessonProgress>();
    for (const p of progressList) {
      map.set(p.lessonId, p);
    }
    return map;
  }, [progressList]);

  const volumeLinksMap = useMemo(() => {
    const map = new Map<string, VolumeLink>();
    for (const vl of volumeLinksList) {
      map.set(vl.volumeId, vl);
    }
    return map;
  }, [volumeLinksList]);

  const lessonSubjectMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of allLessons) {
      map.set(l.id, l.subjectId);
    }
    return map;
  }, []);

  // 1. Resumo geral
  const overallStats = useMemo(() => {
    return calculateOverallQuestionsStats(questionLogs);
  }, [questionLogs]);

  // 2. Atalho para Questões Pendentes
  const pendingLessons = useMemo(() => {
    return getPendingQuestions({ progressList, questionLogs });
  }, [progressList, questionLogs]);

  // 3. Acerto por matéria, em barras, ordenado do menor para o maior (PRD seção 8)
  const subjectRankings = useMemo(() => {
    return calculateSubjectAccuracyRankings(
      curriculum.subjects,
      questionLogs,
      lessonSubjectMap
    );
  }, [questionLogs, lessonSubjectMap]);

  // 4. Lista de registros por data
  const filteredLogs = useMemo(() => {
    let list = [...questionLogs];

    if (selectedSubjectFilter !== 'todos') {
      list = list.filter((log) => {
        const subId = lessonSubjectMap.get(log.lessonId);
        return subId === selectedSubjectFilter;
      });
    }

    // Ordenado por data decrescente (mais recente primeiro), depois por id desc
    return list.sort((a, b) => {
      const dateCmp = b.date.localeCompare(a.date);
      if (dateCmp !== 0) return dateCmp;
      return (b.id || 0) - (a.id || 0);
    });
  }, [questionLogs, selectedSubjectFilter, lessonSubjectMap]);

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

  const handleConfirmDeleteLog = async () => {
    if (logToDelete && logToDelete.id !== undefined) {
      await deleteQuestionLog(logToDelete.id);
    }
    setLogToDelete(null);
  };

  return (
    <div className="py-2 space-y-5 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-5 lg:items-start">
      {/* 1. Resumo Geral (PRD seção 8) */}
      <div className="bg-gradient-to-br from-indigo-950/70 via-slate-900 to-slate-900 border border-indigo-900/40 rounded-xl p-4 shadow-sm space-y-3 lg:col-span-2">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
              Desempenho Geral
            </span>
            <h1 className="text-xl font-bold text-slate-100">Questões Realizadas</h1>
          </div>
          <div className="text-right">
            <span className="text-2xl font-black text-indigo-400">
              {overallStats.percentage}%
            </span>
            <span className="block text-[11px] text-slate-400">
              {overallStats.totalCorrect}/{overallStats.totalQuestions} acertos
            </span>
          </div>
        </div>

        {/* Barra de Progresso de Acerto */}
        <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              overallStats.percentage < 60
                ? 'bg-rose-500'
                : overallStats.percentage < 80
                ? 'bg-amber-500'
                : 'bg-emerald-500'
            }`}
            style={{ width: `${overallStats.percentage}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-slate-800/60">
          <span>{overallStats.totalSessions} sessões registradas</span>
          <span>{subjectRankings.length} matérias com questões</span>
        </div>
      </div>

      {/* 2. Atalho para Questões Pendentes (PRD seção 8) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">📋</span>
            <h2 className="text-sm font-bold text-slate-100">Questões Pendentes</h2>
            {pendingLessons.length > 0 ? (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800">
                {pendingLessons.length}
              </span>
            ) : (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800">
                Tudo em dia
              </span>
            )}
          </div>

          {pendingLessons.length > 0 && (
            <button
              type="button"
              onClick={() => setShowPendingSection(!showPendingSection)}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
            >
              {showPendingSection ? 'Ocultar' : 'Ver todas'}
            </button>
          )}
        </div>

        {pendingLessons.length > 0 ? (
          showPendingSection && (
            <div className="space-y-2 pt-1">
              <p className="text-xs text-slate-400">
                Aulas concluídas que ainda não possuem registro de questões:
              </p>
              <div className="divide-y divide-slate-800/80 rounded-lg overflow-hidden border border-slate-800 bg-slate-950/40">
                {pendingLessons.map((p) => {
                  const lesson = lessonById.get(p.lessonId);
                  if (!lesson) return null;

                  return (
                    <div
                      key={p.lessonId}
                      className="p-3 flex items-center justify-between gap-3 hover:bg-slate-800/40 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-200 truncate">
                          {lesson.title}
                        </p>
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">
                          {lesson.subjectName} • {lesson.volumeName}
                          {p.completedOn && ` • Concluída em ${formatDateBr(p.completedOn)}`}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => setActiveQuestionsLessonId(p.lessonId)}
                        className="py-1.5 px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shrink-0 transition-colors shadow-sm"
                      >
                        Registrar
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )
        ) : (
          <p className="text-xs text-slate-400 py-1">
            Nenhuma aula concluída aguardando questões no momento.
          </p>
        )}
      </div>

      {/* 3. Acerto por matéria, em barras, ordenado do menor para o maior (PRD seção 8) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
            <span>📊</span>
            <span>Acerto por Matéria (Menor para Maior)</span>
          </h2>
          <span className="text-[11px] text-slate-400">
            {subjectRankings.length} matéria(s)
          </span>
        </div>

        {subjectRankings.length > 0 ? (
          <div className="space-y-3 pt-1">
            {subjectRankings.map((stat) => {
              return (
                <div key={stat.subjectId} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 truncate">
                      <span className="font-semibold text-slate-200 truncate">
                        {stat.subjectName}
                      </span>
                      {stat.isWeak && (
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-rose-950 text-rose-300 border border-rose-800 shrink-0">
                          Tema Fraco
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-slate-400 text-[11px]">
                        {stat.correct}/{stat.total}
                      </span>
                      <span
                        className={`font-bold ${
                          stat.isWeak
                            ? 'text-rose-400'
                            : stat.percentage < 80
                            ? 'text-amber-400'
                            : 'text-emerald-400'
                        }`}
                      >
                        {stat.percentage}%
                      </span>
                    </div>
                  </div>

                  {/* Barra de porcentagem colorida */}
                  <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        stat.isWeak
                          ? 'bg-rose-500'
                          : stat.percentage < 80
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                      }`}
                      style={{ width: `${stat.percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-xs text-slate-500 italic py-2 text-center">
            Nenhum registro de questões registrado ainda.
          </div>
        )}
      </div>

      {/* 4. Lista de registros por data (PRD seção 8) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm space-y-3 lg:col-span-2">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
            <span>📝</span>
            <span>Histórico de Registros ({filteredLogs.length})</span>
          </h2>

          {/* Filtro por matéria */}
          <select
            value={selectedSubjectFilter}
            onChange={(e) => setSelectedSubjectFilter(e.target.value)}
            className="bg-slate-950 border border-slate-700 text-xs text-slate-200 rounded-lg px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="todos">Todas as matérias</option>
            {curriculum.subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {filteredLogs.length > 0 ? (
          <div className="divide-y divide-slate-800/80 rounded-lg overflow-hidden border border-slate-800 bg-slate-950/40">
            {filteredLogs.map((log) => {
              const lesson = lessonById.get(log.lessonId);
              const percentage =
                log.total > 0 ? Math.round((log.correct / log.total) * 100) : 0;
              const isWeak = percentage < 60;

              return (
                <div key={log.id} className="p-3.5 space-y-2 hover:bg-slate-850/30 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[11px] text-slate-400 font-medium">
                          {formatDateBr(log.date)}
                        </span>
                        {lesson && (
                          <span className="text-[10px] font-semibold px-2 py-0.2 rounded-full bg-slate-800 text-slate-300">
                            {lesson.subjectName}
                          </span>
                        )}
                        {isWeak && (
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-rose-950 text-rose-300 border border-rose-800">
                            Fraca
                          </span>
                        )}
                      </div>

                      <h3 className="text-xs font-bold text-slate-100 truncate">
                        {lesson?.title || log.lessonId}
                      </h3>
                      {lesson?.volumeName && (
                        <p className="text-[11px] text-slate-400 truncate">
                          {lesson.volumeName}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <span
                          className={`text-sm font-bold ${
                            isWeak ? 'text-rose-400' : 'text-emerald-400'
                          }`}
                        >
                          {log.correct}/{log.total}
                        </span>
                        <span className="block text-[11px] text-slate-400">
                          {percentage}%
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => setLogToDelete(log)}
                        className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                        title="Excluir este registro"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {log.note && (
                    <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800 text-[11px] text-slate-300 italic">
                      "{log.note}"
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-xs text-slate-500 italic py-4 text-center">
            Nenhum registro encontrado para o filtro selecionado.
          </div>
        )}
      </div>

      {/* Modal Tela Cheia de Registro de Questões */}
      {activeQuestionsLessonId && (() => {
        const lesson = allLessons.find((l) => l.id === activeQuestionsLessonId);
        if (!lesson) return null;

        return (
          <PostLessonQuestionsModal
            isOpen={true}
            lesson={{
              ...lesson,
              lessonUrl: progressMap.get(lesson.id)?.questionsUrl,
              volumeUrl: volumeLinksMap.get(lesson.volumeId)?.questionsUrl,
            }}
            globalQuestionsTemplate={settings?.questionsUrlTemplate}
            onClose={() => setActiveQuestionsLessonId(null)}
            onSave={handleSaveQuestions}
          />
        );
      })()}

      {/* Confirmação de Exclusão de Registro */}
      <ConfirmModal
        isOpen={Boolean(logToDelete)}
        title="Excluir registro de questões?"
        message="Deseja excluir este registro de desempenho? O percentual da matéria será recalculado."
        confirmText="Excluir"
        cancelText="Cancelar"
        variant="danger"
        onConfirm={handleConfirmDeleteLog}
        onCancel={() => setLogToDelete(null)}
      />
    </div>
  );
};

export default QuestoesPage;
