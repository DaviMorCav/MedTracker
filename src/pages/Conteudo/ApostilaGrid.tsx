import React from 'react';
import { motion } from 'framer-motion';

interface ApostilaGridProps {
  volumeId: string;
  apostilaNumbers: number[];
  markedPages: Set<number>;
  drivePdfId?: string;
  driveItemsMap?: Map<number, string>;
  onOpenPdf?: () => void;
  onTogglePage: (volumeId: string, page: number) => void;
  onSetAll: (volumeId: string, pages: number[], completed: boolean) => void;
}

export const ApostilaGrid: React.FC<ApostilaGridProps> = ({
  volumeId,
  apostilaNumbers,
  markedPages,
  drivePdfId,
  driveItemsMap,
  onOpenPdf,
  onTogglePage,
  onSetAll,
}) => {
  if (!apostilaNumbers || apostilaNumbers.length === 0) {
    return (
      <div className="text-xs text-slate-500 italic py-2">
        Nenhum item de apostila para este volume.
      </div>
    );
  }

  const completedCount = apostilaNumbers.filter((p) => markedPages.has(p)).length;
  const totalCount = apostilaNumbers.length;
  const percentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const allCompleted = completedCount === totalCount;

  const handleNumberClick = (page: number) => {
    const itemDriveId = driveItemsMap?.get(page);
    if (itemDriveId) {
      window.open(`https://drive.google.com/file/d/${itemDriveId}/view`, '_blank');
    } else if (onOpenPdf) {
      onOpenPdf();
    } else if (drivePdfId) {
      window.open(`https://drive.google.com/file/d/${drivePdfId}/view`, '_blank');
    }

    // Marca como lido se ainda não estiver
    if (!markedPages.has(page)) {
      onTogglePage(volumeId, page);
    }
  };

  return (
    <div className="bg-slate-900/60 rounded-xl p-3.5 border border-slate-800/80 my-2 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Apostila
          </span>
          <span className="text-xs font-medium text-slate-300">
            {completedCount}/{totalCount} lidos ({percentage}%)
          </span>
        </div>

        <button
          type="button"
          onClick={() => onSetAll(volumeId, apostilaNumbers, !allCompleted)}
          className="text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
        >
          {allCompleted ? 'Desmarcar todos' : 'Marcar todos'}
        </button>
      </div>

      {/* Barra de progresso da apostila */}
      <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
        <div
          className="bg-emerald-500 h-full rounded-full transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Grade de números clicáveis para abrir o Drive */}
      <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-1.5">
        {apostilaNumbers.map((page) => {
          const isDone = markedPages.has(page);
          const hasDriveLink = Boolean(driveItemsMap?.get(page));
          return (
            <motion.button
              key={page}
              type="button"
              whileTap={{ scale: 0.93 }}
              onClick={() => handleNumberClick(page)}
              onContextMenu={(e) => {
                e.preventDefault();
                onTogglePage(volumeId, page);
              }}
              className={`relative h-9 rounded-lg font-medium text-xs flex items-center justify-center transition-all select-none group shadow-sm ${
                isDone
                  ? 'bg-emerald-600 text-white font-semibold shadow-emerald-950/30'
                  : 'bg-slate-800/90 text-slate-300 border border-slate-700/60 hover:bg-slate-750 hover:text-slate-50 hover:border-indigo-500/50'
              }`}
              title={`Apostila ${page}: ${isDone ? 'Concluída' : 'Não lida'}${hasDriveLink ? ' • Clique para abrir vídeo no Drive' : ''} (botão direito para alternar)`}
            >
              <span>{page}</span>
              {/* Indicador sutil de link para Drive */}
              <span className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <svg className="w-2.5 h-2.5 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};
