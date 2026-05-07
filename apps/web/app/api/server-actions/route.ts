import { NextRequest, NextResponse } from 'next/server';

const BLOCK_PATTERNS = [
  /\/dev\/tcp/i,
  /\bbash\s+-i\b/i,
  /\bsh\s+-i\b/i,
  /\bexec\b/i,
  /\bspawn\b/i,
  /\bapt-get\b/i,
  /\byum\b/i,
  /\bsubprocess\b/i,
  /\burlretrieve\b/i,
  />\s*&\s*\/dev\/tcp/i
];

function containsSuspiciousCommand(input: string): boolean {
  return BLOCK_PATTERNS.some((pattern) => pattern.test(input));
}

function extractTextPayload(body: unknown): string {
  if (typeof body === 'string') {
    return body;
  }

  if (body && typeof body === 'object') {
    return JSON.stringify(body);
  }

  return '';
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let payload = '';
  const contentType = request.headers.get('content-type') ?? '';

  try {
    if (contentType.includes('application/json')) {
      payload = extractTextPayload(await request.json());
    } else {
      payload = await request.text();
    }
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message: 'Malformed request body'
      },
      { status: 400 }
    );
  }

  if (containsSuspiciousCommand(payload)) {
    return NextResponse.json(
      {
        ok: false,
        message: 'Suspicious command payload is blocked'
      },
      { status: 403 }
    );
  }

  return NextResponse.json(
    {
      ok: false,
      message: 'Direct server-actions endpoint is disabled'
    },
    { status: 404 }
  );
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    {
      ok: false,
      message: 'Use POST'
    },
    { status: 405 }
  );
}

