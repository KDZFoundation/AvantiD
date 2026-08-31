import { planImposition, type PlanRequestV1, type SheetPatternV1 } from '@/packages/imposition-core/src';
import type { ImpositionJobPayload, JobResult, PlacedItem, SheetLayout, WorkflowDetails } from '@/types/imposition';
import { checkFilenameDimensionMismatch } from './validation';

const mmToUm = (value: number) => Math.round(value * 1000);
const umToMm = (value: number) => value / 1000;

export function toCoreRequest(payload: ImpositionJobPayload): PlanRequestV1 {
  const baseMargin = mmToUm(payload.sheet.margins_mm);
  const gripper = mmToUm(payload.sheet.gripper_margin_mm);
  const insets = { top: baseMargin, right: baseMargin, bottom: baseMargin, left: baseMargin };
  const edge = payload.sheet.gripper_margin_mm > 0 ? 'BOTTOM' as const : 'NONE' as const;
  if (edge !== 'NONE') insets.bottom += gripper;
  const spacing = mmToUm(payload.sheet.gutter_mm ?? (payload.workflow === 'GANGING' ? 6 : 0));
  return {
    contract_version: '1.0',
    algorithm: {
      name: 'avanti-rect-v1',
      objective: 'MIN_SHEETS_THEN_WASTE_THEN_CUTS',
      tie_break: 'INPUT_ORDER_THEN_ITEM_ID_THEN_Y_THEN_X_THEN_ROTATION',
    },
    workflow: payload.workflow === 'GANGING'
      ? { kind: 'N_UP' }
      : { kind: 'CUT_AND_STACK', stack_order: 'ROW_MAJOR', pad_last_stack: true },
    sheet: {
      width_um: mmToUm(payload.sheet.width_mm),
      height_um: mmToUm(payload.sheet.height_mm),
      printable_insets_um: insets,
      gripper_edge: edge,
    },
    spacing: { horizontal_um: spacing, vertical_um: spacing },
    duplex: { mode: 'DUPLEX', tumble: 'FLIP_SHORT_EDGE', back_rotation_deg: 0 },
    items: payload.orders.map((order, index) => ({
      item_id: order.order_id,
      source_ref: order.pdf_source_url,
      quantity: order.quantity,
      trim: { width_um: mmToUm(order.trim_width_mm), height_um: mmToUm(order.trim_height_mm) },
      bleed_um: {
        top: mmToUm(order.bleed_mm), right: mmToUm(order.bleed_mm),
        bottom: mmToUm(order.bleed_mm), left: mmToUm(order.bleed_mm),
      },
      allowed_rotations_deg: [0, 90],
      priority: order.priority ?? index,
      sides: { kind: 'PAIRED', front_page: 1, back_page: 2 },
    })),
  };
}

