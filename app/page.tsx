'use client';

import React, { useState } from 'react';
import { DevOpsStatusHeader } from '@/components/DevOpsStatusHeader';
import { JobSubmitForm } from '@/components/JobSubmitForm';
import { JobsListTable } from '@/components/JobsListTable';
import { JobDetailModal } from '@/components/JobDetailModal';
import { OpenApiViewer } from '@/components/OpenApiViewer';
import { ImpositionJob } from '@/types/imposition';
import {
  Layers,
  FileCode2,
  GitMerge,
  Server,
  Cloud,
  CheckCircle2,
  Terminal,
  Cpu,
  ArrowRight,
  Shield,
  HelpCircle,
} from 'lucide-react';

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<'panel' | 'openapi' | 'arch'>('panel');
  const [selectedJob, setSelectedJob] = useState<ImpositionJob | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  const handleJobSubmitted = async (jobId: string) => {
    setRefreshTrigger((prev) => prev + 1);
    // Fetch and open the newly created job details
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        headers: { 'x-pod-test-panel': 'true' },
      });
      if (res.ok) {
        const data = await res.json();
        // Transform to ImpositionJob format if necessary
        setSelectedJob({
          id: data.job_id,
          status: data.status,
          workflow: data.workflow,
          device_type: data.device_type,
          pdf_standard: data.pdf_standard,
          sheet: data.request_spec?.sheet,
          orders: data.request_spec?.orders,
          created_at: data.created_at,
          updated_at: data.updated_at,
          started_at: data.started_at,
          completed_at: data.completed_at,
          result: data.result,
          error_message: data.error_message,
        });
      }
    } catch (err) {
      console.error('Error fetching newly created job:', err);
    }
  };

  const handleSelectJob = (job: ImpositionJob) => {
    setSelectedJob(job);
  };

  const handleRefreshCurrentJob = async () => {
    if (!selectedJob) return;
    try {
      const res = await fetch(`/api/jobs/${selectedJob.id}`, {
        headers: { 'x-pod-test-panel': 'true' },
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedJob({
          id: data.job_id,
          status: data.status,
          workflow: data.workflow,
          device_type: data.device_type,
          pdf_standard: data.pdf_standard,
          sheet: data.request_spec?.sheet || selectedJob.sheet,
          orders: data.request_spec?.orders || selectedJob.orders,
          created_at: data.created_at,
          updated_at: data.updated_at,
          started_at: data.started_at,
          completed_at: data.completed_at,
          result: data.result,
          error_message: data.error_message,
        });
        setRefreshTrigger((p) => p + 1);
      }
    } catch (err) {
      console.error('Failed to refresh job:', err);
    }
  };

  const handleCancelJob = async (jobId: string) => {
    try {
      const res = await fetch(`/api/jobs/${jobId}/cancel`, {
        method: 'POST',
        headers: {
          'x-pod-test-panel': 'true',
        },
      });
      if (res.ok) {
        handleRefreshCurrentJob();
        setRefreshTrigger((p) => p + 1);
      }
    } catch (err) {
      console.error('Error cancelling job:', err);
    }
  };

  return (
    <main className="min-h-screen bg-neutral-100 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 font-sans p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Top DevOps Header */}
        <DevOpsStatusHeader />

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-neutral-200 dark:border-neutral-800 pb-1">
          <button
            onClick={() => setActiveTab('panel')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-colors ${
              activeTab === 'panel'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800'
            }`}
          >
            <Layers className="h-4 w-4" />
            Panel Testowy API (Wysyłanie i Podgląd Zleceń)
          </button>

          <button
            onClick={() => setActiveTab('openapi')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-colors ${
              activeTab === 'openapi'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800'
            }`}
          >
            <FileCode2 className="h-4 w-4" />
            Dokumentacja OpenAPI 3.1 & Endpointy
          </button>

          <button
            onClick={() => setActiveTab('arch')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-colors ${
              activeTab === 'arch'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800'
            }`}
          >
            <GitMerge className="h-4 w-4" />
            Architektura & Integracja Azure POD
          </button>
        </div>

        {/* Tab 1: Test Panel */}
        {activeTab === 'panel' && (
          <div className="space-y-6">
            {/* Submit Job Box */}
            <JobSubmitForm onJobSubmitted={handleJobSubmitted} />

            {/* Jobs Queue Table */}
            <JobsListTable
              onSelectJob={handleSelectJob}
              selectedJobId={selectedJob?.id}
              refreshTrigger={refreshTrigger}
            />
          </div>
        )}

        {/* Tab 2: OpenAPI Spec & Docs */}
        {activeTab === 'openapi' && <OpenApiViewer />}

        {/* Tab 3: Architecture & Azure POD integration */}
        {activeTab === 'arch' && (
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 space-y-6 shadow-sm">
            <div>
              <h3 className="text-lg font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                <GitMerge className="h-5 w-5 text-sky-500" />
                Architektura Integracji: Azure POD ⟷ Next.js API ⟷ Cloud Run Python
              </h3>
              <p className="text-xs text-neutral-500 mt-1">
                Model asynchroniczny (202 Accepted + Polling) zoptymalizowany pod kątem niezawodności i wydajności w prepressie.
              </p>
            </div>

            {/* Step by Step Flow */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
              <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 bg-neutral-50 dark:bg-neutral-950/40">
                <div className="font-mono font-bold text-sky-600 dark:text-sky-400 mb-1">01. Azure POD (Client)</div>
                <h4 className="font-bold text-neutral-900 dark:text-neutral-100 mb-1">Wysłanie zlecenia</h4>
                <p className="text-neutral-600 dark:text-neutral-400 leading-relaxed">
                  Zewnętrzny system w Microsoft Azure wysyła zapytanie <code className="font-mono text-[11px] bg-neutral-200 dark:bg-neutral-800 px-1 rounded">POST /api/jobs</code> z nagłówkiem <code className="font-mono text-[11px] bg-neutral-200 dark:bg-neutral-800 px-1 rounded">X-API-Key</code> i linkami do plików PDF (np. Azure Blob).
                </p>
              </div>

              <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 bg-neutral-50 dark:bg-neutral-950/40">
                <div className="font-mono font-bold text-emerald-600 dark:text-emerald-400 mb-1">02. Next.js Route Handlers</div>
                <h4 className="font-bold text-neutral-900 dark:text-neutral-100 mb-1">Walidacja & Stan</h4>
                <p className="text-neutral-600 dark:text-neutral-400 leading-relaxed">
                  API waliduje dane wejściowe (Zod), zapisuje status <code className="font-mono text-[11px] text-amber-600 font-bold">QUEUED</code> w Firestore i natychmiast zwraca <code className="font-mono text-[11px] font-bold text-emerald-600">202 Accepted</code> z <code className="font-mono text-[11px]">status_url</code>.
                </p>
              </div>

              <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 bg-neutral-50 dark:bg-neutral-950/40">
                <div className="font-mono font-bold text-indigo-600 dark:text-indigo-400 mb-1">03. Python Solver (Cloud Run)</div>
                <h4 className="font-bold text-neutral-900 dark:text-neutral-100 mb-1">Optymalizacja i PDF</h4>
                <p className="text-neutral-600 dark:text-neutral-400 leading-relaxed">
                  Dedykowany mikroserwis Python (FastAPI/PyMuPDF) oblicza nesting 2D / sekwencję Cut & Stack, generuje produkcyjny PDF/X-4 i zapisuje go w Google Cloud Storage.
                </p>
              </div>

              <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 bg-neutral-50 dark:bg-neutral-950/40">
                <div className="font-mono font-bold text-purple-600 dark:text-purple-400 mb-1">04. Polling & Pobranie</div>
                <h4 className="font-bold text-neutral-900 dark:text-neutral-100 mb-1">Gotowy plik produkcyjny</h4>
                <p className="text-neutral-600 dark:text-neutral-400 leading-relaxed">
                  System Azure odpytuje cyklicznie <code className="font-mono text-[11px] bg-neutral-200 dark:bg-neutral-800 px-1 rounded">GET /api/jobs/{'{id}'}</code>. Po osiągnięciu <code className="font-mono text-[11px] text-emerald-600 font-bold">COMPLETED</code> pobiera gotowy plik PDF i statystyki uzysku.
                </p>
              </div>
            </div>

            {/* Print Engineering Rules & Formulas */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 space-y-2">
                <h4 className="font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-sky-500" />
                  Algorytm GANGING (Combo-Run & Cięcia Gilotynowe)
                </h4>
                <ul className="space-y-1.5 text-neutral-600 dark:text-neutral-400 list-disc list-inside leading-relaxed">
                  <li>Łączenie wielu zleceń o różnych nakładach na jednym dużym arkuszu offsetowym/cyfrowym (np. B1/B2).</li>
                  <li>Automatyczne dopasowanie proporcji (multiplikatorów) tak, by pojedynczy nakład arkuszy spełnił wszystkie zamówienia przy minimalnym naddatku.</li>
                  <li>Generowanie prostych linii cięcia krawędź-do-krawędzi (Guillotine through-cuts) bez konieczności nacinania ręcznego.</li>
                  <li>Obsługa spadów drukarskich (Bleed Box) oraz marginesu łapki maszyny (Gripper Margin).</li>
                </ul>
              </div>

              <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 space-y-2">
                <h4 className="font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-indigo-500" />
                  Algorytm CUT & STACK (Sekwencjonowanie Stosu)
                </h4>
                <ul className="space-y-1.5 text-neutral-600 dark:text-neutral-400 list-disc list-inside leading-relaxed">
                  <li>Dla $N$ użytków na arkuszu i $M$ elementów całkowitych: wysokość stosu $S = \lceil M / N \rceil$.</li>
                  <li>Arkusz $k$ na pozycji $j$ ($0 \le j &lt; N$) otrzymuje numer $k + j \cdot S$.</li>
                  <li>Po pocięciu całego wydrukowanego stosu i ułożeniu słupków jeden na drugim elementy zachowują ciągłą numerację $1..M$ bez ręcznego zbierania i tasowania.</li>
                  <li>Kluczowe przy druku biletów, voucherów, kart i książek cyfrowych.</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedJob && (
        <JobDetailModal
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
          onCancelJob={handleCancelJob}
          onRefresh={handleRefreshCurrentJob}
        />
      )}
    </main>
  );
}
