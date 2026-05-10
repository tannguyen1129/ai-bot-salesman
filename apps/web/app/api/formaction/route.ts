import { NextResponse } from 'next/server';

function gone(): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      message: 'Endpoint disabled'
    },
    { status: 410 }
  );
}

export async function GET(): Promise<NextResponse> {
  return gone();
}

export async function POST(): Promise<NextResponse> {
  return gone();
}

export async function PUT(): Promise<NextResponse> {
  return gone();
}

export async function PATCH(): Promise<NextResponse> {
  return gone();
}

export async function DELETE(): Promise<NextResponse> {
  return gone();
}
