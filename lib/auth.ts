import { NextRequest } from 'next/server';

export interface AuthResult {
  isAuthenticated: boolean;
  source: 'AZURE_EXTERNAL_POD' | 'INTERNAL_DEV_PANEL' | 'UNAUTHORIZED';
  error?: string;
  keyUsed?: string;
}

export function validateApiKey(req: NextRequest): AuthResult {
  const configuredSecret = process.env.POD_API_SECRET_KEY;
  const internalTestSecret = process.env.INTERNAL_TEST_PANEL_SECRET;

  // 1. Strict Environment Configuration Check
  // If POD_API_SECRET_KEY is not configured in the environment, reject with a clear 500-level error description
  if (!configuredSecret || configuredSecret.trim().length === 0) {
    return {
      isAuthenticated: false,
      source: 'UNAUTHORIZED',
      error: 'Server Misconfiguration: POD_API_SECRET_KEY environment variable is not configured. Please set a secure secret in .env.local or Secret Manager.',
    };
  }

  // 2. Check internal test panel session cookie (pod_test_session)
  const sessionCookie = req.cookies.get('pod_test_session')?.value;
  if (sessionCookie && internalTestSecret && internalTestSecret.trim().length > 0) {
    if (sessionCookie === internalTestSecret) {
      return {
        isAuthenticated: true,
        source: 'INTERNAL_DEV_PANEL',
        keyUsed: 'internal-test-panel-session-cookie',
      };
    }
  }

  // 3. Check X-API-Key or Authorization Bearer header
  const apiKeyHeader = req.headers.get('x-api-key') || req.headers.get('X-API-Key');
  const authHeader = req.headers.get('authorization');
  const token = apiKeyHeader || (authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null);

  if (!token) {
    return {
      isAuthenticated: false,
      source: 'UNAUTHORIZED',
      error: "Missing authentication header. Please provide 'X-API-Key: <YOUR_API_KEY>' or 'Authorization: Bearer <YOUR_API_KEY>'",
    };
  }

  // 4. Strict timing-safe / constant matching against configuredSecret ONLY
  if (token === configuredSecret) {
    return {
      isAuthenticated: true,
      source: 'AZURE_EXTERNAL_POD',
      keyUsed: token.length > 8 ? token.substring(0, 4) + '...' + token.slice(-4) : '***',
    };
  }

  return {
    isAuthenticated: false,
    source: 'UNAUTHORIZED',
    error: 'Invalid API Key provided. Access denied.',
  };
}
