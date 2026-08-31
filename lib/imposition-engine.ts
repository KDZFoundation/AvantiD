import {
  ImpositionJobPayload,
  JobResult,
  SheetLayout,
  PlacedItem,
  PlacedItemSlotType,
  CutLine,
  OpticalMark,
  WorkflowDetails,
} from '@/types/imposition';
import { updateJobInStore } from './job-store';
import { checkFilenameDimensionMismatch } from './validation';
import { runCoreLayoutAdapter } from './imposition-core-adapter';

/**
 * Executes or delegates the imposition calculation.
 * 
 * ARCHITECTURAL DESIGN NOTE:
 * Next.js handles incoming HTTP, request validation, state management in Firestore,
 * and status queries. The compute-intensive layout solvers and PDF/X assembly
 * are designed to run in a dedicated Python (FastAPI / PyMuPDF / reportlab / shapely)
 * microservice hosted on Google Cloud Run.
 * 
 * If PYTHON_IMPOSITION_SERVICE_URL is set in Secret Manager / environment,
 * this function dispatches the job payload via HTTP POST to the Python service.
 * Otherwise, it executes the high-fidelity native print-engineering layout solver below.
 */
export async function executeImpositionJob(jobId: string, payload: ImpositionJobPayload): Promise<void> {
  const startTime = Date.now();

  try {
    // 1. Mark status as PROCESSING
    await updateJobInStore(jobId, {
      status: 'PROCESSING',
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const pythonServiceUrl = process.env.PYTHON_IMPOSITION_SERVICE_URL;
    let result: JobResult;

    if (pythonServiceUrl && pythonServiceUrl.trim().length > 0) {
      // ----------------------------------------------------------------------
      // TODO: EXTERNAL PYTHON FASTAPI CLOUD RUN DISPATCH
      // ----------------------------------------------------------------------
      // Target: Deploy a Python FastAPI microservice (e.g. using `ezdxf`, `PyMuPDF`,
      // `reportlab`, `rectpack`, `shapely`) to Cloud Run.
      // Configure secret `PYTHON_IMPOSITION_SERVICE_URL` and `PYTHON_IMPOSITION_SERVICE_API_KEY`.
      // ----------------------------------------------------------------------
      try {
        const response = await fetch(`${pythonServiceUrl.replace(/\/$/, '')}/api/v1/optimize`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Service-Key': process.env.PYTHON_IMPOSITION_SERVICE_API_KEY || '',
            'X-Job-ID': jobId,
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error(`Python Cloud Run imposition service returned HTTP ${response.status}: ${await response.text()}`);
        }

        const externalData = await response.json();
        result = {
          ...externalData,
          service_origin: 'EXTERNAL_PYTHON_CLOUDRUN_LIVE',
          execution_time_ms: Date.now() - startTime,
        };
      } catch (err: any) {
        console.warn(`[ImpositionEngine] Remote Python service call failed (${err.message}). Falling back to internal engine.`);
        result = runInternalLayoutEngine(jobId, payload, startTime);
      }
    } else {
      // Run native print-engineering optimization engine (with clear separation between workflows)
      result = runInternalLayoutEngine(jobId, payload, startTime);
    }

    // 2. Persist COMPLETED state and detailed metrics
    await updateJobInStore(jobId, {
      status: 'COMPLETED',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      result: result,
    });
  } catch (error: any) {
    console.error(`[ImpositionEngine] Job ${jobId} failed:`, error);
    try {
      await updateJobInStore(jobId, {
        status: 'FAILED',
        error_message: error.message || 'Unknown imposition layout error',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    } catch (dbErr) {
      console.error(`[ImpositionEngine] Could not update failed status for job ${jobId}:`, dbErr);
    }
  }
}

/**
 * Auto-optimizes item rotation (0° vs 90°) to maximize the number of items that fit on the sheet.
 */
export function calculateBestOrientation(
  sheetWidth: number,
  sheetHeight: number,
  trimW: number,
  trimH: number,
  bleed: number,
  gap: number = 6.0,
  margin: number = 5.0
): {
  bestRotation: 0 | 90;
  cols: number;
  rows: number;
  slotsPerSheet: number;
  itemTotalW: number;
  itemTotalH: number;
  gridTotalW: number;
  gridTotalH: number;
  offsetX: number;
  offsetY: number;
} {
  const printableW = sheetWidth - 2 * margin;
  const printableH = sheetHeight - 2 * margin;

  // Test 0°:
  const orient0_W = trimW + 2 * bleed;
  const orient0_H = trimH + 2 * bleed;
  const cols0 = Math.max(1, Math.floor((printableW + gap) / (orient0_W + gap)));
  const rows0 = Math.max(1, Math.floor((printableH + gap) / (orient0_H + gap)));
  const count0 = cols0 * rows0;

  // Test 90°:
  const orient90_W = trimH + 2 * bleed;
  const orient90_H = trimW + 2 * bleed;
  const cols90 = Math.max(1, Math.floor((printableW + gap) / (orient90_W + gap)));
  const rows90 = Math.max(1, Math.floor((printableH + gap) / (orient90_H + gap)));
  const count90 = cols90 * rows90;

  const use90 = count90 > count0;

  const bestRotation: 0 | 90 = use90 ? 90 : 0;
  const cols = use90 ? cols90 : cols0;
  const rows = use90 ? rows90 : rows0;
  const slotsPerSheet = use90 ? count90 : count0;
  const itemTotalW = use90 ? orient90_W : orient0_W;
  const itemTotalH = use90 ? orient90_H : orient0_H;

  const gridTotalW = cols * itemTotalW + (cols - 1) * gap;
  const gridTotalH = rows * itemTotalH + (rows - 1) * gap;

  const offsetX = Number(((sheetWidth - gridTotalW) / 2).toFixed(2));
  const offsetY = Number(((sheetHeight - gridTotalH) / 2).toFixed(2));

  return {
    bestRotation,
    cols,
    rows,
    slotsPerSheet,
    itemTotalW,
    itemTotalH,
    gridTotalW,
    gridTotalH,
    offsetX,
    offsetY,
  };
}

/**
 * High-fidelity print engineering layout engine.
 * Distinct execution branches for:
 * 1. GANGING (combo-run, 2D guillotine bin packing, ratio balancing)
 * 2. CUT_AND_STACK (multi-up sequence stacking for books, tickets, continuous runs)
 */
export function runInternalLayoutEngine(jobId: string, payload: ImpositionJobPayload, startTime: number): JobResult {
  return runCoreLayoutAdapter(jobId, payload, startTime);
}

/**
 * GANGING WORKFLOW (Combo-Run):
 * Minimal paper waste combo-run nesting with multi-order quantity proportion balancing.
 * Generates exact print-engineering slot sequences:
 * [ORDER_INFO_PANEL -> PRODUCT -> WASTE_SLOT -> NEXT_ORDER_START_MARKER -> ORDER_END_MARKER]
 */
export function runGangingWorkflow(jobId: string, payload: ImpositionJobPayload, startTime: number): JobResult {
  const { sheet, orders, device_type, pdf_standard } = payload;
  const mismatchWarning = checkFilenameDimensionMismatch(orders);

  const sheetWidth = sheet?.width_mm ?? 480.0;
  const sheetHeight = sheet?.height_mm ?? 330.0;
  const margin = sheet?.margins_mm ?? 5.0;
  const gap = 6.0;

  let isSampledEstimate = false;

  // Track combo-run multipliers for each order
  const comboMultipliers: Record<string, { ordered: number; per_sheet: number; total_printed: number; overprint_count: number }> = {};

  // All slot descriptor items to be placed on sheets
  interface SlotBlueprint {
    order: typeof orders[0];
    slotType: 'PRODUCT' | 'ORDER_INFO_PANEL' | 'WASTE_SLOT' | 'NEXT_ORDER_START_MARKER' | 'ORDER_END_MARKER';
    orderIndex: number;
    totalOrders: number;
    subIndex?: number;
    bestRotation: 0 | 90;
    cols: number;
    rows: number;
    slotsPerSheet: number;
    itemTotalW: number;
    itemTotalH: number;
    offsetX: number;
    offsetY: number;
  }

  const allSlotsQueue: SlotBlueprint[] = [];
  const quantities = orders.map((o) => o.quantity);
  const minQty = Math.max(1, Math.min(...quantities));

  for (let oIdx = 0; oIdx < orders.length; oIdx++) {
    const o = orders[oIdx];
    const bleed = o.bleed_mm;

    const orient = calculateBestOrientation(
      sheetWidth,
      sheetHeight,
      o.trim_width_mm,
      o.trim_height_mm,
      bleed,
      gap,
      margin
    );

    const positionsPerSheet = orient.slotsPerSheet;

    let productSlotsCount: number;
    let wasteSlotsCount: number;

    if (o.quantity > positionsPerSheet * 2) {
      isSampledEstimate = true;
      const rawRatio = o.quantity / minQty;
      productSlotsCount = Math.max(1, Math.min(positionsPerSheet - 3, Math.round(rawRatio * 2)));
      const remainder = o.quantity % positionsPerSheet;
      wasteSlotsCount = remainder > 0 ? 1 : 0;
    } else {
      productSlotsCount = Math.min(o.quantity, positionsPerSheet);
      const remainder = o.quantity % positionsPerSheet;
      wasteSlotsCount = remainder > 0 && positionsPerSheet - remainder <= 2 ? 1 : 0;
    }

    const baseBlueprint = {
      order: o,
      orderIndex: oIdx + 1,
      totalOrders: orders.length,
      bestRotation: orient.bestRotation,
      cols: orient.cols,
      rows: orient.rows,
      slotsPerSheet: orient.slotsPerSheet,
      itemTotalW: orient.itemTotalW,
      itemTotalH: orient.itemTotalH,
      offsetX: orient.offsetX,
      offsetY: orient.offsetY,
    };

    // 1. ORDER_INFO_PANEL (1)
    allSlotsQueue.push({ ...baseBlueprint, slotType: 'ORDER_INFO_PANEL' });

    // 2. PRODUCT (productSlotsCount)
    for (let p = 0; p < productSlotsCount; p++) {
      allSlotsQueue.push({ ...baseBlueprint, slotType: 'PRODUCT', subIndex: p + 1 });
    }

    // 3. WASTE_SLOT (wasteSlotsCount)
    for (let w = 0; w < wasteSlotsCount; w++) {
      allSlotsQueue.push({ ...baseBlueprint, slotType: 'WASTE_SLOT', subIndex: w + 1 });
    }

    // 4. NEXT_ORDER_START_MARKER (1, omitted for last order)
    if (oIdx < orders.length - 1) {
      allSlotsQueue.push({ ...baseBlueprint, slotType: 'NEXT_ORDER_START_MARKER' });
    }

    // 5. ORDER_END_MARKER (1)
    allSlotsQueue.push({ ...baseBlueprint, slotType: 'ORDER_END_MARKER' });
  }

  // Pack slots onto sheets
  const sheets: SheetLayout[] = [];
  let sheetIndex = 1;
  let slotIdx = 0;
  let instanceCounter = 0;

  while (slotIdx < allSlotsQueue.length) {
    const placedItems: PlacedItem[] = [];
    const horizontalCuts = new Set<number>();
    const verticalCuts = new Set<number>();

    const refBlueprint = allSlotsQueue[slotIdx];
    const { cols, rows, itemTotalW, itemTotalH, offsetX, offsetY, bestRotation } = refBlueprint;
    const itemsOnThisSheet = Math.min(cols * rows, allSlotsQueue.length - slotIdx);

    for (let slotPos = 0; slotPos < itemsOnThisSheet; slotPos++) {
      const blueprint = allSlotsQueue[slotIdx + slotPos];
      const o = blueprint.order;
      const bleed = o.bleed_mm;

      const r = Math.floor(slotPos / cols);
      const c = slotPos % cols;

      const itemX = offsetX + c * (itemTotalW + gap);
      const itemY = offsetY + r * (itemTotalH + gap);

      placedItems.push({
        instance_id: `ganging_${o.order_id}_${blueprint.slotType.toLowerCase()}_${instanceCounter++}`,
        order_id: o.order_id,
        pdf_source_url: o.pdf_source_url,
        x_mm: Number(itemX.toFixed(2)),
        y_mm: Number(itemY.toFixed(2)),
        width_with_bleed_mm: itemTotalW,
        height_with_bleed_mm: itemTotalH,
        trim_width_mm: o.trim_width_mm,
        trim_height_mm: o.trim_height_mm,
        bleed_mm: bleed,
        rotation_deg: bestRotation,
        cut_contour: device_type === 'CNC_PLOTTER',
        slot_type: blueprint.slotType,
        customer_reference: o.customer_reference || 'Drukarnia Partnerska',
        order_quantity: o.quantity,
        plate_id: jobId,
        product_specs: {
          size: `${o.trim_width_mm}x${o.trim_height_mm}mm`,
          paper_weight_gsm: o.paper_weight_gsm || sheet.paper_weight_gsm || 350,
          finish: o.paper_finish || 'Kreda Mat 350g (4+4 CMYK)',
        },
        job_label: `Print job ${blueprint.orderIndex}/${blueprint.totalOrders}`,
        order_index: blueprint.orderIndex,
        total_orders: blueprint.totalOrders,
        bleed_box: {
          x1: itemX,
          y1: itemY,
          x2: itemX + itemTotalW,
          y2: itemY + itemTotalH,
        },
        trim_box: {
          x1: itemX + bleed,
          y1: itemY + bleed,
          x2: itemX + itemTotalW - bleed,
          y2: itemY + itemTotalH - bleed,
        },
      });

      horizontalCuts.add(itemY);
      horizontalCuts.add(itemY + itemTotalH);
      verticalCuts.add(itemX);
      verticalCuts.add(itemX + itemTotalW);
    }

    slotIdx += itemsOnThisSheet;

    // Cut lines for current sheet
    const cutLines: CutLine[] = [];
    if (device_type === 'GUILLOTINE') {
      let cutOrder = 1;
      Array.from(horizontalCuts).sort((a, b) => a - b).forEach((y) => {
        cutLines.push({
          type: 'HORIZONTAL',
          start_mm: { x: 0, y },
          end_mm: { x: sheetWidth, y },
          cut_order: cutOrder++,
          is_through_cut: true,
        });
      });
      Array.from(verticalCuts).sort((a, b) => a - b).forEach((x) => {
        cutLines.push({
          type: 'VERTICAL',
          start_mm: { x, y: 0 },
          end_mm: { x, y: sheetHeight },
          cut_order: cutOrder++,
          is_through_cut: true,
        });
      });
    }

    // Optical marks for CNC plotter
    const opticalMarks: OpticalMark[] = [];
    if (device_type === 'CNC_PLOTTER') {
      opticalMarks.push(
        { x_mm: margin / 2, y_mm: margin / 2, type: 'CROSSHAIR', radius_mm: 3 },
        { x_mm: sheetWidth - margin / 2, y_mm: margin / 2, type: 'CROSSHAIR', radius_mm: 3 },
        { x_mm: sheetWidth - margin / 2, y_mm: sheetHeight - margin / 2, type: 'CROSSHAIR', radius_mm: 3 },
        { x_mm: margin / 2, y_mm: sheetHeight - margin / 2, type: 'CROSSHAIR', radius_mm: 3 },
        { x_mm: sheetWidth / 2, y_mm: margin / 2, type: 'CIRCLE_DOT', radius_mm: 2 },
        { x_mm: sheetWidth / 2, y_mm: sheetHeight - margin / 2, type: 'CIRCLE_DOT', radius_mm: 2 }
      );
    }

    const totalSheetAreaSqm = (sheetWidth * sheetHeight) / 1_000_000;
    const usedAreaSqm = placedItems.reduce((acc, item) => {
      return acc + (item.trim_width_mm * item.trim_height_mm) / 1_000_000;
    }, 0);
    const wasteAreaSqm = Math.max(0, totalSheetAreaSqm - usedAreaSqm);
    const yieldPct = Math.min(99.5, Number(((usedAreaSqm / totalSheetAreaSqm) * 100).toFixed(1)));

    sheets.push({
      sheet_index: sheetIndex,
      sheet_name: `Sheet ${sheetIndex} (Ganging Master - ${sheetWidth}x${sheetHeight}mm)`,
      width_mm: sheetWidth,
      height_mm: sheetHeight,
      gripper_edge: 'BOTTOM',
      placed_items: placedItems,
      cut_lines: cutLines,
      optical_marks: opticalMarks,
      waste_area_sqm: wasteAreaSqm,
      used_area_sqm: usedAreaSqm,
      sheet_yield_percentage: yieldPct,
    });

    sheetIndex++;
  }

  // Calculate combo multipliers based on product slots
  const allPlacedItems = sheets.flatMap((s) => s.placed_items);
  let maxRequiredSheetRuns = 0;

  for (const o of orders) {
    const productSlots = allPlacedItems.filter((p) => p.order_id === o.order_id && p.slot_type === 'PRODUCT').length || 1;
    const requiredSheets = Math.ceil(o.quantity / productSlots);
    if (requiredSheets > maxRequiredSheetRuns) {
      maxRequiredSheetRuns = requiredSheets;
    }
  }

  for (const o of orders) {
    const productSlots = allPlacedItems.filter((p) => p.order_id === o.order_id && p.slot_type === 'PRODUCT').length || 1;
    const totalPrinted = productSlots * maxRequiredSheetRuns;
    comboMultipliers[o.order_id] = {
      ordered: o.quantity,
      per_sheet: productSlots,
      total_printed: totalPrinted,
      overprint_count: Math.max(0, totalPrinted - o.quantity),
    };
  }

  const primarySheet = sheets[0];
  const yieldPct = primarySheet ? primarySheet.sheet_yield_percentage : 80;
  const wastePct = Number((100 - yieldPct).toFixed(1));
  const totalUsedSqm = sheets.reduce((acc, s) => acc + s.used_area_sqm, 0);
  const totalWasteSqm = sheets.reduce((acc, s) => acc + s.waste_area_sqm, 0);

  const totalGuillotineCuts = sheets.reduce((sum, s) => sum + (s.cut_lines?.length || 0), 0);
  const totalCncMarks = sheets.reduce((sum, s) => sum + (s.optical_marks?.length || 0), 0);

  const workflowDetails: WorkflowDetails = {
    workflow: 'GANGING',
    device_type: device_type,
    combo_run_multipliers: comboMultipliers,
    guillotine_details: device_type === 'GUILLOTINE' ? {
      total_guillotine_cuts: totalGuillotineCuts,
      guillotine_cut_stages: 2,
      edge_to_edge_enforced: true,
    } : undefined,
    cnc_details: device_type === 'CNC_PLOTTER' ? {
      optical_registration_marks_count: totalCncMarks,
      cut_contour_layers: ['CutContour', 'CreaseMatrix'],
      nesting_mode: 'BOUNDING_BOX_WITH_GAP',
      safety_margin_between_cuts_mm: 6.0,
    } : undefined,
  };

  const downloadPdfUrl = `/api/jobs/${jobId}/render-pdf`;

  return {
    yield_percentage: yieldPct,
    waste_percentage: wastePct,
    total_waste_sqm: Number(totalWasteSqm.toFixed(4)),
    total_used_sqm: Number(totalUsedSqm.toFixed(4)),
    sheet_run_count: maxRequiredSheetRuns,
    total_sheets_required: maxRequiredSheetRuns,
    sheets_generated_count: sheets.length,
    download_pdf_url: downloadPdfUrl,
    pdf_standard: pdf_standard,
    execution_time_ms: Date.now() - startTime,
    sheets: sheets,
    workflow_details: workflowDetails,
    service_origin: 'INTERNAL_CALC_ENGINE',
    is_sampled_estimate: isSampledEstimate,
    filename_dimension_mismatch_warning: mismatchWarning,
  };
}

/**
 * CUT & STACK WORKFLOW:
 * Multi-up layout sequencing for books, sequential serial tickets, vouchers, or large multi-page jobs.
 */
export function runCutAndStackWorkflow(jobId: string, payload: ImpositionJobPayload, startTime: number): JobResult {
  const { sheet, orders, device_type, pdf_standard } = payload;

  const mismatchWarning = checkFilenameDimensionMismatch(orders);

  const sheetWidth = sheet?.width_mm ?? 480.0;
  const sheetHeight = sheet?.height_mm ?? 330.0;
  const margin = sheet?.margins_mm ?? 5.0;
  const gap = sheet?.gutter_mm ?? 0.0;

  const sampleOrder = orders[0];
  const trimW = sampleOrder?.trim_width_mm ?? 141.0;
  const trimH = sampleOrder?.trim_height_mm ?? 141.0;
  const bleed = sampleOrder?.bleed_mm ?? 3.0;

  const {
    bestRotation,
    cols,
    rows,
    slotsPerSheet,
    itemTotalW,
    itemTotalH,
    offsetX,
    offsetY,
  } = calculateBestOrientation(sheetWidth, sheetHeight, trimW, trimH, bleed, gap, margin);

  const dynamicPlateId = (() => {
    const rawNum = jobId.replace(/\D/g, '');
    if (rawNum.length >= 10) return rawNum.slice(-10);
    let hash = 5381;
    for (let i = 0; i < jobId.length; i++) {
      hash = ((hash << 5) + hash) + jobId.charCodeAt(i);
      hash = hash & hash;
    }
    const hashStr = Math.abs(hash).toString();
    return (rawNum + hashStr + '8901234567').slice(0, 10);
  })();

  // 1. Build unified production stream across all orders in the job:
  interface StreamItemTemplate {
    order_id: string;
    slot_type: PlacedItemSlotType;
    customer_reference?: string;
    pdf_source_url: string;
    trim_width_mm: number;
    trim_height_mm: number;
    bleed_mm: number;
    order_quantity: number;
    order_index: number;
    total_orders: number;
    product_specs: any;
    job_label: string;
    sequence_number?: number;
    barcode_value?: string;
  }

  const productionStream: StreamItemTemplate[] = [];

  orders.forEach((o, oIdx) => {
    const oIndex = oIdx + 1;
    const printJobBarcode = o.order_id.replace(/\D/g, '').slice(-10) || o.order_id;

    // A. Order Info Panel (Start of Order)
    productionStream.push({
      order_id: o.order_id,
      slot_type: 'ORDER_INFO_PANEL',
      customer_reference: o.customer_reference || `Order #${o.order_id}`,
      pdf_source_url: o.pdf_source_url,
      trim_width_mm: o.trim_width_mm,
      trim_height_mm: o.trim_height_mm,
      bleed_mm: o.bleed_mm,
      order_quantity: o.quantity,
      order_index: oIndex,
      total_orders: orders.length,
      product_specs: {
        size: `${o.trim_width_mm}x${o.trim_height_mm}-mm`,
        paper_weight_gsm: o.paper_weight_gsm || 300,
        finish: o.paper_finish || '300-gsm-uncoated',
      },
      job_label: `Print job ${oIndex}/${orders.length}`,
      barcode_value: printJobBarcode,
    });

    // B. Product Pages (1..Quantity)
    for (let q = 1; q <= o.quantity; q++) {
      productionStream.push({
        order_id: o.order_id,
        slot_type: 'PRODUCT',
        customer_reference: o.customer_reference,
        pdf_source_url: o.pdf_source_url,
        trim_width_mm: o.trim_width_mm,
        trim_height_mm: o.trim_height_mm,
        bleed_mm: o.bleed_mm,
        order_quantity: o.quantity,
        order_index: oIndex,
        total_orders: orders.length,
        product_specs: {
          size: `${o.trim_width_mm}x${o.trim_height_mm}-mm`,
          paper_weight_gsm: o.paper_weight_gsm || 300,
          finish: o.paper_finish || '300-gsm-uncoated',
        },
        job_label: `Print job ${oIndex}/${orders.length}`,
        sequence_number: q,
      });
    }

    // C. End of Order Separator
    productionStream.push({
      order_id: o.order_id,
      slot_type: 'WASTE_SLOT',
      customer_reference: o.customer_reference,
      pdf_source_url: o.pdf_source_url,
      trim_width_mm: o.trim_width_mm,
      trim_height_mm: o.trim_height_mm,
      bleed_mm: o.bleed_mm,
      order_quantity: o.quantity,
      order_index: oIndex,
      total_orders: orders.length,
      product_specs: {
        size: `${o.trim_width_mm}x${o.trim_height_mm}-mm`,
        paper_weight_gsm: o.paper_weight_gsm || 300,
        finish: o.paper_finish || '300-gsm-uncoated',
      },
      job_label: `Print job ${oIndex}/${orders.length}`,
      barcode_value: printJobBarcode,
    });
  });

  const totalStreamItems = productionStream.length;
  const productSheetsDepth = Math.max(1, Math.ceil(totalStreamItems / slotsPerSheet));
  const totalSheetsRequired = 1 + productSheetsDepth;

  const sheets: SheetLayout[] = [];

  // 1. GENERATE SHEET 1 (STACK COVER SHEET FOR ALL STACKS)
  const coverPlacedItems: PlacedItem[] = [];
  const coverHorizCuts = new Set<number>();
  const coverVertCuts = new Set<number>();

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const slotIdx = r * cols + c;
      const stackNo = slotIdx + 1;
      const itemX = offsetX + c * (itemTotalW + gap);
      const itemY = offsetY + r * (itemTotalH + gap);

      const streamIdxForStack = slotIdx * productSheetsDepth;
      const dominantItem = productionStream[Math.min(streamIdxForStack, totalStreamItems - 1)] || productionStream[0];
      const dominantOrder = orders.find((ord) => ord.order_id === dominantItem.order_id) || orders[0];

      coverPlacedItems.push({
        instance_id: `cover_stack_${stackNo}_sheet_1`,
        order_id: dominantOrder.order_id,
        pdf_source_url: dominantOrder.pdf_source_url,
        x_mm: Number(itemX.toFixed(2)),
        y_mm: Number(itemY.toFixed(2)),
        width_with_bleed_mm: itemTotalW,
        height_with_bleed_mm: itemTotalH,
        trim_width_mm: trimW,
        trim_height_mm: trimH,
        bleed_mm: bleed,
        rotation_deg: bestRotation,
        slot_type: 'STACK_COVER',
        stack_number: stackNo,
        total_stacks: slotsPerSheet,
        customer_reference: dominantOrder.customer_reference || `Order #${dominantOrder.order_id}`,
        order_quantity: dominantOrder.quantity,
        plate_id: dynamicPlateId,
        dispatch_date: new Date().toISOString().split('T')[0],
        product_specs: {
          size: `${trimW}x${trimH}-mm`,
          paper_weight_gsm: dominantOrder.paper_weight_gsm || 300,
          finish: dominantOrder.paper_finish || '300-gsm-uncoated',
        },
        job_label: dominantItem.job_label || 'Print job 1/2',
        order_index: dominantItem.order_index,
        total_orders: orders.length,
        barcode_value: dynamicPlateId,
        bleed_box: {
          x1: itemX,
          y1: itemY,
          x2: itemX + itemTotalW,
          y2: itemY + itemTotalH,
        },
        trim_box: {
          x1: itemX + bleed,
          y1: itemY + bleed,
          x2: itemX + itemTotalW - bleed,
          y2: itemY + itemTotalH - bleed,
        },
      });

      coverHorizCuts.add(itemY);
      coverHorizCuts.add(itemY + itemTotalH);
      coverVertCuts.add(itemX);
      coverVertCuts.add(itemX + itemTotalW);
    }
  }

  const coverCutLines: CutLine[] = [];
  if (device_type === 'GUILLOTINE') {
    let cutOrder = 1;
    Array.from(coverHorizCuts).sort((a, b) => a - b).forEach((y) => {
      coverCutLines.push({
        type: 'HORIZONTAL',
        start_mm: { x: 0, y },
        end_mm: { x: sheetWidth, y },
        cut_order: cutOrder++,
        is_through_cut: true,
      });
    });
    Array.from(coverVertCuts).sort((a, b) => a - b).forEach((x) => {
      coverCutLines.push({
        type: 'VERTICAL',
        start_mm: { x, y: 0 },
        end_mm: { x, y: sheetHeight },
        cut_order: cutOrder++,
        is_through_cut: true,
      });
    });
  }

  const totalSheetAreaSqm = (sheetWidth * sheetHeight) / 1_000_000;
  const coverUsedArea = coverPlacedItems.reduce((acc, item) => acc + (item.trim_width_mm * item.trim_height_mm) / 1_000_000, 0);

  sheets.push({
    sheet_index: 1,
    sheet_name: `sheet 1/${totalSheetsRequired}`,
    width_mm: sheetWidth,
    height_mm: sheetHeight,
    placed_items: coverPlacedItems,
    cut_lines: coverCutLines,
    waste_area_sqm: Math.max(0, totalSheetAreaSqm - coverUsedArea),
    used_area_sqm: coverUsedArea,
    sheet_yield_percentage: Number(((coverUsedArea / totalSheetAreaSqm) * 100).toFixed(1)),
  });

  // 2. GENERATE SHEETS 2..N
  for (let pIdx = 0; pIdx < productSheetsDepth; pIdx++) {
    const currentSheetIndex = pIdx + 2;
    const prodPlacedItems: PlacedItem[] = [];
    const prodHorizCuts = new Set<number>();
    const prodVertCuts = new Set<number>();

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const slotIdx = r * cols + c;
        const itemX = offsetX + c * (itemTotalW + gap);
        const itemY = offsetY + r * (itemTotalH + gap);

        const streamIdx = slotIdx * productSheetsDepth + pIdx;

        if (streamIdx < totalStreamItems) {
          const itemTemplate = productionStream[streamIdx];
          prodPlacedItems.push({
            instance_id: `item_sheet_${currentSheetIndex}_slot_${slotIdx}_stream_${streamIdx}`,
            order_id: itemTemplate.order_id,
            pdf_source_url: itemTemplate.pdf_source_url,
            x_mm: Number(itemX.toFixed(2)),
            y_mm: Number(itemY.toFixed(2)),
            width_with_bleed_mm: itemTotalW,
            height_with_bleed_mm: itemTotalH,
            trim_width_mm: itemTemplate.trim_width_mm,
            trim_height_mm: itemTemplate.trim_height_mm,
            bleed_mm: itemTemplate.bleed_mm,
            rotation_deg: bestRotation,
            slot_type: itemTemplate.slot_type,
            sequence_number: itemTemplate.sequence_number,
            customer_reference: itemTemplate.customer_reference,
            order_quantity: itemTemplate.order_quantity,
            plate_id: dynamicPlateId,
            dispatch_date: new Date().toISOString().split('T')[0],
            product_specs: itemTemplate.product_specs,
            job_label: itemTemplate.job_label,
            order_index: itemTemplate.order_index,
            total_orders: itemTemplate.total_orders,
            barcode_value: itemTemplate.barcode_value,
            bleed_box: {
              x1: itemX,
              y1: itemY,
              x2: itemX + itemTotalW,
              y2: itemY + itemTotalH,
            },
            trim_box: {
              x1: itemX + itemTemplate.bleed_mm,
              y1: itemY + itemTemplate.bleed_mm,
              x2: itemX + itemTotalW - itemTemplate.bleed_mm,
              y2: itemY + itemTotalH - itemTemplate.bleed_mm,
            },
          });
        } else {
          // Empty slot at end of run
          prodPlacedItems.push({
            instance_id: `waste_sheet_${currentSheetIndex}_slot_${slotIdx}`,
            order_id: orders[orders.length - 1].order_id,
            pdf_source_url: orders[orders.length - 1].pdf_source_url,
            x_mm: Number(itemX.toFixed(2)),
            y_mm: Number(itemY.toFixed(2)),
            width_with_bleed_mm: itemTotalW,
            height_with_bleed_mm: itemTotalH,
            trim_width_mm: trimW,
            trim_height_mm: trimH,
            bleed_mm: bleed,
            rotation_deg: bestRotation,
            slot_type: 'WASTE_SLOT',
            order_quantity: 0,
            plate_id: dynamicPlateId,
            dispatch_date: new Date().toISOString().split('T')[0],
            job_label: `Print job ${orders.length}/${orders.length}`,
            order_index: orders.length,
            total_orders: orders.length,
            bleed_box: {
              x1: itemX,
              y1: itemY,
              x2: itemX + itemTotalW,
              y2: itemY + itemTotalH,
            },
            trim_box: {
              x1: itemX + bleed,
              y1: itemY + bleed,
              x2: itemX + itemTotalW - bleed,
              y2: itemY + itemTotalH - bleed,
            },
          });
        }

        prodHorizCuts.add(itemY);
        prodHorizCuts.add(itemY + itemTotalH);
        prodVertCuts.add(itemX);
        prodVertCuts.add(itemX + itemTotalW);
      }
    }

    const prodCutLines: CutLine[] = [];
    if (device_type === 'GUILLOTINE') {
      let cutOrder = 1;
      Array.from(prodHorizCuts).sort((a, b) => a - b).forEach((y) => {
        prodCutLines.push({
          type: 'HORIZONTAL',
          start_mm: { x: 0, y },
          end_mm: { x: sheetWidth, y },
          cut_order: cutOrder++,
          is_through_cut: true,
        });
      });
      Array.from(prodVertCuts).sort((a, b) => a - b).forEach((x) => {
        prodCutLines.push({
          type: 'VERTICAL',
          start_mm: { x, y: 0 },
          end_mm: { x, y: sheetHeight },
          cut_order: cutOrder++,
          is_through_cut: true,
        });
      });
    }

    const prodUsedArea = prodPlacedItems.reduce((acc, item) => acc + (item.trim_width_mm * item.trim_height_mm) / 1_000_000, 0);

    sheets.push({
      sheet_index: currentSheetIndex,
      sheet_name: `sheet ${currentSheetIndex}/${totalSheetsRequired}`,
      width_mm: sheetWidth,
      height_mm: sheetHeight,
      placed_items: prodPlacedItems,
      cut_lines: prodCutLines,
      waste_area_sqm: Math.max(0, totalSheetAreaSqm - prodUsedArea),
      used_area_sqm: prodUsedArea,
      sheet_yield_percentage: Number(((prodUsedArea / totalSheetAreaSqm) * 100).toFixed(1)),
    });
  }

  const primarySheet = sheets[0];
  const yieldPct = primarySheet?.sheet_yield_percentage ?? 80;
  const wastePct = Number((100 - yieldPct).toFixed(1));
  const totalWasteSqm = Number(((totalSheetAreaSqm * (100 - yieldPct)) / 100 * totalSheetsRequired).toFixed(4));
  const totalUsedSqm = Number(((totalSheetAreaSqm * yieldPct) / 100 * totalSheetsRequired).toFixed(4));

  const totalItemsCount = orders.reduce((sum, o) => sum + o.quantity, 0);

  const workflowDetails: WorkflowDetails = {
    workflow: 'CUT_AND_STACK',
    device_type: device_type,
    cut_and_stack: {
      total_pages_or_items: totalItemsCount,
      slots_per_sheet: slotsPerSheet,
      grid_rows: rows,
      grid_cols: cols,
      stack_depth_sheets: totalSheetsRequired,
      operator_stack_instructions: [
        `1. Drukuj cały nakład (${totalSheetsRequired} arkuszy SRA3) w jednym stosie.`,
        `2. Umieść cały stos w gilotynie jednonożowej bez obracania ani tasowania arkuszy.`,
        `3. Wykonaj cięcia wzdłużne i poprzeczne (siatka ${cols} x ${rows} = ${slotsPerSheet} użytków).`,
        `4. Po pocięciu zdejmij górne karty rozdzielające STACK COVER i ułóż słupki 1..${slotsPerSheet} kolejno na siebie.`,
        `5. Wynikowy stos zawiera perfekcyjnie posegregowane zamówienia z panelami informacyjnymi i separatorami.`,
      ],
    },
  };

  const downloadPdfUrl = `/api/jobs/${jobId}/render-pdf`;

  return {
    yield_percentage: yieldPct,
    waste_percentage: wastePct,
    total_waste_sqm: totalWasteSqm,
    total_used_sqm: totalUsedSqm,
    sheet_run_count: totalSheetsRequired,
    total_sheets_required: totalSheetsRequired,
    sheets_generated_count: totalSheetsRequired,
    download_pdf_url: downloadPdfUrl,
    pdf_standard: pdf_standard,
    execution_time_ms: Date.now() - startTime,
    sheets: sheets,
    workflow_details: workflowDetails,
    service_origin: 'INTERNAL_CALC_ENGINE',
    filename_dimension_mismatch_warning: mismatchWarning,
  };
}
