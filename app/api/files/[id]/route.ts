import { NextRequest, NextResponse } from 'next/server';
import { getFile } from '@/lib/file-storage';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const stored = getFile(id);

  if (!stored) {
    return NextResponse.json({ error: 'File not found or expired' }, { status: 404 });
  }

  const fileBuffer = Buffer.from(stored.dataBase64, 'base64');

  return new NextResponse(fileBuffer, {
    status: 200,
    headers: {
      'Content-Type': stored.mimeType || 'application/pdf',
      'Content-Length': fileBuffer.length.toString(),
      'Content-Disposition': `inline; filename="${stored.filename}"`,
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
