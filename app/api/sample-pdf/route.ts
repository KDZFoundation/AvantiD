import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { mmToPoints } from '@/lib/file-storage';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') || 'a6'; // 'a6' | 'business_card' | 'ticket_book'

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);

  if (type === 'business_card') {
    // 90 x 50 mm + 2mm bleed = 94 x 54 mm
    const wPt = mmToPoints(94);
    const hPt = mmToPoints(54);
    const page = doc.addPage([wPt, hPt]);

    // Background with bleed
    page.drawRectangle({
      x: 0,
      y: 0,
      width: wPt,
      height: hPt,
      color: rgb(0.12, 0.22, 0.35),
    });

    // Content inside trim (2mm from edge = 5.67 pt)
    const trimMarginPt = mmToPoints(2);
    page.drawRectangle({
      x: trimMarginPt,
      y: trimMarginPt,
      width: wPt - 2 * trimMarginPt,
      height: hPt - 2 * trimMarginPt,
      borderColor: rgb(0.4, 0.6, 0.8),
      borderWidth: 0.5,
    });

    page.drawText('DRUKARNIA TEST POLIGRAFIA', {
      x: trimMarginPt + mmToPoints(4),
      y: hPt / 2 + mmToPoints(3),
      size: 10,
      font,
      color: rgb(1, 1, 1),
    });

    page.drawText('Wizytowka Standard 90x50 mm | Spad 2mm', {
      x: trimMarginPt + mmToPoints(4),
      y: hPt / 2 - mmToPoints(4),
      size: 6.5,
      font: fontRegular,
      color: rgb(0.8, 0.85, 0.9),
    });
  } else if (type === 'ticket_book') {
    // Multi-page Cut & Stack test document (12 pages, 100 x 50 mm)
    const wPt = mmToPoints(104);
    const hPt = mmToPoints(54);

    for (let i = 1; i <= 12; i++) {
      const page = doc.addPage([wPt, hPt]);
      page.drawRectangle({
        x: 0,
        y: 0,
        width: wPt,
        height: hPt,
        color: rgb(0.96, 0.97, 0.98),
      });

      const trimMarginPt = mmToPoints(2);
      page.drawRectangle({
        x: trimMarginPt,
        y: trimMarginPt,
        width: wPt - 2 * trimMarginPt,
        height: hPt - 2 * trimMarginPt,
        color: rgb(1, 1, 1),
        borderColor: rgb(0.3, 0.6, 0.4),
        borderWidth: 1,
      });

      page.drawText(`BILET / VOUCHER TESTOWY #${i}`, {
        x: trimMarginPt + mmToPoints(6),
        y: hPt / 2 + mmToPoints(4),
        size: 11,
        font,
        color: rgb(0.1, 0.4, 0.2),
      });

      page.drawText(`Numer seryjny: 2026-SEQ-${String(i).padStart(4, '0')} | Cut & Stack Page ${i}/12`, {
        x: trimMarginPt + mmToPoints(6),
        y: hPt / 2 - mmToPoints(5),
        size: 7,
        font: fontRegular,
        color: rgb(0.3, 0.3, 0.3),
      });
    }
  } else {
    // Default A6 flyer (105 x 148 mm + 2mm bleed = 109 x 152 mm)
    const wPt = mmToPoints(109);
    const hPt = mmToPoints(152);
    const page = doc.addPage([wPt, hPt]);

    page.drawRectangle({
      x: 0,
      y: 0,
      width: wPt,
      height: hPt,
      color: rgb(0.93, 0.95, 0.98),
    });

    const trimMarginPt = mmToPoints(2);
    page.drawRectangle({
      x: trimMarginPt,
      y: trimMarginPt,
      width: wPt - 2 * trimMarginPt,
      height: hPt - 2 * trimMarginPt,
      color: rgb(1, 1, 1),
      borderColor: rgb(0.2, 0.4, 0.8),
      borderWidth: 1,
    });

    page.drawText('PLIK TESTOWY DRUKARNI', {
      x: trimMarginPt + mmToPoints(8),
      y: hPt - mmToPoints(20),
      size: 14,
      font,
      color: rgb(0.1, 0.2, 0.4),
    });

    page.drawText('Ulotka format A6 (105 x 148 mm netto)', {
      x: trimMarginPt + mmToPoints(8),
      y: hPt - mmToPoints(28),
      size: 9,
      font: fontRegular,
      color: rgb(0.3, 0.3, 0.3),
    });

    page.drawText('Spad drukarski (Bleed): 2.0 mm', {
      x: trimMarginPt + mmToPoints(8),
      y: hPt - mmToPoints(34),
      size: 8,
      font: fontRegular,
      color: rgb(0.5, 0.5, 0.5),
    });

    // CMYK simulation blocks
    const colors = [
      rgb(0, 0.8, 0.9), // Cyan
      rgb(0.9, 0, 0.6), // Magenta
      rgb(0.95, 0.9, 0), // Yellow
      rgb(0.1, 0.1, 0.1), // Black
    ];
    colors.forEach((col, idx) => {
      page.drawRectangle({
        x: trimMarginPt + mmToPoints(8 + idx * 14),
        y: trimMarginPt + mmToPoints(15),
        width: mmToPoints(10),
        height: mmToPoints(10),
        color: col,
      });
    });
  }

  const pdfBytes = await doc.save();
  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="sample_${type}_print_file.pdf"`,
    },
  });
}
