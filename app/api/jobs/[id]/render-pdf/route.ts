import { NextRequest, NextResponse } from 'next/server';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { generateProductionPdf } from '@/lib/pdf-assembler';
import { ImpositionJobPayload, SheetLayout } from '@/types/imposition';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const docRef = doc(db, 'imposition_jobs', id);
    const snap = await getDoc(docRef);

    if (!snap.exists()) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const data = snap.data();
    const payload: ImpositionJobPayload = data.request_spec;
    const sheets: SheetLayout[] = data.result?.sheets || [];

    if (!payload || sheets.length === 0) {
      return NextResponse.json(
        { error: 'Job has not generated sheet layouts yet or is still processing' },
        { status: 400 }
      );
    }

    const pdfBytes = await generateProductionPdf(id, payload, sheets);

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="IMPOSITION_${id}_${payload.workflow}_${payload.pdf_standard.replace(/[^a-zA-Z0-9]/g, '_')}.pdf"`,
        'Content-Length': pdfBytes.length.toString(),
      },
    });
  } catch (error: any) {
    console.error('Error generating production imposition PDF:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate PDF' },
      { status: 500 }
    );
  }
}
