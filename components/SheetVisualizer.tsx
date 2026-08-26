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
              {/* Waste area pattern */}
              <pattern id="wastePattern" width="10" height="10" patternUnits="userSpaceOnUse">
                <rect width="10" height="10" fill="#f3f4f6" />
                <circle cx="5" cy="5" r="0.8" fill="#d1d5db" />
              </pattern>
            </defs>

            {/* Base paper sheet */}
            <rect x="0" y="0" width={viewBoxWidth} height={viewBoxHeight} fill="url(#wastePattern)" stroke="#4b5563" strokeWidth="1" />

            {/* Vertical Margin Finishing Text Marks */}
            <text
              x="6"
              y={viewBoxHeight / 2}
              fill="#06b6d4"
              fontSize="7"
              fontWeight="bold"
              fontFamily="sans-serif"
              transform={`rotate(-90, 6, ${viewBoxHeight / 2})`}
              textAnchor="middle"
              pointerEvents="none"
            >
              No protection
            </text>

            <text
              x={viewBoxWidth - 6}
              y={viewBoxHeight / 2}
              fill="#06b6d4"
              fontSize="7"
              fontWeight="bold"
              fontFamily="sans-serif"
              transform={`rotate(90, ${viewBoxWidth - 6}, ${viewBoxHeight / 2})`}
              textAnchor="middle"
              pointerEvents="none"
            >
              No protection
            </text>

            {/* Top plate ID in red */}
            <text
              x={viewBoxWidth - 10}
              y="9"
              fill="#dc2626"
              fontSize="4.5"
              fontWeight="bold"
              fontFamily="monospace"
              textAnchor="end"
              pointerEvents="none"
            >
              {sheet.placed_items[0]?.plate_id || 'PLATE'} sheet {currentSheetIndex}/{allSheetsCount}
            </text>

            {/* 4 Corner Registration Crosshairs */}
            <g pointerEvents="none">
              {[
                { cx: 7, cy: 7 },
                { cx: viewBoxWidth - 7, cy: 7 },
                { cx: 7, cy: viewBoxHeight - 7 },
                { cx: viewBoxWidth - 7, cy: viewBoxHeight - 7 },
              ].map((pos, idx) => (
                <g key={idx}>
                  <circle cx={pos.cx} cy={pos.cy} r="3" fill="none" stroke="#000000" strokeWidth="0.4" />
                  <line x1={pos.cx - 4.5} y1={pos.cy} x2={pos.cx + 4.5} y2={pos.cy} stroke="#000000" strokeWidth="0.4" />
                  <line x1={pos.cx} y1={pos.cy - 4.5} x2={pos.cx} y2={pos.cy + 4.5} stroke="#000000" strokeWidth="0.4" />
                </g>
              ))}
            </g>

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

            {/* Placed Items */}
            {sheet.placed_items.map((item) => {
              const isSelected = selectedItemId === item.instance_id;
              const color = getOrderColor(item.order_id);
              const slotType = item.slot_type || 'PRODUCT';

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
                      fill={isSelected ? '#fef08a' : slotType === 'ORDER_INFO_PANEL' ? '#f1f5f9' : '#e0f2fe'}
                      stroke={isSelected ? '#ca8a04' : '#38bdf8'}
                      strokeWidth={isSelected ? 1.5 : 0.6}
                      strokeDasharray="2 2"
                      opacity="0.85"
                    />
                  )}

                  {/* Render based on slot_type */}
                  {slotType === 'STACK_COVER' && (
                    <g>
                      {/* White stack cover card */}
                      <rect
                        x={item.trim_box.x1}
                        y={item.trim_box.y1}
                        width={item.trim_width_mm}
                        height={item.trim_height_mm}
                        fill="#ffffff"
                        stroke="#0f172a"
                        strokeWidth="1.2"
                      />

                      {/* Header Stack Title */}
                      <g pointerEvents="none" className="font-sans">
                        <text x={item.trim_box.x1 + 4} y={item.trim_box.y1 + 8} fill="#0f172a" fontSize="5" fontWeight="bold">
                          Stack {item.stack_number || 1}/{item.total_stacks || 6}
                        </text>
                        <text x={item.trim_box.x1 + 4} y={item.trim_box.y1 + 14} fill="#0f172a" fontSize="4.2" fontWeight="bold">
                          {item.barcode_value || item.order_id} (Nakład: {item.order_quantity || 0})
                        </text>
                        <text x={item.trim_box.x1 + 4} y={item.trim_box.y1 + 19} fill="#475569" fontSize="3.6">
                          FLAT CARD (2 PAGES) | {item.product_specs?.size || '141x141-mm'}
                        </text>
                        <text x={item.trim_box.x1 + 4} y={item.trim_box.y1 + 24} fill="#475569" fontSize="3.6">
                          Klient: {item.customer_reference || 'Customer'}
                        </text>
                        <text x={item.trim_box.x1 + 4} y={item.trim_box.y1 + 29} fill="#475569" fontSize="3.6">
                          Plate: {item.plate_id || 'PLATE'} | {item.job_label || 'Print job 1/2'}
                        </text>
                      </g>

                      {/* Artwork Thumbnail Miniature */}
                      <g transform={`translate(${item.trim_box.x1 + item.trim_width_mm - 46}, ${item.trim_box.y1 + 6})`}>
                        <rect width="40" height="40" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="0.8" rx="1" />
                        <rect x="4" y="4" width="32" height="32" fill="#e0f2fe" stroke="#38bdf8" strokeWidth="0.5" />
                        <text x="20" y="22" fill="#0284c7" fontSize="4" fontWeight="bold" textAnchor="middle">
                          MINIATURA
                        </text>
                      </g>

                      {/* Yellow Bottom Footer Bar */}
                      <rect
                        x={item.trim_box.x1}
                        y={item.trim_box.y1 + item.trim_height_mm - 14}
                        width={item.trim_width_mm}
                        height="14"
                        fill="#facc15"
                        stroke="#ca8a04"
                        strokeWidth="0.5"
                      />
                      <g pointerEvents="none" className="font-sans">
                        <text x={item.trim_box.x1 + 3} y={item.trim_box.y1 + item.trim_height_mm - 8} fill="#0f172a" fontSize="3.6" fontWeight="bold">
                          Dispatch: {item.dispatch_date || '2026-08-24'} | FLAT CARD | 300g
                        </text>
                        <text x={item.trim_box.x1 + 3} y={item.trim_box.y1 + item.trim_height_mm - 3} fill="#713f12" fontSize="3.2" fontWeight="bold">
                          Remove this top card during sorting
                        </text>
                      </g>
                    </g>
                  )}

                  {slotType === 'ORDER_INFO_PANEL' && (
                    <g>
                      {/* Chessboard / CMYK calibration pattern background */}
                      <rect
                        x={item.trim_box.x1}
                        y={item.trim_box.y1}
                        width={item.trim_width_mm}
                        height={item.trim_height_mm}
                        fill="#ffffff"
                        stroke="#0f172a"
                        strokeWidth="1.5"
                      />
                      {/* Top CMYK calibration strip */}
                      <rect x={item.trim_box.x1 + 1} y={item.trim_box.y1 + 1} width={item.trim_width_mm - 2} height="3" fill="#0284c7" />
                      <rect x={item.trim_box.x1 + 1 + (item.trim_width_mm - 2) * 0.25} y={item.trim_box.y1 + 1} width={(item.trim_width_mm - 2) * 0.25} height="3" fill="#ec4899" />
                      <rect x={item.trim_box.x1 + 1 + (item.trim_width_mm - 2) * 0.5} y={item.trim_box.y1 + 1} width={(item.trim_width_mm - 2) * 0.25} height="3" fill="#eab308" />
                      <rect x={item.trim_box.x1 + 1 + (item.trim_width_mm - 2) * 0.75} y={item.trim_box.y1 + 1} width={(item.trim_width_mm - 2) * 0.25} height="3" fill="#0f172a" />
                      
                      {showLabels && (
                        <g pointerEvents="none" className="font-sans">
                          <text x={item.trim_box.x1 + 4} y={item.trim_box.y1 + 10} fill="#0f172a" fontSize="5.5" fontWeight="bold">
                            PANEL INFORMACYJNY ZAMÓWIENIA
                          </text>
                          <text x={item.trim_box.x1 + 4} y={item.trim_box.y1 + 17} fill="#0369a1" fontSize="5" fontWeight="bold">
                            ID: {item.order_id} ({item.order_quantity?.toLocaleString() || 0} szt.)
                          </text>
                          <text x={item.trim_box.x1 + 4} y={item.trim_box.y1 + 23} fill="#475569" fontSize="4.2">
                            Klient: {item.customer_reference || 'Drukarnia Partnerska'}
                          </text>
                          <text x={item.trim_box.x1 + 4} y={item.trim_box.y1 + 29} fill="#475569" fontSize="4.2">
                            Plate: {item.plate_id || 'JOB-PLATE'}
                          </text>
                          <text x={item.trim_box.x1 + 4} y={item.trim_box.y1 + 35} fill="#475569" fontSize="4">
                            Spec: {item.product_specs?.size} | {item.product_specs?.paper_weight_gsm}g | {item.product_specs?.finish?.slice(0, 18)}
                          </text>
                        </g>
                      )}
                    </g>
                  )}

                  {slotType === 'WASTE_SLOT' && (
                    <g>
                      {/* Solid yellow filled card */}
                      <rect
                        x={item.trim_box.x1}
                        y={item.trim_box.y1}
                        width={item.trim_width_mm}
                        height={item.trim_height_mm}
                        fill="#facc15"
                        stroke="#ca8a04"
                        strokeWidth="1.2"
                      />
                      {showLabels && (
                        <g pointerEvents="none">
                          <text
                            x={item.trim_box.x1 + item.trim_width_mm / 2}
                            y={item.trim_box.y1 + item.trim_height_mm / 2 - 2}
                            fill="#854d0e"
                            fontSize="5.5"
                            fontWeight="bold"
                            textAnchor="middle"
                            fontFamily="monospace"
                          >
                            [ ŻÓŁTY SEPARATOR ODPADU ]
                          </text>
                          <text
                            x={item.trim_box.x1 + item.trim_width_mm / 2}
                            y={item.trim_box.y1 + item.trim_height_mm / 2 + 6}
                            fill="#a16207"
                            fontSize="4.2"
                            textAnchor="middle"
                            fontFamily="sans-serif"
                          >
                            {item.job_label || 'WASTE FILLER'}
                          </text>
                        </g>
                      )}
                    </g>
                  )}

                  {slotType === 'NEXT_ORDER_START_MARKER' && (
                    <g>
                      {/* Solid yellow background, blank */}
                      <rect
                        x={item.trim_box.x1}
                        y={item.trim_box.y1}
                        width={item.trim_width_mm}
                        height={item.trim_height_mm}
                        fill="#facc15"
                        stroke="#ca8a04"
                        strokeWidth="1.2"
                      />
                      {showLabels && (
                        <text
                          x={item.trim_box.x1 + item.trim_width_mm / 2}
                          y={item.trim_box.y1 + item.trim_height_mm / 2}
                          fill="#854d0e"
                          fontSize="4.5"
                          fontWeight="bold"
                          textAnchor="middle"
                          fontFamily="sans-serif"
                        >
                          POŁĄCZENIE ZLECEŃ (MARKER)
                        </text>
                      )}
                    </g>
                  )}

                  {slotType === 'ORDER_END_MARKER' && (
                    <g>
                      {/* Solid yellow background with barcode & Print job label */}
                      <rect
                        x={item.trim_box.x1}
                        y={item.trim_box.y1}
                        width={item.trim_width_mm}
                        height={item.trim_height_mm}
                        fill="#facc15"
                        stroke="#ca8a04"
                        strokeWidth="1.2"
                      />
                      {/* Simulated barcode */}
                      <g transform={`translate(${item.trim_box.x1 + 6}, ${item.trim_box.y1 + 8})`}>
                        {Array.from({ length: 18 }).map((_, bIdx) => (
                          <rect
                            key={bIdx}
                            x={bIdx * (item.trim_width_mm - 12) / 18}
                            y="0"
                            width={bIdx % 3 === 0 ? 2 : 1}
                            height="10"
                            fill="#000000"
                          />
                        ))}
                      </g>
                      {showLabels && (
                        <g pointerEvents="none">
                          <text
                            x={item.trim_box.x1 + item.trim_width_mm / 2}
                            y={item.trim_box.y1 + 25}
                            fill="#000000"
                            fontSize="5.5"
                            fontWeight="bold"
                            textAnchor="middle"
                            fontFamily="monospace"
                          >
                            {item.job_label || `Print job ${item.order_index}/${item.total_orders}`}
                          </text>
                          <text
                            x={item.trim_box.x1 + item.trim_width_mm / 2}
                            y={item.trim_box.y1 + 32}
                            fill="#713f12"
                            fontSize="4.5"
                            textAnchor="middle"
                            fontFamily="sans-serif"
                          >
                            ZNACZNIK KOŃCA ZLECENIA
                          </text>
                        </g>
                      )}
                    </g>
                  )}

                  {slotType === 'PRODUCT' && (
                    <g>
                      {/* Trim box (the actual cut final product size) */}
                      <rect
                        x={item.trim_box.x1}
                        y={item.trim_box.y1}
                        width={item.trim_width_mm}
                        height={item.trim_height_mm}
                        fill={isSelected ? '#fef9c3' : '#ffffff'}
                        stroke={isSelected ? '#eab308' : '#0284c7'}
                        strokeWidth={isSelected ? 1.8 : 1.0}
                        rx="1"
                      />

                      {/* CutContour vector stroke for CNC Plotter */}
                      {deviceType === 'CNC_PLOTTER' && (
                        <rect
                          x={item.trim_box.x1}
                          y={item.trim_box.y1}
                          width={item.trim_width_mm}
                          height={item.trim_height_mm}
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
                              cx={item.trim_box.x1 + 14}
                              cy={item.trim_box.y1 + 14}
                              r="9"
                              fill="#4f46e5"
                            />
                          )}
                          {workflow === 'CUT_AND_STACK' && item.sequence_number && (
                            <text
                              x={item.trim_box.x1 + 14}
                              y={item.trim_box.y1 + 17}
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
                            x={item.trim_box.x1 + 6}
                            y={item.trim_box.y1 + (workflow === 'CUT_AND_STACK' ? 30 : 14)}
                            fill="#0f172a"
                            fontSize={Math.max(4.5, Math.min(7.5, item.trim_width_mm / 14))}
                            fontWeight="bold"
                            fontFamily="sans-serif"
                          >
                            {item.order_id}
                          </text>

                          <text
                            x={item.trim_box.x1 + 6}
                            y={item.trim_box.y1 + (workflow === 'CUT_AND_STACK' ? 40 : 23)}
                            fill="#64748b"
                            fontSize={Math.max(4.0, Math.min(6.0, item.trim_width_mm / 16))}
                            fontFamily="monospace"
                          >
                            {item.trim_width_mm} × {item.trim_height_mm} mm
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
        <div className="flex items-center gap-3 flex-wrap text-neutral-400">
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-sm bg-sky-400" />
            <span>Bleed (spad)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-sm bg-white border border-neutral-500" />
            <span>Produkt</span>
          </div>
          {workflow === 'GANGING' && (
            <>
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-sm bg-slate-100 border border-slate-900" />
                <span>Panel Info (Order)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-sm bg-white border-2 border-amber-500" />
                <span>Slot Odpadu</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-sm bg-yellow-400 border border-amber-600" />
                <span>Marker Graniczny</span>
              </div>
            </>
          )}
          {deviceType === 'GUILLOTINE' && (
            <div className="flex items-center gap-1.5">
              <div className="h-0.5 w-4 bg-rose-500" />
              <span>Cięcie gilotynowe</span>
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
            <span>
              Pozycja: ({selectedItem.x_mm}, {selectedItem.y_mm}) mm | Wymiar netto: {selectedItem.trim_width_mm}×{selectedItem.trim_height_mm} mm
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