function patternToLegacySheet(
  pattern: SheetPatternV1,
  payload: ImpositionJobPayload,
  jobId: string,
  sheetIndex: number,
  repeatOffset = 0,
): SheetLayout {
  const orders = new Map(payload.orders.map((order, index) => [order.order_id, { order, index }]));
  const placedItems: PlacedItem[] = pattern.placements.map((placement) => {
    const fallback = { order: payload.orders[payload.orders.length - 1], index: payload.orders.length - 1 };
    const source = placement.item_id ? orders.get(placement.item_id) : fallback;
    if (!source) throw new Error(`Missing source for placement ${placement.placement_index}.`);
    const { order, index } = source;
    const isProduct = placement.slot_kind === 'PRODUCT';
    return {
      instance_id: `${jobId}_p${pattern.pattern_index}_r${repeatOffset}_s${placement.placement_index}`,
      order_id: placement.item_id ?? order.order_id,
      pdf_source_url: placement.source_ref ?? order.pdf_source_url,
      x_mm: umToMm(placement.footprint_box.x_um),
      y_mm: umToMm(placement.footprint_box.y_um),
      width_with_bleed_mm: umToMm(placement.footprint_box.width_um),
      height_with_bleed_mm: umToMm(placement.footprint_box.height_um),
      trim_width_mm: order.trim_width_mm,
      trim_height_mm: order.trim_height_mm,
      bleed_mm: order.bleed_mm,
      rotation_deg: placement.rotation_deg,
      sequence_number: isProduct && placement.copy ? placement.copy.first + repeatOffset * placement.copy.increment_per_repeat : undefined,
      cut_contour: payload.device_type === 'CNC_PLOTTER',
      slot_type: isProduct ? 'PRODUCT' : 'WASTE_SLOT',
      customer_reference: order.customer_reference,
      order_quantity: isProduct ? order.quantity : 0,
      plate_id: jobId,
      product_specs: {
        size: `${order.trim_width_mm}x${order.trim_height_mm}mm`,
        paper_weight_gsm: order.paper_weight_gsm ?? payload.sheet.paper_weight_gsm,
        finish: order.paper_finish,
      },
      job_label: `Print job ${index + 1}/${payload.orders.length}`,
      order_index: index + 1,
      total_orders: payload.orders.length,
      stack_number: placement.stack_index === null ? undefined : placement.stack_index + 1,
      total_stacks: placement.stack_index === null ? undefined : Math.max(...pattern.placements.map((p) => p.stack_index ?? -1)) + 1,
      bleed_box: {
        x1: umToMm(placement.footprint_box.x_um), y1: umToMm(placement.footprint_box.y_um),
        x2: umToMm(placement.footprint_box.x_um + placement.footprint_box.width_um),
        y2: umToMm(placement.footprint_box.y_um + placement.footprint_box.height_um),
      },
      trim_box: {
        x1: umToMm(placement.trim_box.x_um), y1: umToMm(placement.trim_box.y_um),
        x2: umToMm(placement.trim_box.x_um + placement.trim_box.width_um),
        y2: umToMm(placement.trim_box.y_um + placement.trim_box.height_um),
      },
    };
  });
  return {
    sheet_index: sheetIndex,
    sheet_name: `sheet ${sheetIndex}`,
    width_mm: payload.sheet.width_mm,
    height_mm: payload.sheet.height_mm,
    gripper_edge: payload.sheet.gripper_margin_mm > 0 ? 'BOTTOM' : undefined,
    placed_items: placedItems,
    cut_lines: pattern.cuts.map((cut) => ({
      type: cut.axis,
      start_mm: cut.axis === 'HORIZONTAL'
        ? { x: umToMm(cut.span.from_um), y: umToMm(cut.position_um) }
        : { x: umToMm(cut.position_um), y: umToMm(cut.span.from_um) },
      end_mm: cut.axis === 'HORIZONTAL'
        ? { x: umToMm(cut.span.to_um), y: umToMm(cut.position_um) }
        : { x: umToMm(cut.position_um), y: umToMm(cut.span.to_um) },
      cut_order: cut.order,
      is_through_cut: cut.through_cut,
    })),
    optical_marks: payload.device_type === 'CNC_PLOTTER' ? [
      { x_mm: payload.sheet.margins_mm / 2, y_mm: payload.sheet.margins_mm / 2, type: 'CROSSHAIR', radius_mm: 3 },
      { x_mm: payload.sheet.width_mm - payload.sheet.margins_mm / 2, y_mm: payload.sheet.height_mm - payload.sheet.margins_mm / 2, type: 'CROSSHAIR', radius_mm: 3 },
    ] : undefined,
    waste_area_sqm: pattern.metrics.waste_area_um2_per_sheet / 1_000_000_000_000,
    used_area_sqm: pattern.metrics.occupied_area_um2_per_sheet / 1_000_000_000_000,
    sheet_yield_percentage: pattern.metrics.utilization_bp / 100,
  };
}

