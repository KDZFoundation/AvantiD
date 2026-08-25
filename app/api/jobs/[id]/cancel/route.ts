import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { getJobFromStore, updateJobInStore } from '@/lib/job-store';
import { ImpositionJob } from '@/types/imposition';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/jobs/{id}/cancel - Cancels an imposition job in QUEUED or PROCESSING state
export async function POST(req: NextRequest, { params }: RouteParams) {
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

  const { id } = await params;
  if (!id) {
    return NextResponse.json(
      { error: 'Bad Request', message: 'Missing job ID parameter', code: 'MISSING_ID' },
      { status: 400 }
    );
  }

  try {
    const job = await getJobFromStore(id);

    if (!job) {
      return NextResponse.json(
        {
          error: 'Not Found',
          message: `Imposition job with ID '${id}' was not found in Firestore`,
          code: 'JOB_NOT_FOUND',
        },
        { status: 404 }
      );
    }

    if (job.status === 'COMPLETED') {
      return NextResponse.json(
        {
          error: 'Conflict',
          message: `Cannot cancel job '${id}' because it has already COMPLETED`,
          code: 'JOB_ALREADY_COMPLETED',
          status: job.status,
        },
        { status: 409 }
      );
    }

    if (job.status === 'CANCELLED') {
      return NextResponse.json(
        {
          message: `Job '${id}' is already CANCELLED`,
          job_id: id,
          status: 'CANCELLED',
        },
        { status: 200 }
      );
    }

    const nowIso = new Date().toISOString();
    await updateJobInStore(id, {
      status: 'CANCELLED',
      updated_at: nowIso,
      completed_at: nowIso,
      error_message: 'Job was cancelled by client request',
    });

    return NextResponse.json({
      message: `Job '${id}' successfully cancelled`,
      job_id: id,
      status: 'CANCELLED',
      updated_at: nowIso,
    });
  } catch (err: any) {
    console.error(`[POST /api/jobs/${id}/cancel] Error:`, err);
    return NextResponse.json(
      {
        error: 'Database Error',
        message: `Failed to cancel job '${id}': ${err.message}`,
        code: 'FIRESTORE_CANCEL_FAILED',
      },
      { status: 500 }
    );
  }
}
