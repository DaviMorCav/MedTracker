import React from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { db } from '../db';
import { useLiveQuery } from '../db/useLiveQuery';
import { DEFAULT_SETTINGS } from '../db/operations';
import type { UserSettings } from '../db/schema';
import { curriculum, subjectById } from '../data/curriculum';

const tabs = [
  {
    to: '/',
    label: 'Hoje',
    end: true,
    path: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  },
  {
    to: '/conteudo',
    label: 'Conteúdo',
    end: false,
    path: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
  },
  {
    to: '/revisoes',
    label: 'Revisões',
    end: false,
    path: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
  },
  {
    to: '/questoes',
    label: 'Questões',
    end: false,
    path: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  {
    to: '/mais',
    label: 'Mais',
    end: false,
    path: 'M4 6h16M4 12h16M4 18h16',
  },
];

const TabIcon: React.FC<{ path: string; className: string }> = ({ path, className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d={path} />
  </svg>
);

// Cores das "etiquetas" das matérias na barra lateral (por posição no currículo)
const TAG_COLORS = ['bg-rose-500', 'bg-amber-500', 'bg-emerald-500', 'bg-blue-500', 'bg-purple-500', 'bg-indigo-500'];

export const Layout: React.FC = () => {
  const location = useLocation();
  const shouldReduceMotion = useReducedMotion();

  const settings = useLiveQuery<UserSettings>(
    async () => (await db.settings.get('default')) || DEFAULT_SETTINGS,
    [],
    DEFAULT_SETTINGS
  );

  const activeSubjects = (settings?.activeSubjects ?? [])
    .map((id) => subjectById.get(id))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 md:flex">
      {/* Barra lateral (computador e tablet), no estilo da barra do Finder */}
      <aside className="hidden md:flex md:flex-col md:fixed md:inset-y-0 md:left-0 md:w-56 border-r border-slate-800 bg-slate-900/90 backdrop-blur-xl px-3 py-4 overflow-y-auto">
        <div className="px-2 pb-3 text-sm font-semibold text-slate-100 flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-sm shadow-indigo-500/50" />
          <span>MedTracker</span>
        </div>

        <nav aria-label="Principal" className="space-y-0.5">
          <p className="px-2 pt-2 pb-1 text-[11px] font-semibold text-slate-400">Favoritos</p>
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] transition-colors select-none ${
                  isActive
                    ? 'bg-slate-800 text-slate-100 font-medium'
                    : 'text-slate-200 hover:bg-slate-800/60'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <TabIcon
                    path={tab.path}
                    className={`w-4 h-4 shrink-0 ${isActive ? 'text-indigo-400' : 'text-slate-400'}`}
                  />
                  <span>{tab.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {activeSubjects.length > 0 && (
          <nav aria-label="Matérias ativas" className="mt-5 space-y-0.5">
            <p className="px-2 pb-1 text-[11px] font-semibold text-slate-400">Matérias ativas</p>
            {activeSubjects.map((subject) => {
              const idx = curriculum.subjects.findIndex((s) => s.id === subject.id);
              return (
                <Link
                  key={subject.id}
                  to={`/conteudo?materia=${subject.id}`}
                  className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] text-slate-200 hover:bg-slate-800/60 transition-colors"
                >
                  <span className={`w-2.5 h-2.5 shrink-0 rounded-full ${TAG_COLORS[Math.max(idx, 0) % TAG_COLORS.length]}`} />
                  <span className="truncate">{subject.name}</span>
                </Link>
              );
            })}
          </nav>
        )}
      </aside>

      {/* Conteúdo Principal com transição ágil e fluida de abas */}
      <main className="flex-1 min-w-0 w-full mx-auto px-4 pt-4 pb-24 md:pl-64 md:pr-8 md:pt-6 md:pb-10 md:max-w-none">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: shouldReduceMotion ? 0 : 0.12, ease: [0.32, 0.72, 0, 1] }}
          className="mx-auto w-full max-w-md md:max-w-6xl"
        >
          <Outlet />
        </motion.div>
      </main>

      {/* Barra de navegação inferior (celular) com feedback tátil de toque (Item 11) */}
      <nav
        aria-label="Principal"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/90 backdrop-blur-xl border-t border-slate-800 pb-[env(safe-area-inset-bottom)]"
      >
        <div className="max-w-md mx-auto flex items-center justify-around h-16 px-1">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center flex-1 py-1 text-[11px] font-medium transition-colors select-none active:scale-95 ${
                  isActive ? 'text-indigo-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
                }`
              }
            >
              <TabIcon path={tab.path} className="w-6 h-6 mb-1" />
              <span>{tab.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
};

export default Layout;
