import React from 'react';

interface ApostilaGridProps {
  volumeId: string;
  apostilaNumbers: number[];
  markedPages: Set<number>;
  onTogglePage: (volumeId: string, page: number) => void;
  onSetAll: (volumeId: string, pages: number[], completed: boolean) => void;
}

export const ApostilaGrid: React.FC<ApostilaGridProps> = ({
  volumeId,
  apostilaNumbers,
  markedPages,
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

  return (
    <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800/80 my-2">
      <div className="flex items-center justify-between mb-2.5">
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
      <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mb-3">
        <div
          className="bg-emerald-500 h-full rounded-full transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Grade de números */}
      <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-1.5">
        {apostilaNumbers.map((page) => {
          const isDone = markedPages.has(page);
          return (
            <button
              key={page}
              type="button"
              onClick={() => onTogglePage(volumeId, page)}
              className={`h-9 rounded-lg font-medium text-xs flex items-center justify-center transition-all select-none active:scale-95 ${
                isDone
                  ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-900/50 font-semibold'
                  : 'bg-slate-800/90 text-slate-300 border border-slate-700/60 hover:bg-slate-750 hover:text-white'
              }`}
              title={`Item ${page}: ${isDone ? 'Concluído' : 'Não lido'}`}
            >
              {page}
            </button>
          );
        })}
      </div>
    </div>
  );
};
