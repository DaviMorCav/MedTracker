import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { VolumeWithSubject, LessonKind } from '../../data/curriculum';
import type {
  LessonProgress,
  LessonReview,
  QuestionLog,
  LessonStatus,
  VolumeMedia,
  ApostilaMedia,
} from '../../db/schema';
import { db } from '../../db';
import { useLiveQuery } from '../../db/useLiveQuery';
import { ApostilaGrid } from './ApostilaGrid';
import { calculateAccuracy, isReviewOverdue } from '../../core/content';
import { formatDateBr } from '../../core/dates';
import { completeLesson, uncompleteLesson } from '../../db/operations';
import { ConfirmModal } from '../../components/ConfirmModal';
import { DriveViewerModal } from '../../components/DriveViewerModal';

interface VolumeAccordionProps {
  volume: VolumeWithSubject;
  isOpen: boolean;
  onToggle: () => void;
  progressMap: Map<string, LessonProgress>;
  reviewsMap: Map<string, LessonReview>;
  questionLogsMap: Map<string, QuestionLog[]>;
  apostilaMarkedPages: Set<number>;
  statusFilter: 'todos' | LessonStatus;
  kindFilter: 'todos' | LessonKind;
  today: string;
  onSelectLesson: (lessonId: string) => void;
  onOpenQuestionsModal?: (lessonId: string) => void;
  onToggleApostilaPage: (volumeId: string, page: number) => void;
  onSetAllApostila: (volumeId: string, pages: number[], completed: boolean) => void;
}

