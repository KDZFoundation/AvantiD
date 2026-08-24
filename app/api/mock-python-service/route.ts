import { NextRequest, NextResponse } from 'next/server';

/**
 * Mock endpoint simulating the external Python FastAPI service deployed on Google Cloud Run.
 * Used for development and contract testing between Next.js and the Python imposition solver.
 */
export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const serviceKey = req.headers.get('x-service-key');

    // Simulate Python processing time (e.g. PyMuPDF parsing & 2D packing)
    await new Promise((res) => setTimeout(res, 600));

    const totalSheetAreaSqm = (payload.sheet.width_mm * payload.sheet.height_mm) / 1_000_000;
    const yieldPct = payload.workflow === 'GANGING' ? 88.4 : 91.2;
    const wastePct = Number((100 - yieldPct).toFixed(1));

    return NextResponse.json({
      service_origin: 'EXTERNAL_PYTHON_SERVICE_MOCK',
      workflow: payload.workflow,
      device_type: payload.device_type,
      pdf_standard: payload.pdf_standard,
      yield_percentage: yieldPct,
      waste_percentage: wastePct,
      total_waste_sqm: Number(((totalSheetAreaSqm * wastePct) / 100).toFixed(4)),
      total_used_sqm: Number(((totalSheetAreaSqm * yieldPct) / 100).toFixed(4)),
      sheet_run_count: 500,
      total_sheets_required: 500,
      sheets_generated_count: 1,
      download_pdf_url: `https://storage.googleapis.com/pod-imposition-production-outputs/mock_python_fastapi_result.pdf`,
      execution_time_ms: 610,
      workflow_details: {
        workflow: payload.workflow,
        device_type: payload.device_type,
        python_fastapi_worker_info: {
          engine_version: 'imposition-solver-py-v2.1.0',
          pymupdf_version: '1.24.0',
          rectpack_algorithm: 'GuillotineBssfMaxArea',
        },
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: 'Mock Service Error', message: err.message }, { status: 500 });
  }
}
