import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { adminDb } from '@/lib/firebase-admin';
import { ImpositionJob } from '@/types/imposition';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Convert millimeters to PDF points (1 pt = 1/72 inch, 1 inch = 25.4 mm => ~2.83465 pt/mm)
const MM_TO_PT = 72 / 25.4;

// GET /api/jobs/{id}/render-pdf - Generates and streams vector Imposition Sheet PDF
export async function GET(req: NextRequest, { params }: RouteParams) {
  // 1. Authenticate incoming request via X-API-Key or Test Panel
  const auth = validateApiKey(req);
  if (!auth.isAuthenticated) {
    const isMisconfigured = auth.error?.startsWith('Server Misconfiguration');
    return NextResponse.json(
      {
        error: isMisconfigured ? 'Configuration Error' : 'Unauthorized',
        message: auth.error,
        code: isMisconfigured ? 'SERVER_MISCONFIGURED' : 'AUTH_FAILED',
      },
      { status: isMisconfigured ? 500 : 401 }
    );
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json(
      { error: 'Bad Request', message: 'Missing job ID parameter', code: 'MISSING_ID' },
      { status: 400 }
    );
  }

  try {
    // 2. Fetch imposition job from Firestore using Admin SDK
    const jobDoc = await adminDb.collection('imposition_jobs').doc(id).get();

    if (!jobDoc.exists) {
      return NextResponse.json(
        {
          error: 'Not Found',
          message: `Imposition job with ID '${id}' was not found in Firestore`,
          code: 'JOB_NOT_FOUND',
        },
        { status: 404 }
      );
    }

    const job = jobDoc.data() as ImpositionJob;

    if (!job.result || !job.result.sheets || job.result.sheets.length === 0) {
      return NextResponse.json(
        {
          error: 'Not Ready',
          message: `Imposition calculation for job '${id}' is not yet completed or has no sheets. Status: ${job.status}`,
          code: 'JOB_NOT_COMPLETED',
          status: job.status,
        },
        { status: 409 }
      );
    }

    // 3. Create PDF Document and embed fonts
    const pdfDoc = await PDFDocument.create();
    const fontHelvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontHelveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // 4. Render each sheet layout onto PDF pages
    for (const sheetLayout of job.result.sheets) {
      const sheetWidthPt = sheetLayout.width_mm * MM_TO_PT;
      const sheetHeightPt = sheetLayout.height_mm * MM_TO_PT;

      const page = pdfDoc.addPage([sheetWidthPt, sheetHeightPt]);

      // Draw Raw Sheet Background (clean white)
      page.drawRectangle({
        x: 0,
        y: 0,
        width: sheetWidthPt,
        height: sheetHeightPt,
        color: rgb(0.99, 0.99, 0.99),
      });

      // Draw Gripper Margin (leading edge indicator on offset/digital press)
      const gripperHeightPt = (job.sheet?.gripper_margin_mm || 15) * MM_TO_PT;
      page.drawRectangle({
        x: 0,
        y: 0,
        width: sheetWidthPt,
        height: gripperHeightPt,
        color: rgb(0.93, 0.94, 0.96),
        borderColor: rgb(0.8, 0.83, 0.88),
        borderWidth: 0.5,
      });

      page.drawText(`GRIPPER EDGE / LAPKA MASZYNY (${job.sheet?.gripper_margin_mm || 15} mm)`, {
        x: 15,
        y: Math.max(4, gripperHeightPt / 2 - 4),
        size: 8,
        font: fontHelveticaBold,
        color: rgb(0.45, 0.5, 0.58),
      });

      // Draw Sheet Protective Margins Box
      const marginPt = (job.sheet?.margins_mm || 5) * MM_TO_PT;
      page.drawRectangle({
        x: marginPt,
        y: gripperHeightPt,
        width: sheetWidthPt - marginPt * 2,
        height: sheetHeightPt - gripperHeightPt - marginPt,
        borderColor: rgb(0.85, 0.88, 0.92),
        borderWidth: 0.5,
      });

      // Distinct pastel color palette for placed items
      const colorPalette = [
        rgb(0.88, 0.94, 0.99), // Light sky
        rgb(0.92, 0.98, 0.92), // Light emerald
        rgb(0.98, 0.93, 0.99), // Light purple
        rgb(0.99, 0.96, 0.88), // Light amber
        rgb(0.99, 0.91, 0.92), // Light rose
        rgb(0.91, 0.96, 0.99), // Light cyan
      ];

      // Draw Placed Items (bleed boxes, trim boxes, crop marks, labels)
      sheetLayout.placed_items.forEach((item, index) => {
        const itemColor = colorPalette[index % colorPalette.length];
        const bleedPt = item.bleed_mm * MM_TO_PT;

        // Position in PDF coordinates (origin at bottom-left)
        // Convert top-left layout coordinates to bottom-left PDF coordinates
        const trimXPt = item.x_mm * MM_TO_PT;
        const trimYPt = sheetHeightPt - (item.y_mm + item.trim_height_mm) * MM_TO_PT;
        const trimWidthPt = item.trim_width_mm * MM_TO_PT;
        const trimHeightPt = item.trim_height_mm * MM_TO_PT;

        // Draw Bleed Box (extended)
        if (item.bleed_mm > 0) {
          page.drawRectangle({
            x: trimXPt - bleedPt,
            y: trimYPt - bleedPt,
            width: trimWidthPt + bleedPt * 2,
            height: trimHeightPt + bleedPt * 2,
            color: itemColor,
            borderColor: rgb(0.7, 0.75, 0.82),
            borderWidth: 0.5,
          });
        }

        // Draw Netto Trim Box
        page.drawRectangle({
          x: trimXPt,
          y: trimYPt,
          width: trimWidthPt,
          height: trimHeightPt,
          color: rgb(1, 1, 1),
          borderColor: rgb(0.2, 0.25, 0.35),
          borderWidth: 0.75,
        });

        // Item Label Text
        const title = item.order_id;
        const sub = `${item.trim_width_mm}x${item.trim_height_mm}mm (Bleed ${item.bleed_mm}mm)`;
        const posText = `#${index + 1}${item.sequence_number ? ` | Str. ${item.sequence_number}` : ''}`;

        const fontSizeTitle = Math.min(10, Math.max(6, trimWidthPt / 16));
        const fontSizeSub = Math.max(5, fontSizeTitle - 2);

        page.drawText(title, {
          x: trimXPt + 6,
          y: trimYPt + trimHeightPt - fontSizeTitle - 6,
          size: fontSizeTitle,
          font: fontHelveticaBold,
          color: rgb(0.1, 0.15, 0.25),
        });

        page.drawText(sub, {
          x: trimXPt + 6,
          y: trimYPt + trimHeightPt - fontSizeTitle - fontSizeSub - 9,
          size: fontSizeSub,
          font: fontHelvetica,
          color: rgb(0.4, 0.45, 0.55),
        });

        page.drawText(posText, {
          x: trimXPt + 6,
          y: trimYPt + 6,
          size: fontSizeSub + 1,
          font: fontHelveticaBold,
          color: rgb(0.15, 0.4, 0.7),
        });

        // Corner crop marks (znaki cięcia)
        const cropLen = 8;
        const cropOffset = 2;

        // Top-Left crop marks
        page.drawLine({
          start: { x: trimXPt, y: trimYPt + trimHeightPt + cropOffset },
          end: { x: trimXPt, y: trimYPt + trimHeightPt + cropOffset + cropLen },
          thickness: 0.5,
          color: rgb(0, 0, 0),
        });
        page.drawLine({
          start: { x: trimXPt - cropOffset - cropLen, y: trimYPt + trimHeightPt },
          end: { x: trimXPt - cropOffset, y: trimYPt + trimHeightPt },
          thickness: 0.5,
          color: rgb(0, 0, 0),
        });

        // Top-Right crop marks
        page.drawLine({
          start: { x: trimXPt + trimWidthPt, y: trimYPt + trimHeightPt + cropOffset },
          end: { x: trimXPt + trimWidthPt, y: trimYPt + trimHeightPt + cropOffset + cropLen },
          thickness: 0.5,
          color: rgb(0, 0, 0),
        });
        page.drawLine({
          start: { x: trimXPt + trimWidthPt + cropOffset, y: trimYPt + trimHeightPt },
          end: { x: trimXPt + trimWidthPt + cropOffset + cropLen, y: trimYPt + trimHeightPt },
          thickness: 0.5,
          color: rgb(0, 0, 0),
        });

        // Bottom-Left crop marks
        page.drawLine({
          start: { x: trimXPt, y: trimYPt - cropOffset - cropLen },
          end: { x: trimXPt, y: trimYPt - cropOffset },
          thickness: 0.5,
          color: rgb(0, 0, 0),
        });
        page.drawLine({
          start: { x: trimXPt - cropOffset - cropLen, y: trimYPt },
          end: { x: trimXPt - cropOffset, y: trimYPt },
          thickness: 0.5,
          color: rgb(0, 0, 0),
        });

        // Bottom-Right crop marks
        page.drawLine({
          start: { x: trimXPt + trimWidthPt, y: trimYPt - cropOffset - cropLen },
          end: { x: trimXPt + trimWidthPt, y: trimYPt - cropOffset },
          thickness: 0.5,
          color: rgb(0, 0, 0),
        });
        page.drawLine({
          start: { x: trimXPt + trimWidthPt + cropOffset, y: trimYPt },
          end: { x: trimXPt + trimWidthPt + cropOffset + cropLen, y: trimYPt },
          thickness: 0.5,
          color: rgb(0, 0, 0),
        });
      });

      // Draw Cut Lines (Gilotyna)
      if (sheetLayout.cut_lines && sheetLayout.cut_lines.length > 0) {
        sheetLayout.cut_lines.forEach((cut) => {
          const startX = cut.start_mm.x * MM_TO_PT;
          const startY = sheetHeightPt - cut.start_mm.y * MM_TO_PT;
          const endX = cut.end_mm.x * MM_TO_PT;
          const endY = sheetHeightPt - cut.end_mm.y * MM_TO_PT;

          page.drawLine({
            start: { x: startX, y: startY },
            end: { x: endX, y: endY },
            thickness: 0.5,
            color: rgb(0.85, 0.2, 0.2),
          });
        });
      }

      // Draw Optical Marks (CNC Plotter pasery / registration dots)
      if (sheetLayout.optical_marks && sheetLayout.optical_marks.length > 0) {
        sheetLayout.optical_marks.forEach((mark) => {
          const markX = mark.x_mm * MM_TO_PT;
          const markY = sheetHeightPt - mark.y_mm * MM_TO_PT;
          const radiusPt = (mark.radius_mm || 2.5) * MM_TO_PT;

          // Outer circle
          page.drawCircle({
            x: markX,
            y: markY,
            size: radiusPt,
            borderColor: rgb(0, 0, 0),
            borderWidth: 0.75,
          });

          // Inner dot or crosshair
          if (mark.type === 'CROSSHAIR') {
            page.drawLine({
              start: { x: markX - radiusPt * 1.4, y: markY },
              end: { x: markX + radiusPt * 1.4, y: markY },
              thickness: 0.5,
              color: rgb(0, 0, 0),
            });
            page.drawLine({
              start: { x: markX, y: markY - radiusPt * 1.4 },
              end: { x: markX, y: markY + radiusPt * 1.4 },
              thickness: 0.5,
              color: rgb(0, 0, 0),
            });
          } else {
            page.drawCircle({
              x: markX,
              y: markY,
              size: radiusPt * 0.4,
              color: rgb(0, 0, 0),
            });
          }
        });
      }

      // Info Slug Header Line at Top Margin
      const slugText = `POD IMPOSITION | Job ID: ${job.id} | Workflow: ${job.workflow} | Device: ${job.device_type} | Standard: ${job.pdf_standard} | Sheet: ${sheetLayout.sheet_name} | Yield: ${sheetLayout.sheet_yield_percentage}%`;
      page.drawText(slugText, {
        x: marginPt,
        y: sheetHeightPt - marginPt / 2 - 3,
        size: 7,
        font: fontHelvetica,
        color: rgb(0.3, 0.35, 0.45),
      });
    }

    const pdfBytes = await pdfDoc.save();

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="imposition_${id}.pdf"`,
        'X-Imposition-Job-Id': id,
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      },
    });
  } catch (err: any) {
    console.error(`[GET /api/jobs/${id}/render-pdf] Error:`, err);
    return NextResponse.json(
      {
        error: 'Rendering Error',
        message: `Failed to render imposition PDF: ${err.message}`,
        code: 'PDF_RENDER_FAILED',
      },
      { status: 500 }
    );
  }
}