export const VolumeAccordion: React.FC<VolumeAccordionProps> = ({
  volume,
  isOpen,
  onToggle,
  progressMap,
  reviewsMap,
  questionLogsMap,
  apostilaMarkedPages,
  statusFilter,
  kindFilter,
  today,
  onSelectLesson,
  onOpenQuestionsModal,
  onToggleApostilaPage,
  onSetAllApostila,
}) => {
  const [confirmUncompleteLessonId, setConfirmUncompleteLessonId] = useState<string | null>(null);
  const [showPdfViewer, setShowPdfViewer] = useState(false);

  // Mídia do volume (Google Drive PDF)
  const volumeMedia = useLiveQuery<VolumeMedia | undefined>(
    () => db.volumeMedia.get(volume.id),
    [volume.id],
    undefined
  );

  // Mídia dos itens de apostila (Google Drive vídeos por página/item)
  const apostilaMediaItems = useLiveQuery<ApostilaMedia[]>(
    () => db.apostilaMedia.where('volumeId').equals(volume.id).toArray(),
    [volume.id],
    []
  );

  const driveItemsMap = useMemo(() => {
    const map = new Map<number, string>();
    if (apostilaMediaItems) {
      for (const item of apostilaMediaItems) {
        map.set(item.page, item.driveFileId);
      }
    }
    return map;
  }, [apostilaMediaItems]);

  const aulas = volume.lessons.filter((l) => l.kind === 'aula');
  const bonus = volume.lessons.filter((l) => l.kind === 'bonus');

  // Filter lessons based on status and kind
  const matchesLesson = (lesson: { id: string; title: string; kind: LessonKind }) => {
    const status = progressMap.get(lesson.id)?.status || 'nao_vista';
    const matchesStatus = statusFilter === 'todos' || status === statusFilter;
    const matchesKind = kindFilter === 'todos' || lesson.kind === kindFilter;
    return matchesStatus && matchesKind;
  };

  const filteredAulas = aulas.filter(matchesLesson);
  const filteredBonus = bonus.filter(matchesLesson);

  const completedAulasCount = aulas.filter(
    (l) => progressMap.get(l.id)?.status === 'concluida'
  ).length;

  const completedBonusCount = bonus.filter(
    (l) => progressMap.get(l.id)?.status === 'concluida'
  ).length;

  const completedApostilaCount = volume.apostila.filter((p) =>
    apostilaMarkedPages.has(p)
  ).length;

  // Overdue reviews in this volume
  const overdueReviewsCount = volume.lessons.filter((l) => {
    const r = reviewsMap.get(l.id);
    return r && !r.mastered && isReviewOverdue(r.dueDate, today);
  }).length;

  const handleToggleLessonCompletion = async (
    lessonId: string,
    currentStatus: LessonStatus
  ) => {
    if (currentStatus === 'concluida') {
      setConfirmUncompleteLessonId(lessonId);
    } else {
      await completeLesson(lessonId, today);
      if (onOpenQuestionsModal) {
        onOpenQuestionsModal(lessonId);
      }
    }
  };

  const handleConfirmUncomplete = async () => {
    if (confirmUncompleteLessonId) {
      await uncompleteLesson(confirmUncompleteLessonId, 'nao_vista');
      setConfirmUncompleteLessonId(null);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden transition-all shadow-sm">
      {/* Header do Acordeão */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left p-4 flex items-center justify-between gap-3 hover:bg-slate-800/50 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-semibold text-slate-100 text-sm truncate">
              {volume.name}
            </span>
            {overdueReviewsCount > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-950 text-rose-300 border border-rose-800 animate-pulse">
                {overdueReviewsCount} atrasada{overdueReviewsCount > 1 ? 's' : ''}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400 flex-wrap">
            <span>
              Aulas: {completedAulasCount}/{aulas.length}
            </span>
            {bonus.length > 0 && (
              <>
                <span>•</span>
                <span>
                  Bônus: {completedBonusCount}/{bonus.length}
                </span>
              </>
            )}
            {volume.apostila.length > 0 && (
              <>
                <span>•</span>
                <span>
                  Apostila: {completedApostilaCount}/{volume.apostila.length}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 text-slate-400">
          <svg
            className={`w-5 h-5 transform transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-indigo-400' : ''
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Conteúdo Expansível do Volume com transição fluida */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: { duration: 0.28, ease: [0.32, 0.72, 0, 1] },
              opacity: { duration: 0.2, ease: 'easeOut' },
            }}
            className="overflow-hidden"
          >
            <div className="p-4 pt-2 border-t border-slate-800/80 bg-slate-950/40 space-y-4">
              {/* Botão Clean 'Abrir apostila' acima das aulas - Item 2 */}
              <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                <button
                  type="button"
                  onClick={() => setShowPdfViewer(true)}
                  className="inline-flex items-center gap-2 py-1.5 px-3 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-all border border-slate-700/60 shadow-sm active:scale-95"
                >
                  <svg className="w-4 h-4 text-indigo-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                  <span>Abrir apostila</span>
                </button>
                <span className="text-[11px] text-slate-500 truncate max-w-xs">
                  {volumeMedia?.pdfName || volume.pdf}
                </span>
              </div>

              {/* Seção 1: AULAS */}
              {(kindFilter === 'todos' || kindFilter === 'aula') && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-400 px-1">
                    <span>Aulas ({filteredAulas.length})</span>
                  </div>

                  {filteredAulas.length > 0 ? (
                    <div className="divide-y divide-slate-800/60 rounded-xl overflow-hidden border border-slate-800/80 bg-slate-900/70">
                      {filteredAulas.map((aula) => {
                        const prog = progressMap.get(aula.id);
                        const rev = reviewsMap.get(aula.id);
                        const logs = questionLogsMap.get(aula.id) || [];
                        const status = prog?.status || 'nao_vista';
                        const accuracy = calculateAccuracy(logs);
                        const isOverdue = rev && !rev.mastered && isReviewOverdue(rev.dueDate, today);

                        return (
                          <div
                            key={aula.id}
                            onClick={() => onSelectLesson(aula.id)}
                            className="p-3 flex items-center justify-between gap-3 hover:bg-slate-800/60 cursor-pointer transition-colors group select-none active:scale-[0.99]"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              {/* Botão interativo de status */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleLessonCompletion(aula.id, status);
                                }}
                                className="shrink-0 focus:outline-none"
                                title={
                                  status === 'concluida'
                                    ? 'Aula concluída. Clique para desmarcar.'
                                    : 'Marcar como concluída e abrir questões.'
                                }
                              >
                                {status === 'concluida' ? (
                                  <div className="w-6 h-6 rounded-full bg-emerald-950 border border-emerald-600 flex items-center justify-center text-emerald-400 hover:scale-105 transition-transform">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                    </svg>
                                  </div>
                                ) : status === 'assistindo' ? (
                                  <div className="w-6 h-6 rounded-full bg-blue-950 border border-blue-500 flex items-center justify-center text-blue-400 hover:scale-105 transition-transform">
                                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                                      <path d="M8 5v14l11-7z" />
                                    </svg>
                                  </div>
                                ) : (
                                  <div className="w-6 h-6 rounded-full border border-slate-700 bg-slate-800/60 hover:border-emerald-500 hover:scale-105 transition-all" />
                                )}
                              </button>

                              {/* Título e etiquetas */}
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-slate-200 group-hover:text-slate-50 truncate">
                                  {aula.title}
                                </p>
                                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
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
                                  {rev && !rev.mastered && (
                                    <span
                                      className={`text-[10px] font-medium px-1.5 py-0.2 rounded ${
                                        isOverdue
                                          ? 'bg-rose-950/80 text-rose-300 border border-rose-800'
                                          : 'bg-slate-800 text-slate-400'
                                      }`}
                                    >
                                      Rev: {formatDateBr(rev.dueDate)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Chevron right */}
                            <svg
                              className="w-4 h-4 text-slate-500 group-hover:text-slate-300 shrink-0 transition-transform group-hover:translate-x-0.5"
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
                    <p className="text-xs text-slate-500 italic px-2 py-1">
                      Nenhuma aula encontrada com os filtros atuais.
                    </p>
                  )}
                </div>
              )}

              {/* Seção 2: BÔNUS */}
              {bonus.length > 0 && (kindFilter === 'todos' || kindFilter === 'bonus') && (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-purple-400 px-1">
                    <span>Bônus ({filteredBonus.length})</span>
                  </div>

                  {filteredBonus.length > 0 ? (
                    <div className="divide-y divide-slate-800/60 rounded-xl overflow-hidden border border-slate-800/80 bg-slate-900/70">
                      {filteredBonus.map((b) => {
                        const prog = progressMap.get(b.id);
                        const rev = reviewsMap.get(b.id);
                        const logs = questionLogsMap.get(b.id) || [];
                        const status = prog?.status || 'nao_vista';
                        const accuracy = calculateAccuracy(logs);
                        const isOverdue = rev && !rev.mastered && isReviewOverdue(rev.dueDate, today);

                        return (
                          <div
                            key={b.id}
                            onClick={() => onSelectLesson(b.id)}
                            className="p-3 flex items-center justify-between gap-3 hover:bg-slate-800/60 cursor-pointer transition-colors group select-none active:scale-[0.99]"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              {/* Botão interativo de status */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleLessonCompletion(b.id, status);
                                }}
                                className="shrink-0 focus:outline-none"
                                title={
                                  status === 'concluida'
                                    ? 'Bônus concluído. Clique para desmarcar.'
                                    : 'Marcar como concluído e abrir questões.'
                                }
                              >
                                {status === 'concluida' ? (
                                  <div className="w-6 h-6 rounded-full bg-emerald-950 border border-emerald-600 flex items-center justify-center text-emerald-400 hover:scale-105 transition-transform">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                    </svg>
                                  </div>
                                ) : status === 'assistindo' ? (
                                  <div className="w-6 h-6 rounded-full bg-blue-950 border border-blue-500 flex items-center justify-center text-blue-400 hover:scale-105 transition-transform">
                                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                                      <path d="M8 5v14l11-7z" />
                                    </svg>
                                  </div>
                                ) : (
                                  <div className="w-6 h-6 rounded-full border border-purple-900/70 bg-slate-800/60 hover:border-emerald-500 hover:scale-105 transition-all" />
                                )}
                              </button>

                              {/* Título e etiquetas */}
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-slate-200 group-hover:text-slate-50 truncate">
                                  {b.title}
                                </p>
                                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                  <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-purple-950 text-purple-300 border border-purple-800">
                                    Bônus
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
                                  {rev && !rev.mastered && (
                                    <span
                                      className={`text-[10px] font-medium px-1.5 py-0.2 rounded ${
                                        isOverdue
                                          ? 'bg-rose-950/80 text-rose-300 border border-rose-800'
                                          : 'bg-slate-800 text-slate-400'
                                      }`}
                                    >
                                      Rev: {formatDateBr(rev.dueDate)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Chevron right */}
                            <svg
                              className="w-4 h-4 text-slate-500 group-hover:text-slate-300 shrink-0 transition-transform group-hover:translate-x-0.5"
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
                    <p className="text-xs text-slate-500 italic px-2 py-1">
                      Nenhum bônus encontrado com os filtros atuais.
                    </p>
                  )}
                </div>
              )}

              {/* Seção 3: APOSTILA - Grade de números clicáveis (Item 3) */}
              {volume.apostila.length > 0 && (
                <ApostilaGrid
                  volumeId={volume.id}
                  apostilaNumbers={volume.apostila}
                  markedPages={apostilaMarkedPages}
                  drivePdfId={volumeMedia?.drivePdfId}
                  driveItemsMap={driveItemsMap}
                  onOpenPdf={() => setShowPdfViewer(true)}
                  onTogglePage={onToggleApostilaPage}
                  onSetAll={onSetAllApostila}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirmação para desmarcar aula concluída (PRD seção 5 item 4) */}
      <ConfirmModal
        isOpen={Boolean(confirmUncompleteLessonId)}
        title="Desmarcar aula concluída?"
        message="Ao desmarcar esta aula como concluída, a revisão ativa associada será removida. Deseja continuar?"
        confirmText="Desmarcar e remover revisão"
        cancelText="Voltar"
        variant="warning"
        onConfirm={handleConfirmUncomplete}
        onCancel={() => setConfirmUncompleteLessonId(null)}
      />

      {/* Visualizador de PDF da Apostila via Google Drive */}
      {showPdfViewer && (
        <DriveViewerModal
          isOpen={true}
          onClose={() => setShowPdfViewer(false)}
          title={volume.name}
          subtitle="Apostila em PDF"
          drivePdfId={volumeMedia?.drivePdfId}
          pdfName={volumeMedia?.pdfName || volume.pdf}
          initialTab="pdf"
        />
      )}
    </div>
  );
};
