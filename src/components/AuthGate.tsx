import React, { useState, useEffect } from 'react';

export const AUTHORIZED_EMAIL = 'davimoreira1307@gmail.com';
const AUTH_STORAGE_KEY = 'medtracker_auth_user';

export interface AuthUser {
  email: string;
  name: string;
  picture?: string;
  authenticatedAt: number;
}

export function getStoredAuthUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed: AuthUser = JSON.parse(raw);
    // Válido por 30 dias
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    if (Date.now() - parsed.authenticatedAt > thirtyDays) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }
    if (parsed.email.toLowerCase() !== AUTHORIZED_EMAIL.toLowerCase()) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function logoutUser(): void {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  window.location.reload();
}

interface AuthGateProps {
  children: React.ReactNode;
}

export const AuthGate: React.FC<AuthGateProps> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(() => getStoredAuthUser());
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [googleClientId] = useState(() => {
    return (
      localStorage.getItem('medtracker_google_client_id') ||
      (import.meta as unknown as { env?: { VITE_GOOGLE_CLIENT_ID?: string } }).env
        ?.VITE_GOOGLE_CLIENT_ID ||
      ''
    );
  });
  const [pinInput, setPinInput] = useState('');
  const [showPinFallback, setShowPinFallback] = useState(false);

  // Inicializa Google Identity Services
  useEffect(() => {
    if (user) return;

    function handleCredentialResponse(response: { credential?: string }) {
      if (!response.credential) return;
      try {
        const payloadBase64 = response.credential.split('.')[1];
        const decoded = JSON.parse(
          decodeURIComponent(
            atob(payloadBase64)
              .split('')
              .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
              .join('')
          )
        );

        const email = (decoded.email || '').toLowerCase().trim();

        if (email === AUTHORIZED_EMAIL.toLowerCase()) {
          const newUser: AuthUser = {
            email,
            name: decoded.name || 'Davi Moreira',
            picture: decoded.picture,
            authenticatedAt: Date.now(),
          };
          localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(newUser));
          setUser(newUser);
          setErrorMsg(null);
        } else {
          setErrorMsg(
            `Acesso Negado: A conta Google (${email}) não tem autorização para acessar este MedTracker. Entre com a conta oficial ${AUTHORIZED_EMAIL}.`
          );
        }
      } catch (err) {
        setErrorMsg('Falha ao processar login com Google.');
      }
    }

    if (!googleClientId) return;

    // Carrega script GIS do Google
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if ((window as any).google?.accounts?.id) {
        (window as any).google.accounts.id.initialize({
          client_id: googleClientId,
          callback: handleCredentialResponse,
          auto_select: true,
        });
        const buttonDiv = document.getElementById('googleSignInBtn');
        if (buttonDiv) {
          (window as any).google.accounts.id.renderButton(buttonDiv, {
            theme: 'filled_blue',
            size: 'large',
            shape: 'pill',
            text: 'continue_with',
            width: 280,
          });
        }
      }
    };
    document.head.appendChild(script);

    return () => {
      script.remove();
    };
  }, [user, googleClientId]);

  // Login de verificação direta para o Davi
  const handleDirectOwnerLogin = () => {
    if (pinInput.trim() === '2026') {
      const newUser: AuthUser = {
        email: AUTHORIZED_EMAIL,
        name: 'Davi Moreira',
        authenticatedAt: Date.now(),
      };
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(newUser));
      setUser(newUser);
      setErrorMsg(null);
    } else {
      setErrorMsg('PIN de confirmação incorreto.');
    }
  };

  if (user) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-slate-100">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-6 text-center">
        {/* Logo / Ícone */}
        <div className="mx-auto w-16 h-16 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-inner">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
        </div>

        {/* Título e Subtítulo */}
        <div className="space-y-1.5">
          <h1 className="text-xl font-bold tracking-tight text-white">MedTracker</h1>
          <p className="text-xs font-medium text-indigo-400 uppercase tracking-wider">
            Acesso Pessoal • Davi Moreira
          </p>
          <p className="text-xs text-slate-400 pt-1 leading-relaxed">
            Aplicativo de estudos privado. Apenas a conta autorizada tem permissão de acesso.
          </p>
        </div>

        {/* Alerta de Erro se houver */}
        {errorMsg && (
          <div className="p-3 bg-rose-950/70 border border-rose-800/80 rounded-xl text-xs text-rose-200 text-left leading-relaxed">
            {errorMsg}
          </div>
        )}

        {/* Área do Botão do Google */}
        <div className="flex flex-col items-center justify-center gap-3 pt-2">
          {googleClientId ? (
            <div id="googleSignInBtn" className="min-h-[44px] flex items-center justify-center" />
          ) : (
            <button
              type="button"
              onClick={() => setShowPinFallback(true)}
              className="w-full py-3 px-4 bg-white hover:bg-slate-100 text-slate-900 rounded-xl font-semibold text-xs transition-colors flex items-center justify-center gap-2.5 shadow-md"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Entrar com Google ({AUTHORIZED_EMAIL.split('@')[0]})</span>
            </button>
          )}

          {/* Autenticação Rápida de Segurança */}
          {showPinFallback && (
            <div className="w-full space-y-3 pt-2 text-left bg-slate-950/80 p-3.5 rounded-xl border border-slate-800">
              <label className="block text-[11px] font-semibold text-slate-300">
                Confirme seu PIN de Acesso Pessoal (2026):
              </label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  placeholder="PIN..."
                  autoFocus
                  className="w-full text-center tracking-widest text-sm bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 font-mono"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleDirectOwnerLogin();
                  }}
                />
                <button
                  type="button"
                  onClick={handleDirectOwnerLogin}
                  className="py-2 px-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shrink-0 transition-colors"
                >
                  Entrar
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé Seguro */}
        <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-500">
          Sessão segura de 30 dias com persistência local.
        </div>
      </div>
    </div>
  );
};
