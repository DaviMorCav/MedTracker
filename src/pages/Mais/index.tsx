import React, { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { db } from '../../db';
import { useLiveQuery } from '../../db/useLiveQuery';
import { curriculum } from '../../data/curriculum';
import {
  DEFAULT_SETTINGS,
  updateSettings,
  toggleSubjectActive,
  exportCurrentBackup,
  applyBackupData,
} from '../../db/operations';
import { mergeBackupData } from '../../core/driveSync';
import {
  requestGoogleAccessToken,
  findSyncFileId,
  downloadSyncFromDrive,
  uploadSyncToDrive,
} from '../../services/googleDriveSync';
import type { UserSettings } from '../../db/schema';

export const MaisPage: React.FC = () => {
  const shouldReduceMotion = useReducedMotion();
  const settings = useLiveQuery<UserSettings>(
    async () => {
      const s = await db.settings.get('default');
      return s || DEFAULT_SETTINGS;
    },
    [],
    DEFAULT_SETTINGS
  );

  // Tela dedicada de matérias ativas (Item 7)
  const [showSubjectsScreen, setShowSubjectsScreen] = useState(false);

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
          // Mescla com segurança sem perder dados
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
        text: `Sincronizado com sucesso! (${progCount} aulas concluídas e ${revCount} revisões ativas unificadas).`,
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

  return (
    <div className="py-2 space-y-6 md:max-w-3xl md:mx-auto">
      <AnimatePresence mode="wait">
        {showSubjectsScreen ? (
          /* ── TELA DEDICADA: Matérias ativas e ordem (Item 7 e 11) ── */
          <motion.div
            key="subjects-screen"
            initial={{ opacity: 0, x: shouldReduceMotion ? 0 : 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: shouldReduceMotion ? 0 : -16 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.22, ease: [0.32, 0.72, 0, 1] }}
            className="space-y-4"
          >
            <div>
              <button
                type="button"
                onClick={() => setShowSubjectsScreen(false)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-400 hover:text-indigo-300 py-1 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span>Voltar aos Ajustes</span>
              </button>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-lg font-bold text-slate-100">Matérias Ativas e Ordem</h1>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Defina quais matérias entram no rodízio de sugestões da aba Hoje e sua prioridade.
                  </p>
                </div>
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800 shrink-0">
                  {activeSubjects.length}/{curriculum.subjects.length} ativas
                </span>
              </div>

              {/* Lista Animada de Matérias Ativas */}
              <div className="space-y-2 pt-2">
                {activeSubjects.map((subjectId, idx) => {
                  const subject = curriculum.subjects.find((s) => s.id === subjectId);
                  if (!subject) return null;
                  return (
                    <motion.div
                      key={subjectId}
                      layout
                      transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
                      className="flex items-center gap-3 bg-slate-800/70 border border-slate-700/70 rounded-xl px-3.5 py-2.5 shadow-sm"
                    >
                      <div className="flex flex-col gap-0.5 shrink-0">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => handleMoveSubject(subjectId, 'up')}
                          className="text-slate-400 hover:text-slate-200 disabled:opacity-20 transition-colors leading-none text-base p-0.5"
                          title="Mover para cima"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          disabled={idx === activeSubjects.length - 1}
                          onClick={() => handleMoveSubject(subjectId, 'down')}
                          className="text-slate-400 hover:text-slate-200 disabled:opacity-20 transition-colors leading-none text-base p-0.5"
                          title="Mover para baixo"
                        >
                          ▼
                        </button>
                      </div>

                      <span className="text-xs font-bold text-indigo-400 w-5 text-center shrink-0">
                        #{idx + 1}
                      </span>

                      <span className="flex-1 text-sm font-semibold text-slate-200 truncate">
                        {subject.name}
                      </span>

                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.94 }}
                        onClick={() => handleToggleActive(subjectId)}
                        className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-950 text-emerald-300 border border-emerald-700 hover:bg-rose-950 hover:text-rose-300 hover:border-rose-700 transition-colors shrink-0"
                      >
                        Ativa ✓
                      </motion.button>
                    </motion.div>
                  );
                })}

                {/* Divisor */}
                {activeSubjects.length > 0 && activeSubjects.length < curriculum.subjects.length && (
                  <div className="flex items-center gap-2 py-2">
                    <div className="flex-1 h-px bg-slate-800" />
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                      Inativas ({curriculum.subjects.length - activeSubjects.length})
                    </span>
                    <div className="flex-1 h-px bg-slate-800" />
                  </div>
                )}

                {/* Matérias inativas */}
                {curriculum.subjects
                  .filter((s) => !activeSubjects.includes(s.id))
                  .map((subject) => (
                    <div
                      key={subject.id}
                      className="flex items-center gap-3 bg-slate-950/40 border border-slate-800/50 rounded-xl px-3.5 py-2.5"
                    >
                      <span className="w-5 shrink-0" />
                      <span className="flex-1 text-sm font-medium text-slate-400 truncate">
                        {subject.name}
                      </span>
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.94 }}
                        onClick={() => handleToggleActive(subject.id)}
                        className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 hover:bg-emerald-950 hover:text-emerald-300 hover:border-emerald-700 transition-colors shrink-0"
                      >
                        + Ativar
                      </motion.button>
                    </div>
                  ))}
              </div>
            </div>
          </motion.div>
        ) : (
          /* ── TELA PRINCIPAL DE AJUSTES ── */
          <motion.div
            key="main-settings"
            initial={{ opacity: 0, x: shouldReduceMotion ? 0 : -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: shouldReduceMotion ? 0 : 16 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.22, ease: [0.32, 0.72, 0, 1] }}
            className="space-y-6"
          >
            <div>
              <h1 className="text-xl font-bold text-slate-100">Ajustes</h1>
              <p className="text-xs text-slate-400 mt-0.5">Configurações do MedTracker</p>
            </div>

            {/* ── 1. Metas Diárias ────────────────────────────────────────────────── */}
            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm">
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
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.9 }}
                    onClick={() => handleDailyLessonsChange((settings?.dailyNewLessons || 2) - 1)}
                    className="w-8 h-8 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 font-bold flex items-center justify-center transition-colors"
                  >
                    -
                  </motion.button>
                  <span className="w-8 text-center font-bold text-slate-100 text-sm">
                    {settings?.dailyNewLessons ?? 2}
                  </span>
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.9 }}
                    onClick={() => handleDailyLessonsChange((settings?.dailyNewLessons || 2) + 1)}
                    className="w-8 h-8 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 font-bold flex items-center justify-center transition-colors"
                  >
                    +
                  </motion.button>
                </div>
              </div>

              {/* Limite de revisões por dia */}
              <div className="flex items-center justify-between gap-4 pt-3 border-t border-slate-800">
                <div>
                  <p className="text-sm font-semibold text-slate-200">Limite de revisões/dia</p>
                  <p className="text-xs text-slate-400 mt-0.5">Exibidas na fila da aba Hoje</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.9 }}
                    onClick={() => handleDailyReviewCapChange((settings?.dailyReviewCap || 20) - 5)}
                    className="w-8 h-8 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 font-bold flex items-center justify-center transition-colors"
                  >
                    -
                  </motion.button>
                  <span className="w-8 text-center font-bold text-slate-100 text-sm">
                    {settings?.dailyReviewCap ?? 20}
                  </span>
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.9 }}
                    onClick={() => handleDailyReviewCapChange((settings?.dailyReviewCap || 20) + 5)}
                    className="w-8 h-8 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 font-bold flex items-center justify-center transition-colors"
                  >
                    +
                  </motion.button>
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

            {/* ── 2. Botão Matérias Ativas e Ordem (Item 7) ────────────────────────── */}
            <motion.button
              type="button"
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowSubjectsScreen(true)}
              className="w-full bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded-2xl p-4 sm:p-5 flex items-center justify-between gap-3 shadow-sm text-left transition-colors group"
            >
              <div>
                <h2 className="text-sm font-semibold text-slate-200 group-hover:text-white transition-colors">
                  Matérias ativas e ordem
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {activeSubjects.length} de {curriculum.subjects.length} matérias ativas no rodízio
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-semibold text-indigo-400 bg-indigo-950/70 border border-indigo-800/80 px-2 py-0.5 rounded-full">
                  Configurar
                </span>
                <svg
                  className="w-4 h-4 text-slate-500 group-hover:text-slate-300 group-hover:translate-x-0.5 transition-all"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </motion.button>

            {/* ── 3. Sincronização em Nuvem (Google Drive) - Items 6 e 9 ──────────── */}
            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-400">
                    Sincronização em Nuvem (Google Drive)
                  </h2>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Unifique seu progresso de estudos, revisões e questões entre computador, tablet e celular direto no seu Google Drive pessoal.
                  </p>
                </div>

                {/* Indicador discreto de última sincronização - Item 9 */}
                {lastSyncTime && (
                  <div className="text-right shrink-0">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                      Última sinc.
                    </span>
                    <span className="text-xs font-medium text-emerald-400">
                      {new Date(lastSyncTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}{' '}
                      ({new Date(lastSyncTime).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })})
                    </span>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  onClick={handleSyncGoogleDrive}
                  disabled={isSyncing}
                  className="py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-2 shadow-sm"
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
                </motion.button>

                <motion.button
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  onClick={() => setShowClientIdConfig(!showClientIdConfig)}
                  className="py-2.5 px-3.5 bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5"
                >
                  <span>{googleClientId ? 'Configuração' : 'Configurar ID'}</span>
                </motion.button>
              </div>

              {/* Formulário de Client ID */}
              {showClientIdConfig && (
                <div className="p-3.5 bg-slate-950/80 rounded-xl border border-slate-800 space-y-2.5 mt-2">
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
                      Criado gratuitamente no Google Cloud Console com escopo seguro de arquivo próprio.
                    </span>
                    <button
                      type="button"
                      onClick={handleSaveClientId}
                      className="py-1.5 px-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shrink-0 transition-colors"
                    >
                      Salvar
                    </button>
                  </div>
                </div>
              )}

              {/* Feedback de Sincronização */}
              {syncMsg && (
                <div
                  className={`p-3 rounded-xl text-xs ${
                    syncMsg.type === 'success'
                      ? 'bg-emerald-950/70 border border-emerald-800 text-emerald-200'
                      : 'bg-rose-950/70 border border-rose-800 text-rose-200'
                  }`}
                >
                  {syncMsg.text}
                </div>
              )}
            </section>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MaisPage;
