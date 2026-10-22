import React, { useState, useMemo, useRef } from 'react';
import { db } from '../../db';
import { useLiveQuery } from '../../db/useLiveQuery';
import { curriculum } from '../../data/curriculum';
import { DEFAULT_SETTINGS, updateSettings, toggleSubjectActive } from '../../db/operations';
import { validateBackupJson } from '../../core/backup';
import { getLocalDateString } from '../../core/dates';
import { ConfirmModal } from '../../components/ConfirmModal';
import type { UserSettings } from '../../db/schema';

export const MaisPage: React.FC = () => {
  const settings = useLiveQuery<UserSettings>(
    async () => {
      const s = await db.settings.get('default');
      return s || DEFAULT_SETTINGS;
    },
    [],
    DEFAULT_SETTINGS
  );

  const [questionsUrlTemplate, setQuestionsUrlTemplate] = useState('');
  const [templateEditing, setTemplateEditing] = useState(false);

  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [pendingBackupJson, setPendingBackupJson] = useState<string | null>(null);
  const [showImportConfirm, setShowImportConfirm] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sincroniza o template de questões ao carregar settings
  useMemo(() => {
    if (settings && !templateEditing) {
      setQuestionsUrlTemplate(settings.questionsUrlTemplate || '');
    }
  }, [settings, templateEditing]);

  const activeSubjects = settings?.activeSubjects || [];

  // ─── Matérias Ativas e Ordem ───────────────────────────────────────────────
  const handleToggleActive = async (subjectId: string) => {
    await toggleSubjectActive(subjectId);
  };

  const handleMoveSubject = async (subjectId: string, direction: 'up' | 'down') => {
    const current = [...activeSubjects];
    const idx = current.indexOf(subjectId);
    if (idx === -1) return;
    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= current.length) return;
    [current[idx], current[newIdx]] = [current[newIdx], current[idx]];
    await updateSettings({ activeSubjects: current });
  };

  // ─── Metas numéricas ───────────────────────────────────────────────────────
  const handleDailyLessonsChange = async (val: number) => {
    const n = Math.max(1, Math.min(20, val));
    await updateSettings({ dailyNewLessons: n });
  };

  const handleDailyReviewCapChange = async (val: number) => {
    const n = Math.max(1, Math.min(100, val));
    await updateSettings({ dailyReviewCap: n });
  };

  const handleIncludeBonusChange = async (val: boolean) => {
    await updateSettings({ includeBonus: val });
  };

  // ─── Template de questões ──────────────────────────────────────────────────
  const handleTemplateSave = async () => {
    await updateSettings({ questionsUrlTemplate: questionsUrlTemplate.trim() });
    setTemplateEditing(false);
  };

  // ─── Exportar Backup JSON ──────────────────────────────────────────────────
  const handleExportBackup = async () => {
    const [settingsList, progress, volumeLinks, apostila, reviews, questionLogs] =
      await Promise.all([
        db.settings.toArray(),
        db.progress.toArray(),
        db.volumeLinks.toArray(),
        db.apostila.toArray(),
        db.reviews.toArray(),
        db.questionLogs.toArray(),
      ]);

    const backup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      data: { settings: settingsList, progress, volumeLinks, apostila, reviews, questionLogs },
    };

    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const today = getLocalDateString();
    a.href = url;
    a.download = `medtracker-backup-${today}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Importar Backup JSON ──────────────────────────────────────────────────
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError(null);
    setImportSuccess(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      setImportError('Selecione um arquivo .json gerado pelo botão de exportar.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const result = validateBackupJson(text);
      if (!result.valid) {
        setImportError(result.error || 'Arquivo inválido.');
        return;
      }
      setPendingBackupJson(text);
      setShowImportConfirm(true);
    };
    reader.readAsText(file);

    // Limpa o input para permitir reimportar o mesmo arquivo
    e.target.value = '';
  };

  const handleConfirmImport = async () => {
    if (!pendingBackupJson) return;
    const result = validateBackupJson(pendingBackupJson);
    if (!result.valid || !result.backup) return;

    const { data } = result.backup;

    await db.transaction(
      'rw',
      [db.settings, db.progress, db.volumeLinks, db.apostila, db.reviews, db.questionLogs],
      async () => {
        await db.settings.clear();
        await db.progress.clear();
        await db.volumeLinks.clear();
        await db.apostila.clear();
        await db.reviews.clear();
        await db.questionLogs.clear();

        if (data.settings?.length) await db.settings.bulkPut(data.settings);
        if (data.progress?.length) await db.progress.bulkPut(data.progress);
        if (data.volumeLinks?.length) await db.volumeLinks.bulkPut(data.volumeLinks);
        if (data.apostila?.length) await db.apostila.bulkPut(data.apostila);
        if (data.reviews?.length) await db.reviews.bulkPut(data.reviews);
        if (data.questionLogs?.length) await db.questionLogs.bulkPut(data.questionLogs);
      }
    );

    setPendingBackupJson(null);
    setShowImportConfirm(false);
    setImportSuccess(
      `Backup importado com sucesso: ${data.progress?.length || 0} progresso, ${data.reviews?.length || 0} revisões, ${data.questionLogs?.length || 0} questões.`
    );
  };

  return (
    <div className="py-2 space-y-6 md:max-w-3xl md:mx-auto">
      <div>
        <h1 className="text-xl font-bold text-slate-100">Ajustes</h1>
        <p className="text-xs text-slate-400 mt-0.5">Configurações do MedTracker</p>
      </div>

      {/* ── 1. Metas Diárias ────────────────────────────────────────────────── */}
      <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-400">
          Metas Diárias
        </h2>

        {/* Aulas novas por dia */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-200">Aulas novas por dia</p>
            <p className="text-xs text-slate-400 mt-0.5">Sugeridas na aba Hoje</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleDailyLessonsChange((settings?.dailyNewLessons || 2) - 1)}
              className="w-8 h-8 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 font-bold flex items-center justify-center transition-colors"
            >
              -
            </button>
            <span className="w-8 text-center font-bold text-slate-100 text-sm">
              {settings?.dailyNewLessons ?? 2}
            </span>
            <button
              type="button"
              onClick={() => handleDailyLessonsChange((settings?.dailyNewLessons || 2) + 1)}
              className="w-8 h-8 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 font-bold flex items-center justify-center transition-colors"
            >
              +
            </button>
          </div>
        </div>

        {/* Limite de revisões por dia */}
        <div className="flex items-center justify-between gap-4 pt-3 border-t border-slate-800">
          <div>
            <p className="text-sm font-semibold text-slate-200">Limite de revisões/dia</p>
            <p className="text-xs text-slate-400 mt-0.5">Exibidas na fila da aba Hoje</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleDailyReviewCapChange((settings?.dailyReviewCap || 20) - 5)}
              className="w-8 h-8 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 font-bold flex items-center justify-center transition-colors"
            >
              -
            </button>
            <span className="w-8 text-center font-bold text-slate-100 text-sm">
              {settings?.dailyReviewCap ?? 20}
            </span>
            <button
              type="button"
              onClick={() => handleDailyReviewCapChange((settings?.dailyReviewCap || 20) + 5)}
              className="w-8 h-8 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 font-bold flex items-center justify-center transition-colors"
            >
              +
            </button>
          </div>
        </div>

        {/* Incluir bônus nas sugestões */}
        <div className="flex items-center justify-between gap-4 pt-3 border-t border-slate-800">
          <div>
            <p className="text-sm font-semibold text-slate-200">Incluir bônus nas sugestões</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Bônus após todas as aulas do volume
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings?.includeBonus}
            onClick={() => handleIncludeBonusChange(!(settings?.includeBonus))}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
              settings?.includeBonus ? 'bg-indigo-600' : 'bg-slate-700'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                settings?.includeBonus ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </section>

      {/* ── 2. Matérias Ativas e Ordem ──────────────────────────────────────── */}
      <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-400">
            Matérias Ativas e Ordem
          </h2>
          <span className="text-xs text-slate-500">
            {activeSubjects.length}/{curriculum.subjects.length} ativas
          </span>
        </div>
        <p className="text-xs text-slate-400">
          Ativas entram no rodízio de sugestões. A ordem define a prioridade.
        </p>

        <div className="space-y-2">
          {/* Primeiro mostrar as ativas em ordem */}
          {activeSubjects.map((subjectId, idx) => {
            const subject = curriculum.subjects.find((s) => s.id === subjectId);
            if (!subject) return null;
            return (
              <div
                key={subjectId}
                className="flex items-center gap-3 bg-slate-800/60 border border-slate-700/60 rounded-lg px-3 py-2.5"
              >
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => handleMoveSubject(subjectId, 'up')}
                    className="text-slate-400 hover:text-slate-200 disabled:opacity-25 transition-colors leading-none text-base"
                    title="Mover para cima"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    disabled={idx === activeSubjects.length - 1}
                    onClick={() => handleMoveSubject(subjectId, 'down')}
                    className="text-slate-400 hover:text-slate-200 disabled:opacity-25 transition-colors leading-none text-base"
                    title="Mover para baixo"
                  >
                    ▼
                  </button>
                </div>

                <span className="text-[10px] font-bold text-slate-500 w-4 text-center shrink-0">
                  {idx + 1}
                </span>

                <span className="flex-1 text-sm font-semibold text-slate-200 truncate">
                  {subject.name}
                </span>

                <button
                  type="button"
                  onClick={() => handleToggleActive(subjectId)}
                  className="text-[10px] font-bold px-2 py-1 rounded-lg bg-emerald-950 text-emerald-300 border border-emerald-700 hover:bg-rose-950 hover:text-rose-300 hover:border-rose-700 transition-colors shrink-0"
                >
                  Ativa ✓
                </button>
              </div>
            );
          })}

          {/* Divisor */}
          {activeSubjects.length > 0 && activeSubjects.length < curriculum.subjects.length && (
            <div className="flex items-center gap-2 py-1">
              <div className="flex-1 h-px bg-slate-800" />
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">Inativas</span>
              <div className="flex-1 h-px bg-slate-800" />
            </div>
          )}

          {/* Matérias inativas */}
          {curriculum.subjects
            .filter((s) => !activeSubjects.includes(s.id))
            .map((subject) => (
              <div
                key={subject.id}
                className="flex items-center gap-3 bg-slate-950/40 border border-slate-800/40 rounded-lg px-3 py-2.5"
              >
                <span className="w-4 shrink-0" />
                <span className="flex-1 text-sm font-medium text-slate-400 truncate">
                  {subject.name}
                </span>
                <button
                  type="button"
                  onClick={() => handleToggleActive(subject.id)}
                  className="text-[10px] font-bold px-2 py-1 rounded-lg bg-slate-800 text-slate-400 border border-slate-700 hover:bg-emerald-950 hover:text-emerald-300 hover:border-emerald-700 transition-colors shrink-0"
                >
                  Ativar
                </button>
              </div>
            ))}
        </div>
      </section>

      {/* ── 3. Modelo Global de Link de Questões ────────────────────────────── */}
      <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-400">
          Link Global de Questões
        </h2>
        <p className="text-xs text-slate-400 leading-relaxed">
          Modelo com <code className="bg-slate-800 px-1 rounded text-indigo-300">{'{materia}'}</code>,{' '}
          <code className="bg-slate-800 px-1 rounded text-indigo-300">{'{volume}'}</code> e{' '}
          <code className="bg-slate-800 px-1 rounded text-indigo-300">{'{aula}'}</code> (codificados para URL).
          Cada aula ou volume pode ter um link próprio que sobrescreve este.
        </p>

        <textarea
          rows={2}
          value={questionsUrlTemplate}
          onChange={(e) => { setQuestionsUrlTemplate(e.target.value); setTemplateEditing(true); }}
          placeholder="https://minhaplatforma.com/questoes?materia={materia}&aula={aula}"
          className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none font-mono"
        />

        {templateEditing && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleTemplateSave}
              className="py-1.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition-colors"
            >
              Salvar
            </button>
            <button
              type="button"
              onClick={() => { setQuestionsUrlTemplate(settings?.questionsUrlTemplate || ''); setTemplateEditing(false); }}
              className="py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition-colors"
            >
              Cancelar
            </button>
          </div>
        )}
      </section>

      {/* ── 4. Backup: Exportar e Importar ──────────────────────────────────── */}
      <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-400">
            Backup dos Dados
          </h2>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            Todos os dados ficam no aparelho (IndexedDB). Faça backup com frequência e antes de trocar de dispositivo.
          </p>
        </div>

        {/* Exportar */}
        <div className="flex items-center justify-between gap-3 p-3.5 bg-slate-950/60 rounded-lg border border-slate-800">
          <div>
            <p className="text-sm font-semibold text-slate-200">Exportar Backup</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Gera um arquivo .json com todos os seus dados
            </p>
          </div>
          <button
            type="button"
            onClick={handleExportBackup}
            className="py-2 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shrink-0 transition-colors shadow-sm flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Exportar
          </button>
        </div>

        {/* Importar */}
        <div className="flex items-center justify-between gap-3 p-3.5 bg-slate-950/60 rounded-lg border border-slate-800">
          <div>
            <p className="text-sm font-semibold text-slate-200">Importar Backup</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Substitui todos os dados atuais pelo backup
            </p>
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="py-2 px-4 bg-slate-700 hover:bg-slate-600 text-slate-100 rounded-lg text-xs font-semibold shrink-0 transition-colors shadow-sm flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l4-4m0 0l4 4m-4-4v12" />
            </svg>
            Importar
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>

        {/* Mensagens de erro/sucesso */}
        {importError && (
          <div className="bg-rose-950/60 border border-rose-800 p-3 rounded-lg text-xs text-rose-200 flex items-start gap-2">
            <span>⚠️</span>
            <span>{importError}</span>
          </div>
        )}
        {importSuccess && (
          <div className="bg-emerald-950/60 border border-emerald-800 p-3 rounded-lg text-xs text-emerald-200 flex items-start gap-2">
            <span>✓</span>
            <span>{importSuccess}</span>
          </div>
        )}
      </section>

      {/* ── 5. Info PWA ─────────────────────────────────────────────────────── */}
      <section className="bg-slate-900/60 border border-slate-800/60 rounded-xl p-4 space-y-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Sobre o App
        </h2>
        <p className="text-xs text-slate-400 leading-relaxed">
          <strong className="text-slate-300">MedTracker</strong> é um PWA offline-first.
          No celular, use o menu do navegador e toque em "Adicionar à tela inicial" para instalar.
          Os dados ficam no dispositivo — exporte o backup antes de trocar de aparelho.
        </p>
        <p className="text-xs text-slate-500">
          Versão MVP • Dados locais via IndexedDB
        </p>
      </section>

      {/* Modal Confirmação de Importação */}
      <ConfirmModal
        isOpen={showImportConfirm}
        title="Importar backup?"
        message="Todos os dados atuais (progresso, revisões, questões, ajustes) serão substituídos pelos dados do arquivo selecionado. Esta ação não pode ser desfeita."
        confirmText="Sim, importar e substituir"
        cancelText="Cancelar"
        variant="danger"
        onConfirm={handleConfirmImport}
        onCancel={() => { setShowImportConfirm(false); setPendingBackupJson(null); }}
      />
    </div>
  );
};

export default MaisPage;
