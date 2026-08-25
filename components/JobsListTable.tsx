'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ImpositionJob, JobStatus } from '@/types/imposition';
import {
  Layers,
  CheckCircle2,
  Clock,
  RefreshCw,
  AlertCircle,
  XCircle,
  Eye,
  FileText,
  FileDown,
} from 'lucide-react';

interface JobsListTableProps {
  onSelectJob: (job: ImpositionJob) => void;
  selectedJobId?: string | null;
  refreshTrigger: number;
}

export const JobsListTable: React.FC<JobsListTableProps> = ({
  onSelectJob,
  selectedJobId,
  refreshTrigger,
}) => {
  const [jobs, setJobs] = useState<ImpositionJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [workflowFilter, setWorkflowFilter] = useState<string>('ALL');
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    let isCancelled = false;

    const loadData = async () => {
      try {
        let url = '/api/jobs?limit=50';
        if (statusFilter !== 'ALL') url += `&status=${statusFilter}`;
        if (workflowFilter !== 'ALL') url += `&workflow=${workflowFilter}`;

        const res = await fetch(url, {
          headers: {
            'x-pod-test-panel': 'true',
          },
        });

        if (res.ok && !isCancelled) {
          const data = await res.json();
          setJobs(data.jobs || []);
        }
      } catch (err) {
        if (!isCancelled) {
          console.error('Failed to fetch jobs:', err);
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    loadData();

    let intervalId: NodeJS.Timeout | null = null;
    if (autoRefresh) {
      intervalId = setInterval(() => {
        loadData();
      }, 2500);
    }

    return () => {
      isCancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [statusFilter, workflowFilter, refreshTrigger, autoRefresh]);

  const getStatusBadge = (status: JobStatus) => {
    switch (status) {
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="h-3 w-3" />
            COMPLETED
          </span>
        );
      case 'PROCESSING':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-sky-700 dark:text-sky-400 border border-sky-500/20 animate-pulse">
            <RefreshCw className="h-3 w-3 animate-spin" />
            PROCESSING
          </span>
        );
      case 'QUEUED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400 border border-amber-500/20">
            <Clock className="h-3 w-3" />
            QUEUED
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-neutral-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 border border-neutral-500/20">
            <XCircle className="h-3 w-3" />
            CANCELLED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-rose-700 dark:text-rose-400 border border-rose-500/20">
            <AlertCircle className="h-3 w-3" />
            FAILED
          </span>
        );
    }
  };

  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm overflow-hidden">
      {/* Header & Filters */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-950/60 p-4">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-neutral-600 dark:text-neutral-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
            Kolejka Zleceń w Firestore (`imposition_jobs`)
          </span>
          <span className="rounded-full bg-neutral-200 dark:bg-neutral-800 px-2 py-0.5 text-xs font-mono font-bold text-neutral-700 dark:text-neutral-300">
            {jobs.length}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Status filter */}
          <div className="flex items-center gap-1 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-1">
            {['ALL', 'QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  statusFilter === st
                    ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                    : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          {/* Workflow filter */}
          <div className="flex items-center gap-1 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-1">
            {['ALL', 'GANGING', 'CUT_AND_STACK'].map((wf) => (
              <button
                key={wf}
                onClick={() => setWorkflowFilter(wf)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  workflowFilter === wf
                    ? 'bg-sky-600 text-white'
                    : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                {wf === 'ALL' ? 'Wszystkie' : wf === 'GANGING' ? 'Ganging' : 'Cut & Stack'}
              </button>
            ))}
          </div>

          {/* Auto refresh toggle */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors ${
              autoRefresh
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border-neutral-300 dark:border-neutral-700'
            }`}
          >
            <RefreshCw className={`h-3 w-3 ${autoRefresh ? 'animate-spin' : ''}`} />
            Live Polling (2.5s)
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-neutral-50 dark:bg-neutral-950 text-neutral-500 border-b border-neutral-200 dark:border-neutral-800 font-medium">
            <tr>
              <th className="p-3.5">Job ID</th>
              <th className="p-3.5">Workflow & Maszyna</th>
              <th className="p-3.5">Arkusz & Pozycje</th>
              <th className="p-3.5">Standard PDF</th>
              <th className="p-3.5">Uzysk (Yield) / Nakład</th>
              <th className="p-3.5">Status</th>
              <th className="p-3.5">Czas utworzenia</th>
              <th className="p-3.5 text-right">Akcje</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/60">
            {isLoading && jobs.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-neutral-500">
                  <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-sky-500" />
                  Ładowanie kolejki zleceń z Firestore...
                </td>
              </tr>
            ) : jobs.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-neutral-500">
                  Brak zleceń w kolejce dla wybranych filtrów. Wybierz preset powyżej i kliknij &quot;Wyślij zlecenie do API&quot;.
                </td>
              </tr>
            ) : (
              jobs.map((job) => {
                const isSelected = selectedJobId === job.id;
                return (
                  <tr
                    key={job.id}
                    onClick={() => onSelectJob(job)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-sky-50/70 dark:bg-sky-950/30'
                        : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/40'
                    }`}
                  >
                    <td className="p-3.5 font-mono text-neutral-900 dark:text-neutral-100">
                      <div className="font-bold">{job.id}</div>
                      {job.name && (
                        <div className="text-[11px] font-sans font-medium text-sky-600 dark:text-sky-400 truncate max-w-[220px]">
                          {job.name}
                        </div>
                      )}
                      {job.orders && job.orders.length > 0 && (
                        <div className="text-[10px] font-sans text-neutral-500 truncate max-w-[220px] mt-0.5">
                          {job.orders.map(o => o.order_id + (o.customer_reference ? ` (${o.customer_reference})` : '')).join(', ')}
                        </div>
                      )}
                    </td>

                    <td className="p-3.5">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`font-semibold ${
                            job.workflow === 'GANGING' ? 'text-sky-600 dark:text-sky-400' : 'text-indigo-600 dark:text-indigo-400'
                          }`}
                        >
                          {job.workflow === 'GANGING' ? 'GANGING' : 'CUT & STACK'}
                        </span>
                        <span className="text-neutral-400">•</span>
                        <span className="text-neutral-600 dark:text-neutral-400">
                          {job.device_type === 'GUILLOTINE' ? 'Gilotyna' : 'Ploter CNC'}
                        </span>
                      </div>
                    </td>

                    <td className="p-3.5">
                      <div className="font-mono text-neutral-700 dark:text-neutral-300">
                        {job.sheet.width_mm} × {job.sheet.height_mm} mm
                      </div>
                      <div className="text-[11px] text-neutral-500">
                        {job.orders.length} pozycji (nakład łączny:{' '}
                        {job.orders.reduce((s, o) => s + o.quantity, 0).toLocaleString()})
                      </div>
                    </td>

                    <td className="p-3.5 font-mono text-neutral-600 dark:text-neutral-400">
                      {job.pdf_standard}
                    </td>

                    <td className="p-3.5 font-mono">
                      {job.result ? (
                        <div>
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">
                            {job.result.yield_percentage}% uzysk
                          </span>
                          <span className="text-neutral-400 block text-[11px]">
                            {job.result.sheet_run_count} ark.
                          </span>
                        </div>
                      ) : (
                        <span className="text-neutral-400">—</span>
                      )}
                    </td>

                    <td className="p-3.5">{getStatusBadge(job.status)}</td>

                    <td className="p-3.5 text-neutral-500 font-mono text-[11px]">
                      {new Date(job.created_at).toLocaleTimeString('pl-PL', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>

                    <td className="p-3.5 text-right">
                      <div className="inline-flex items-center gap-1.5 justify-end">
                        {job.status === 'COMPLETED' && (
                          <a
                            href={`/api/jobs/${job.id}/render-pdf?source=test-panel`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            title="Pobierz / Otwórz Arkusz PDF"
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-sky-500/15 hover:bg-sky-500/25 text-sky-700 dark:text-sky-400 font-semibold text-xs transition-colors border border-sky-500/30"
                          >
                            <FileDown className="h-3 w-3" />
                            PDF
                          </a>
                        )}
                        <a
                          href={`/api/jobs/${job.id}/report?source=test-panel`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          title="Otwórz / Wydrukuj Raport Technologiczny"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 font-medium text-xs transition-colors border border-amber-500/30"
                        >
                          <FileText className="h-3 w-3" />
                          Raport
                        </a>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectJob(job);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 font-medium text-xs transition-colors"
                        >
                          <Eye className="h-3 w-3" />
                          Szczegóły
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
