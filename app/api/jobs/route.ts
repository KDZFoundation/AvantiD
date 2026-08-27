import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { ImpositionJobPayloadSchema } from '@/lib/validation';
import { saveJobToStore, listJobsFromStore } from '@/lib/job-store';
import { runInternalLayoutEngine } from '@/lib/imposition-engine';
import { ImpositionJob } from '@/types/imposition';

// POST /api/jobs - Accepts POD imposition job, returns COMPLETED or 202
export async function POST(req: NextRequest) {
  // 1. Authenticate incoming request (Azure POD via X-API-Key or Test Panel)
  const auth = validateApiKey(req);
  if (!auth.isAuthenticated) {
    const isMisconfigured = auth.error?.startsWith('Server Misconfiguration');
    return NextResponse.json(
      {
        error: isMisconfigured ? 'Configuration Error' : 'Unauthorized',
        message: auth.error,
        code: isMisconfigured ? 'SERVER_MISCONFIGURED' : 'AUTH_FAILED',
      },
      { status: isMisconfigured ? 500 : 401 }
    );
  }

  // 2. Parse & validate JSON payload
  let rawBody: any;
  try {
    rawBody = await req.json();
  } catch (err) {
    return NextResponse.json(
      {
        error: 'Invalid JSON',
        message: 'Request body must be a valid JSON object',
        code: 'MALFORMED_JSON',
      },
      { status: 400 }
    );
  }

  const parseResult = ImpositionJobPayloadSchema.safeParse(rawBody);
  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: 'Validation Error',
        message: 'Input parameters do not meet imposition schema requirements',
        code: 'VALIDATION_FAILED',
        issues: parseResult.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      },
      { status: 422 }
    );
  }

  const payload = parseResult.data;
  const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const nowIso = new Date().toISOString();
  const startTime = Date.now();

  // 3. Compute imposition layout immediately
  const result = runInternalLayoutEngine(jobId, payload, startTime);

  const completedJob: ImpositionJob = {
    id: jobId,
    name: payload.name,
    status: 'COMPLETED',
    workflow: payload.workflow,
    device_type: payload.device_type,
    pdf_standard: payload.pdf_standard,
    sheet: payload.sheet,
    orders: payload.orders,
    created_at: nowIso,
    started_at: nowIso,
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    result: result,
    client_metadata: {
      source_system: auth.source,
      auth_method: auth.keyUsed,
      request_ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
    },
  };

  try {
    await saveJobToStore(completedJob);

    const baseUrl = process.env.APP_URL || req.nextUrl.origin;
    const statusUrl = `${baseUrl}/api/jobs/${jobId}`;

    return NextResponse.json(
      {
        job_id: jobId,
        status: 'COMPLETED',
        workflow: payload.workflow,
        device_type: payload.device_type,
        pdf_standard: payload.pdf_standard,
        status_url: statusUrl,
        download_pdf_url: `/api/jobs/${jobId}/render-pdf`,
        created_at: nowIso,
        completed_at: completedJob.completed_at,
        result: result,
        message: 'Imposition job generated successfully.',
      },
      {
        status: 201,
        headers: {
          Location: statusUrl,
        },
      }
    );
  } catch (err: any) {
    console.error('[POST /api/jobs] Save error:', err);
    return NextResponse.json(
      {
        error: 'Database Error',
        message: `Failed to persist imposition job: ${err.message}`,
        code: 'JOB_PERSIST_FAILED',
      },
      { status: 500 }
    );
  }
}

// GET /api/jobs - List jobs with optional filtering (status, workflow, limit)
export async function GET(req: NextRequest) {
  const auth = validateApiKey(req);
  if (!auth.isAuthenticated) {
    const isMisconfigured = auth.error?.startsWith('Server Misconfiguration');
    return NextResponse.json(
      {
        error: isMisconfigured ? 'Configuration Error' : 'Unauthorized',
        message: auth.error,
        code: isMisconfigured ? 'SERVER_MISCONFIGURED' : 'AUTH_FAILED',
      },
      { status: isMisconfigured ? 500 : 401 }
    );
  }

  const { searchParams } = req.nextUrl;
  const statusFilter = searchParams.get('status');
  const workflowFilter = searchParams.get('workflow');
  const limitParam = parseInt(searchParams.get('limit') || '50', 10);

  try {
    const result = await listJobsFromStore({
      status: statusFilter,
      workflow: workflowFilter,
      limit: limitParam,
    });

    return NextResponse.json({
      total: result.total,
      jobs: result.jobs,
      isQuotaExceeded: result.isQuotaExceeded,
      quotaInfo: result.quotaInfo,
    });
  } catch (err: any) {
    console.error('[GET /api/jobs] Query error:', err);
    return NextResponse.json(
      {
        error: 'Database Error',
        message: `Failed to fetch imposition jobs: ${err.message}`,
        code: 'QUERY_FAILED',
      },
      { status: 500 }
    );
  }
}
