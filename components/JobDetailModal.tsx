'use client';

import React, { useState } from 'react';
import { ImpositionJob } from '@/types/imposition';
import { SheetVisualizer } from './SheetVisualizer';
import {
  X,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  FileDown,
  Copy,
  Check,
  Terminal,
  Layers,
  Scissors,
  Sparkles,
  ArrowRight,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';

interface JobDetailModalProps {
  job: ImpositionJob | null;
  onClose: () => void;
  onCancelJob: (jobId: string) => Promise<void>;
  onRefresh: () => void;
}

export const JobDetailModal: React.FC<JobDetailModalProps> = ({
  job,
  onClose,
  onCancelJob,
  onRefresh,
}) => {
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [currentSheetIdx, setCurrentSheetIdx] = useState(1);
  const [isCancelling, setIsCancelling] = useState(false);
  const [codeTab, setCodeTab] = useState<'curl' | 'csharp' | 'python'>('curl');

  if (!job) return null;

  const copyToClipboard = (text: string, sectionId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(sectionId);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="h-3.5 w-3.5" />
            COMPLETED
          </span>
        );
      case 'PROCESSING':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-700 dark:text-sky-400 border border-sky-500/20 animate-pulse">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            PROCESSING (OBICZANIE)
          </span>
        );
      case 'QUEUED':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-700 dark:text-amber-400 border border-amber-500/20">
            <Clock className="h-3.5 w-3.5" />
            QUEUED (W KOLEJCE)
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-500/10 px-3 py-1 text-xs font-semibold text-neutral-600 dark:text-neutral-400 border border-neutral-500/20">
            <XCircle className="h-3.5 w-3.5" />
            CANCELLED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-700 dark:text-rose-400 border border-rose-500/20">
            <AlertCircle className="h-3.5 w-3.5" />
            FAILED
          </span>
        );
    }
  };

  const currentSheet = job.result?.sheets[currentSheetIdx - 1] || job.result?.sheets[0];

  const handleCancel = async () => {
    if (!confirm('Czy na pewno chcesz anulować to zlecenie impozycji?')) return;
    setIsCancelling(true);
    try {
      await onCancelJob(job.id);
    } finally {
      setIsCancelling(false);
    }
  };

  const curlGetCommand = `curl -X GET "https://api.example.com/api/jobs/${job.id}" \\
  -H "X-API-Key: pod_live_secret_key_poligrafia_2026"`;

  const csharpSnippet = `// Azure Function / Worker C# Status Poller
using var client = new HttpClient();
client.DefaultRequestHeaders.Add("X-API-Key", "pod_live_secret_key_poligrafia_2026");
var response = await client.GetAsync("https://api.example.com/api/jobs/${job.id}");
var jobStatus = await response.Content.ReadFromJsonAsync<ImpositionJobResponse>();
if (jobStatus.Status == "COMPLETED") {
    string pdfUrl = jobStatus.Result.DownloadPdfUrl;
    Console.WriteLine($"Production PDF ready: {pdfUrl}");
}`;

  const pythonSnippet = `# Azure Python Automation Worker
import requests

headers = {"X-API-Key": "pod_live_secret_key_poligrafia_2026"}
resp = requests.get("https://api.example.com/api/jobs/${job.id}", headers=headers)
data = resp.json()
if data.get("status") == "COMPLETED":
    pdf_url = data["result"]["download_pdf_url"]
    print(f"Ready: {pdf_url}, Yield: {data['result']['yield_percentage']}%")`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div
        id="job-detail-modal"
        className="relative w-full max-w-5xl rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-2xl overflow-hidden my-8"
      >
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950/60 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-sky-50 dark:bg-sky-950/80 border border-sky-200 dark:border-sky-800 text-sky-600 dark:text-sky-400">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-mono text-base font-bold text-neutral-900 dark:text-neutral-100">
                  {job.id}
                </h3>
                {getStatusBadge(job.status)}
              </div>
              <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                <span className="font-medium text-neutral-700 dark:text-neutral-300">
                  {job.workflow === 'GANGING' ? 'Ganging (Combo-Run)' : 'Cut & Stack'}
                </span>
                <span>•</span>
                <span>{job.device_type === 'GUILLOTINE' ? 'Gilotyna jednonożowa' : 'Ploter CNC + CutContour'}</span>
                <span>•</span>
                <span className="font-mono font-semibold text-neutral-600 dark:text-neutral-400">{job.pdf_standard}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onRefresh}
              className="p-2 rounded-lg text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              title="Odśwież status"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              title="Zamknij"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 max-h-[calc(85vh-80px)] overflow-y-auto">
          {/* Status Alert if Queued or Processing */}
          {job.status === 'PROCESSING' && (
            <div className="rounded-xl border border-sky-200 dark:border-sky-900 bg-sky-50 dark:bg-sky-950/40 p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <RefreshCw className="h-5 w-5 text-sky-600 dark:text-sky-400 animate-spin" />
                <div>
                  <h4 className="text-sm font-semibold text-sky-900 dark:text-sky-200">
                    Trwa optymalizacja impozycji...
                  </h4>
                  <p className="text-xs text-sky-700 dark:text-sky-400">
                    Silnik obliczeniowy analizuje 2D bin packing i minimalizuje odpad papieru.
                  </p>
                </div>
              </div>
              <button
                onClick={onRefresh}
                className="px-3 py-1.5 text-xs font-semibold text-sky-700 dark:text-sky-300 bg-sky-100 dark:bg-sky-900/60 rounded-lg hover:bg-sky-200"
              >
                Sprawdź teraz
              </button>
            </div>
          )}

          {job.status === 'FAILED' && (
            <div className="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-rose-900 dark:text-rose-200">
                  Błąd przetwarzania zlecenia
                </h4>
                <p className="text-xs text-rose-700 dark:text-rose-400 mt-1 font-mono">
                  {job.error_message || 'Nieznany błąd podczas układania użytków.'}
                </p>
              </div>
            </div>
          )}

          {/* Interactive Layout Visualizer (if results available) */}
          {job.result && currentSheet && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                  <Scissors className="h-4 w-4 text-sky-500" />
                  Wizualizacja arkusza produkcyjnego (Podgląd wektorowy)
                </h4>
                <span className="text-xs text-neutral-500 font-mono">
                  Format arkusza: {job.sheet.width_mm} × {job.sheet.height_mm} mm (Margines: {job.sheet.margins_mm}mm, Łapka: {job.sheet.gripper_margin_mm}mm)
                </span>
              </div>

              <SheetVisualizer
                sheet={currentSheet}
                deviceType={job.device_type}
                workflow={job.workflow}
                allSheetsCount={job.result.sheets.length}
                currentSheetIndex={currentSheetIdx}
                onSelectSheet={setCurrentSheetIdx}
              />
            </div>
          )}

          {/* Production KPI & Yield Summary */}
          {job.result && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950/50 p-3.5">
                <div className="text-xs text-neutral-500 font-medium">Uzysk powierzchni (Yield)</div>
                <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                  {job.result.yield_percentage}%
                </div>
                <div className="text-[11px] text-neutral-400 mt-0.5">
                  Odpad papieru: {job.result.waste_percentage}%
                </div>
              </div>

              <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950/50 p-3.5">
                <div className="text-xs text-neutral-500 font-medium">Nakład arkuszy netto</div>
                <div className="text-2xl font-black text-sky-600 dark:text-sky-400 mt-1 font-mono">
                  {job.result.sheet_run_count}
                </div>
                <div className="text-[11px] text-neutral-400 mt-0.5">
                  Liczba cykli maszyny
                </div>
              </div>

              <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950/50 p-3.5">
                <div className="text-xs text-neutral-500 font-medium">Całkowity odpad (m²)</div>
                <div className="text-2xl font-black text-neutral-800 dark:text-neutral-200 mt-1 font-mono">
                  {job.result.total_waste_sqm} m²
                </div>
                <div className="text-[11px] text-neutral-400 mt-0.5">
                  Zadruk: {job.result.total_used_sqm} m²
                </div>
              </div>

              <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950/50 p-3.5">
                <div className="text-xs text-neutral-500 font-medium">Czas optymalizacji</div>
                <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1 font-mono">
                  {job.result.execution_time_ms} ms
                </div>
                <div className="text-[11px] text-neutral-400 mt-0.5">
                  Silnik: {job.result.service_origin}
                </div>
              </div>
            </div>
          )}

          {/* Workflow Specific Breakdown */}
          {job.result && job.workflow === 'GANGING' && job.result.workflow_details.combo_run_multipliers && (
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 bg-white dark:bg-neutral-950/40">
              <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-3 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                Bilans nakładów Combo-Run (Ganging Ratio)
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-neutral-200 dark:border-neutral-800 text-neutral-500">
                      <th className="pb-2 font-medium">ID Zlecenia</th>
                      <th className="pb-2 font-medium">Zamówiony nakład</th>
                      <th className="pb-2 font-medium">Użytków na arkuszu</th>
                      <th className="pb-2 font-medium">Wydrukowano łącznie</th>
                      <th className="pb-2 font-medium">Nadkład (Overprint)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/60 font-mono">
                    {Object.entries(job.result.workflow_details.combo_run_multipliers).map(([ordId, mult]) => (
                      <tr key={ordId}>
                        <td className="py-2.5 font-sans font-semibold text-neutral-900 dark:text-neutral-100">
                          {ordId}
                        </td>
                        <td className="py-2.5 text-neutral-700 dark:text-neutral-300">{mult.ordered.toLocaleString()} szt.</td>
                        <td className="py-2.5 text-sky-600 dark:text-sky-400 font-bold">{mult.per_sheet} up</td>
                        <td className="py-2.5 text-emerald-600 dark:text-emerald-400">{mult.total_printed.toLocaleString()} szt.</td>
                        <td className="py-2.5 text-amber-600 dark:text-amber-400">
                          +{mult.overprint_count.toLocaleString()} szt. ({((mult.overprint_count / mult.ordered) * 100).toFixed(1)}%)
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {job.result && job.workflow === 'CUT_AND_STACK' && job.result.workflow_details.cut_and_stack && (
            <div className="rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/50 dark:bg-indigo-950/20 p-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-900 dark:text-indigo-300 mb-2 flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                Parametry sekwencji Cut & Stack
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs mb-3">
                <div className="bg-white dark:bg-neutral-900 p-2.5 rounded-lg border border-indigo-100 dark:border-indigo-900">
                  <span className="text-neutral-500 block">Łączna liczba użytków:</span>
                  <span className="font-bold font-mono text-neutral-900 dark:text-white">
                    {job.result.workflow_details.cut_and_stack.total_pages_or_items}
                  </span>
                </div>
                <div className="bg-white dark:bg-neutral-900 p-2.5 rounded-lg border border-indigo-100 dark:border-indigo-900">
                  <span className="text-neutral-500 block">Siatka użytków:</span>
                  <span className="font-bold font-mono text-neutral-900 dark:text-white">
                    {job.result.workflow_details.cut_and_stack.grid_cols} × {job.result.workflow_details.cut_and_stack.grid_rows} ({job.result.workflow_details.cut_and_stack.slots_per_sheet} up)
                  </span>
                </div>
                <div className="bg-white dark:bg-neutral-900 p-2.5 rounded-lg border border-indigo-100 dark:border-indigo-900">
                  <span className="text-neutral-500 block">Wysokość stosu arkuszy:</span>
                  <span className="font-bold font-mono text-indigo-600 dark:text-indigo-400">
                    {job.result.workflow_details.cut_and_stack.stack_depth_sheets} arkuszy
                  </span>
                </div>
                <div className="bg-white dark:bg-neutral-900 p-2.5 rounded-lg border border-indigo-100 dark:border-indigo-900">
                  <span className="text-neutral-500 block">Ręczne tasowanie:</span>
                  <span className="font-bold text-emerald-600">0% (Brak)</span>
                </div>
              </div>

              <div className="space-y-1 text-xs text-neutral-700 dark:text-neutral-300 bg-white dark:bg-neutral-900 p-3 rounded-lg border border-indigo-100 dark:border-indigo-900">
                <span className="font-semibold text-neutral-900 dark:text-neutral-100 block mb-1">
                  Instrukcja dla operatora gilotyny introligatorskiej:
                </span>
                {job.result.workflow_details.cut_and_stack.operator_stack_instructions.map((step, idx) => (
                  <p key={idx} className="leading-relaxed">
                    {step}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Download Production PDF Button */}
          {job.result && (
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-gradient-to-r from-neutral-900 to-neutral-800 text-white shadow-lg">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/30">
                  <FileDown className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold">Wynikowy plik produkcyjny ({job.pdf_standard})</h4>
                  <p className="text-xs text-neutral-300 font-mono">
                    {job.result.download_pdf_url.split('/').pop()}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={job.result.download_pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-4 py-2 bg-sky-500 hover:bg-sky-400 text-neutral-950 font-bold rounded-lg text-xs transition-colors shadow"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Pobierz PDF Produkcyjny (Cloud Storage)
                </a>
              </div>
            </div>
          )}

          {/* Azure Integration Code Snippets */}
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-900 text-neutral-100 overflow-hidden">
            <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-2.5 bg-neutral-950">
              <div className="flex items-center gap-2">
                <Terminal className="h-4 w-4 text-sky-400" />
                <span className="text-xs font-semibold text-neutral-300">
                  Integracja Azure POD (Odpytywanie statusu / Poll Status)
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCodeTab('curl')}
                  className={`px-2 py-0.5 text-xs rounded transition-colors ${
                    codeTab === 'curl' ? 'bg-sky-600 text-white' : 'text-neutral-400 hover:bg-neutral-800'
                  }`}
                >
                  cURL
                </button>
                <button
                  onClick={() => setCodeTab('csharp')}
                  className={`px-2 py-0.5 text-xs rounded transition-colors ${
                    codeTab === 'csharp' ? 'bg-sky-600 text-white' : 'text-neutral-400 hover:bg-neutral-800'
                  }`}
                >
                  C# (Azure)
                </button>
                <button
                  onClick={() => setCodeTab('python')}
                  className={`px-2 py-0.5 text-xs rounded transition-colors ${
                    codeTab === 'python' ? 'bg-sky-600 text-white' : 'text-neutral-400 hover:bg-neutral-800'
                  }`}
                >
                  Python
                </button>
                <button
                  onClick={() => {
                    const textToCopy =
                      codeTab === 'curl' ? curlGetCommand : codeTab === 'csharp' ? csharpSnippet : pythonSnippet;
                    copyToClipboard(textToCopy, 'code');
                  }}
                  className="ml-2 flex items-center gap-1 px-2 py-0.5 text-xs rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300"
                >
                  {copiedSection === 'code' ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  Kopiuj
                </button>
              </div>
            </div>
            <pre className="p-4 text-xs font-mono overflow-x-auto text-neutral-300 leading-relaxed">
              {codeTab === 'curl' && curlGetCommand}
              {codeTab === 'csharp' && csharpSnippet}
              {codeTab === 'python' && pythonSnippet}
            </pre>
          </div>

          {/* Request Orders Specification Table */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
              Elementy wejściowe zlecenia ({job.orders.length} pozycji)
            </h4>
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-50 dark:bg-neutral-950 text-neutral-500 border-b border-neutral-200 dark:border-neutral-800">
                  <tr>
                    <th className="p-2.5 font-medium">ID Pozycji</th>
                    <th className="p-2.5 font-medium">Format netto</th>
                    <th className="p-2.5 font-medium">Spad</th>
                    <th className="p-2.5 font-medium">Nakład</th>
                    <th className="p-2.5 font-medium">Źródłowy URL PDF</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                  {job.orders.map((ord) => (
                    <tr key={ord.order_id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-900/50">
                      <td className="p-2.5 font-semibold text-neutral-900 dark:text-neutral-100">
                        {ord.order_id}
                        {ord.custom_label && (
                          <span className="block text-[11px] font-normal text-neutral-500">{ord.custom_label}</span>
                        )}
                      </td>
                      <td className="p-2.5 font-mono">
                        {ord.trim_width_mm} × {ord.trim_height_mm} mm
                      </td>
                      <td className="p-2.5 font-mono">{ord.bleed_mm} mm</td>
                      <td className="p-2.5 font-mono font-semibold">{ord.quantity.toLocaleString()} szt.</td>
                      <td className="p-2.5 font-mono text-[11px] text-sky-600 dark:text-sky-400 truncate max-w-xs">
                        {ord.pdf_source_url}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950/60 px-6 py-4">
          <div className="text-xs text-neutral-500 font-mono">
            Utworzono: {new Date(job.created_at).toLocaleString('pl-PL')}
          </div>

          <div className="flex items-center gap-2">
            {(job.status === 'QUEUED' || job.status === 'PROCESSING') && (
              <button
                onClick={handleCancel}
                disabled={isCancelling}
                className="px-3.5 py-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 rounded-lg transition-colors border border-rose-200 dark:border-rose-900"
              >
                {isCancelling ? 'Anulowanie...' : 'Anuluj zlecenie'}
              </button>
            )}

            <button
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-semibold text-neutral-700 dark:text-neutral-300 bg-white dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-lg transition-colors border border-neutral-200 dark:border-neutral-700"
            >
              Zamknij
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
