'use client';

import React from 'react';
import { Server, Database, Cloud, ShieldCheck, Activity, Cpu } from 'lucide-react';

export const DevOpsStatusHeader: React.FC = () => {
  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-900 text-white p-6 shadow-md">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-500/30">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              API SYSTEM READY
            </span>
            <span className="text-xs text-neutral-400 font-mono">v1.0.0-PROD</span>
          </div>
          <h1 className="text-xl md:text-2xl font-black tracking-tight text-white">
            POD Imposition Backend API & Test Panel
          </h1>
          <p className="text-xs md:text-sm text-neutral-300 mt-1 max-w-3xl leading-relaxed">
            Wysokowydajny backend impozycji poligraficznej dla systemów <span className="font-semibold text-sky-400">Print-on-Demand (Azure)</span>. Obsługuje inteligentny <span className="font-semibold text-emerald-400">Ganging Combo-Run</span>, sekwencjonowanie <span className="font-semibold text-indigo-400">Cut & Stack</span>, formaty <span className="font-mono text-amber-300">PDF/X-4 & PDF/X-1a</span> oraz maszyny wykańczające (Gilotyna / Ploter CNC).
          </p>
        </div>

        {/* Microservices Status Pill Group */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 shrink-0 text-xs">
          <div className="rounded-xl border border-neutral-800 bg-neutral-950/80 p-2.5">
            <div className="flex items-center gap-1.5 text-neutral-400 mb-1">
              <Database className="h-3.5 w-3.5 text-amber-400" />
              <span>Baza Danych</span>
            </div>
            <div className="font-bold text-white flex items-center gap-1 font-mono text-[11px]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Firestore Active
            </div>
          </div>

          <div className="rounded-xl border border-neutral-800 bg-neutral-950/80 p-2.5">
            <div className="flex items-center gap-1.5 text-neutral-400 mb-1">
              <ShieldCheck className="h-3.5 w-3.5 text-sky-400" />
              <span>Autoryzacja</span>
            </div>
            <div className="font-bold text-white flex items-center gap-1 font-mono text-[11px]">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
              X-API-Key Auth
            </div>
          </div>

          <div className="rounded-xl border border-neutral-800 bg-neutral-950/80 p-2.5 col-span-2 sm:col-span-1">
            <div className="flex items-center gap-1.5 text-neutral-400 mb-1">
              <Cpu className="h-3.5 w-3.5 text-indigo-400" />
              <span>Silnik Impozycji</span>
            </div>
            <div className="font-bold text-white flex items-center gap-1 font-mono text-[11px]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Ganging & CutStack
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
