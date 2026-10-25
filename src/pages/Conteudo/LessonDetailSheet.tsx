import React, { useEffect, useState, useRef } from 'react';
import { motion, useReducedMotion, useDragControls } from 'framer-motion';
import { db } from '../../db';
import { useLiveQuery } from '../../db/useLiveQuery';
import { lessonById, volumeById, subjectById } from '../../data/curriculum';
import {
  setLessonStatus,
  saveLessonNotes,
  setLessonMastered,
  completeLesson,
  uncompleteLesson,
} from '../../db/operations';
import { ConfirmModal } from '../../components/ConfirmModal';
import { DriveViewerModal } from '../../components/DriveViewerModal';
import type {
  LessonProgress,
  LessonReview,
  QuestionLog,
  LessonStatus,
  LessonMedia,
  VolumeMedia,
} from '../../db/schema';
import {
  calculateAccuracy,
  isReviewOverdue,
} from '../../core/content';
import { formatDateBr } from '../../core/dates';

interface LessonDetailSheetProps {
  lessonId: string | null;
  onClose: () => void;
  today: string;
  progressMap: Map<string, LessonProgress>;
  reviewsMap: Map<string, LessonReview>;
  questionLogsMap: Map<string, QuestionLog[]>;
  onOpenQuestionsModal?: (lessonId: string) => void;
}

