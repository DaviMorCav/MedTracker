import React, { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { Subject, LessonKind } from '../../types/curriculum';
import type {
  LessonProgress,
  LessonReview,
  QuestionLog,
  UserSettings,
  LessonStatus,
} from '../../db/schema';
import { VolumeAccordion } from './VolumeAccordion';
import { calculateSubjectProgress, isReviewOverdue } from '../../core/content';
import { toggleSubjectActive } from '../../db/operations';
import { volumeById } from '../../data/curriculum';

interface SubjectDetailProps {
  subject: Subject;
  onBack: () => void;
  hideBack?: boolean;
  today: string;
  progressMap: Map<string, LessonProgress>;
  reviewsMap: Map<string, LessonReview>;
  questionLogsMap: Map<string, QuestionLog[]>;
  apostilaMap: Map<string, Set<number>>;
  settings?: UserSettings;
  statusFilter: 'todos' | LessonStatus;
  kindFilter: 'todos' | LessonKind;
  onSelectLesson: (lessonId: string) => void;
  onOpenQuestionsModal?: (lessonId: string) => void;
  onToggleApostilaPage: (volumeId: string, page: number) => void;
  onSetAllApostila: (volumeId: string, pages: number[], completed: boolean) => void;
}

export const SubjectDetail: React.FC<SubjectDetailProps> = ({
  subject,
  onBack,
  hideBack = false,
  today,
  progressMap,
  reviewsMap,
  questionLogsMap,
  apostilaMap,
  settings,
  statusFilter,
  kindFilter,
  onSelectLesson,
  onOpenQuestionsModal,
  onToggleApostilaPage,
  onSetAllApostila,
}) => {
  const shouldReduceMotion = useReducedMotion();
  // Set of open volume IDs, initialize with the first volume open
  const [openVolumeIds, setOpenVolumeIds] = useState<Set<string>>(
    () => new Set(subject.volumes.length > 0 ? [subject.volumes[0].id] : [])
  );

  const isActive = Boolean(settings?.activeSubjects?.includes(subject.id));

  // Flatten all lessons of this subject to compute progress and overdue counts
  const allSubjectLessons = subject.volumes.flatMap((v) => v.lessons);
  const progressStats = calculateSubjectProgress(allSubjectLessons, progressMap);

  const overdueCount = allSubjectLessons.filter((l) => {
    const r = reviewsMap.get(l.id);
    return r && !r.mastered && isReviewOverdue(r.dueDate, today);
  }).length;

  const toggleVolume = (volumeId: string) => {
    setOpenVolumeIds((prev) => {
      const next = new Set(prev);
      if (next.has(volumeId)) {
        next.delete(volumeId);
      } else {
        next.add(volumeId);
      }
      return next;
    });
  };

  const expandAll = () => {
    setOpenVolumeIds(new Set(subject.volumes.map((v) => v.id)));
  };

  const collapseAll = () => {
    setOpenVolumeIds(new Set());
  };

  const handleToggleActive = async () => {
    await toggleSubjectActive(subject.id);
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: shouldReduceMotion ? 0 : 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: shouldReduceMotion ? 0 : -12 }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.22, ease: [0.32, 0.72, 0, 1] }}
      className="space-y-4"
    >
      {/* Botão Voltar (só no celular; no computador a lista fica ao lado) */}
      {!hideBack && (
        <div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-400 hover:text-indigo-300 py-1 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span>Todas as Matérias</span>
          </button>
        </div>
      )}

      {/* Cartão de Cabeçalho da Matéria */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <button
                type="button"
                onClick={handleToggleActive}
                className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border transition-all ${
                  isActive
                    ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700 hover:bg-emerald-900'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                }`}
                title="Clique para alternar se a matéria está ativa no rodízio de estudos"
              >
                {isActive ? '✓ Matéria Ativa' : '+ Ativar matéria'}
              </button>

              {overdueCount > 0 && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-950 text-rose-300 border border-rose-800 animate-pulse">
                  {overdueCount} revisão(ões) atrasada(s)
                </span>
              )}
            </div>

            <h1 className="text-xl sm:text-2xl font-bold text-slate-100">{subject.name}</h1>
          </div>

          <div className="text-right shrink-0">
            <span className="text-xl sm:text-2xl font-bold text-slate-100">
              {progressStats.percentAulas}%
            </span>
            <span className="block text-[11px] text-slate-400">
              {progressStats.completedAulas}/{progressStats.totalAulas} aulas
            </span>
          </div>
        </div>

        {/* Barra de Progresso */}
        <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
          <div
            className="bg-indigo-500 h-full rounded-full transition-all duration-300"
            style={{ width: `${progressStats.percentAulas}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-xs text-slate-400 pt-0.5">
          <span>{subject.volumes.length} volume(s)</span>
          {progressStats.totalBonus > 0 && (
            <span>
              Bônus: {progressStats.completedBonus}/{progressStats.totalBonus}
            </span>
          )}
        </div>
      </div>

      {/* Barra de Ações dos Volumes */}
      <div className="flex items-center justify-between px-1 text-xs">
        <span className="font-semibold text-slate-400 uppercase tracking-wider">
          Volumes ({subject.volumes.length})
        </span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={expandAll}
            className="text-slate-400 hover:text-slate-200 transition-colors"
          >
            Expandir todos
          </button>
          <span className="text-slate-600">•</span>
          <button
            type="button"
            onClick={collapseAll}
            className="text-slate-400 hover:text-slate-200 transition-colors"
          >
            Recolher todos
          </button>
        </div>
      </div>

      {/* Lista de Volumes em Acordeão */}
      <div className="space-y-3">
        {subject.volumes.map((volume) => {
          const volWithSub = volumeById.get(volume.id) || {
            ...volume,
            subjectId: subject.id,
            subjectName: subject.name,
          };
          const markedPages = apostilaMap.get(volume.id) || new Set<number>();

          return (
            <VolumeAccordion
              key={volume.id}
              volume={volWithSub}
              isOpen={openVolumeIds.has(volume.id)}
              onToggle={() => toggleVolume(volume.id)}
              progressMap={progressMap}
              reviewsMap={reviewsMap}
              questionLogsMap={questionLogsMap}
              apostilaMarkedPages={markedPages}
              statusFilter={statusFilter}
              kindFilter={kindFilter}
              today={today}
              onSelectLesson={onSelectLesson}
              onOpenQuestionsModal={onOpenQuestionsModal}
              onToggleApostilaPage={onToggleApostilaPage}
              onSetAllApostila={onSetAllApostila}
            />
          );
        })}
      </div>
    </motion.div>
  );
};
