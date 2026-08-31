import type {
  CutOperationV1,
  ImpositionPlanV1,
  PlacementV1,
  PlanIssueV1,
  PlanItemV1,
  PlanRequestV1,
  PlanResponseV1,
  RectV1,
  Rotation,
  SheetPatternV1,
} from './contract';
import { canonicalJson, sha256Hex } from './canonicalize';
import { orientedSize, printableBox, surfacePlacement, trimBox } from './geometry';

const REVISION = '1.0.0';

interface NormalizedItem { item: PlanItemV1; inputIndex: number }
interface DraftPlacement { item: PlanItemV1; rotation: Rotation; footprint: RectV1; stackIndex: number | null; occurrence: number }

function issue(code: PlanIssueV1['code'], path: string, message: string): PlanIssueV1 {
  return { code, path, severity: 'ERROR', message };
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function validate(request: PlanRequestV1): PlanIssueV1[] {
  const errors: PlanIssueV1[] = [];
  if (request.contract_version !== '1.0') errors.push(issue('INVALID_INPUT', '/contract_version', 'Unsupported contract version.'));
  if (request.algorithm?.name !== 'avanti-rect-v1') errors.push(issue('INVALID_INPUT', '/algorithm/name', 'Unsupported algorithm.'));
  if (request.workflow?.kind !== 'N_UP' && request.workflow?.kind !== 'CUT_AND_STACK') errors.push(issue('INVALID_INPUT', '/workflow/kind', 'Unsupported workflow.'));
  if (request.duplex?.mode !== 'SIMPLEX' && request.duplex?.mode !== 'DUPLEX') errors.push(issue('INVALID_INPUT', '/duplex/mode', 'Unsupported duplex mode.'));
  const integers: Array<[string, number, boolean]> = [
    ['/sheet/width_um', request.sheet?.width_um, false], ['/sheet/height_um', request.sheet?.height_um, false],
    ['/sheet/printable_insets_um/top', request.sheet?.printable_insets_um?.top, true],
    ['/sheet/printable_insets_um/right', request.sheet?.printable_insets_um?.right, true],
    ['/sheet/printable_insets_um/bottom', request.sheet?.printable_insets_um?.bottom, true],
    ['/sheet/printable_insets_um/left', request.sheet?.printable_insets_um?.left, true],
    ['/spacing/horizontal_um', request.spacing?.horizontal_um, true], ['/spacing/vertical_um', request.spacing?.vertical_um, true],
  ];
  integers.forEach(([path, value, zeroAllowed]) => {
    if (!Number.isSafeInteger(value) || (zeroAllowed ? value < 0 : value <= 0)) errors.push(issue('INVALID_INPUT', path, 'Expected a safe integer in micrometres.'));
  });
  if (request.sheet && request.sheet.printable_insets_um &&
      request.sheet.printable_insets_um.left + request.sheet.printable_insets_um.right >= request.sheet.width_um) {
    errors.push(issue('INVALID_INPUT', '/sheet/printable_insets_um', 'Horizontal insets consume the entire sheet.'));
  }
  if (request.sheet && request.sheet.printable_insets_um &&
      request.sheet.printable_insets_um.top + request.sheet.printable_insets_um.bottom >= request.sheet.height_um) {
    errors.push(issue('INVALID_INPUT', '/sheet/printable_insets_um', 'Vertical insets consume the entire sheet.'));
  }
  if (!Array.isArray(request.items) || request.items.length === 0) errors.push(issue('INVALID_INPUT', '/items', 'At least one item is required.'));
  const ids = new Set<string>();
  request.items?.forEach((item, index) => {
    const base = `/items/${index}`;
    if (!item.item_id) errors.push(issue('INVALID_INPUT', `${base}/item_id`, 'item_id cannot be empty.'));
    else if (ids.has(item.item_id)) errors.push(issue('DUPLICATE_ITEM_ID', `${base}/item_id`, `Duplicate item_id: ${item.item_id}`));
    ids.add(item.item_id);
    if (!item.source_ref) errors.push(issue('INVALID_INPUT', `${base}/source_ref`, 'source_ref cannot be empty.'));
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 10_000_000) errors.push(issue('INVALID_INPUT', `${base}/quantity`, 'quantity must be an integer from 1 to 10,000,000.'));
    const dimensions = [item.trim.width_um, item.trim.height_um, item.bleed_um.top, item.bleed_um.right, item.bleed_um.bottom, item.bleed_um.left];
    if (dimensions.some((value, i) => !Number.isSafeInteger(value) || value < (i < 2 ? 1 : 0))) errors.push(issue('INVALID_INPUT', base, 'Trim and bleed must use safe integer micrometres.'));
    const rotations = [...new Set(item.allowed_rotations_deg)].sort((a, b) => a - b);
    if (rotations.length === 0 || rotations.some((value) => value !== 0 && value !== 90)) errors.push(issue('INVALID_INPUT', `${base}/allowed_rotations_deg`, 'Allowed rotations must contain 0 and/or 90.'));
    if (!Number.isSafeInteger(item.priority)) errors.push(issue('INVALID_INPUT', `${base}/priority`, 'priority must be an integer.'));
    const pages = item.sides.kind === 'PAIRED' ? [item.sides.front_page, item.sides.back_page] : [item.sides.front_page];
    if (pages.some((page) => !Number.isSafeInteger(page) || page < 1)) errors.push(issue('INVALID_INPUT', `${base}/sides`, 'Page numbers are 1-based positive integers.'));
  });
  return errors;
}