export const LessonDetailSheet: React.FC<LessonDetailSheetProps> = ({
  lessonId,
  onClose,
  today,
  progressMap,
  reviewsMap,
  questionLogsMap,
  onOpenQuestionsModal,
}) => {
  const shouldReduceMotion = useReducedMotion();
  const dragControls = useDragControls();
  const lesson = lessonId ? lessonById.get(lessonId) : null;
  const progress = lessonId ? progressMap.get(lessonId) : undefined;
  const review = lessonId ? reviewsMap.get(lessonId) : undefined;
  const logs = lessonId ? questionLogsMap.get(lessonId) || [] : [];
  const volume = lesson ? volumeById.get(lesson.volumeId) : undefined;
  const subject = lesson ? subjectById.get(lesson.subjectId) : undefined;

  const [notes, setNotes] = useState('');
  const [showUncompleteConfirm, setShowUncompleteConfirm] = useState(false);
  const [pendingStatusChange, setPendingStatusChange] = useState<LessonStatus | null>(null);

  // Mídia do Google Drive
  const lessonMedia = useLiveQuery<LessonMedia | undefined>(
    () => (lessonId ? db.lessonMedia.get(lessonId) : Promise.resolve(undefined)),
    [lessonId],
    undefined
  );
  const volumeMedia = useLiveQuery<VolumeMedia | undefined>(
    () => (lesson?.volumeId ? db.volumeMedia.get(lesson.volumeId) : Promise.resolve(undefined)),
    [lesson?.volumeId],
    undefined
  );
  const [viewerTab, setViewerTab] = useState<'video' | 'pdf' | null>(null);

  const notesRef = useRef(notes);
  notesRef.current = notes;

  // Carrega anotações da aula
  useEffect(() => {
    setNotes(progress?.notes || '');
  }, [lessonId, progress?.notes]);

  // Salva automaticamente notas com debounce para nunca perder digitação
  useEffect(() => {
    if (!lessonId) return;
    const timer = setTimeout(() => {
      if (notes !== (progress?.notes || '')) {
        saveLessonNotes(lessonId, notes);
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [lessonId, notes, progress?.notes]);

  // Garante salvar notas no unmount
  useEffect(() => {
    return () => {
      if (lessonId && notesRef.current !== (progress?.notes || '')) {
        saveLessonNotes(lessonId, notesRef.current);
      }
    };
  }, [lessonId, progress?.notes]);

  // Tecla Escape para fechar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!lesson) {
    return null;
  }

  const currentStatus: LessonStatus = progress?.status || 'nao_vista';
  const isMastered = Boolean(progress?.mastered || review?.mastered);
  const accuracy = calculateAccuracy(logs);

  const handleStatusChange = async (newStatus: LessonStatus) => {
    if (!lesson) return;

    if (newStatus === 'concluida' && currentStatus !== 'concluida') {
      await completeLesson(lesson.id, today);
      if (onOpenQuestionsModal) {
        onOpenQuestionsModal(lesson.id);
      }
    } else if (currentStatus === 'concluida' && newStatus !== 'concluida') {
      setPendingStatusChange(newStatus);
      setShowUncompleteConfirm(true);
    } else {
      await setLessonStatus(lesson.id, newStatus, today);
    }
  };

  const handleConfirmUncomplete = async () => {
    if (!lesson || !pendingStatusChange) return;
    await uncompleteLesson(lesson.id, pendingStatusChange);
    setShowUncompleteConfirm(false);
    setPendingStatusChange(null);
  };

  const handleCancelUncomplete = () => {
    setShowUncompleteConfirm(false);
    setPendingStatusChange(null);
  };

  const handleToggleMastered = async () => {
    await setLessonMastered(lesson.id, !isMastered);
  };

  const overdue = review?.dueDate ? isReviewOverdue(review.dueDate, today) : false;
  // Botão dominada só é exibido quando faz sentido (aula concluída ou com revisão ativa)
  const showMasteredOption = currentStatus === 'concluida' || Boolean(review) || isMastered;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-stretch sm:justify-end">
      {/* Backdrop com fade suave estilo iOS */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Painel com gesto de arrastar para fechar (Bottom Sheet no celular, Slide no desktop) */}
      <motion.div
        drag="y"
        dragListener={false}
        dragControls={dragControls}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.5 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 90 || info.velocity.y > 400) {
            onClose();
          }
        }}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={
          shouldReduceMotion
            ? { duration: 0 }
            : { type: 'spring', damping: 32, stiffness: 350, mass: 0.8 }
        }
        className="relative w-full sm:max-w-lg bg-slate-900 border-t sm:border-t-0 sm:border-l border-slate-800 rounded-t-3xl sm:rounded-none h-[88vh] sm:h-full overflow-y-auto flex flex-col shadow-2xl z-10"
      >
        {/* Barra de puxar no topo (iOS Drag Handle) */}
        <div
          className="sm:hidden pt-3 pb-2 flex justify-center cursor-grab active:cursor-grabbing touch-none select-none"
          onPointerDown={(e) => dragControls.start(e)}
        >
          <div className="w-12 h-1.5 rounded-full bg-slate-600/80 active:bg-slate-400 transition-colors" />
        </div>

        {/* Header */}
        <div className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur-md px-5 py-3.5 border-b border-slate-800 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                {subject?.name || 'Matéria'}
              </span>
              <span className="text-xs text-slate-500">•</span>
              <span className="text-xs text-slate-400 truncate max-w-[180px]">
                {volume?.name || 'Volume'}
              </span>
              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                  lesson.kind === 'bonus'
                    ? 'bg-purple-900/50 text-purple-300 border border-purple-700/50'
                    : 'bg-indigo-900/50 text-indigo-300 border border-indigo-700/50'
                }`}
              >
                {lesson.kind === 'bonus' ? 'Bônus' : 'Aula'}
              </span>
              {accuracy.isWeak && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-950/70 text-rose-300 border border-rose-800/60">
                  Tema fraco
                </span>
              )}
              {isMastered && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-950/70 text-amber-300 border border-amber-800/60">
                  Dominada
                </span>
              )}
            </div>
            <h2 className="text-base sm:text-lg font-bold text-slate-100 leading-snug">
              {lesson.title}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 -mr-1 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition-colors"
            title="Fechar"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body content */}
        <div className="p-5 space-y-4 flex-1">
          {/* Mídia do Google Drive (Assistir / Apostila) */}
          {(lessonMedia?.driveVideoId || volumeMedia?.drivePdfId) && (
            <div className="bg-indigo-950/30 p-3.5 rounded-xl border border-indigo-900/40 space-y-2.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 block">
                Material no Google Drive
              </span>
              <div className="flex gap-2">
                {lessonMedia?.driveVideoId && (
                  <button
                    type="button"
                    onClick={() => setViewerTab('video')}
                    className="flex-1 py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Assistir aula</span>
                  </button>
                )}
                {volumeMedia?.drivePdfId && (
                  <button
                    type="button"
                    onClick={() => setViewerTab('pdf')}
                    className="flex-1 py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border border-slate-700/60"
                  >
                    <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                    <span>Ler apostila</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Status selector (3 estados) */}
          <div className="bg-slate-800/50 p-3.5 rounded-xl border border-slate-700/50">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Status da aula
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleStatusChange('nao_vista')}
                className={`py-2 px-3 rounded-lg text-xs font-medium transition-all ${
                  currentStatus === 'nao_vista'
                    ? 'bg-slate-700 text-slate-50 shadow-sm ring-1 ring-slate-500'
                    : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                Não vista
              </button>
              <button
                type="button"
                onClick={() => handleStatusChange('assistindo')}
                className={`py-2 px-3 rounded-lg text-xs font-medium transition-all ${
                  currentStatus === 'assistindo'
                    ? 'bg-blue-600 text-white shadow-sm ring-1 ring-blue-400'
                    : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                Assistindo
              </button>
              <button
                type="button"
                onClick={() => handleStatusChange('concluida')}
                className={`py-2 px-3 rounded-lg text-xs font-medium transition-all ${
                  currentStatus === 'concluida'
                    ? 'bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-400'
                    : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                Concluída
              </button>
            </div>
            {progress?.completedOn && currentStatus === 'concluida' && (
              <p className="text-[11px] text-slate-400 mt-2">
                Concluída em: {formatDateBr(progress.completedOn)}
              </p>
            )}
          </div>

          {/* Revisão Espaçada e Dominado */}
          <div className="bg-slate-800/50 p-3.5 rounded-xl border border-slate-700/50 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Revisão Espaçada
              </span>
              {/* Botão discreto de 'Marcar como dominada' - Item 5 */}
              {showMasteredOption && (
                <button
                  type="button"
                  onClick={handleToggleMastered}
                  className={`text-[11px] font-medium px-2.5 py-0.5 rounded-md border transition-all ${
                    isMastered
                      ? 'bg-amber-950/70 text-amber-300 border-amber-800 hover:bg-slate-800'
                      : 'bg-slate-900/80 text-slate-400 border-slate-700 hover:text-amber-300 hover:border-amber-700/60'
                  }`}
                  title="Encerra ou reativa o agendamento de revisões espaçadas para esta aula"
                >
                  {isMastered ? 'Dominada ✓' : 'Dominar'}
                </button>
              )}
            </div>

            {review ? (
              <div className="space-y-1.5 pt-0.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Passo da escada:</span>
                  <span className="font-semibold text-slate-200">
                    Passo {review.step} de 4
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Próxima revisão:</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-slate-200">
                      {formatDateBr(review.dueDate)}
                    </span>
                    {overdue && (
                      <span className="text-[10px] uppercase font-bold px-1.5 py-0.2 rounded bg-rose-950 text-rose-300 border border-rose-800">
                        Atrasada
                      </span>
                    )}
                    {review.dueDate === today && (
                      <span className="text-[10px] uppercase font-bold px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800">
                        Hoje
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-400 bg-slate-900/40 p-2.5 rounded-lg border border-slate-800">
                Nenhuma revisão ativa agendada.
              </div>
            )}
          </div>

          {/* Anotações em texto livre com salvamento automático */}
          <div className="bg-slate-800/50 p-3.5 rounded-xl border border-slate-700/50 space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Anotações da aula
              </label>
              <span className="text-[10px] text-slate-500">Salvo automaticamente</span>
            </div>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anote aqui pontos-chave, dúvidas, esquemas mentais..."
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-y"
            />
          </div>

          {/* Histórico de questões da aula */}
          <div className="bg-slate-800/50 p-3.5 rounded-xl border border-slate-700/50 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Histórico de questões
              </span>
              {logs.length > 0 && (
                <span className="text-xs font-semibold text-slate-200">
                  {accuracy.correct}/{accuracy.total} ({accuracy.percentage}%)
                </span>
              )}
            </div>

            {logs.length > 0 ? (
              <div className="space-y-2">
                {logs.map((log, index) => {
                  const itemPct = log.total > 0 ? Math.round((log.correct / log.total) * 100) : 0;
                  return (
                    <div
                      key={log.id || index}
                      className="bg-slate-900/70 p-2.5 rounded-lg border border-slate-800 text-xs flex flex-col gap-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 font-medium">
                          {formatDateBr(log.date)}
                        </span>
                        <span
                          className={`font-semibold ${
                            itemPct >= 60 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {log.correct}/{log.total} ({itemPct}%)
                        </span>
                      </div>
                      {log.note && (
                        <p className="text-slate-300 text-[11px] italic bg-slate-950/40 p-1.5 rounded">
                          "{log.note}"
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs text-slate-500 italic py-1">
                Nenhum registro de questões para esta aula ainda.
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Modal de Confirmação para Desmarcar Aula Concluída (PRD seção 5 item 4) */}
      <ConfirmModal
        isOpen={showUncompleteConfirm}
        title="Desmarcar aula concluída?"
        message="Ao desmarcar esta aula como concluída, a revisão ativa associada será removida. Deseja continuar?"
        confirmText="Desmarcar e remover revisão"
        cancelText="Voltar"
        variant="warning"
        onConfirm={handleConfirmUncomplete}
        onCancel={handleCancelUncomplete}
      />

      {/* Visualizador do Google Drive (Vídeo / PDF) */}
      {viewerTab && (
        <DriveViewerModal
          isOpen={true}
          onClose={() => setViewerTab(null)}
          title={lesson.title}
          subtitle={`${subject?.name || ''}${volume?.name ? ` • ${volume.name}` : ''}`}
          driveVideoId={lessonMedia?.driveVideoId}
          videoName={lessonMedia?.videoName}
          drivePdfId={volumeMedia?.drivePdfId}
          pdfName={volumeMedia?.pdfName}
          initialTab={viewerTab}
        />
      )}
    </div>
  );
};
