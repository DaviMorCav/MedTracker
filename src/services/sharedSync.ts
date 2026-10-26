import { exportCurrentBackup, applyBackupData, onDatabaseChange } from '../db/operations';
import { mergeBackupData } from '../core/driveSync';
import type { BackupData } from '../core/backup';

const DEFAULT_SYNC_ENDPOINT = '/api/sync';
const ENDPOINT_STORAGE_KEY = 'medtracker_shared_sync_endpoint';
const LAST_SYNC_STORAGE_KEY = 'medtracker_last_sync_time';

export function getSyncEndpoint(): string {
  if (typeof window === 'undefined') return DEFAULT_SYNC_ENDPOINT;
  return localStorage.getItem(ENDPOINT_STORAGE_KEY) || DEFAULT_SYNC_ENDPOINT;
}

export function setSyncEndpoint(endpoint: string): void {
  if (typeof window === 'undefined') return;
  const clean = endpoint.trim();
  if (clean) {
    localStorage.setItem(ENDPOINT_STORAGE_KEY, clean);
  } else {
    localStorage.removeItem(ENDPOINT_STORAGE_KEY);
  }
}

export function getLastSyncTime(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(LAST_SYNC_STORAGE_KEY);
}

/**
 * Busca o histórico compartilhado armazenado no servidor ou na nuvem.
 */
export async function fetchRemoteBackup(endpoint?: string): Promise<BackupData | null> {
  const url = endpoint || getSyncEndpoint();
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error(`Servidor respondeu com status ${res.status}`);
    }

    const json = await res.json();
    if (!json || json.empty || !json.data) {
      return null;
    }
    return json as BackupData;
  } catch (err) {
    console.warn('[MedTracker Sync] Falha ao buscar histórico compartilhado:', err);
    throw err;
  }
}

/**
 * Salva o backup unificado no endpoint compartilhado.
 */
export async function uploadRemoteBackup(backup: BackupData, endpoint?: string): Promise<void> {
  const url = endpoint || getSyncEndpoint();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(backup),
  });

  if (!res.ok) {
    throw new Error(`Falha ao salvar no servidor compartilhado (status ${res.status})`);
  }
}

/**
 * Executa a sincronização do histórico compartilhado:
 * - Lê o banco IndexedDB local
 * - Baixa a versão compartilhada da nuvem
 * - Mescla sem perda de dados (mergeBackupData)
 * - Atualiza o banco local do dispositivo
 * - Envia o estado unificado para a nuvem
 * Qualquer outro computador/celular que acessar receberá o mesmo estado!
 */
export async function syncSharedHistory(options?: {
  endpoint?: string;
  silent?: boolean;
}): Promise<{
  success: boolean;
  message: string;
  mergedBackup?: BackupData;
}> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      success: false,
      message: 'Dispositivo offline. As alterações continuam salvas localmente neste aparelho.',
    };
  }

  const endpoint = options?.endpoint || getSyncEndpoint();

  try {
    const localBackup = await exportCurrentBackup();
    let remoteBackup: BackupData | null = null;

    try {
      remoteBackup = await fetchRemoteBackup(endpoint);
    } catch (fetchErr) {
      return {
        success: false,
        message:
          fetchErr instanceof Error
            ? fetchErr.message
            : 'Não foi possível conectar ao servidor de sincronização.',
      };
    }

    let finalBackup: BackupData = localBackup;

    if (remoteBackup && remoteBackup.data) {
      // Mescla com segurança sem perder dados
      finalBackup = mergeBackupData(localBackup, remoteBackup);
      // Atualiza o IndexedDB local
      await applyBackupData(finalBackup);
    }

    // Salva na nuvem para manter atualizado para todos os outros PCs/dispositivos
    await uploadRemoteBackup(finalBackup, endpoint);

    const now = new Date().toISOString();
    if (typeof window !== 'undefined') {
      localStorage.setItem(LAST_SYNC_STORAGE_KEY, now);
    }

    const progCount =
      finalBackup.data.progress?.filter((p) => p.status === 'concluida').length || 0;
    const revCount = finalBackup.data.reviews?.length || 0;

    return {
      success: true,
      message: `Sincronizado! Histórico compartilhado unificado (${progCount} aulas concluídas, ${revCount} revisões).`,
      mergedBackup: finalBackup,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Falha na sincronização compartilhada.';
    return { success: false, message: msg };
  }
}

let syncTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Dispara uma sincronização em segundo plano com debounce de 2.5 segundos
 * após alterações locais, para que todos os PCs recebam as atualizações.
 */
export function triggerBackgroundSync(): void {
  if (typeof window === 'undefined') return;
  if (syncTimeout) {
    clearTimeout(syncTimeout);
  }
  syncTimeout = setTimeout(() => {
    syncSharedHistory({ silent: true }).catch((err) => {
      console.warn('[MedTracker Sync] Sincronização em segundo plano falhou:', err);
    });
  }, 2500);
}

// Conecta automaticamente alterações locais ao agendamento de sincronização
if (typeof window !== 'undefined') {
  onDatabaseChange(() => {
    triggerBackgroundSync();
  });
}
