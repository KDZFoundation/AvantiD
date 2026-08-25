import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { ImpositionJobPayloadSchema } from '@/lib/validation';
import { adminDb } from '@/lib/firebase-admin';
import { executeImpositionJob } from '@/lib/imposition-engine';
import { ImpositionJob } from '@/types/imposition';

// POST /api/jobs - Accepts POD imposition job, returns 202 Accepted
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

  // 3. Create initial QUEUED record in Firestore using Admin SDK
  const initialJob: ImpositionJob = {
    id: jobId,
    name: payload.name,
    status: 'QUEUED',
    workflow: payload.workflow,
    device_type: payload.device_type,
    pdf_standard: payload.pdf_standard,
    sheet: payload.sheet,
    orders: payload.orders,
    created_at: nowIso,
    updated_at: nowIso,
    client_metadata: {
      source_system: auth.source,
      auth_method: auth.keyUsed,
      request_ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
    },
  };

  try {
    const jobRef = adminDb.collection('imposition_jobs').doc(jobId);
    await jobRef.set(initialJob);

    // 4. Trigger asynchronous imposition optimization execution without blocking response
    executeImpositionJob(jobId, payload).catch((err) => {
      console.error(`[BackgroundExecution] Unhandled failure in job ${jobId}:`, err);
    });

    const baseUrl = process.env.APP_URL || req.nextUrl.origin;
    const statusUrl = `${baseUrl}/api/jobs/${jobId}`;

    // 5. Return 202 Accepted immediately as per async microservice pattern
    return NextResponse.json(
      {
        job_id: jobId,
        status: 'QUEUED',
        workflow: payload.workflow,
        device_type: payload.device_type,
        pdf_standard: payload.pdf_standard,
        status_url: statusUrl,
        created_at: nowIso,
        message: 'Imposition job accepted and queued for optimization.',
      },
      {
        status: 202,
        headers: {
          Location: statusUrl,
        },
      }
    );
  } catch (err: any) {
    console.error('[POST /api/jobs] Firestore save error:', err);
    return NextResponse.json(
      {
        error: 'Database Error',
        message: `Failed to persist imposition job: ${err.message}`,
        code: 'FIRESTORE_WRITE_FAILED',
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
    let query = adminDb.collection('imposition_jobs').limit(limitParam);

    if (statusFilter && statusFilter !== 'ALL') {
      query = adminDb.collection('imposition_jobs').where('status', '==', statusFilter).limit(limitParam);
    }
    if (workflowFilter && workflowFilter !== 'ALL') {
      query = (statusFilter && statusFilter !== 'ALL'
        ? adminDb.collection('imposition_jobs').where('status', '==', statusFilter).where('workflow', '==', workflowFilter)
        : adminDb.collection('imposition_jobs').where('workflow', '==', workflowFilter)
      ).limit(limitParam);
    }

    const snapshot = await query.get();
    const jobs: ImpositionJob[] = [];

    snapshot.forEach((doc) => {
      jobs.push(doc.data() as ImpositionJob);
    });

    // Sort by created_at descending in memory
    jobs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return NextResponse.json({
      total: jobs.length,
      jobs: jobs,
    });
  } catch (err: any) {
    console.error('[GET /api/jobs] Firestore query error:', err);
    return NextResponse.json(
      {
        error: 'Database Error',
        message: `Failed to fetch imposition jobs: ${err.message}`,
        code: 'FIRESTORE_QUERY_FAILED',
      },
      { status: 500 }
    );
  }
}