function normalizedItems(request: PlanRequestV1): NormalizedItem[] {
  return request.items.map((item, inputIndex) => ({ item: { ...item, allowed_rotations_deg: [...new Set(item.allowed_rotations_deg)].sort((a, b) => a - b) as Rotation[] }, inputIndex }))
    .sort((a, b) => a.item.priority - b.item.priority || a.inputIndex - b.inputIndex || compareText(a.item.item_id, b.item.item_id));
}

function placementFromDraft(request: PlanRequestV1, draft: DraftPlacement, index: number, first: number, increment: number): PlacementV1 {
  const item = draft.item;
  const backPage = item.sides.kind === 'PAIRED' ? item.sides.back_page : null;
  return {
    placement_index: index,
    slot_kind: 'PRODUCT',
    item_id: item.item_id,
    source_ref: item.source_ref,
    copy: { first, increment_per_repeat: increment },
    front: surfacePlacement(request, draft.footprint, draft.rotation, item.sides.front_page, false),
    back: request.duplex.mode === 'DUPLEX' && backPage !== null
      ? surfacePlacement(request, draft.footprint, draft.rotation, backPage, true)
      : null,
    trim_box: trimBox(item, draft.footprint, draft.rotation),
    footprint_box: draft.footprint,
    rotation_deg: draft.rotation,
    stack_index: draft.stackIndex,
  };
}

function metrics(pattern: Omit<SheetPatternV1, 'metrics'>, items: Map<string, PlanItemV1>) {
  const printableArea = pattern.sheet.printable_box.width_um * pattern.sheet.printable_box.height_um;
  const occupied = pattern.placements.reduce((sum, p) => sum + p.footprint_box.width_um * p.footprint_box.height_um, 0);
  const good = pattern.placements.reduce((sum, p) => {
    const item = p.item_id ? items.get(p.item_id) : undefined;
    return sum + (item ? item.trim.width_um * item.trim.height_um : 0);
  }, 0);
  return {
    good_area_um2_per_sheet: good,
    occupied_area_um2_per_sheet: occupied,
    waste_area_um2_per_sheet: Math.max(0, printableArea - occupied),
    utilization_bp: printableArea === 0 ? 0 : Math.round(occupied * 10_000 / printableArea),
  };
}

function shelfCuts(box: RectV1, placements: PlacementV1[]): CutOperationV1[] {
  const rows = new Map<string, PlacementV1[]>();
  placements.forEach((placement) => {
    const key = `${placement.footprint_box.y_um}:${placement.footprint_box.height_um}`;
    const row = rows.get(key) ?? [];
    row.push(placement);
    rows.set(key, row);
  });
  const cuts: CutOperationV1[] = [];
  const horizontal = new Map<number, number[]>();
  [...rows.values()].forEach((row) => row.forEach((p) => {
    for (const y of [p.footprint_box.y_um, p.footprint_box.y_um + p.footprint_box.height_um]) {
      const refs = horizontal.get(y) ?? [];
      refs.push(p.placement_index);
      horizontal.set(y, refs);
    }
  }));
  [...horizontal.entries()].sort((a, b) => a[0] - b[0]).forEach(([y, refs]) => cuts.push({
    order: cuts.length + 1, axis: 'HORIZONTAL', position_um: y,
    span: { from_um: box.x_um, to_um: box.x_um + box.width_um }, through_cut: true,
    separates_placement_indexes: [...new Set(refs)].sort((a, b) => a - b),
  }));
  [...rows.values()].sort((a, b) => a[0].footprint_box.y_um - b[0].footprint_box.y_um).forEach((row) => {
    const y0 = row[0].footprint_box.y_um, y1 = y0 + row[0].footprint_box.height_um;
    const xs = new Map<number, number[]>();
    row.forEach((p) => {
      for (const x of [p.footprint_box.x_um, p.footprint_box.x_um + p.footprint_box.width_um]) {
        const refs = xs.get(x) ?? []; refs.push(p.placement_index); xs.set(x, refs);
      }
    });
    [...xs.entries()].sort((a, b) => a[0] - b[0]).forEach(([x, refs]) => cuts.push({
      order: cuts.length + 1, axis: 'VERTICAL', position_um: x,
      span: { from_um: y0, to_um: y1 }, through_cut: false,
      separates_placement_indexes: [...new Set(refs)].sort((a, b) => a - b),
    }));
  });
  return cuts;
}

