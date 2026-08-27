import { NextRequest, NextResponse } from 'next/server';
import { safeCompare } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const internalSecret = process.env.INTERNAL_TEST_PANEL_SECRET;

  if (!internalSecret || internalSecret.trim().length === 0) {
    return NextResponse.json(
      {
        error: 'Configuration Error',
        message: 'INTERNAL_TEST_PANEL_SECRET is not configured on the server.',
        code: 'SERVER_MISCONFIGURED',
      },
      { status: 500 }
    );
  }

  try {
    const body = await req.json();
    const { password } = body;

    if (!password || !safeCompare(password, internalSecret)) {
      return NextResponse.json(
        {
          error: 'Unauthorized',
          message: 'Nieprawidłowe hasło dostępowe do panelu testowego.',
          code: 'INVALID_CREDENTIALS',
        },
        { status: 401 }
      );
    }

    const response = NextResponse.json({
      success: true,
      message: 'Zalogowano pomyślnie do panelu testowego.',
    });

    // Set secure httpOnly cookie with the secret token
    response.cookies.set({
      name: 'pod_test_session',
      value: internalSecret,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch (err: any) {
    return NextResponse.json(
      {
        error: 'Bad Request',
        message: 'Błąd przetwarzania żądania logowania: ' + err.message,
        code: 'BAD_REQUEST',
      },
      { status: 400 }
    );
  }
}
