import { NextResponse } from 'next/server';

export async function GET() {
  const openApiSpec = {
    openapi: '3.1.0',
    info: {
      title: 'Print on Demand (POD) Imposition Backend API',
      version: '1.0.0',
      description:
        'RESTful API for automated prepress imposition, 2D guillotine combo-run nesting, and cut-and-stack sequencing consumed by external POD systems (Microsoft Azure). Outputs compliant PDF/X-4 and PDF/X-1a files to Google Cloud Storage.',
      contact: {
        name: 'Print Engineering & DevOps Team',
      },
    },
    servers: [
      {
        url: '/',
        description: 'Current Environment API Server',
      },
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'Production API authentication key for Azure POD integration',
        },
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'Alternative Bearer token header',
        },
      },
      schemas: {
        ImpositionWorkflow: {
          type: 'string',
          enum: ['GANGING', 'CUT_AND_STACK'],
          description:
            'GANGING: 2D bin-packing / combo-run layout minimizing paper waste. CUT_AND_STACK: sequential ordering for books/tickets.',
        },
        DeviceType: {
          type: 'string',
          enum: ['GUILLOTINE', 'CNC_PLOTTER'],
          description:
            'GUILLOTINE: straight edge-to-edge knife cuts. CNC_PLOTTER: irregular contour cutting with CutContour vectors and optical marks.',
        },
        PdfStandard: {
          type: 'string',
          enum: ['PDF/X-4', 'PDF/X-1a'],
          description: 'Target ISO PDF standard for prepress / CTP plates.',
        },
        SheetConfig: {
          type: 'object',
          required: ['width_mm', 'height_mm', 'margins_mm', 'gripper_margin_mm'],
          properties: {
            width_mm: { type: 'number', example: 1000.0, description: 'Raw press sheet width in mm' },
            height_mm: { type: 'number', example: 700.0, description: 'Raw press sheet height in mm' },
            margins_mm: { type: 'number', example: 5.0, description: 'Safe non-printable margins in mm' },
            gripper_margin_mm: { type: 'number', example: 15.0, description: 'Press gripper edge margin in mm' },
            paper_weight_gsm: { type: 'number', example: 350 },
            grain_direction: { type: 'string', enum: ['LONG', 'SHORT'] },
          },
        },
        OrderItem: {
          type: 'object',
          required: ['order_id', 'pdf_source_url', 'trim_width_mm', 'trim_height_mm', 'bleed_mm', 'quantity'],
          properties: {
            order_id: { type: 'string', example: 'ORD-94821' },
            pdf_source_url: {
              type: 'string',
              format: 'uri',
              example: 'https://azureblob.blob.core.windows.net/print-files/flyer_a6.pdf',
              description: 'Public or presigned URL to download input PDF (Azure Blob, S3, etc.)',
            },
            trim_width_mm: { type: 'number', example: 105.0 },
            trim_height_mm: { type: 'number', example: 148.0 },
            bleed_mm: { type: 'number', example: 2.0 },
            quantity: { type: 'integer', example: 5000 },
            custom_label: { type: 'string', example: 'Summer Campaign Flyer A6' },
          },
        },
        ImpositionJobRequest: {
          type: 'object',
          required: ['workflow', 'device_type', 'pdf_standard', 'sheet', 'orders'],
          properties: {
            workflow: { $ref: '#/components/schemas/ImpositionWorkflow' },
            device_type: { $ref: '#/components/schemas/DeviceType' },
            pdf_standard: { $ref: '#/components/schemas/PdfStandard' },
            sheet: { $ref: '#/components/schemas/SheetConfig' },
            orders: {
              type: 'array',
              items: { $ref: '#/components/schemas/OrderItem' },
            },
          },
        },
        JobAcceptedResponse: {
          type: 'object',
          properties: {
            job_id: { type: 'string', example: 'job_1724497800_x9a8b7' },
            status: { type: 'string', example: 'QUEUED' },
            workflow: { $ref: '#/components/schemas/ImpositionWorkflow' },
            device_type: { $ref: '#/components/schemas/DeviceType' },
            pdf_standard: { $ref: '#/components/schemas/PdfStandard' },
            status_url: { type: 'string', example: 'https://api.example.com/api/jobs/job_1724497800_x9a8b7' },
            created_at: { type: 'string', format: 'date-time' },
            message: { type: 'string' },
          },
        },
      },
    },
    security: [{ ApiKeyAuth: [] }],
    paths: {
      '/api/jobs': {
        post: {
          summary: 'Submit new POD Imposition Job',
          description:
            'Accepts print orders, validates input dimensions & PDF sources, creates asynchronous job, and returns 202 Accepted with polling URL.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ImpositionJobRequest' },
              },
            },
          },
          responses: {
            '202': {
              description: 'Job accepted and queued for optimization',
              headers: {
                Location: {
                  schema: { type: 'string' },
                  description: 'Polling URL for job status',
                },
              },
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/JobAcceptedResponse' },
                },
              },
            },
            '401': { description: 'Missing or invalid API Key' },
            '422': { description: 'Validation error in request schema' },
          },
        },
        get: {
          summary: 'List imposition jobs with optional filtering',
          parameters: [
            { name: 'status', in: 'query', schema: { type: 'string', enum: ['QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'] } },
            { name: 'workflow', in: 'query', schema: { type: 'string', enum: ['GANGING', 'CUT_AND_STACK'] } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
          ],
          responses: {
            '200': { description: 'List of imposition jobs' },
          },
        },
      },
      '/api/jobs/{id}': {
        get: {
          summary: 'Get imposition job status & result metadata',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Job details, layout yield %, and PDF download URL' },
            '404': { description: 'Job ID not found in Firestore' },
          },
        },
      },
      '/api/jobs/{id}/cancel': {
        post: {
          summary: 'Cancel pending or queued job',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Job successfully cancelled' },
            '409': { description: 'Job cannot be cancelled (already completed)' },
          },
        },
      },
    },
  };

  return NextResponse.json(openApiSpec);
}
