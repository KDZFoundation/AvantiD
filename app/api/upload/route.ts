import { NextRequest, NextResponse } from 'next/server';
import { storeFile, inspectPdfBuffer } from '@/lib/file-storage';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided in form data (field name: "file")' },
        { status: 400 }
      );
    }

    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      return NextResponse.json(
        { error: 'Invalid file format. Only PDF files are supported.' },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString('base64');

    // Inspect PDF using pdf-lib
    const inspection = await inspectPdfBuffer(arrayBuffer);

    const fileId = `pdf_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');

    // Store in-memory
    storeFile({
      id: fileId,
      filename: file.name,
      size: file.size,
      mimeType: file.type || 'application/pdf',
      uploadedAt: new Date().toISOString(),
      pageCount: inspection.pageCount,
      widthMm: inspection.widthMm,
      heightMm: inspection.heightMm,
      bleedMm: inspection.bleedMm,
      dataBase64: base64,
    });

    const fileUrl = `/api/files/${fileId}`;

    return NextResponse.json(
      {
        file_id: fileId,
        filename: file.name,
        file_url: fileUrl,
        size_bytes: file.size,
        page_count: inspection.pageCount,
        detected_dimensions: {
          width_mm: inspection.widthMm,
          height_mm: inspection.heightMm,
          bleed_mm: inspection.bleedMm,
        },
        message: 'PDF file parsed and ready for imposition.',
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error uploading/parsing PDF:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process PDF upload' },
      { status: 500 }
    );
  }
}
