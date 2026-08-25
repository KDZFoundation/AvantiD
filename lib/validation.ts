import { z } from 'zod';

export const OrderItemSchema = z.object({
  order_id: z.string().min(1, 'order_id cannot be empty'),
  pdf_source_url: z
    .string()
    .min(1, 'pdf_source_url cannot be empty')
    .refine(
      (val) => val.startsWith('http://') || val.startsWith('https://') || val.startsWith('/') || val.startsWith('data:'),
      { message: 'pdf_source_url must be a valid URL (https://, http://, or local path /...)' }
    ),
  trim_width_mm: z
    .number()
    .positive('trim_width_mm must be a positive number')
    .max(5000, 'trim_width_mm cannot exceed 5000 mm'),
  trim_height_mm: z
    .number()
    .positive('trim_height_mm must be a positive number')
    .max(5000, 'trim_height_mm cannot exceed 5000 mm'),
  bleed_mm: z
    .number()
    .min(0, 'bleed_mm cannot be negative')
    .max(50, 'bleed_mm cannot exceed 50 mm')
    .default(2.0),
  quantity: z
    .number()
    .int('quantity must be an integer')
    .positive('quantity must be at least 1')
    .max(10000000, 'quantity cannot exceed 10,000,000'),
  custom_label: z.string().optional(),
  priority: z.number().int().optional(),
});

export const SheetConfigSchema = z.object({
  width_mm: z
    .number()
    .positive('sheet width_mm must be positive')
    .min(100, 'sheet width_mm must be at least 100 mm')
    .max(5000, 'sheet width_mm cannot exceed 5000 mm'),
  height_mm: z
    .number()
    .positive('sheet height_mm must be positive')
    .min(100, 'sheet height_mm must be at least 100 mm')
    .max(5000, 'sheet height_mm cannot exceed 5000 mm'),
  margins_mm: z
    .number()
    .min(0, 'margins_mm cannot be negative')
    .max(100, 'margins_mm cannot exceed 100 mm')
    .default(5.0),
  gripper_margin_mm: z
    .number()
    .min(0, 'gripper_margin_mm cannot be negative')
    .max(100, 'gripper_margin_mm cannot exceed 100 mm')
    .default(12.0),
  paper_weight_gsm: z.number().positive().optional(),
  grain_direction: z.enum(['LONG', 'SHORT']).optional(),
});

export const ImpositionJobPayloadSchema = z.object({
  workflow: z.enum(['GANGING', 'CUT_AND_STACK'], {
    message: "workflow must be either 'GANGING' or 'CUT_AND_STACK'",
  }),
  device_type: z.enum(['GUILLOTINE', 'CNC_PLOTTER'], {
    message: "device_type must be either 'GUILLOTINE' or 'CNC_PLOTTER'",
  }),
  pdf_standard: z
    .enum(['PDF/X-4', 'PDF/X-1a'], {
      message: "pdf_standard must be either 'PDF/X-4' or 'PDF/X-1a'",
    })
    .default('PDF/X-4'),
  sheet: SheetConfigSchema,
  orders: z
    .array(OrderItemSchema)
    .min(1, 'At least 1 order item is required for imposition'),
});

export type ValidatedJobPayload = z.infer<typeof ImpositionJobPayloadSchema>;
