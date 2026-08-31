export type Um = number;
export type Rotation = 0 | 90;

export interface PlanRequestV1 {
  contract_version: '1.0';
  algorithm: {
    name: 'avanti-rect-v1';
    objective: 'MIN_SHEETS_THEN_WASTE_THEN_CUTS';
    tie_break: 'INPUT_ORDER_THEN_ITEM_ID_THEN_Y_THEN_X_THEN_ROTATION';
  };
  workflow:
    | { kind: 'N_UP' }
    | { kind: 'CUT_AND_STACK'; stack_order: 'ROW_MAJOR' | 'COLUMN_MAJOR'; pad_last_stack: boolean };
  sheet: {
    width_um: Um;
    height_um: Um;
    printable_insets_um: { top: Um; right: Um; bottom: Um; left: Um };
    gripper_edge: 'NONE' | 'TOP' | 'RIGHT' | 'BOTTOM' | 'LEFT';
  };
  spacing: { horizontal_um: Um; vertical_um: Um };
  duplex:
    | { mode: 'SIMPLEX' }
    | { mode: 'DUPLEX'; tumble: 'FLIP_LONG_EDGE' | 'FLIP_SHORT_EDGE'; back_rotation_deg: 0 | 180 };
  items: PlanItemV1[];
}

export interface PlanItemV1 {
  item_id: string;
  source_ref: string;
  quantity: number;
  trim: { width_um: Um; height_um: Um };
  bleed_um: { top: Um; right: Um; bottom: Um; left: Um };
  allowed_rotations_deg: Rotation[];
  priority: number;
  sides:
    | { kind: 'SINGLE'; front_page: number }
    | { kind: 'PAIRED'; front_page: number; back_page: number };
}

export interface RectV1 { x_um: Um; y_um: Um; width_um: Um; height_um: Um }

export interface SurfacePlacementV1 {
  page: number;
  transform: { a: -1 | 0 | 1; b: -1 | 0 | 1; c: -1 | 0 | 1; d: -1 | 0 | 1; tx_um: number; ty_um: number };
}

export interface PlacementV1 {
  placement_index: number;
  slot_kind: 'PRODUCT' | 'BLANK' | 'TECHNICAL';
  item_id?: string;
  source_ref?: string;
  copy: { first: number; increment_per_repeat: number } | null;
  front: SurfacePlacementV1 | null;
  back: SurfacePlacementV1 | null;
  trim_box: RectV1;
  footprint_box: RectV1;
  rotation_deg: Rotation;
  stack_index: number | null;
}

export interface CutOperationV1 {
  order: number;
  axis: 'HORIZONTAL' | 'VERTICAL';
  position_um: Um;
  span: { from_um: Um; to_um: Um };
  through_cut: boolean;
  separates_placement_indexes: number[];
}

export interface SheetPatternV1 {
  pattern_index: number;
  repeat_count: number;
  sheet: { width_um: Um; height_um: Um; printable_box: RectV1 };
  placements: PlacementV1[];
  cuts: CutOperationV1[];
  metrics: {
    good_area_um2_per_sheet: number;
    occupied_area_um2_per_sheet: number;
    waste_area_um2_per_sheet: number;
    utilization_bp: number;
  };
}

export interface PlanIssueV1 {
  code:
    | 'INVALID_INPUT'
    | 'DUPLICATE_ITEM_ID'
    | 'ITEM_DOES_NOT_FIT'
    | 'INCOMPATIBLE_CUT_AND_STACK_GEOMETRY'
    | 'NO_FEASIBLE_LAYOUT'
    | 'QUANTITY_OVERRUN'
    | 'CUT_PLAN_NOT_GUILLOTINE_FEASIBLE';
  path: string;
  severity: 'ERROR' | 'WARNING';
  message: string;
  details?: Record<string, string | number | boolean>;
}

export interface ImpositionPlanV1 {
  contract_version: '1.0';
  algorithm: { name: 'avanti-rect-v1'; revision: string };
  coordinate_system: 'TOP_LEFT_X_RIGHT_Y_DOWN_UM';
  plan_fingerprint: string;
  patterns: SheetPatternV1[];
  item_totals: Array<{ item_id: string; requested: number; planned_good: number; overrun: number }>;
  totals: {
    physical_sheets: number;
    pattern_count: number;
    good_area_um2: number;
    occupied_area_um2: number;
    printable_area_um2: number;
    waste_area_um2: number;
    utilization_bp: number;
  };
  finishing: {
    stack_order?: 'ROW_MAJOR' | 'COLUMN_MAJOR';
    stack_sequence?: number[];
    instructions: Array<{ code: 'PRINT' | 'TURN' | 'CUT' | 'REMOVE_TECHNICAL' | 'STACK'; refs: number[] }>;
  };
  warnings: PlanIssueV1[];
}

export type PlanResponseV1 = { ok: true; plan: ImpositionPlanV1 } | { ok: false; errors: PlanIssueV1[] };
