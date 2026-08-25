'use client';

import React, { useState } from 'react';
import { SheetLayout, DeviceType, ImpositionWorkflow } from '@/types/imposition';
import { Eye, Layers, Scissors, Crosshair, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface SheetVisualizerProps {
  sheet: SheetLayout;
  deviceType: DeviceType;
  workflow: ImpositionWorkflow;
  allSheetsCount?: number;
  currentSheetIndex?: number;
  onSelectSheet?: (index: number) => void;
}

export const SheetVisualizer: React.FC<SheetVisualizerProps> = ({
  sheet,
  deviceType,
  workflow,
  allSheetsCount = 1,
  currentSheetIndex = 1,
  onSelectSheet,
}) => {
  const [showCutLines, setShowCutLines] = useState(true);
  const [showOpticalMarks, setShowOpticalMarks] = useState(true);
  const [showBleedBox, setShowBleedBox] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const viewBoxWidth = sheet.width_mm;
  const viewBoxHeight = sheet.height_mm;

  // Color palette for distinct orders
  const orderColorPalette = [
    { bg: 'fill-sky-100 dark:fill-sky-950/60', border: 'stroke-sky-600', text: 'text-sky-700' },
    { bg: 'fill-emerald-100 dark:fill-emerald-950/60', border: 'stroke-emerald-600', text: 'text-emerald-700' },
    { bg: 'fill-amber-100 dark:fill-amber-950/60', border: 'stroke-amber-600', text: 'text-amber-700' },
    { bg: 'fill-indigo-100 dark:fill-indigo-950/60', border: 'stroke-indigo-600', text: 'text-indigo-700' },
    { bg: 'fill-rose-100 dark:fill-rose-950/60', border: 'stroke-rose-600', text: 'text-rose-700' },
  ];

  // Map order_ids to color indexes
  const distinctOrderIds = Array.from(new Set(sheet.placed_items.map((i) => i.order_id)));
  const getOrderColor = (orderId: string) => {
    const idx = distinctOrderIds.indexOf(orderId) % orderColorPalette.length;
    return orderColorPalette[idx] || orderColorPalette[0];
  };

  const selectedItem = sheet.placed_items.find((i) => i.instance_id === selectedItemId);

  return (
    <div id="sheet-visualizer-container" className="flex flex-col rounded-xl border border-neutral-200 bg-neutral-900 text-neutral-100 overflow-hidden shadow-inner">
      {/* Visualizer Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 bg-neutral-950/80 px-4 py-2.5 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-neutral-300">
            Arkusz: {sheet.width_mm} × {sheet.height_mm} mm
          </span>
          <span className="rounded bg-neutral-800 px-2 py-0.5 text-[11px] font-mono text-neutral-400">
            Użytków na arkuszu: {sheet.placed_items.length}
          </span>
          <span className="rounded bg-emerald-950/80 border border-emerald-800 px-2 py-0.5 text-[11px] font-mono text-emerald-400">
            Uzysk: {sheet.sheet_yield_percentage}%
          </span>
        </div>

        {/* View toggles */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {deviceType === 'GUILLOTINE' && (
            <button
              id="btn-toggle-cutlines"
              onClick={() => setShowCutLines(!showCutLines)}
              className={`flex items-center gap-1 rounded px-2.5 py-1 text-xs transition-colors ${
                showCutLines
                  ? 'bg-rose-950/80 text-rose-300 border border-rose-800'
                  : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
              }`}
            >
              <Scissors className="h-3.5 w-3.5" />
              Linie cięcia gilotyny
            </button>
          )}

          {deviceType === 'CNC_PLOTTER' && (
            <button
              id="btn-toggle-marks"
              onClick={() => setShowOpticalMarks(!showOpticalMarks)}
              className={`flex items-center gap-1 rounded px-2.5 py-1 text-xs transition-colors ${
                showOpticalMarks
                  ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
                  : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
              }`}
            >
              <Crosshair className="h-3.5 w-3.5" />
              Znaczniki CNC / CutContour
            </button>
          )}

          <button
            id="btn-toggle-bleeds"
            onClick={() => setShowBleedBox(!showBleedBox)}
            className={`flex items-center gap-1 rounded px-2.5 py-1 text-xs transition-colors ${
              showBleedBox
                ? 'bg-sky-950/80 text-sky-300 border border-sky-800'
                : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            Spady (Bleed 2mm)
          </button>

          <button
            id="btn-toggle-labels"
            onClick={() => setShowLabels(!showLabels)}
            className={`flex items-center gap-1 rounded px-2.5 py-1 text-xs transition-colors ${
              showLabels
                ? 'bg-amber-950/80 text-amber-300 border border-amber-800'
                : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
            }`}
          >
            <Eye className="h-3.5 w-3.5" />
            Etykiety
          </button>

          <div className="h-4 w-px bg-neutral-800 mx-1" />

          {/* Zoom controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setZoomLevel((z) => Math.max(0.6, Number((z - 0.2).toFixed(1))))}
              className="p-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300"
              title="Pomniejsz"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <span className="font-mono text-[11px] px-1 text-neutral-400">{Math.round(zoomLevel * 100)}%</span>
            <button
              onClick={() => setZoomLevel((z) => Math.min(2.5, Number((z + 0.2).toFixed(1))))}
              className="p-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300"
              title="Powiększ"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setZoomLevel(1)}
              className="p-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300"
              title="Resetuj widok"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* SVG Canvas Area */}
      <div className="relative flex-1 min-h-[380px] max-h-[540px] overflow-auto bg-neutral-950 p-6 flex items-center justify-center">
        <div
          style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'center center', transition: 'transform 0.15s ease-out' }}
          className="relative drop-shadow-2xl"
        >
          <svg
            width={Math.min(750, (viewBoxWidth / viewBoxHeight) * 450)}
            height={450}
            viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
            className="rounded border-2 border-neutral-700 bg-neutral-100 shadow-2xl transition-all"
          >
            <defs>
              {/* Gripper margin pattern (diagonal stripes) */}
              <pattern id="gripperStripe" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="8" stroke="#f59e0b" strokeWidth="2.5" opacity="0.45" />
              </pattern>
              {/* Waste area pattern */}
              <pattern id="wastePattern" width="10" height="10" patternUnits="userSpaceOnUse">
                <rect width="10" height="10" fill="#f3f4f6" />
                <circle cx="5" cy="5" r="0.8" fill="#d1d5db" />
              </pattern>
              {/* CMYK Checkerboard Calibration Pattern for Info Panel Border */}
              <pattern id="cmykChecker" width="12" height="4" patternUnits="userSpaceOnUse">
                <rect x="0" y="0" width="3" height="4" fill="#06b6d4" />
                <rect x="3" y="0" width="3" height="4" fill="#ec4899" />
                <rect x="6" y="0" width="3" height="4" fill="#eab308" />
                <rect x="9" y="0" width="3" height="4" fill="#0f172a" />
              </pattern>
            </defs>

            {/* Base paper sheet */}
            <rect x="0" y="0" width={viewBoxWidth} height={viewBoxHeight} fill="url(#wastePattern)" stroke="#4b5563" strokeWidth="1" />

            {/* Gripper margin zone (bottom edge) */}
            <rect
              x="0"
              y="0"
              width={viewBoxWidth}
              height="15"
              fill="url(#gripperStripe)"
              stroke="#d97706"
              strokeWidth="0.8"
              strokeDasharray="3 3"
            />
            <text x="12" y="10" fill="#b45309" fontSize="6.5" fontWeight="bold" fontFamily="monospace">
              GRIPPER MARGIN (ŁAPKA MASZYNY 15mm)
            </text>

            {/* Color control strip on top margin */}
            <g transform={`translate(${viewBoxWidth / 2 - 80}, ${viewBoxHeight - 6})`}>
              <rect x="0" y="0" width="20" height="4" fill="#00ffff" stroke="#000" strokeWidth="0.2" />
              <rect x="20" y="0" width="20" height="4" fill="#ff00ff" stroke="#000" strokeWidth="0.2" />
              <rect x="40" y="0" width="20" height="4" fill="#ffff00" stroke="#000" strokeWidth="0.2" />
              <rect x="60" y="0" width="20" height="4" fill="#000000" stroke="#000" strokeWidth="0.2" />
              <rect x="80" y="0" width="20" height="4" fill="#444444" stroke="#000" strokeWidth="0.2" />
              <rect x="100" y="0" width="20" height="4" fill="#888888" stroke="#000" strokeWidth="0.2" />
              <rect x="120" y="0" width="20" height="4" fill="#cccccc" stroke="#000" strokeWidth="0.2" />
              <text x="145" y="3.5" fill="#374151" fontSize="4.5" fontFamily="monospace">CMYK POD CALIBRATION</text>
            </g>

            {/* Placed Items with GANGING Boundary Markers & Info Panels */}
            {sheet.placed_items.map((item) => {
              const isSelected = selectedItemId === item.instance_id;
              const slotType = item.slot_type || 'PRODUCT';

              // Dimensions
              const trimX = item.trim_box.x1;
              const trimY = item.trim_box.y1;
              const trimW = item.trim_width_mm;
              const trimH = item.trim_height_mm;

              return (
                <g
                  key={item.instance_id}
                  onClick={() => setSelectedItemId(isSelected ? null : item.instance_id)}
                  className="cursor-pointer transition-transform hover:opacity-95"
                >
                  {/* Bleed box (if enabled) */}
                  {showBleedBox && (
                    <rect
                      x={item.x_mm}
                      y={item.y_mm}
                      width={item.width_with_bleed_mm}
                      height={item.height_with_bleed_mm}
                      fill={isSelected ? '#fef08a' : slotType === 'WASTE_SLOT' ? '#fefce8' : '#e0f2fe'}
                      stroke={isSelected ? '#ca8a04' : '#38bdf8'}
                      strokeWidth={isSelected ? 1.5 : 0.6}
                      strokeDasharray="2 2"
                      opacity="0.85"
                    />
                  )}

                  {/* 1. ORDER_INFO_PANEL - CMYK checkerboard border + comprehensive order info */}
                  {slotType === 'ORDER_INFO_PANEL' && (
                    <g>
                      {/* CMYK Calibration border frame */}
                      <rect
                        x={trimX}
                        y={trimY}
                        width={trimW}
                        height={trimH}
                        fill="url(#cmykChecker)"
                        stroke="#0f172a"
                        strokeWidth="0.8"
                        rx="1"
                      />
                      {/* Inner clean white card with padding */}
                      <rect
                        x={trimX + 2.5}
                        y={trimY + 2.5}
                        width={Math.max(10, trimW - 5)}
                        height={Math.max(10, trimH - 5)}
                        fill="#ffffff"
                        stroke="#e2e8f0"
                        strokeWidth="0.5"
                        rx="1"
                      />

                      {showLabels && (
                        <g pointerEvents="none">
                          {/* CMYK Header badge */}
                          <g transform={`translate(${trimX + 5}, ${trimY + 5})`}>
                            <rect x="0" y="0" width={Math.max(20, trimW - 10)} height="5.5" fill="#0f172a" rx="0.8" />
                            <circle cx="3" cy="2.75" r="1" fill="#06b6d4" />
                            <circle cx="5.5" cy="2.75" r="1" fill="#ec4899" />
                            <circle cx="8" cy="2.75" r="1" fill="#eab308" />
                            <circle cx="10.5" cy="2.75" r="1" fill="#ffffff" />
                            <text x="13.5" y="4" fill="#ffffff" fontSize="3.2" fontWeight="bold" fontFamily="sans-serif">
                              PANEL INFORMACYJNY ZAMÓWIENIA
                            </text>
                          </g>

                          {/* Data rows */}
                          <text x={trimX + 5} y={trimY + 14} fill="#0f172a" fontSize="4.2" fontWeight="bold" fontFamily="sans-serif">
                            {item.order_id}
                          </text>

                          <text x={trimX + 5} y={trimY + 20} fill="#0284c7" fontSize="3.6" fontWeight="bold" fontFamily="sans-serif">
                            Klient: {item.customer_reference || 'Drukarnia Partnerska'}
                          </text>

                          <text x={trimX + 5} y={trimY + 25.5} fill="#15803d" fontSize="3.6" fontWeight="bold" fontFamily="sans-serif">
                            Nakład: {item.order_quantity ? `${item.order_quantity.toLocaleString()} szt.` : '10,000 szt.'}
                          </text>

                          <text x={trimX + 5} y={trimY + 31} fill="#64748b" fontSize="3.2" fontFamily="monospace">
                            Plate ID: {item.plate_id || 'JOB-GANGING-PLATE'}
                          </text>

                          <text x={trimX + 5} y={trimY + 36} fill="#475569" fontSize="3.0" fontFamily="sans-serif">
                            Spec: {item.product_specs?.size || `${item.trim_width_mm}×${item.trim_height_mm}mm`} | {item.product_specs?.paper_weight_gsm || 350}g
                          </text>
                        </g>
                      )}
                    </g>
                  )}

                  {/* 2. WASTE_SLOT - White block with yellow border (representing real surplus unutilized material) */}
                  {slotType === 'WASTE_SLOT' && (
                    <g>
                      <rect
                        x={trimX}
                        y={trimY}
                        width={trimW}
                        height={trimH}
                        fill="#ffffff"
                        stroke="#eab308"
                        strokeWidth="1.6"
                        strokeDasharray="3 2"
                        rx="1"
                      />
                      {showLabels && (
                        <g pointerEvents="none">
                          <g transform={`translate(${trimX + trimW / 2 - 18}, ${trimY + trimH / 2 - 4})`}>
                            <rect x="0" y="0" width="36" height="8" fill="#fef9c3" stroke="#ca8a04" strokeWidth="0.6" rx="1" />
                            <text x="18" y="5.5" fill="#854d0e" fontSize="3.6" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">
                              ODPAD / WASTE
                            </text>
                          </g>
                        </g>
                      )}
                    </g>
                  )}

                  {/* 3. NEXT_ORDER_START_MARKER - Solid yellow background, completely blank without text or barcode */}
                  {slotType === 'NEXT_ORDER_START_MARKER' && (
                    <g>
                      <rect
                        x={trimX}
                        y={trimY}
                        width={trimW}
                        height={trimH}
                        fill="#facc15"
                        stroke="#ca8a04"
                        strokeWidth="1.2"
                        rx="1"
                      />
                    </g>
                  )}

                  {/* 4. ORDER_END_MARKER - Solid yellow background + 1D Barcode placeholder + "Print job {n}/{total}" */}
                  {slotType === 'ORDER_END_MARKER' && (
                    <g>
                      <rect
                        x={trimX}
                        y={trimY}
                        width={trimW}
                        height={trimH}
                        fill="#facc15"
                        stroke="#ca8a04"
                        strokeWidth="1.2"
                        rx="1"
                      />
                      {showLabels && (
                        <g pointerEvents="none">
                          {/* Barcode SVG placeholder */}
                          <g transform={`translate(${trimX + trimW / 2 - 22}, ${trimY + trimH / 2 - 10})`}>
                            <rect x="0" y="0" width="44" height="12" fill="#ffffff" rx="0.5" />
                            {/* Barcode stripes */}
                            {[0, 3, 5, 8, 10, 12, 16, 18, 22, 25, 27, 30, 34, 36, 39, 41].map((bx, bIdx) => (
                              <rect key={bx} x={bx + 1.5} y="1.5" width={bIdx % 2 === 0 ? "1.5" : "0.8"} height="9" fill="#000000" />
                            ))}
                          </g>

                          {/* Print job n/total badge */}
                          <g transform={`translate(${trimX + trimW / 2 - 20}, ${trimY + trimH / 2 + 4})`}>
                            <rect x="0" y="0" width="40" height="6.5" fill="#0f172a" rx="1" />
                            <text x="20" y="4.5" fill="#facc15" fontSize="3.6" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">
                              {item.job_label || `Print job ${item.order_index || 1}/${item.total_orders || 1}`}
                            </text>
                          </g>
                        </g>
                      )}
                    </g>
                  )}

                  {/* 5. PRODUCT - Regular product item */}
                  {slotType === 'PRODUCT' && (
                    <g>
                      <rect
                        x={trimX}
                        y={trimY}
                        width={trimW}
                        height={trimH}
                        fill={isSelected ? '#fef9c3' : '#ffffff'}
                        stroke={isSelected ? '#eab308' : '#0284c7'}
                        strokeWidth={isSelected ? 1.8 : 1.0}
                        rx="1"
                      />

                      {/* CutContour vector stroke for CNC Plotter */}
                      {deviceType === 'CNC_PLOTTER' && (
                        <rect
                          x={trimX}
                          y={trimY}
                          width={trimW}
                          height={trimH}
                          fill="none"
                          stroke="#10b981"
                          strokeWidth="0.9"
                          strokeDasharray="4 2"
                        />
                      )}

                      {/* Item Text / Labels */}
                      {showLabels && (
                        <g pointerEvents="none">
                          {/* Sequence number for Cut & Stack */}
                          {workflow === 'CUT_AND_STACK' && item.sequence_number && (
                            <circle
                              cx={trimX + 14}
                              cy={trimY + 14}
                              r="9"
                              fill="#4f46e5"
                            />
                          )}
                          {workflow === 'CUT_AND_STACK' && item.sequence_number && (
                            <text
                              x={trimX + 14}
                              y={trimY + 17}
                              fill="#ffffff"
                              fontSize="9"
                              fontWeight="bold"
                              textAnchor="middle"
                              fontFamily="sans-serif"
                            >
                              #{item.sequence_number}
                            </text>
                          )}

                          {/* Order Label & Dimensions */}
                          <text
                            x={trimX + 6}
                            y={trimY + (workflow === 'CUT_AND_STACK' ? 30 : 14)}
                            fill="#0f172a"
                            fontSize={Math.max(4.5, Math.min(7.5, trimW / 14))}
                            fontWeight="bold"
                            fontFamily="sans-serif"
                          >
                            {item.order_id}
                          </text>

                          <text
                            x={trimX + 6}
                            y={trimY + (workflow === 'CUT_AND_STACK' ? 40 : 23)}
                            fill="#64748b"
                            fontSize={Math.max(4.0, Math.min(6.0, trimW / 16))}
                            fontFamily="monospace"
                          >
                            {trimW} × {trimH} mm
                          </text>
                        </g>
                      )}
                    </g>
                  )}
                </g>
              );
            })}

            {/* Guillotine Through-Cut Lines */}
            {deviceType === 'GUILLOTINE' &&
              showCutLines &&
              sheet.cut_lines?.map((cut, idx) => (
                <line
                  key={`cut_${idx}`}
                  x1={cut.start_mm.x}
                  y1={cut.start_mm.y}
                  x2={cut.end_mm.x}
                  y2={cut.end_mm.y}
                  stroke="#ef4444"
                  strokeWidth="0.75"
                  strokeDasharray="4 3"
                  opacity="0.9"
                />
              ))}

            {/* CNC Optical Registration Crosshairs */}
            {deviceType === 'CNC_PLOTTER' &&
              showOpticalMarks &&
              sheet.optical_marks?.map((mark, mIdx) => (
                <g key={`opt_${mIdx}`} transform={`translate(${mark.x_mm}, ${mark.y_mm})`}>
                  <circle cx="0" cy="0" r="3.5" fill="none" stroke="#10b981" strokeWidth="0.8" />
                  <circle cx="0" cy="0" r="1.2" fill="#10b981" />
                  <line x1="-5" y1="0" x2="5" y2="0" stroke="#10b981" strokeWidth="0.6" />
                  <line x1="0" y1="-5" x2="0" y2="5" stroke="#10b981" strokeWidth="0.6" />
                </g>
              ))}

            {/* Registration Crosshair in 4 sheet corners */}
            {[
              { x: 4, y: 4 },
              { x: viewBoxWidth - 4, y: 4 },
              { x: viewBoxWidth - 4, y: viewBoxHeight - 4 },
              { x: 4, y: viewBoxHeight - 4 },
            ].map((pt, pIdx) => (
              <g key={`reg_${pIdx}`} transform={`translate(${pt.x}, ${pt.y})`}>
                <circle cx="0" cy="0" r="2.5" fill="none" stroke="#000000" strokeWidth="0.4" />
                <line x1="-4" y1="0" x2="4" y2="0" stroke="#000000" strokeWidth="0.3" />
                <line x1="0" y1="-4" x2="0" y2="4" stroke="#000000" strokeWidth="0.3" />
              </g>
            ))}
          </svg>
        </div>
      </div>

      {/* Footer Info & Multi-sheet Pagination */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-800 bg-neutral-950 px-4 py-2 text-xs">
        <div className="flex items-center gap-4 text-neutral-400 flex-wrap">
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-sm bg-sky-400" />
            <span>Bleed (spad)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-sm bg-white border border-neutral-500" />
            <span>Format netto</span>
          </div>
          {workflow === 'GANGING' && (
            <>
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-4 rounded-sm border border-neutral-600 bg-gradient-to-r from-cyan-400 via-pink-400 via-yellow-400 to-slate-900" />
                <span>Panel info</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-3 rounded-sm bg-white border border-dashed border-amber-400" />
                <span>Odpad (Waste)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-3 rounded-sm bg-yellow-400 border border-yellow-600" />
                <span>Marker graniczny</span>
              </div>
            </>
          )}
          {deviceType === 'GUILLOTINE' && (
            <div className="flex items-center gap-1.5">
              <div className="h-0.5 w-4 bg-rose-500" />
              <span>Cięcie gilotyny</span>
            </div>
          )}
          {deviceType === 'CNC_PLOTTER' && (
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full border border-emerald-500 flex items-center justify-center">
                <div className="h-1 w-1 bg-emerald-500 rounded-full" />
              </div>
              <span>Znacznik CNC</span>
            </div>
          )}
        </div>

        {/* Selected Item inspector chip */}
        {selectedItem && (
          <div className="flex items-center gap-2 rounded bg-neutral-800 px-3 py-1 text-neutral-200">
            <span className="font-semibold text-sky-400">{selectedItem.order_id}</span>
            {selectedItem.slot_type && selectedItem.slot_type !== 'PRODUCT' && (
              <span className="rounded bg-amber-900/80 text-amber-200 text-[10px] px-1.5 py-0.5 font-bold">
                {selectedItem.slot_type}
              </span>
            )}
            <span>
              Pozycja: ({selectedItem.x_mm}, {selectedItem.y_mm}) mm | Wymiar: {selectedItem.trim_width_mm}×{selectedItem.trim_height_mm} mm
            </span>
          </div>
        )}

        {/* Sheet selector */}
        {allSheetsCount > 1 && (
          <div className="flex items-center gap-1 text-xs">
            <span className="text-neutral-400">Arkusz:</span>
            {Array.from({ length: allSheetsCount }).map((_, idx) => (
              <button
                key={idx}
                onClick={() => onSelectSheet && onSelectSheet(idx + 1)}
                className={`px-2 py-0.5 rounded text-xs font-mono transition-colors ${
                  currentSheetIndex === idx + 1
                    ? 'bg-sky-600 text-white font-bold'
                    : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                }`}
              >
                {idx + 1}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