export function runCoreLayoutAdapter(jobId: string, payload: ImpositionJobPayload, startTime: number): JobResult {
  const response = planImposition(toCoreRequest(payload));
  if (!response.ok) {
    const message = response.errors.map((error) => `${error.code} ${error.path}: ${error.message}`).join(' | ');
    throw new Error(message);
  }
  const { plan } = response;
  const sheets: SheetLayout[] = [];
  if (payload.workflow === 'CUT_AND_STACK') {
    plan.patterns.forEach((pattern) => {
      for (let repeat = 0; repeat < pattern.repeat_count; repeat++) sheets.push(patternToLegacySheet(pattern, payload, jobId, sheets.length + 1, repeat));
    });
  } else {
    plan.patterns.forEach((pattern) => sheets.push(patternToLegacySheet(pattern, payload, jobId, sheets.length + 1)));
  }
  const combo = payload.workflow === 'GANGING' ? Object.fromEntries(plan.item_totals.map((total) => {
    const perSheet = Math.max(0, ...plan.patterns.map((pattern) => pattern.placements.filter((p) => p.item_id === total.item_id).length));
    return [total.item_id, { ordered: total.requested, per_sheet: perSheet, total_printed: total.planned_good, overprint_count: total.overrun }];
  })) : undefined;
  const workflowDetails: WorkflowDetails = {
    workflow: payload.workflow,
    device_type: payload.device_type,
    combo_run_multipliers: combo,
    cut_and_stack: payload.workflow === 'CUT_AND_STACK' ? {
      total_pages_or_items: payload.orders.reduce((sum, order) => sum + order.quantity, 0),
      slots_per_sheet: Math.max(0, ...plan.patterns.map((pattern) => pattern.placements.length)),
      grid_rows: new Set(plan.patterns.flatMap((p) => p.placements.map((x) => x.footprint_box.y_um))).size,
      grid_cols: new Set(plan.patterns.flatMap((p) => p.placements.map((x) => x.footprint_box.x_um))).size,
      stack_depth_sheets: plan.totals.physical_sheets,
      operator_stack_instructions: [
        `Drukuj ${plan.totals.physical_sheets} arkuszy w kolejności planu.`,
        'Wykonaj cięcia w kolejności wskazanej w planie.',
        `Ułóż słupki w kolejności: ${(plan.finishing.stack_sequence ?? []).join(', ')}.`,
      ],
    } : undefined,
    guillotine_details: payload.device_type === 'GUILLOTINE' ? {
      total_guillotine_cuts: plan.patterns.reduce((sum, pattern) => sum + pattern.cuts.length, 0),
      guillotine_cut_stages: 2,
      edge_to_edge_enforced: false,
    } : undefined,
    cnc_details: payload.device_type === 'CNC_PLOTTER' ? {
      optical_registration_marks_count: plan.patterns.length * 2,
      cut_contour_layers: ['CutContour'],
      nesting_mode: 'BOUNDING_BOX_WITH_GAP',
      safety_margin_between_cuts_mm: payload.sheet.gutter_mm ?? 6,
    } : undefined,
  };
  return {
    contract_version: plan.contract_version,
    plan_fingerprint: plan.plan_fingerprint,
    yield_percentage: plan.totals.utilization_bp / 100,
    waste_percentage: (10_000 - plan.totals.utilization_bp) / 100,
    total_waste_sqm: plan.totals.waste_area_um2 / 1_000_000_000_000,
    total_used_sqm: plan.totals.occupied_area_um2 / 1_000_000_000_000,
    sheet_run_count: plan.totals.physical_sheets,
    total_sheets_required: plan.totals.physical_sheets,
    sheets_generated_count: sheets.length,
    download_pdf_url: `/api/jobs/${jobId}/render-pdf`,
    pdf_standard: payload.pdf_standard,
    execution_time_ms: Date.now() - startTime,
    sheets,
    workflow_details: workflowDetails,
    service_origin: 'INTERNAL_CALC_ENGINE',
    filename_dimension_mismatch_warning: checkFilenameDimensionMismatch(payload.orders),
  };
}
