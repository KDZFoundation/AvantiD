'use client';

import React, { useState } from 'react';
import { ImpositionJobPayload, OrderItem } from '@/types/imposition';
import { PRESETS, PresetDef } from '@/lib/presets';
import {
  Send,
  Sparkles,
  Code,
  Sliders,
  Plus,
  Trash2,
  Key,
  Layers,
  Scissors,
  CheckCircle2,
  AlertCircle,
  FileCode2,
} from 'lucide-react';

interface JobSubmitFormProps {
  onJobSubmitted: (jobId: string) => void;
}

export const JobSubmitForm: React.FC<JobSubmitFormProps> = ({ onJobSubmitted }) => {
  const [selectedPresetId, setSelectedPresetId] = useState<string>(PRESETS[0].id);
  const [mode, setMode] = useState<'visual' | 'json'>('visual');
  const [apiKey, setApiKey] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{ jobId: string; statusUrl: string } | null>(null);

  // Form State
  const [workflow, setWorkflow] = useState<'GANGING' | 'CUT_AND_STACK'>(PRESETS[0].payload.workflow);
  const [deviceType, setDeviceType] = useState<'GUILLOTINE' | 'CNC_PLOTTER'>(PRESETS[0].payload.device_type);
  const [pdfStandard, setPdfStandard] = useState<'PDF/X-4' | 'PDF/X-1a'>(PRESETS[0].payload.pdf_standard);
  const [sheetWidth, setSheetWidth] = useState<number>(PRESETS[0].payload.sheet.width_mm);
  const [sheetHeight, setSheetHeight] = useState<number>(PRESETS[0].payload.sheet.height_mm);
  const [sheetMargins, setSheetMargins] = useState<number>(PRESETS[0].payload.sheet.margins_mm);
  const [gripperMargin, setGripperMargin] = useState<number>(PRESETS[0].payload.sheet.gripper_margin_mm);
  const [orders, setOrders] = useState<OrderItem[]>(PRESETS[0].payload.orders);

  // Raw JSON state
  const [rawJsonText, setRawJsonText] = useState<string>(
    JSON.stringify(PRESETS[0].payload, null, 2)
  );

  const applyPreset = (preset: PresetDef) => {
    setSelectedPresetId(preset.id);
    setWorkflow(preset.payload.workflow);
    setDeviceType(preset.payload.device_type);
    setPdfStandard(preset.payload.pdf_standard);
    setSheetWidth(preset.payload.sheet.width_mm);
    setSheetHeight(preset.payload.sheet.height_mm);
    setSheetMargins(preset.payload.sheet.margins_mm);
    setGripperMargin(preset.payload.sheet.gripper_margin_mm);
    setOrders(preset.payload.orders);
    setRawJsonText(JSON.stringify(preset.payload, null, 2));
    setErrorMessage(null);
    setSuccessInfo(null);
  };

  const getPayload = (): ImpositionJobPayload => {
    if (mode === 'json') {
      return JSON.parse(rawJsonText);
    }
    return {
      workflow,
      device_type: deviceType,
      pdf_standard: pdfStandard,
      sheet: {
        width_mm: Number(sheetWidth),
        height_mm: Number(sheetHeight),
        margins_mm: Number(sheetMargins),
        gripper_margin_mm: Number(gripperMargin),
      },
      orders: orders.map((o) => ({
        ...o,
        trim_width_mm: Number(o.trim_width_mm),
        trim_height_mm: Number(o.trim_height_mm),
        bleed_mm: Number(o.bleed_mm),
        quantity: Number(o.quantity),
      })),
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessInfo(null);

    try {
      const payload = getPayload();

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (apiKey.trim()) {
        headers['X-API-Key'] = apiKey.trim();
      }

      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || `HTTP ${response.status}`);
      }

      setSuccessInfo({
        jobId: data.job_id,
        statusUrl: data.status_url,
      });

      onJobSubmitted(data.job_id);
    } catch (err: any) {
      setErrorMessage(err.message || 'Wystąpił błąd podczas wysyłania zlecenia.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const addOrderItem = () => {
    const newId = `ORD-CUSTOM-${orders.length + 1}`;
    setOrders([
      ...orders,
      {
        order_id: newId,
        pdf_source_url: 'https://podstorage.blob.core.windows.net/orders/sample_custom.pdf',
        trim_width_mm: 90,
        trim_height_mm: 50,
        bleed_mm: 2,
        quantity: 1000,
        custom_label: `Wizytówki ${orders.length + 1}`,
      },
    ]);
  };

  const removeOrderItem = (index: number) => {
    if (orders.length <= 1) return;
    setOrders(orders.filter((_, i) => i !== index));
  };

  const updateOrderItem = (index: number, field: keyof OrderItem, value: any) => {
    const updated = [...orders];
    updated[index] = { ...updated[index], [field]: value };
    setOrders(updated);
  };

  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm overflow-hidden">
      {/* Presets Bar */}
      <div className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-950/60 p-4">
        <div className="flex items-center gap-2 mb-2.5">
          <Sparkles className="h-4 w-4 text-amber-500" />
          <span className="text-xs font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-300">
            Gotowe Presety Poligraficzne (Print-on-Demand)
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {PRESETS.map((preset) => {
            const isSelected = selectedPresetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset)}
                className={`flex flex-col text-left p-3 rounded-xl border transition-all text-xs ${
                  isSelected
                    ? 'border-sky-500 bg-sky-50/80 dark:bg-sky-950/40 text-sky-950 dark:text-sky-100 shadow-sm ring-1 ring-sky-500'
                    : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/80 hover:border-neutral-300 dark:hover:border-neutral-700 text-neutral-700 dark:text-neutral-300'
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="font-bold">{preset.name}</span>
                </div>
                <span className="text-[10px] font-mono text-sky-600 dark:text-sky-400 font-semibold mb-1">
                  {preset.badge}
                </span>
                <span className="text-[11px] text-neutral-500 dark:text-neutral-400 line-clamp-2 leading-relaxed">
                  {preset.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        {/* Mode Selector & Auth Settings */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setMode('visual');
                try {
                  const parsed = JSON.parse(rawJsonText);
                  setWorkflow(parsed.workflow || 'GANGING');
                  setDeviceType(parsed.device_type || 'GUILLOTINE');
                  setPdfStandard(parsed.pdf_standard || 'PDF/X-4');
                  if (parsed.sheet) {
                    setSheetWidth(parsed.sheet.width_mm);
                    setSheetHeight(parsed.sheet.height_mm);
                    setSheetMargins(parsed.sheet.margins_mm);
                    setGripperMargin(parsed.sheet.gripper_margin_mm);
                  }
                  if (parsed.orders) setOrders(parsed.orders);
                } catch (e) {}
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                mode === 'visual'
                  ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 shadow-sm'
                  : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
              }`}
            >
              <Sliders className="h-3.5 w-3.5" />
              Kreator Wizualny
            </button>

            <button
              type="button"
              onClick={() => {
                setMode('json');
                setRawJsonText(JSON.stringify(getPayload(), null, 2));
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                mode === 'json'
                  ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 shadow-sm'
                  : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
              }`}
            >
              <Code className="h-3.5 w-3.5" />
              Edytor Raw JSON (Azure Payload)
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 px-3 py-1.5 rounded-lg text-xs">
              <Key className="h-3.5 w-3.5 text-neutral-400" />
              <span className="text-neutral-500 font-medium">Nagłówek X-API-Key:</span>
              <input
                type="text"
                placeholder="Wklej POD_API_SECRET_KEY..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="font-mono text-neutral-900 dark:text-neutral-100 bg-transparent border-none focus:outline-none w-52 text-xs"
              />
            </div>
          </div>
        </div>

        {/* Visual Mode Inputs */}
        {mode === 'visual' ? (
          <div className="space-y-6">
            {/* Core Workflow & Device Selector */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Workflow selection */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400 mb-2">
                  1. Tryb Impozycji (Workflow)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setWorkflow('GANGING')}
                    className={`flex flex-col p-3 rounded-xl border text-left transition-all ${
                      workflow === 'GANGING'
                        ? 'border-sky-500 bg-sky-50/60 dark:bg-sky-950/40 text-sky-950 dark:text-sky-200 ring-1 ring-sky-500'
                        : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300'
                    }`}
                  >
                    <span className="font-bold text-xs">GANGING</span>
                    <span className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                      Combo-run, 2D bin packing, minimalizacja odpadu.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setWorkflow('CUT_AND_STACK')}
                    className={`flex flex-col p-3 rounded-xl border text-left transition-all ${
                      workflow === 'CUT_AND_STACK'
                        ? 'border-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/40 text-indigo-950 dark:text-indigo-200 ring-1 ring-indigo-500'
                        : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300'
                    }`}
                  >
                    <span className="font-bold text-xs">CUT & STACK</span>
                    <span className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                      Sekwencjonowanie stosu (książki, bilety).
                    </span>
                  </button>
                </div>
              </div>

              {/* Device Type Selection */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400 mb-2">
                  2. Urządzenie Wykańczające (Device)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDeviceType('GUILLOTINE')}
                    className={`flex flex-col p-3 rounded-xl border text-left transition-all ${
                      deviceType === 'GUILLOTINE'
                        ? 'border-rose-500 bg-rose-50/60 dark:bg-rose-950/40 text-rose-950 dark:text-rose-200 ring-1 ring-rose-500'
                        : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300'
                    }`}
                  >
                    <span className="font-bold text-xs flex items-center gap-1">
                      <Scissors className="h-3 w-3" /> Gilotyna
                    </span>
                    <span className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                      Cięcia proste krawędź-do-krawędzi (through-cuts).
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeviceType('CNC_PLOTTER')}
                    className={`flex flex-col p-3 rounded-xl border text-left transition-all ${
                      deviceType === 'CNC_PLOTTER'
                        ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/40 text-emerald-950 dark:text-emerald-200 ring-1 ring-emerald-500'
                        : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300'
                    }`}
                  >
                    <span className="font-bold text-xs flex items-center gap-1">
                      <Layers className="h-3 w-3" /> Ploter CNC
                    </span>
                    <span className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                      Warstwa CutContour + znaczniki optyczne.
                    </span>
                  </button>
                </div>
              </div>

              {/* PDF Standard */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400 mb-2">
                  3. Standard Pliku PDF
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPdfStandard('PDF/X-4')}
                    className={`flex flex-col p-3 rounded-xl border text-left transition-all ${
                      pdfStandard === 'PDF/X-4'
                        ? 'border-sky-500 bg-sky-50/60 dark:bg-sky-950/40 text-sky-950 dark:text-sky-200 ring-1 ring-sky-500'
                        : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300'
                    }`}
                  >
                    <span className="font-bold text-xs">PDF/X-4</span>
                    <span className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                      Nowoczesny, wspiera warstwy i przezroczystości.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPdfStandard('PDF/X-1a')}
                    className={`flex flex-col p-3 rounded-xl border text-left transition-all ${
                      pdfStandard === 'PDF/X-1a'
                        ? 'border-amber-500 bg-amber-50/60 dark:bg-amber-950/40 text-amber-950 dark:text-amber-200 ring-1 ring-amber-500'
                        : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300'
                    }`}
                  >
                    <span className="font-bold text-xs">PDF/X-1a</span>
                    <span className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                      Ścisłe CMYK, spłaszczone warstwy pod CTP.
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {/* Sheet Dimensions */}
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-950/40 p-4">
              <label className="block text-xs font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400 mb-3">
                Wymiary Arkusza Produkcyjnego (Raw Sheet)
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs text-neutral-500">Szerokość arkusza (mm)</label>
                  <input
                    type="number"
                    value={sheetWidth}
                    onChange={(e) => setSheetWidth(parseFloat(e.target.value) || 0)}
                    className="mt-1 w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-xs font-mono text-neutral-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-neutral-500">Wysokość arkusza (mm)</label>
                  <input
                    type="number"
                    value={sheetHeight}
                    onChange={(e) => setSheetHeight(parseFloat(e.target.value) || 0)}
                    className="mt-1 w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-xs font-mono text-neutral-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-neutral-500">Marginesy ochronne (mm)</label>
                  <input
                    type="number"
                    value={sheetMargins}
                    onChange={(e) => setSheetMargins(parseFloat(e.target.value) || 0)}
                    className="mt-1 w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-xs font-mono text-neutral-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-neutral-500">Łapka maszyny (Gripper mm)</label>
                  <input
                    type="number"
                    value={gripperMargin}
                    onChange={(e) => setGripperMargin(parseFloat(e.target.value) || 0)}
                    className="mt-1 w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-xs font-mono text-neutral-900 dark:text-white"
                  />
                </div>
              </div>
            </div>

            {/* Orders List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
                  Zlecenia Wejściowe do Impozycji ({orders.length})
                </label>
                <button
                  type="button"
                  onClick={addOrderItem}
                  className="flex items-center gap-1 text-xs font-semibold text-sky-600 dark:text-sky-400 hover:text-sky-700"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Dodaj kolejne zamówienie
                </button>
              </div>

              <div className="space-y-2.5">
                {orders.map((ord, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3.5 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 flex-1">
                        <span className="text-xs font-bold font-mono text-neutral-400">#{idx + 1}</span>
                        <input
                          type="text"
                          placeholder="ID Zlecenia (np. ORD-12345)"
                          value={ord.order_id}
                          onChange={(e) => updateOrderItem(idx, 'order_id', e.target.value)}
                          className="font-mono text-xs font-bold text-neutral-900 dark:text-white bg-neutral-100 dark:bg-neutral-800 rounded px-2.5 py-1 border border-neutral-300 dark:border-neutral-700 w-44"
                        />
                        <input
                          type="text"
                          placeholder="Etykieta (np. Ulotka A6)"
                          value={ord.custom_label || ''}
                          onChange={(e) => updateOrderItem(idx, 'custom_label', e.target.value)}
                          className="text-xs text-neutral-700 dark:text-neutral-300 bg-neutral-50 dark:bg-neutral-800/60 rounded px-2.5 py-1 border border-neutral-200 dark:border-neutral-700 flex-1"
                        />
                      </div>
                      {orders.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeOrderItem(idx)}
                          className="text-neutral-400 hover:text-rose-500 p-1"
                          title="Usuń pozycję"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs">
                      <div>
                        <span className="text-[11px] text-neutral-500">Szerokość netto (mm)</span>
                        <input
                          type="number"
                          value={ord.trim_width_mm}
                          onChange={(e) => updateOrderItem(idx, 'trim_width_mm', parseFloat(e.target.value) || 0)}
                          className="mt-0.5 w-full rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-2 py-1 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <span className="text-[11px] text-neutral-500">Wysokość netto (mm)</span>
                        <input
                          type="number"
                          value={ord.trim_height_mm}
                          onChange={(e) => updateOrderItem(idx, 'trim_height_mm', parseFloat(e.target.value) || 0)}
                          className="mt-0.5 w-full rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-2 py-1 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <span className="text-[11px] text-neutral-500">Spad bleed (mm)</span>
                        <input
                          type="number"
                          value={ord.bleed_mm}
                          onChange={(e) => updateOrderItem(idx, 'bleed_mm', parseFloat(e.target.value) || 0)}
                          className="mt-0.5 w-full rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-2 py-1 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <span className="text-[11px] text-neutral-500">Nakład (szt.)</span>
                        <input
                          type="number"
                          value={ord.quantity}
                          onChange={(e) => updateOrderItem(idx, 'quantity', parseInt(e.target.value, 10) || 1)}
                          className="mt-0.5 w-full rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-2 py-1 font-mono text-xs font-bold text-sky-600 dark:text-sky-400"
                        />
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <span className="text-[11px] text-neutral-500">Źródło PDF (Azure / URL)</span>
                        <input
                          type="text"
                          value={ord.pdf_source_url}
                          onChange={(e) => updateOrderItem(idx, 'pdf_source_url', e.target.value)}
                          className="mt-0.5 w-full rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-2 py-1 font-mono text-[11px] truncate text-neutral-600 dark:text-neutral-400"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* JSON Mode */
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-neutral-500">
              <span>Edytuj bezpośredni JSON zlecenia (zgodny z kontraktem REST API):</span>
              <span className="font-mono text-[11px]">POST /api/jobs</span>
            </div>
            <textarea
              rows={14}
              value={rawJsonText}
              onChange={(e) => setRawJsonText(e.target.value)}
              className="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-950 p-4 font-mono text-xs text-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-500 leading-relaxed shadow-inner"
              spellCheck={false}
            />
          </div>
        )}

        {/* Feedback Alerts */}
        {errorMessage && (
          <div className="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-bold text-rose-900 dark:text-rose-200">
                Błąd walidacji lub komunikacji z API
              </h4>
              <p className="text-xs text-rose-700 dark:text-rose-400 mt-0.5 font-mono">{errorMessage}</p>
            </div>
          </div>
        )}

        {successInfo && (
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 p-4 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                  Zlecenie przyjęte pomyślnie (Status 202 Accepted)!
                </h4>
                <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5 font-mono">
                  Job ID: <span className="font-bold">{successInfo.jobId}</span>
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onJobSubmitted(successInfo.jobId)}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors"
            >
              Podgląd zlecenia →
            </button>
          </div>
        )}

        {/* Submit Actions */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
          <div className="text-xs text-neutral-500">
            Odpowiedź serwera: <span className="font-mono font-semibold text-neutral-700 dark:text-neutral-300">202 Accepted</span> (wzorzec asynchroniczny z odpytywaniem statusu).
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:bg-neutral-300 dark:disabled:bg-neutral-800 text-white font-bold text-xs transition-all shadow-md shadow-sky-600/20 active:scale-[0.99]"
          >
            <Send className="h-4 w-4" />
            {isSubmitting ? 'Wysyłanie zlecenia do API...' : 'Wyślij zlecenie do API (POST /api/jobs)'}
          </button>
        </div>
      </form>
    </div>
  );
};