function planNUp(request: PlanRequestV1, items: NormalizedItem[]): SheetPatternV1[] | PlanIssueV1[] {
  const box = printableBox(request);
  for (const { item, inputIndex } of items) {
    const fits = item.allowed_rotations_deg.some((rotation) => {
      const size = orientedSize(item, rotation); return size.width <= box.width_um && size.height <= box.height_um;
    });
    if (!fits) return [issue('ITEM_DOES_NOT_FIT', `/items/${inputIndex}`, `Item ${item.item_id} does not fit the printable box.`)];
  }
  const remaining = new Map(items.map(({ item }) => [item.item_id, item.quantity]));
  const planned = new Map(items.map(({ item }) => [item.item_id, 0]));
  const patterns: SheetPatternV1[] = [];
  while ([...remaining.values()].some((value) => value > 0)) {
    const drafts: DraftPlacement[] = [];
    const usedOnDraft = new Map<string, number>();
    let y = box.y_um;
    while (y < box.y_um + box.height_um) {
      let x = box.x_um;
      let shelfHeight = 0;
      let placedInShelf = false;
      while (x < box.x_um + box.width_um) {
        let selected: { item: PlanItemV1; rotation: Rotation; width: number; height: number } | undefined;
        for (const { item } of items) {
          if ((remaining.get(item.item_id) ?? 0) <= (usedOnDraft.get(item.item_id) ?? 0)) continue;
          for (const rotation of item.allowed_rotations_deg) {
            const size = orientedSize(item, rotation);
            if (x + size.width <= box.x_um + box.width_um && y + size.height <= box.y_um + box.height_um && (shelfHeight === 0 || size.height <= shelfHeight)) {
              selected = { item, rotation, width: size.width, height: size.height }; break;
            }
          }
          if (selected) break;
        }
        if (!selected) break;
        shelfHeight = shelfHeight || selected.height;
        const occurrence = (usedOnDraft.get(selected.item.item_id) ?? 0) + 1;
        usedOnDraft.set(selected.item.item_id, occurrence);
        drafts.push({ item: selected.item, rotation: selected.rotation, footprint: { x_um: x, y_um: y, width_um: selected.width, height_um: selected.height }, stackIndex: null, occurrence });
        x += selected.width + request.spacing.horizontal_um;
        placedInShelf = true;
      }
      if (!placedInShelf) break;
      y += shelfHeight + request.spacing.vertical_um;
    }
    if (drafts.length === 0) return [issue('NO_FEASIBLE_LAYOUT', '/items', 'No item could be placed on an empty sheet.')];
    let repeat = Number.MAX_SAFE_INTEGER;
    usedOnDraft.forEach((count, id) => { repeat = Math.min(repeat, Math.floor((remaining.get(id) ?? 0) / count)); });
    repeat = Math.max(1, repeat);
    const occurrences = new Map<string, number>();
    const placements = drafts.map((draft, index) => {
      const occurrence = (occurrences.get(draft.item.item_id) ?? 0) + 1;
      occurrences.set(draft.item.item_id, occurrence);
      return placementFromDraft(request, draft, index, (planned.get(draft.item.item_id) ?? 0) + occurrence, usedOnDraft.get(draft.item.item_id) ?? 0);
    }).sort((a, b) => a.footprint_box.y_um - b.footprint_box.y_um || a.footprint_box.x_um - b.footprint_box.x_um || compareText(a.item_id ?? '', b.item_id ?? ''));
    placements.forEach((p, index) => { p.placement_index = index; });
    usedOnDraft.forEach((count, id) => {
      const delta = count * repeat;
      remaining.set(id, (remaining.get(id) ?? 0) - delta);
      planned.set(id, (planned.get(id) ?? 0) + delta);
    });
    const base = { pattern_index: patterns.length, repeat_count: repeat, sheet: { width_um: request.sheet.width_um, height_um: request.sheet.height_um, printable_box: box }, placements, cuts: shelfCuts(box, placements) };
    patterns.push({ ...base, metrics: metrics(base, new Map(items.map(({ item }) => [item.item_id, item]))) });
  }
  return patterns;
}

