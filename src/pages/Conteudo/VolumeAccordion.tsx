import React, { useState } from 'react';
import type { VolumeWithSubject, LessonKind } from '../../data/curriculum';
import type {
  LessonProgress,
  LessonReview,
  QuestionLog,
  LessonStatus,
} from '../../db/schema';
import { ApostilaGrid } from './ApostilaGrid';
import { calculateAccuracy, isReviewOverdue } from '../../core/content';
import { formatDateBr } from '../../core/dates';
import { saveVolumeQuestionsUrl, completeLesson, uncompleteLesson } from '../../db/operations';
import { ConfirmModal } from '../../components/ConfirmModal';

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
  searchQuery: string;
  today: string;
  volumeLink?: string;
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
  searchQuery,
  today,
  volumeLink = '',
  onSelectLesson,
  onOpenQuestionsModal,
  onToggleApostilaPage,
  onSetAllApostila,
}) => {
  const [showVolumeLinkModal, setShowVolumeLinkModal] = useState(false);
  const [editingVolumeLink, setEditingVolumeLink] = useState(volumeLink);
  const [confirmUncompleteLessonId, setConfirmUncompleteLessonId] = useState<string | null>(null);

  const aulas = volume.lessons.filter((l) => l.kind === 'aula');
  const bonus = volume.lessons.filter((l) => l.kind === 'bonus');

  // Filter lessons based on status, kind and search query
  const matchesLesson = (lesson: { id: string; title: string; kind: LessonKind }) => {
    const status = progressMap.get(lesson.id)?.status || 'nao_vista';
    const matchesStatus = statusFilter === 'todos' || status === statusFilter;
    const matchesKind = kindFilter === 'todos' || lesson.kind === kindFilter;
    const matchesQuery =
      !searchQuery || lesson.title.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesKind && matchesQuery;
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

  const handleSaveVolumeLink = async () => {
    await saveVolumeQuestionsUrl(volume.id, editingVolumeLink);
    setShowVolumeLinkModal(false);
  };

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

      {/* Conteúdo Expansível do Volume */}
      {isOpen && (
        <div className="p-4 pt-1 border-t border-slate-800/80 bg-slate-950/40 space-y-4">
          {/* Barra de utilitários do volume: PDF e Link de Questões */}
          <div className="flex items-center justify-between text-xs py-2 border-b border-slate-800/60 flex-wrap gap-2">
            <div className="flex items-center gap-1.5 text-slate-400 truncate max-w-xs">
              <svg className="w-4 h-4 text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <span className="truncate" title={volume.pdf}>
                {volume.pdf}
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                setEditingVolumeLink(volumeLink);
                setShowVolumeLinkModal(true);
              }}
              className="text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1 text-[11px]"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              <span>{volumeLink ? 'Link do volume configurado' : 'Configurar link do volume'}</span>
            </button>
          </div>

          {/* Modal / Editor de Link de Questões do Volume */}
          {showVolumeLinkModal && (
            <div className="bg-slate-900 p-3 rounded-lg border border-indigo-900/60 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300">
                  Link de questões padrão para este volume:
                </label>
                <button
                  type="button"
                  onClick={() => setShowVolumeLinkModal(false)}
                  className="text-xs text-slate-400 hover:text-slate-200"
                >
                  ✕
                </button>
              </div>
              <input
                type="url"
                value={editingVolumeLink}
                onChange={(e) => setEditingVolumeLink(e.target.value)}
                placeholder="https://suaplataforma.com/questoes/volume-..."
                className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowVolumeLinkModal(false)}
                  className="px-2.5 py-1 rounded text-xs text-slate-400 hover:text-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveVolumeLink}
                  className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-medium"
                >
                  Salvar
                </button>
              </div>
            </div>
          )}

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
                        className="p-3 flex items-center justify-between gap-3 hover:bg-slate-800/60 cursor-pointer transition-colors group select-none"
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
                            <p className="text-xs font-medium text-slate-200 group-hover:text-white truncate">
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
                        className="p-3 flex items-center justify-between gap-3 hover:bg-slate-800/60 cursor-pointer transition-colors group select-none"
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
                            <p className="text-xs font-medium text-slate-200 group-hover:text-white truncate">
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

          {/* Seção 3: APOSTILA */}
          {volume.apostila.length > 0 && (
            <ApostilaGrid
              volumeId={volume.id}
              apostilaNumbers={volume.apostila}
              markedPages={apostilaMarkedPages}
              onTogglePage={onToggleApostilaPage}
              onSetAll={onSetAllApostila}
            />
          )}
        </div>
      )}

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
    </div>
  );
};
