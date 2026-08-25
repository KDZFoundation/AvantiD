'use client';

import React, { useState, useEffect } from 'react';
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
  Shield,
  Lock,
  LogIn,
  LogOut,
  AlertCircle,
  KeyRound,
} from 'lucide-react';

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<'panel' | 'openapi' | 'arch'>('panel');
  const [selectedJob, setSelectedJob] = useState<ImpositionJob | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  // Session & Authentication state for the browser Test Panel
  const [isCheckingSession] = useState<boolean>(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(true);
  const [loginPassword, setLoginPassword] = useState<string>('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginPassword) return;

    setIsLoggingIn(true);
    setLoginError(null);

    try {
      const res = await fetch('/api/test-panel/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password: loginPassword }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setIsAuthenticated(true);
        setLoginPassword('');
      } else {
        setLoginError(data.message || 'Niepoprawne hasło dostępowe do panelu testowego.');
      }
    } catch (err: any) {
      setLoginError(err.message || 'Błąd połączenia z serwerem podczas logowania.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/test-panel/session', { method: 'DELETE' });
    } catch (err) {
      console.error('Logout error:', err);
    }
    setIsAuthenticated(false);
  };

  const handleJobSubmitted = async (jobId: string) => {
    setRefreshTrigger((prev) => prev + 1);
    try {
      const res = await fetch(`/api/jobs/${jobId}`);
      if (res.ok) {
        const data = await res.json();
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
      const res = await fetch(`/api/jobs/${selectedJob.id}`);
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

        {/* Tab Navigation & Logout Button */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 dark:border-neutral-800 pb-1">
          <div className="flex items-center gap-2">
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

          {isAuthenticated && (
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-lg transition-colors"
              title="Wyloguj z bezpiecznej sesji deweloperskiej"
            >
              <LogOut className="h-3.5 w-3.5" />
              Wyloguj sesję
            </button>
          )}
        </div>

        {/* Tab 1: Test Panel */}
        {activeTab === 'panel' && (
          <div>
            {isCheckingSession ? (
              <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-12 text-center text-xs text-neutral-500">
                Sprawdzanie uprawnień i sesji deweloperskiej...
              </div>
            ) : !isAuthenticated ? (
              /* Developer Login Screen */
              <div className="max-w-md mx-auto my-12 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-8 shadow-sm space-y-6">
                <div className="text-center space-y-2">
                  <div className="inline-flex p-3 rounded-2xl bg-sky-50 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-800 mb-2">
                    <Lock className="h-6 w-6" />
                  </div>
                  <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
                    Panel Testowy POD Imposition
                  </h2>
                  <p className="text-xs text-neutral-500 leading-relaxed">
                    Wprowadź hasło sesji testowej (<code className="font-mono bg-neutral-100 dark:bg-neutral-800 px-1 py-0.5 rounded text-[11px]">INTERNAL_TEST_PANEL_SECRET</code>), aby uzyskać dostęp do panelu deweloperskiego.
                  </p>
                </div>

                {loginError && (
                  <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-300 text-xs">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-500" />
                    <span>{loginError}</span>
                  </div>
                )}

                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1.5">
                      Hasło dostępowe (INTERNAL_TEST_PANEL_SECRET)
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-400">
                        <KeyRound className="h-4 w-4" />
                      </div>
                      <input
                        type="password"
                        required
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        placeholder="Wpisz lub wklej sekret..."
                        className="w-full pl-9 pr-3 py-2 text-xs font-mono rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoggingIn}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs shadow-sm transition-colors disabled:opacity-50"
                  >
                    <LogIn className="h-4 w-4" />
                    {isLoggingIn ? 'Weryfikacja...' : 'Zaloguj do panelu testowego'}
                  </button>
                </form>

                <div className="text-[11px] text-neutral-400 border-t border-neutral-100 dark:border-neutral-800 pt-4 flex items-center gap-2">
                  <Shield className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span>
                    Sesja oparta o bezpieczne ciasteczko <code className="font-mono text-[10px]">httpOnly</code> (Secure & SameSite).
                  </span>
                </div>
              </div>
            ) : (
              /* Authenticated Test Panel */
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
