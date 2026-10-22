import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Lesson } from '../types/curriculum';
import { resolveQuestionsUrl } from '../core/content';

export interface PostLessonQuestionsSaveData {
  total: number;
  correct: number;
  note?: string;
}

interface PostLessonQuestionsModalProps {
  isOpen: boolean;
  onClose: () => void; // "Fazer depois"
  onSave: (data: PostLessonQuestionsSaveData) => Promise<void> | void;
  lesson: Lesson & {
    subjectName?: string;
    volumeName?: string;
    lessonUrl?: string;
    volumeUrl?: string;
  };
  globalQuestionsTemplate?: string;
}

export const PostLessonQuestionsModal: React.FC<PostLessonQuestionsModalProps> = ({
  isOpen,
  onClose,
  onSave,
  lesson,
  globalQuestionsTemplate,
}) => {
  const navigate = useNavigate();

  // Contadores
  const [fiz, setFiz] = useState(10);
  const [acertei, setAcertei] = useState(10);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  // Reset counters when opened for a new lesson
  useEffect(() => {
    if (isOpen) {
      setFiz(10);
      setAcertei(10);
      setNote('');
      setSaving(false);
    }
  }, [isOpen, lesson.id]);

  if (!isOpen) return null;

  const effectiveQuestionsUrl = resolveQuestionsUrl({
    lessonUrl: lesson.lessonUrl,
    volumeUrl: lesson.volumeUrl,
    template: globalQuestionsTemplate,
    subjectName: lesson.subjectName,
    volumeName: lesson.volumeName,
    lessonTitle: lesson.title,
  });

  const handleFizChange = (val: number) => {
    const nextFiz = Math.max(0, val);
    setFiz(nextFiz);
    if (acertei > nextFiz) {
      setAcertei(nextFiz);
    }
  };

  const handleAcerteiChange = (val: number) => {
    const clamped = Math.max(0, Math.min(fiz, val));
    setAcertei(clamped);
  };

  const percentage = fiz > 0 ? Math.round((acertei / fiz) * 100) : 0;
  const isWeak = fiz > 0 && percentage < 60;

  const handleSave = async () => {
    if (fiz <= 0) return;
    setSaving(true);
    try {
      await onSave({
        total: fiz,
        correct: acertei,
        note: note.trim() || undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleGoToSettings = () => {
    onClose();
    navigate('/mais');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
        {/* Cabeçalho */}
        <div className="bg-slate-900/95 px-5 py-4 border-b border-slate-800 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5 text-xs text-indigo-400 font-semibold mb-1">
              <span>🎯</span>
              <span>QUESTÕES DESTA AULA</span>
            </div>
            <h2 className="text-base sm:text-lg font-bold text-slate-100 leading-snug">
              {lesson.title}
            </h2>
            {(lesson.subjectName || lesson.volumeName) && (
              <p className="text-xs text-slate-400 mt-0.5 truncate">
                {lesson.subjectName} • {lesson.volumeName}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition-colors"
            title="Fazer depois"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Conteúdo com rolagem */}
        <div className="p-5 space-y-5 overflow-y-auto flex-1">
          {/* Botão Abrir Questões (PRD seção 5) */}
          <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800 space-y-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
              1. Acessar questões na plataforma
            </span>

            {effectiveQuestionsUrl ? (
              <a
                href={effectiveQuestionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.99] text-white rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-all shadow-md shadow-indigo-950"
              >
                <span>Abrir questões</span>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            ) : (
              <div className="bg-amber-950/40 border border-amber-800/60 p-3 rounded-xl text-xs space-y-2">
                <p className="text-amber-200 leading-relaxed">
                  ⚠️ Nenhum link de questões configurado para esta aula, volume ou modelo global.
                </p>
                <button
                  type="button"
                  onClick={handleGoToSettings}
                  className="inline-flex items-center gap-1.5 text-xs text-amber-300 hover:text-amber-100 font-semibold underline"
                >
                  <span>Ir para Ajustes configurar o modelo</span>
                  <span>⚙️</span>
                </button>
              </div>
            )}
          </div>

          {/* Registro rápido: Contadores Fiz e Acertei (PRD seção 5) */}
          <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800 space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                2. Registro rápido de desempenho
              </span>
              <div className="flex items-center gap-1.5">
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    isWeak
                      ? 'bg-rose-950 text-rose-300 border border-rose-800'
                      : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                  }`}
                >
                  {acertei}/{fiz} ({percentage}%)
                </span>
                {isWeak && (
                  <span className="text-[10px] font-bold text-rose-400">
                    Tema Fraco
                  </span>
                )}
              </div>
            </div>

            {/* Grid dos dois contadores */}
            <div className="grid grid-cols-2 gap-3">
              {/* Contador FIZ */}
              <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 flex flex-col items-center">
                <span className="text-xs text-slate-400 font-semibold mb-1">
                  Questões Feitas
                </span>
                <div className="flex items-center gap-2 my-1">
                  <button
                    type="button"
                    onClick={() => handleFizChange(fiz - 1)}
                    disabled={fiz <= 1}
                    className="w-8 h-8 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:opacity-40 font-bold text-base flex items-center justify-center transition-colors"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min={0}
                    value={fiz}
                    onChange={(e) => handleFizChange(parseInt(e.target.value, 10) || 0)}
                    className="w-14 text-center bg-slate-950 border border-slate-700 rounded-lg py-1 font-bold text-base text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleFizChange(fiz + 1)}
                    className="w-8 h-8 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 font-bold text-base flex items-center justify-center transition-colors"
                  >
                    +
                  </button>
                </div>
                {/* Presets rápidos */}
                <div className="flex gap-1 mt-1">
                  {[5, 10, 15, 20].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => handleFizChange(n)}
                      className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                        fiz === n
                          ? 'bg-indigo-600 text-white border-indigo-500'
                          : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:text-white'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Contador ACERTEI */}
              <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 flex flex-col items-center">
                <span className="text-xs text-slate-400 font-semibold mb-1">
                  Acertos
                </span>
                <div className="flex items-center gap-2 my-1">
                  <button
                    type="button"
                    onClick={() => handleAcerteiChange(acertei - 1)}
                    disabled={acertei <= 0}
                    className="w-8 h-8 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:opacity-40 font-bold text-base flex items-center justify-center transition-colors"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min={0}
                    max={fiz}
                    value={acertei}
                    onChange={(e) => handleAcerteiChange(parseInt(e.target.value, 10) || 0)}
                    className="w-14 text-center bg-slate-950 border border-slate-700 rounded-lg py-1 font-bold text-base text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleAcerteiChange(acertei + 1)}
                    disabled={acertei >= fiz}
                    className="w-8 h-8 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:opacity-40 font-bold text-base flex items-center justify-center transition-colors"
                  >
                    +
                  </button>
                </div>
                {/* Presets rápidos */}
                <div className="flex gap-1 mt-1">
                  <button
                    type="button"
                    onClick={() => handleAcerteiChange(fiz)}
                    className="text-[10px] px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-700 hover:bg-emerald-900"
                  >
                    100%
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAcerteiChange(Math.round(fiz * 0.8))}
                    className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700"
                  >
                    80%
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Campo Opcional de Observação (PRD seção 5) */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 block">
              Observação (o que errei, tema fraco)
            </label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ex.: errei duas questões de conduta em flutter atrial..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
            />
          </div>
        </div>

        {/* Rodapé com Botões Salvar e Fazer depois (PRD seção 5) */}
        <div className="bg-slate-900/95 px-5 py-4 border-t border-slate-800 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="py-2.5 px-4 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            Fazer depois
          </button>

          <button
            type="button"
            disabled={fiz <= 0 || saving}
            onClick={handleSave}
            className="py-2.5 px-6 rounded-xl text-xs sm:text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 transition-all shadow-md shadow-indigo-950"
          >
            {saving ? 'Gravando...' : 'Salvar registro'}
          </button>
        </div>
      </div>
    </div>
  );
};
