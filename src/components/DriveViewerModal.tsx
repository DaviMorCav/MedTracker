import React, { useState, useEffect } from 'react';

interface DriveViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  driveVideoId?: string;
  videoName?: string;
  drivePdfId?: string;
  pdfName?: string;
  initialTab?: 'video' | 'pdf';
}

export const DriveViewerModal: React.FC<DriveViewerModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  driveVideoId,
  videoName,
  drivePdfId,
  pdfName,
  initialTab = 'video',
}) => {
  const hasVideo = Boolean(driveVideoId);
  const hasPdf = Boolean(drivePdfId);

  const [activeTab, setActiveTab] = useState<'video' | 'pdf'>('video');

  useEffect(() => {
    if (isOpen) {
      if (initialTab === 'pdf' && hasPdf) {
        setActiveTab('pdf');
      } else if (hasVideo) {
        setActiveTab('video');
      } else if (hasPdf) {
        setActiveTab('pdf');
      }
    }
  }, [isOpen, initialTab, hasVideo, hasPdf]);

  if (!isOpen) return null;

  const currentId = activeTab === 'video' ? driveVideoId : drivePdfId;
  const currentFileName = activeTab === 'video' ? videoName : pdfName;

  const previewUrl = currentId
    ? `https://drive.google.com/file/d/${currentId}/preview`
    : '';
  const externalUrl = currentId
    ? `https://drive.google.com/file/d/${currentId}/view`
    : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-5xl h-[92vh] max-h-[92vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Cabeçalho */}
        <div className="bg-slate-900/95 px-4 sm:px-5 py-3 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-bold text-slate-100 truncate leading-tight">
              {title}
            </h2>
            {subtitle && (
              <p className="text-[11px] text-slate-400 truncate mt-0.5">{subtitle}</p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Seletor de modo (quando há vídeo e PDF) */}
            {hasVideo && hasPdf && (
              <div className="flex p-0.5 bg-slate-950 border border-slate-800 rounded-lg">
                <button
                  type="button"
                  onClick={() => setActiveTab('video')}
                  className={`py-1 px-2.5 rounded-md text-xs font-semibold transition-colors ${
                    activeTab === 'video'
                      ? 'bg-slate-800 text-slate-100 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Vídeo
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('pdf')}
                  className={`py-1 px-2.5 rounded-md text-xs font-semibold transition-colors ${
                    activeTab === 'pdf'
                      ? 'bg-slate-800 text-slate-100 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Apostila
                </button>
              </div>
            )}

            {/* Abrir no Google Drive */}
            {externalUrl && (
              <a
                href={externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Abrir no Google Drive"
                className="hidden sm:inline-flex items-center gap-1.5 py-1 px-2.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors"
              >
                <span>Abrir no Drive</span>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            )}

            {/* Fechar */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition-colors"
              title="Fechar"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Visualizador Iframe */}
        <div className="flex-1 bg-black relative flex flex-col min-h-0">
          {currentId ? (
            <iframe
              src={previewUrl}
              className="w-full h-full border-0"
              allow="autoplay; fullscreen"
              title={currentFileName || title}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 text-xs p-6 space-y-2 text-center">
              <p>Nenhum arquivo vinculado para esta visualização.</p>
              <p className="text-[11px] text-slate-500">
                Você pode importar o mapeamento da sua pasta em Ajustes.
              </p>
            </div>
          )}
        </div>

        {/* Rodapé sutil */}
        <div className="px-4 py-2 bg-slate-900/95 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 shrink-0">
          <span className="truncate">{currentFileName || (activeTab === 'video' ? 'Vídeo da aula' : 'Apostila em PDF')}</span>
          <span className="shrink-0 hidden sm:inline">Visualização via Google Drive</span>
        </div>
      </div>
    </div>
  );
};
