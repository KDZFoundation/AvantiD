import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { ImpositionJob } from '@/types/imposition';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/jobs/{id} - Query job status and resulting imposition layout metadata
export async function GET(req: NextRequest, { params }: RouteParams) {
  const auth = validateApiKey(req);
  if (!auth.isAuthenticated) {
    return NextResponse.json(
      {
        error: 'Unauthorized',
        message: auth.error,
        code: 'AUTH_FAILED',
      },
      { status: 401 }
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
    const jobRef = doc(db, 'imposition_jobs', id);
    const snap = await getDoc(jobRef);

    if (!snap.exists()) {
      return NextResponse.json(
        {
          error: 'Not Found',
          message: `Imposition job with ID '${id}' was not found in Firestore`,
          code: 'JOB_NOT_FOUND',
        },
        { status: 404 }
      );
    }

    const job = snap.data() as ImpositionJob;

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
        orders_count: job.orders.length,
        orders: job.orders,
      },
    });
  } catch (err: any) {
    console.error(`[GET /api/jobs/${id}] Error:`, err);
    return NextResponse.json(
      {
        error: 'Database Error',
        message: `Failed to retrieve job '${id}': ${err.message}`,
        code: 'FIRESTORE_GET_FAILED',
      },
      { status: 500 }
    );
  }
}
