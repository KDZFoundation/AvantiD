export type ImpositionWorkflow = 'GANGING' | 'CUT_AND_STACK';
export type DeviceType = 'GUILLOTINE' | 'CNC_PLOTTER';
export type PdfStandard = 'PDF/X-4' | 'PDF/X-1a';
export type JobStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface SheetConfig {
  width_mm: number;
  height_mm: number;
  margins_mm: number;
  gripper_margin_mm: number;
  paper_weight_gsm?: number;
  grain_direction?: 'LONG' | 'SHORT';
}

export interface OrderItem {
  order_id: string;
  pdf_source_url: string;
  trim_width_mm: number;
  trim_height_mm: number;
  bleed_mm: number;
  quantity: number;
  custom_label?: string;
  priority?: number;
}

export interface ImpositionJobPayload {
  workflow: ImpositionWorkflow;
  device_type: DeviceType;
  pdf_standard: PdfStandard;
  sheet: SheetConfig;
  orders: OrderItem[];
}

export interface PlacedItem {
  instance_id: string;
  order_id: string;
  pdf_source_url: string;
  x_mm: number;
  y_mm: number;
  width_with_bleed_mm: number;
  height_with_bleed_mm: number;
  trim_width_mm: number;
  trim_height_mm: number;
  bleed_mm: number;
  rotation_deg: number; // 0 or 90
  sequence_number?: number; // for CUT_AND_STACK
  cut_contour?: boolean; // for CNC_PLOTTER
  bleed_box: { x1: number; y1: number; x2: number; y2: number };
  trim_box: { x1: number; y1: number; x2: number; y2: number };
}

export interface CutLine {
  type: 'HORIZONTAL' | 'VERTICAL';
  start_mm: { x: number; y: number };
  end_mm: { x: number; y: number };
  cut_order: number;
  is_through_cut: boolean; // edge-to-edge guillotine cut
}

export interface OpticalMark {
  x_mm: number;
  y_mm: number;
  type: 'CROSSHAIR' | 'CIRCLE_DOT' | 'BARCODE_DATAMATRIX';
  radius_mm?: number;
}

export interface SheetLayout {
  sheet_index: number;
  sheet_name: string;
  width_mm: number;
  height_mm: number;
  gripper_edge: 'BOTTOM' | 'LEFT' | 'TOP' | 'RIGHT';
  placed_items: PlacedItem[];
  cut_lines?: CutLine[];
  optical_marks?: OpticalMark[];
  waste_area_sqm: number;
  used_area_sqm: number;
  sheet_yield_percentage: number;
}

export interface WorkflowDetails {
  workflow: ImpositionWorkflow;
  // Ganging specifics
  combo_run_multipliers?: Record<string, { ordered: number; per_sheet: number; total_printed: number; overprint_count: number }>;
  // Cut and Stack specifics
  cut_and_stack?: {
    total_pages_or_items: number;
    slots_per_sheet: number;
    grid_rows: number;
    grid_cols: number;
    stack_depth_sheets: number;
    operator_stack_instructions: string[];
  };
  // Device specifics
  device_type: DeviceType;
  cnc_details?: {
    optical_registration_marks_count: number;
    cut_contour_layers: string[];
    nesting_mode: 'TRUE_SHAPE' | 'BOUNDING_BOX_WITH_GAP';
    safety_margin_between_cuts_mm: number;
  };
  guillotine_details?: {
    total_guillotine_cuts: number;
    guillotine_cut_stages: number;
    edge_to_edge_enforced: boolean;
  };
}

export interface JobResult {
  yield_percentage: number;
  waste_percentage: number;
  total_waste_sqm: number;
  total_used_sqm: number;
  sheet_run_count: number;
  total_sheets_required: number;
  sheets_generated_count: number;
  download_pdf_url: string;
  pdf_standard: PdfStandard;
  execution_time_ms: number;
  sheets: SheetLayout[];
  workflow_details: WorkflowDetails;
  service_origin: 'INTERNAL_CALC_ENGINE' | 'EXTERNAL_PYTHON_SERVICE_MOCK' | 'EXTERNAL_PYTHON_CLOUDRUN_LIVE';
}

export interface ImpositionJob {
  id: string;
  status: JobStatus;
  workflow: ImpositionWorkflow;
  device_type: DeviceType;
  pdf_standard: PdfStandard;
  sheet: SheetConfig;
  orders: OrderItem[];
  created_at: string;
  updated_at: string;
  started_at?: string;
  completed_at?: string;
  result?: JobResult;
  error_message?: string;
  client_metadata?: {
    source_system?: string;
    correlation_id?: string;
    request_ip?: string;
    auth_method?: string;
  };
}
