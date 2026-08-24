import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { SheetLayout, PlacedItem, ImpositionJobPayload } from '@/types/imposition';
import { getFile, mmToPoints } from './file-storage';

export async function generateProductionPdf(
  jobId: string,
  payload: ImpositionJobPayload,
  sheets: SheetLayout[]
): Promise<Uint8Array> {
  const masterDoc = await PDFDocument.create();
  const font = await masterDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await masterDoc.embedFont(StandardFonts.HelveticaBold);

  // Cache for loaded source PDFs to avoid re-parsing
  const sourcePdfCache = new Map<string, PDFDocument>();

  for (const sheet of sheets) {
    const pageWidthPt = mmToPoints(sheet.width_mm);
    const pageHeightPt = mmToPoints(sheet.height_mm);

    const pdfPage = masterDoc.addPage([pageWidthPt, pageHeightPt]);

    // 1. Draw sheet background / Slug Line Header at top
    pdfPage.drawText(
      `JOB: ${jobId} | WORKFLOW: ${payload.workflow} | DEVICE: ${payload.device_type} | STD: ${payload.pdf_standard} | SHEET: ${sheet.sheet_name}`,
      {
        x: mmToPoints(10),
        y: pageHeightPt - mmToPoints(4),
        size: 7,
        font: fontBold,
        color: rgb(0.2, 0.2, 0.2),
      }
    );

    // 2. Draw Gripper Margin Boundary Line
    const gripperPt = mmToPoints(payload.sheet.gripper_margin_mm);
    pdfPage.drawLine({
      start: { x: 0, y: gripperPt },
      end: { x: pageWidthPt, y: gripperPt },
      thickness: 0.5,
      color: rgb(0.8, 0.2, 0.2),
      dashArray: [4, 4],
    });

    // 3. Draw Placed Items
    for (const item of sheet.placed_items) {
      const itemXPt = mmToPoints(item.x_mm);
      // In PDF coordinate system, (0,0) is bottom-left
      // item.y_mm is measured from bottom or top.
      const itemYPt = mmToPoints(item.y_mm);
      const itemWidthPt = mmToPoints(item.width_with_bleed_mm);
      const itemHeightPt = mmToPoints(item.height_with_bleed_mm);
      const bleedPt = mmToPoints(item.bleed_mm);

      // Check if we have source PDF data
      let embeddedPageDrawn = false;
      const fileIdMatch = item.pdf_source_url.match(/\/api\/files\/([a-zA-Z0-9_-]+)/);
      if (fileIdMatch) {
        const fileId = fileIdMatch[1];
        const stored = getFile(fileId);
        if (stored) {
          try {
            let srcDoc = sourcePdfCache.get(fileId);
            if (!srcDoc) {
              const srcBuffer = Buffer.from(stored.dataBase64, 'base64');
              srcDoc = await PDFDocument.load(srcBuffer, { ignoreEncryption: true });
              sourcePdfCache.set(fileId, srcDoc);
            }

            // Determine which page to embed
            let pageIndex = 0;
            if (item.sequence_number && item.sequence_number <= srcDoc.getPageCount()) {
              pageIndex = item.sequence_number - 1;
            }

            const [embeddedPage] = await masterDoc.embedPages([srcDoc.getPage(pageIndex)]);
            
            // Draw embedded page scaled into item area
            pdfPage.drawPage(embeddedPage, {
              x: itemXPt,
              y: itemYPt,
              width: itemWidthPt,
              height: itemHeightPt,
            });
            embeddedPageDrawn = true;
          } catch (embedErr) {
            console.warn(`Could not embed source PDF ${fileId}:`, embedErr);
          }
        }
      }

      // If not drawn from source PDF, draw visual vector representation with order label
      if (!embeddedPageDrawn) {
        // Bleed area
        pdfPage.drawRectangle({
          x: itemXPt,
          y: itemYPt,
          width: itemWidthPt,
          height: itemHeightPt,
          color: rgb(0.94, 0.96, 0.98),
          borderColor: rgb(0.7, 0.8, 0.9),
          borderWidth: 0.5,
        });

        // Trim area
        pdfPage.drawRectangle({
          x: itemXPt + bleedPt,
          y: itemYPt + bleedPt,
          width: itemWidthPt - 2 * bleedPt,
          height: itemHeightPt - 2 * bleedPt,
          color: rgb(1, 1, 1),
          borderColor: rgb(0.3, 0.5, 0.8),
          borderWidth: 0.75,
        });

        // Label inside
        const label = item.sequence_number ? `#${item.sequence_number}` : item.order_id;
        pdfPage.drawText(label, {
          x: itemXPt + bleedPt + mmToPoints(4),
          y: itemYPt + itemHeightPt / 2,
          size: 9,
          font: fontBold,
          color: rgb(0.1, 0.2, 0.4),
        });

        pdfPage.drawText(`${item.trim_width_mm}x${item.trim_height_mm}mm`, {
          x: itemXPt + bleedPt + mmToPoints(4),
          y: itemYPt + itemHeightPt / 2 - 12,
          size: 7,
          font: font,
          color: rgb(0.4, 0.4, 0.4),
        });
      }

      // 4. Draw Trim / Crop corner marks (hairlines)
      const markLengthPt = mmToPoints(4);
      const markOffsetPt = mmToPoints(1);
      const trimX1 = itemXPt + bleedPt;
      const trimY1 = itemYPt + bleedPt;
      const trimX2 = itemXPt + itemWidthPt - bleedPt;
      const trimY2 = itemYPt + itemHeightPt - bleedPt;

      // Bottom-Left
      pdfPage.drawLine({ start: { x: trimX1, y: trimY1 - markOffsetPt }, end: { x: trimX1, y: trimY1 - markOffsetPt - markLengthPt }, thickness: 0.35, color: rgb(0, 0, 0) });
      pdfPage.drawLine({ start: { x: trimX1 - markOffsetPt, y: trimY1 }, end: { x: trimX1 - markOffsetPt - markLengthPt, y: trimY1 }, thickness: 0.35, color: rgb(0, 0, 0) });

      // Top-Left
      pdfPage.drawLine({ start: { x: trimX1, y: trimY2 + markOffsetPt }, end: { x: trimX1, y: trimY2 + markOffsetPt + markLengthPt }, thickness: 0.35, color: rgb(0, 0, 0) });
      pdfPage.drawLine({ start: { x: trimX1 - markOffsetPt, y: trimY2 }, end: { x: trimX1 - markOffsetPt - markLengthPt, y: trimY2 }, thickness: 0.35, color: rgb(0, 0, 0) });

      // Bottom-Right
      pdfPage.drawLine({ start: { x: trimX2, y: trimY1 - markOffsetPt }, end: { x: trimX2, y: trimY1 - markOffsetPt - markLengthPt }, thickness: 0.35, color: rgb(0, 0, 0) });
      pdfPage.drawLine({ start: { x: trimX2 + markOffsetPt, y: trimY1 }, end: { x: trimX2 + markOffsetPt + markLengthPt, y: trimY1 }, thickness: 0.35, color: rgb(0, 0, 0) });

      // Top-Right
      pdfPage.drawLine({ start: { x: trimX2, y: trimY2 + markOffsetPt }, end: { x: trimX2, y: trimY2 + markOffsetPt + markLengthPt }, thickness: 0.35, color: rgb(0, 0, 0) });
      pdfPage.drawLine({ start: { x: trimX2 + markOffsetPt, y: trimY2 }, end: { x: trimX2 + markOffsetPt + markLengthPt, y: trimY2 }, thickness: 0.35, color: rgb(0, 0, 0) });
    }

    // 5. Optical Registration Marks for CNC Plotter
    if (payload.device_type === 'CNC_PLOTTER' && sheet.optical_marks) {
      for (const mark of sheet.optical_marks) {
        const mx = mmToPoints(mark.x_mm);
        const my = mmToPoints(mark.y_mm);
        const rad = mmToPoints(mark.radius_mm || 2.5);

        pdfPage.drawCircle({
          x: mx,
          y: my,
          size: rad,
          color: rgb(0, 0, 0),
        });

        if (mark.type === 'CROSSHAIR') {
          pdfPage.drawLine({ start: { x: mx - rad * 2, y: my }, end: { x: mx + rad * 2, y: my }, thickness: 0.5, color: rgb(0, 0, 0) });
          pdfPage.drawLine({ start: { x: mx, y: my - rad * 2 }, end: { x: mx, y: my + rad * 2 }, thickness: 0.5, color: rgb(0, 0, 0) });
        }
      }
    }
  }

  return await masterDoc.save();
}
