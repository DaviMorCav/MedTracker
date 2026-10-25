import React, { useState } from 'react';
import { ResolverTab } from './Resolver';
import { RegistrosQuestoes } from './Registros';

type Tab = 'resolver' | 'registros';

const TABS: { id: Tab; label: string }[] = [
  { id: 'resolver', label: 'Resolver' },
  { id: 'registros', label: 'Registros' },
];

export const QuestoesPage: React.FC = () => {
  const [tab, setTab] = useState<Tab>('resolver');

  return (
    <div className="py-2 space-y-4">
      <div
        role="tablist"
        className="flex gap-1 p-1 rounded-lg bg-slate-850 border border-slate-800 w-full md:w-72"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-1.5 rounded-md text-sm font-semibold transition-colors ${
              tab === t.id
                ? 'bg-slate-950 text-slate-100 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* As duas abas ficam montadas, para não perder a sessão ao trocar de aba */}
      <div className={tab === 'resolver' ? 'md:max-w-3xl md:mx-auto' : 'hidden'}>
        <ResolverTab />
      </div>
      <div className={tab === 'registros' ? '' : 'hidden'}>
        <RegistrosQuestoes />
      </div>
    </div>
  );
};

export default QuestoesPage;
