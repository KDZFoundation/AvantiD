import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { getJobFromStore } from '@/lib/job-store';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/jobs/{id} - Query job status and resulting imposition layout metadata
export async function GET(req: NextRequest, { params }: RouteParams) {
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
          message: `Imposition job with ID '${id}' was not found`,
          code: 'JOB_NOT_FOUND',
        },
        { status: 404 }
      );
    }

    // Return status format designed for Azure POD polling
    return NextResponse.json({
      job_id: job.id,
      status: job.status,
      workflow: job.workflow,
      device_type: job.device_type,
      pdf_standard: job.pdf_standard,
      created_at: job.created_at,
      updated_at: job.updated_at,
      started_at: job.started_at,
      completed_at: job.completed_at,
      error_message: job.error_message,
      // Result block is present when status === 'COMPLETED'
      result: job.result || null,
      // Original request parameters for verification
      request_spec: {
        sheet: job.sheet,
        orders_count: job.orders?.length || 0,
        orders: job.orders,
      },
    });
  } catch (err: any) {
    console.error(`[GET /api/jobs/${id}] Error:`, err);
    return NextResponse.json(
      {
        error: 'Database Error',
        message: `Failed to retrieve job '${id}': ${err.message}`,
        code: 'GET_JOB_FAILED',
      },
      { status: 500 }
    );
  }
}