function gridCuts(box: RectV1, placements: PlacementV1[]): CutOperationV1[] {
  return shelfCuts(box, placements);
}

function planCutAndStack(request: PlanRequestV1, items: NormalizedItem[]): SheetPatternV1[] | PlanIssueV1[] {
  const box = printableBox(request);
  const first = items[0].item;
  const candidates = first.allowed_rotations_deg.map((rotation) => ({ rotation, ...orientedSize(first, rotation) }))
    .filter((c) => c.width <= box.width_um && c.height <= box.height_um)
    .map((c) => ({ ...c, cols: Math.floor((box.width_um + request.spacing.horizontal_um) / (c.width + request.spacing.horizontal_um)), rows: Math.floor((box.height_um + request.spacing.vertical_um) / (c.height + request.spacing.vertical_um)) }))
    .sort((a, b) => b.cols * b.rows - a.cols * a.rows || a.rotation - b.rotation);
  const target = candidates[0];
  if (!target) return [issue('ITEM_DOES_NOT_FIT', '/items/0', `Item ${first.item_id} does not fit the printable box.`)];
  const rotations = new Map<string, Rotation>();
  for (const { item } of items) {
    const rotation = item.allowed_rotations_deg.find((r) => { const s = orientedSize(item, r); return s.width === target.width && s.height === target.height; });
    if (rotation === undefined) return [issue('INCOMPATIBLE_CUT_AND_STACK_GEOMETRY', '/items', 'CUT_AND_STACK requires one common oriented footprint for every item.')];
    rotations.set(item.item_id, rotation);
  }
  const slots = target.cols * target.rows;
  const total = items.reduce((sum, { item }) => sum + item.quantity, 0);
  const depth = Math.ceil(total / slots);
  const boundaries: Array<{ start: number; end: number; item: PlanItemV1 }> = [];
  let cursor = 0;
  items.forEach(({ item }) => { boundaries.push({ start: cursor, end: cursor + item.quantity, item }); cursor += item.quantity; });
  const breaks = new Set<number>([0, depth]);
  for (let slot = 0; slot < slots; slot++) for (const boundary of boundaries) {
    for (const edge of [boundary.start, boundary.end]) {
      const value = edge - slot * depth;
      if (value > 0 && value < depth) breaks.add(value);
    }
  }
  const points = [...breaks].sort((a, b) => a - b);
  const patterns: SheetPatternV1[] = [];
  for (let segment = 0; segment < points.length - 1; segment++) {
    const start = points[segment], end = points[segment + 1];
    if (end <= start) continue;
    const placements: PlacementV1[] = [];
    for (let stack = 0; stack < slots; stack++) {
      const global = stack * depth + start;
      const source = boundaries.find((b) => global >= b.start && global < b.end);
      const row = request.workflow.kind === 'CUT_AND_STACK' && request.workflow.stack_order === 'COLUMN_MAJOR' ? stack % target.rows : Math.floor(stack / target.cols);
      const col = request.workflow.kind === 'CUT_AND_STACK' && request.workflow.stack_order === 'COLUMN_MAJOR' ? Math.floor(stack / target.rows) : stack % target.cols;
      const footprint = { x_um: box.x_um + col * (target.width + request.spacing.horizontal_um), y_um: box.y_um + row * (target.height + request.spacing.vertical_um), width_um: target.width, height_um: target.height };
      if (!source) {
        if (request.workflow.kind === 'CUT_AND_STACK' && request.workflow.pad_last_stack) placements.push({
          placement_index: placements.length,
          slot_kind: 'BLANK',
          copy: null,
          front: null,
          back: null,
          trim_box: footprint,
          footprint_box: footprint,
          rotation_deg: 0,
          stack_index: stack,
        });
        continue;
      }
      const draft: DraftPlacement = { item: source.item, rotation: rotations.get(source.item.item_id)!, footprint, stackIndex: stack, occurrence: 1 };
      placements.push(placementFromDraft(request, draft, placements.length, global - source.start + 1, 1));
    }
    placements.sort((a, b) => a.footprint_box.y_um - b.footprint_box.y_um || a.footprint_box.x_um - b.footprint_box.x_um || compareText(a.item_id ?? '', b.item_id ?? ''));
    placements.forEach((p, index) => { p.placement_index = index; });
    const base = { pattern_index: patterns.length, repeat_count: end - start, sheet: { width_um: request.sheet.width_um, height_um: request.sheet.height_um, printable_box: box }, placements, cuts: gridCuts(box, placements) };
    patterns.push({ ...base, metrics: metrics(base, new Map(items.map(({ item }) => [item.item_id, item]))) });
  }
  return patterns;
}

