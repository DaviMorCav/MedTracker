import React, { useState, useMemo, useRef } from 'react';
import { db } from '../../db';
import { useLiveQuery } from '../../db/useLiveQuery';
import { curriculum } from '../../data/curriculum';
import {
  DEFAULT_SETTINGS,
  updateSettings,
  toggleSubjectActive,
  importDriveMedia,
  clearAllDriveMedia,
  exportCurrentBackup,
  applyBackupData,
} from '../../db/operations';
import { validateBackupJson } from '../../core/backup';
import { mergeBackupData } from '../../core/driveSync';
import {
  requestGoogleAccessToken,
  findSyncFileId,
  downloadSyncFromDrive,
  uploadSyncToDrive,
} from '../../services/googleDriveSync';
import { getLocalDateString } from '../../core/dates';
import { ConfirmModal } from '../../components/ConfirmModal';
import type { UserSettings, LessonMedia, VolumeMedia } from '../../db/schema';

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

  // Mídia do Google Drive
  const lessonMediaList = useLiveQuery<LessonMedia[]>(() => db.lessonMedia.toArray(), [], []);
  const volumeMediaList = useLiveQuery<VolumeMedia[]>(() => db.volumeMedia.toArray(), [], []);
  const driveFileInputRef = useRef<HTMLInputElement>(null);
  const [driveImportMsg, setDriveImportMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sincronização em Nuvem via Google Drive
  const [googleClientId, setGoogleClientId] = useState(() => {
    return (
      localStorage.getItem('medtracker_google_client_id') ||
      (import.meta as unknown as { env?: { VITE_GOOGLE_CLIENT_ID?: string } }).env
        ?.VITE_GOOGLE_CLIENT_ID ||
      ''
    );
  });
  const [clientIdInput, setClientIdInput] = useState(googleClientId);
  const [showClientIdConfig, setShowClientIdConfig] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(() => {
    return localStorage.getItem('medtracker_last_sync_time');
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

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
    const backup = await exportCurrentBackup();
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

    const res = await applyBackupData(result.backup);

    setPendingBackupJson(null);
    setShowImportConfirm(false);
    setImportSuccess(
      `Backup importado com sucesso: ${res.progressCount} progresso, ${res.reviewsCount} revisões, ${res.questionsCount} questões.`
    );
  };

  // ─── Sincronização em Nuvem (Google Drive) ──────────────────────────────────
  const handleSaveClientId = () => {
    const trimmed = clientIdInput.trim();
    setGoogleClientId(trimmed);
    localStorage.setItem('medtracker_google_client_id', trimmed);
    setShowClientIdConfig(false);
    setSyncMsg({ type: 'success', text: 'Client ID salvo com sucesso.' });
  };

  const handleSyncGoogleDrive = async () => {
    if (!googleClientId) {
      setShowClientIdConfig(true);
      setSyncMsg({
        type: 'error',
        text: 'Configure o seu Google Client ID abaixo para habilitar a sincronização.',
      });
      return;
    }

    setIsSyncing(true);
    setSyncMsg(null);

    try {
      // 1. Obtém token OAuth (escopo drive.file)
      const token = await requestGoogleAccessToken(googleClientId);

      // 2. Procura arquivo existente medtracker_sync.json no Drive
      const fileId = await findSyncFileId(token);
      const localBackup = await exportCurrentBackup();

      let finalBackup = localBackup;

      if (fileId) {
        // Baixa o backup remoto
        const remoteBackup = await downloadSyncFromDrive(token, fileId);
        if (remoteBackup) {
          // Mescla inteligentemente sem perder nada de nenhum dispositivo
          finalBackup = mergeBackupData(localBackup, remoteBackup);
          // Atualiza banco local
          await applyBackupData(finalBackup);
        }
      }

      // 3. Salva a versão unificada no Google Drive
      await uploadSyncToDrive(token, finalBackup, fileId);

      const now = new Date().toISOString();
      setLastSyncTime(now);
      localStorage.setItem('medtracker_last_sync_time', now);

      const progCount =
        finalBackup.data.progress?.filter((p) => p.status === 'concluida').length || 0;
      const revCount = finalBackup.data.reviews?.length || 0;

      setSyncMsg({
        type: 'success',
        text: `Sincronizado com sucesso! (${progCount} aulas concluídas e ${revCount} revisões unificadas).`,
      });
    } catch (err) {
      setSyncMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Falha ao sincronizar com Google Drive.',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // ─── Importar Mapeamento do Drive ──────────────────────────────────────────
  const handleLoadDefaultDriveLinks = async () => {
    setDriveImportMsg(null);
    try {
      const resp = await fetch('/drive_links.json');
      if (!resp.ok) {
        throw new Error('Arquivo public/drive_links.json não encontrado.');
      }
      const json = await resp.json();
      const res = await importDriveMedia(json);
      setDriveImportMsg({
        type: 'success',
        text: `${res.lessonsCount} aulas com vídeo e ${res.volumesCount} apostilas vinculadas com sucesso!`,
      });
    } catch (err) {
      setDriveImportMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Falha ao sincronizar drive_links.json.',
      });
    }
  };

  const handleDriveFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDriveImportMsg(null);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const res = await importDriveMedia(json);
      setDriveImportMsg({
        type: 'success',
        text: `${res.lessonsCount} aulas com vídeo e ${res.volumesCount} volumes com apostila vinculados.`,
      });
    } catch (err) {
      setDriveImportMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Falha ao importar arquivo do Drive.',
      });
    }
    e.target.value = '';
  };

  const handleClearDrive = async () => {
    await clearAllDriveMedia();
    setDriveImportMsg({
      type: 'success',
      text: 'Vinculações de mídia do Google Drive removidas.',
    });
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

      {/* ── 4. Aulas e Apostilas (Google Drive) ─────────────────────────────── */}
      <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-400">
            Aulas e Apostilas (Google Drive)
          </h2>
          <span className="text-xs text-slate-400">
            {lessonMediaList.length} aulas · {volumeMediaList.length} apostilas
          </span>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          Importe o arquivo <code className="bg-slate-800 px-1 py-0.5 rounded text-indigo-300">drive_links.json</code> gerado pelo script para abrir os vídeos e apostilas diretamente no visualizador do app.
        </p>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onClick={handleLoadDefaultDriveLinks}
            className="py-2 px-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <span>Sincronizar Arquivo Integrado</span>
          </button>

          <button
            type="button"
            onClick={() => driveFileInputRef.current?.click()}
            className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
          >
            <span>Escolher outro .json</span>
          </button>
          <input
            ref={driveFileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleDriveFileSelect}
            className="hidden"
          />

          {(lessonMediaList.length > 0 || volumeMediaList.length > 0) && (
            <button
              type="button"
              onClick={handleClearDrive}
              className="py-2 px-3 bg-rose-950/40 hover:bg-rose-900/50 text-rose-300 border border-rose-900/50 rounded-lg text-xs font-semibold transition-colors"
            >
              Remover vinculações
            </button>
          )}
        </div>

        {driveImportMsg && (
          <div
            className={`p-2.5 rounded-lg text-xs ${
              driveImportMsg.type === 'success'
                ? 'bg-emerald-950/70 border border-emerald-800 text-emerald-200'
                : 'bg-rose-950/70 border border-rose-800 text-rose-200'
            }`}
          >
            {driveImportMsg.text}
          </div>
        )}
      </section>

      {/* ── 5. Sincronização em Nuvem (Google Drive) ─────────────────────────── */}
      <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-400">
            Sincronização em Nuvem (Google Drive)
          </h2>
          {lastSyncTime && (
            <span className="text-[11px] text-slate-400">
              Última: {new Date(lastSyncTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} ({new Date(lastSyncTime).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })})
            </span>
          )}
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          Unifique seu progresso de estudos, revisões e questões entre computador, tablet e celular direto no seu Google Drive pessoal, com segurança.
        </p>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onClick={handleSyncGoogleDrive}
            disabled={isSyncing}
            className="py-2 px-3.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
          >
            {isSyncing ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar Agora'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowClientIdConfig(!showClientIdConfig)}
            className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
          >
            <span>{googleClientId ? 'Configuração' : 'Configurar ID'}</span>
          </button>
        </div>

        {/* Formulário colapsável de Client ID */}
        {showClientIdConfig && (
          <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800 space-y-2 mt-2">
            <label className="block text-xs font-semibold text-slate-300">
              Google OAuth Client ID (Web Application)
            </label>
            <input
              type="text"
              value={clientIdInput}
              onChange={(e) => setClientIdInput(e.target.value)}
              placeholder="ex: 123456789-abc.apps.googleusercontent.com"
              className="w-full text-xs bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
            />
            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-[11px] text-slate-400">
                Criado gratuitamente no Google Cloud Console (Origens autorizadas: seu domínio ou localhost).
              </span>
              <button
                type="button"
                onClick={handleSaveClientId}
                className="py-1 px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shrink-0 transition-colors"
              >
                Salvar
              </button>
            </div>
          </div>
        )}

        {/* Feedback de Sincronização */}
        {syncMsg && (
          <div
            className={`p-2.5 rounded-lg text-xs ${
              syncMsg.type === 'success'
                ? 'bg-emerald-950/70 border border-emerald-800 text-emerald-200'
                : 'bg-rose-950/70 border border-rose-800 text-rose-200'
            }`}
          >
            {syncMsg.text}
          </div>
        )}
      </section>

      {/* ── 6. Backup: Exportar e Importar ──────────────────────────────────── */}
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
          <div className="bg-rose-950/60 border border-rose-800 p-3 rounded-lg text-xs text-rose-200">
            {importError}
          </div>
        )}
        {importSuccess && (
          <div className="bg-emerald-950/60 border border-emerald-800 p-3 rounded-lg text-xs text-emerald-200">
            {importSuccess}
          </div>
        )}
      </section>

      {/* ── 5. Info PWA ─────────────────────────────────────────────────────── */}
      <section className="bg-slate-900/40 border border-slate-800/60 rounded-xl p-4 space-y-1 text-xs text-slate-500">
        <p className="text-slate-400">
          MedTracker · Estudos offline com armazenamento local (IndexedDB).
        </p>
        <p>
          Exporte seu backup periodicamente para manter seus registros seguros.
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
