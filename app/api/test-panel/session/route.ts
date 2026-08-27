import { NextRequest, NextResponse } from 'next/server';
import { safeCompare } from '@/lib/auth';

// GET /api/test-panel/session - Checks if user has a valid pod_test_session cookie
export async function GET(req: NextRequest) {
  const internalSecret = process.env.INTERNAL_TEST_PANEL_SECRET;

  if (!internalSecret || internalSecret.trim().length === 0) {
    return NextResponse.json(
      {
        authenticated: false,
        error: 'INTERNAL_TEST_PANEL_SECRET is not configured on the server.',
      },
      { status: 200 }
    );
  }

  const sessionCookie = req.cookies.get('pod_test_session')?.value;

  if (sessionCookie && safeCompare(sessionCookie, internalSecret)) {
    return NextResponse.json({
      authenticated: true,
      message: 'Aktywna sesja deweloperska panelu testowego.',
    });
  }

  return NextResponse.json({
    authenticated: false,
    message: 'Brak aktywnej sesji. Wymagane logowanie.',
  });
}

// DELETE /api/test-panel/session - Logs out user
export async function DELETE() {
  const response = NextResponse.json({
    authenticated: false,
    message: 'Wylogowano z panelu testowego.',
  });

  response.cookies.delete('pod_test_session');
  return response;
}
