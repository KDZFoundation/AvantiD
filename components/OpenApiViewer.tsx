'use client';

import React, { useState } from 'react';
import { Terminal, Copy, Check, FileText, CheckCircle2 } from 'lucide-react';

export const OpenApiViewer: React.FC = () => {
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(id);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const sampleCurl = `curl -X POST "https://api.example.com/api/jobs" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_POD_API_SECRET_KEY" \\
  -d '{
    "workflow": "GANGING",
    "device_type": "GUILLOTINE",
    "pdf_standard": "PDF/X-4",
    "sheet": {
      "width_mm": 1000.0,
      "height_mm": 700.0,
      "margins_mm": 5.0,
      "gripper_margin_mm": 15.0
    },
    "orders": [
      {
        "order_id": "ORD-AZURE-FLYER-01",
        "pdf_source_url": "https://podstorage.blob.core.windows.net/files/flyer_a6.pdf",
        "trim_width_mm": 105.0,
        "trim_height_mm": 148.0,
        "bleed_mm": 2.0,
        "quantity": 5000
      }
    ]
  }'`;

  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm overflow-hidden p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-200 dark:border-neutral-800 pb-4">
        <div>
          <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
            <FileText className="h-5 w-5 text-sky-500" />
            Dokumentacja API & Specyfikacja OpenAPI 3.1
          </h3>
          <p className="text-xs text-neutral-500 mt-0.5">
            Interfejs RESTful API dedykowany do integracji z systemem Microsoft Azure POD.
          </p>
        </div>
        <a
          href="/api/openapi.json"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-xs font-semibold text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
        >
          Otwórz surowy spec JSON (/api/openapi.json)
        </a>
      </div>

      {/* Endpoints Table */}
      <div className="space-y-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
          Zdefiniowane Endpointy API
        </h4>

        <div className="space-y-3">
          {/* POST /api/jobs */}
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-950/40 p-4">
            <div className="flex items-center gap-2.5">
              <span className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-black text-white font-mono">
                POST
              </span>
              <span className="font-mono text-xs font-bold text-neutral-900 dark:text-neutral-100">
                /api/jobs
              </span>
              <span className="text-xs text-neutral-500 ml-auto font-mono">202 Accepted</span>
            </div>
            <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-2 leading-relaxed">
              Przyjmuje zlecenie impozycji (Ganging lub Cut & Stack), waliduje parametry (zod), zapisuje w Firestore (`QUEUED`), uruchamia asynchroniczną optymalizację i natychmiast zwraca `job_id` oraz URL do odpytywania.
            </p>
          </div>

          {/* GET /api/jobs/{id} */}
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-950/40 p-4">
            <div className="flex items-center gap-2.5">
              <span className="rounded-md bg-sky-600 px-2.5 py-1 text-xs font-black text-white font-mono">
                GET
              </span>
              <span className="font-mono text-xs font-bold text-neutral-900 dark:text-neutral-100">
                /api/jobs/{'{id}'}
              </span>
              <span className="text-xs text-neutral-500 ml-auto font-mono">200 OK</span>
            </div>
            <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-2 leading-relaxed">
              Zwraca bieżący status zlecenia (`QUEUED` | `PROCESSING` | `COMPLETED` | `FAILED` | `CANCELLED`). W przypadku ukończenia zwraca wskaźnik uzysku (`yield_percentage`), nakład arkuszy (`sheet_run_count`), współrzędne impozycji oraz link do pliku produkcyjnego PDF w Google Cloud Storage.
            </p>
          </div>

          {/* GET /api/jobs */}
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-950/40 p-4">
            <div className="flex items-center gap-2.5">
              <span className="rounded-md bg-sky-600 px-2.5 py-1 text-xs font-black text-white font-mono">
                GET
              </span>
              <span className="font-mono text-xs font-bold text-neutral-900 dark:text-neutral-100">
                /api/jobs
              </span>
              <span className="text-xs text-neutral-500 ml-auto font-mono">200 OK</span>
            </div>
            <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-2 leading-relaxed">
              Lista ostatnich zleceń z możliwością filtrowania po parametrach query: `?status=COMPLETED&workflow=GANGING&limit=50`.
            </p>
          </div>

          {/* POST /api/jobs/{id}/cancel */}
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-950/40 p-4">
            <div className="flex items-center gap-2.5">
              <span className="rounded-md bg-rose-600 px-2.5 py-1 text-xs font-black text-white font-mono">
                POST
              </span>
              <span className="font-mono text-xs font-bold text-neutral-900 dark:text-neutral-100">
                /api/jobs/{'{id}'}/cancel
              </span>
              <span className="text-xs text-neutral-500 ml-auto font-mono">200 OK / 409 Conflict</span>
            </div>
            <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-2 leading-relaxed">
              Anuluje zlecenie oczekujące w kolejce `QUEUED` lub w trakcie `PROCESSING`.
            </p>
          </div>
        </div>
      </div>

      {/* Terminal Sample */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-neutral-500">
          <span className="font-bold uppercase tracking-wider">Przykładowe wywołanie cURL z zewnętrznego serwera:</span>
          <button
            onClick={() => copyToClipboard(sampleCurl, 'curl-main')}
            className="flex items-center gap-1 text-sky-600 hover:text-sky-500"
          >
            {copiedSection === 'curl-main' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            Kopiuj polecenie
          </button>
        </div>
        <pre className="p-4 rounded-xl bg-neutral-950 text-neutral-300 font-mono text-xs overflow-x-auto leading-relaxed border border-neutral-800">
          {sampleCurl}
        </pre>
      </div>
    </div>
  );
};