function finalize(request: PlanRequestV1, patterns: SheetPatternV1[]): ImpositionPlanV1 {
  const itemMap = new Map(request.items.map((item) => [item.item_id, item]));
  const planned = new Map(request.items.map((item) => [item.item_id, 0]));
  patterns.forEach((pattern) => pattern.placements.forEach((placement) => {
    if (placement.item_id) planned.set(placement.item_id, (planned.get(placement.item_id) ?? 0) + pattern.repeat_count);
  }));
  const physicalSheets = patterns.reduce((sum, p) => sum + p.repeat_count, 0);
  const goodArea = patterns.reduce((sum, p) => sum + p.metrics.good_area_um2_per_sheet * p.repeat_count, 0);
  const occupiedArea = patterns.reduce((sum, p) => sum + p.metrics.occupied_area_um2_per_sheet * p.repeat_count, 0);
  const printableArea = patterns.reduce((sum, p) => sum + p.sheet.printable_box.width_um * p.sheet.printable_box.height_um * p.repeat_count, 0);
  const planWithoutFingerprint = {
    contract_version: '1.0' as const,
    algorithm: { name: 'avanti-rect-v1' as const, revision: REVISION },
    coordinate_system: 'TOP_LEFT_X_RIGHT_Y_DOWN_UM' as const,
    patterns,
    item_totals: request.items.map((item) => ({ item_id: item.item_id, requested: item.quantity, planned_good: planned.get(item.item_id) ?? 0, overrun: Math.max(0, (planned.get(item.item_id) ?? 0) - item.quantity) })),
    totals: {
      physical_sheets: physicalSheets, pattern_count: patterns.length, good_area_um2: goodArea,
      occupied_area_um2: occupiedArea, printable_area_um2: printableArea,
      waste_area_um2: Math.max(0, printableArea - occupiedArea),
      utilization_bp: printableArea === 0 ? 0 : Math.round(occupiedArea * 10_000 / printableArea),
    },
    finishing: {
      ...(request.workflow.kind === 'CUT_AND_STACK' ? { stack_order: request.workflow.stack_order, stack_sequence: Array.from({ length: Math.max(0, ...patterns.flatMap((p) => p.placements.map((x) => (x.stack_index ?? -1) + 1))) }, (_, i) => i) } : {}),
      instructions: [
        { code: 'PRINT' as const, refs: patterns.map((p) => p.pattern_index) },
        ...(request.duplex.mode === 'DUPLEX' ? [{ code: 'TURN' as const, refs: [] }] : []),
        { code: 'CUT' as const, refs: patterns.flatMap((p) => p.cuts.map((c) => c.order)) },
        ...(request.workflow.kind === 'CUT_AND_STACK' ? [{ code: 'STACK' as const, refs: Array.from({ length: Math.max(0, ...patterns.flatMap((p) => p.placements.map((x) => (x.stack_index ?? -1) + 1))) }, (_, i) => i) }] : []),
      ],
    },
    warnings: [] as PlanIssueV1[],
  };
  return { ...planWithoutFingerprint, plan_fingerprint: sha256Hex(canonicalJson(planWithoutFingerprint)) };
}

export function planImposition(request: PlanRequestV1): PlanResponseV1 {
  const errors = validate(request);
  if (errors.length) return { ok: false, errors };
  const items = normalizedItems(request);
  const result = request.workflow.kind === 'N_UP' ? planNUp(request, items) : planCutAndStack(request, items);
  if (result.length > 0 && 'severity' in result[0]) return { ok: false, errors: result as PlanIssueV1[] };
  return { ok: true, plan: finalize(request, result as SheetPatternV1[]) };
}
