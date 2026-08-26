import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { getJobFromStore } from '@/lib/job-store';
import { ImpositionJob } from '@/types/imposition';
import { PDFDocument, PDFEmbeddedPage, rgb, StandardFonts, degrees } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Convert millimeters to PDF points (1 pt = 1/72 inch, 1 inch = 25.4 mm => ~2.83465 pt/mm)
const MM_TO_PT = 72 / 25.4;

interface EmbeddedSource {
  front: PDFEmbeddedPage | null;
  back: PDFEmbeddedPage | null;
  error?: string;
  sourceWidthPt?: number;
  sourceHeightPt?: number;
}

// Helper to fetch PDF buffer from local disk or network
async function fetchPdfBuffer(url: string, baseOrigin?: string): Promise<Buffer> {
  // If local public asset (/test-assets/..., /uploads/...)
  if (url.startsWith('/')) {
    const localPath = path.join(process.cwd(), 'public', url);
    if (fs.existsSync(localPath)) {
      return fs.readFileSync(localPath);
    }
    // Fallback to internal HTTP fetch
    const fetchUrl = (baseOrigin || 'http://localhost:3000') + url;
    const res = await fetch(fetchUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return Buffer.from(await res.arrayBuffer());
  }

  // If absolute network URL (Google Cloud Storage, etc.)
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return Buffer.from(await res.arrayBuffer());
}

// GET /api/jobs/{id}/render-pdf - Generates and streams vector Imposition Sheet PDF with embedded source pages
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
    // 2. Fetch imposition job from Store
    const job = await getJobFromStore(id);

    if (!job) {
      return NextResponse.json(
        {
          error: 'Not Found',
          message: `Imposition job with ID '${id}' was not found`,
          code: 'JOB_NOT_FOUND',
        },
        { status: 404 }
      );
    }

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

    // 3. Create destination PDF Document and embed fonts
    const pdfDoc = await PDFDocument.create();
    const fontHelvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontHelveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // 4. Pre-fetch and embed all unique source PDF pages (cached for multi-slot reuse)
    const embeddedSourcesCache = new Map<string, EmbeddedSource>();
    const uniqueSourceUrls = Array.from(
      new Set(
        job.result.sheets
          .flatMap((s) => s.placed_items)
          .filter((item) => (item.slot_type || 'PRODUCT') === 'PRODUCT' && item.pdf_source_url)
          .map((item) => item.pdf_source_url)
      )
    );

    const baseOrigin = req.nextUrl?.origin || 'http://localhost:3000';

    for (const sourceUrl of uniqueSourceUrls) {
      try {
        const fileBuffer = await fetchPdfBuffer(sourceUrl, baseOrigin);
        const sourceDoc = await PDFDocument.load(fileBuffer, { ignoreEncryption: true });
        const pageCount = sourceDoc.getPageCount();

        if (pageCount === 0) {
          embeddedSourcesCache.set(sourceUrl, {
            front: null,
            back: null,
            error: 'Plik PDF nie zawiera stron',
          });
          continue;
        }

        const frontPage = sourceDoc.getPage(0);
        const frontEmbedded = await pdfDoc.embedPage(frontPage);

        let backEmbedded = frontEmbedded;
        if (pageCount > 1) {
          const backPage = sourceDoc.getPage(1);
          backEmbedded = await pdfDoc.embedPage(backPage);
        }

        embeddedSourcesCache.set(sourceUrl, {
          front: frontEmbedded,
          back: backEmbedded,
          sourceWidthPt: frontPage.getWidth(),
          sourceHeightPt: frontPage.getHeight(),
        });
      } catch (err: any) {
        console.warn(`[render-pdf] Warning: failed to fetch source PDF '${sourceUrl}':`, err.message);
        embeddedSourcesCache.set(sourceUrl, {
          front: null,
          back: null,
          error: `Nie udało się pobrać pliku źródłowego: ${sourceUrl}`,
        });
      }
    }

    // Helper: Draw 1D pseudo-barcode
    const drawBarcode1D = (
      targetPage: any,
      text: string,
      startX: number,
      startY: number,
      barHeight: number,
      maxBarcodeWidth: number
    ) => {
      const hash = Array.from(text).reduce((acc, char, i) => acc + char.charCodeAt(0) * (i + 1), 0);
      let currentX = startX;
      const barWidth = 0.85;
      const totalBars = Math.min(24, Math.floor(maxBarcodeWidth / (barWidth * 1.8)));

      for (let b = 0; b < totalBars; b++) {
        const isBlack = (hash * (b + 7) + b * 13) % 3 !== 0;
        const isThick = isBlack && (hash + b * 5) % 4 === 0;
        const w = isThick ? barWidth * 1.8 : barWidth;

        if (isBlack) {
          targetPage.drawRectangle({
            x: currentX,
            y: startY,
            width: w,
            height: barHeight,
            color: rgb(0, 0, 0),
          });
        }
        currentX += w + barWidth * 0.75;
        if (currentX > startX + maxBarcodeWidth) break;
      }
    };

    // Helper: Draw standard 4-corner crop marks (pasery / znaczniki cięcia netto)
    const drawCropMarks = (
      targetPage: any,
      trimXPt: number,
      trimYPt: number,
      trimWidthPt: number,
      trimHeightPt: number
    ) => {
      const cropLen = 8;
      const cropOffset = 2;

      // Top-Left
      targetPage.drawLine({
        start: { x: trimXPt, y: trimYPt + trimHeightPt + cropOffset },
        end: { x: trimXPt, y: trimYPt + trimHeightPt + cropOffset + cropLen },
        thickness: 0.5,
        color: rgb(0, 0, 0),
      });
      targetPage.drawLine({
        start: { x: trimXPt - cropOffset - cropLen, y: trimYPt + trimHeightPt },
        end: { x: trimXPt - cropOffset, y: trimYPt + trimHeightPt },
        thickness: 0.5,
        color: rgb(0, 0, 0),
      });

      // Top-Right
      targetPage.drawLine({
        start: { x: trimXPt + trimWidthPt, y: trimYPt + trimHeightPt + cropOffset },
        end: { x: trimXPt + trimWidthPt, y: trimYPt + trimHeightPt + cropOffset + cropLen },
        thickness: 0.5,
        color: rgb(0, 0, 0),
      });
      targetPage.drawLine({
        start: { x: trimXPt + trimWidthPt + cropOffset, y: trimYPt + trimHeightPt },
        end: { x: trimXPt + trimWidthPt + cropOffset + cropLen, y: trimYPt + trimHeightPt },
        thickness: 0.5,
        color: rgb(0, 0, 0),
      });

      // Bottom-Left
      targetPage.drawLine({
        start: { x: trimXPt, y: trimYPt - cropOffset - cropLen },
        end: { x: trimXPt, y: trimYPt - cropOffset },
        thickness: 0.5,
        color: rgb(0, 0, 0),
      });
      targetPage.drawLine({
        start: { x: trimXPt - cropOffset - cropLen, y: trimYPt },
        end: { x: trimXPt - cropOffset, y: trimYPt },
        thickness: 0.5,
        color: rgb(0, 0, 0),
      });

      // Bottom-Right
      targetPage.drawLine({
        start: { x: trimXPt + trimWidthPt, y: trimYPt - cropOffset - cropLen },
        end: { x: trimXPt + trimWidthPt, y: trimYPt - cropOffset },
        thickness: 0.5,
        color: rgb(0, 0, 0),
      });
      targetPage.drawLine({
        start: { x: trimXPt + trimWidthPt + cropOffset, y: trimYPt },
        end: { x: trimXPt + trimWidthPt + cropOffset + cropLen, y: trimYPt },
        thickness: 0.5,
        color: rgb(0, 0, 0),
      });
    };

    // 5. Render each sheet layout onto DUPLEX PDF pages (Front & Back)
    for (const sheetLayout of job.result.sheets) {
      const sheetWidthPt = sheetLayout.width_mm * MM_TO_PT;
      const sheetHeightPt = sheetLayout.height_mm * MM_TO_PT;
      const marginPt = (job.sheet?.margins_mm || 5) * MM_TO_PT;
      const gripperHeightPt = (job.sheet?.gripper_margin_mm || 15) * MM_TO_PT;

      // ==========================================
      // --- SIDE 1: FRONT (AWERS) ---
      // ==========================================
      const pageFront = pdfDoc.addPage([sheetWidthPt, sheetHeightPt]);

      // Draw Raw Sheet Background
      pageFront.drawRectangle({
        x: 0,
        y: 0,
        width: sheetWidthPt,
        height: sheetHeightPt,
        color: rgb(0.99, 0.99, 0.99),
      });

      // Draw Gripper Margin
      pageFront.drawRectangle({
        x: 0,
        y: 0,
        width: sheetWidthPt,
        height: gripperHeightPt,
        color: rgb(0.93, 0.94, 0.96),
        borderColor: rgb(0.8, 0.83, 0.88),
        borderWidth: 0.5,
      });

      pageFront.drawText(
        `GRIPPER EDGE / LAPKA MASZYNY (${job.sheet?.gripper_margin_mm || 15} mm) - FRONT [AWERS]`,
        {
          x: 15,
          y: Math.max(4, gripperHeightPt / 2 - 4),
          size: 8,
          font: fontHelveticaBold,
          color: rgb(0.45, 0.5, 0.58),
        }
      );

      // Render barcode tags for each distinct order in gripper
      const distinctOrders = Array.from(new Set(sheetLayout.placed_items.map((i) => i.order_id)));
      let tagX = 220;
      distinctOrders.forEach((ordId) => {
        if (tagX + 110 < sheetWidthPt - 20) {
          drawBarcode1D(pageFront, ordId, tagX, 4, 12, 45);
          pageFront.drawText(ordId, {
            x: tagX + 50,
            y: 8,
            size: 6,
            font: fontHelveticaBold,
            color: rgb(0.2, 0.25, 0.35),
          });
          tagX += 130;
        }
      });

      // Draw Sheet Margin Box
      pageFront.drawRectangle({
        x: marginPt,
        y: gripperHeightPt,
        width: sheetWidthPt - marginPt * 2,
        height: sheetHeightPt - gripperHeightPt - marginPt,
        borderColor: rgb(0.85, 0.88, 0.92),
        borderWidth: 0.5,
      });

      // Render Placed Items on FRONT
      sheetLayout.placed_items.forEach((item, index) => {
        const slotType = item.slot_type || 'PRODUCT';
        const itemXPt = item.x_mm * MM_TO_PT;
        const itemYPt = sheetHeightPt - (item.y_mm + item.height_with_bleed_mm) * MM_TO_PT;
        const itemWWithBleedPt = item.width_with_bleed_mm * MM_TO_PT;
        const itemHWithBleedPt = item.height_with_bleed_mm * MM_TO_PT;

        const trimXPt = item.trim_box.x1 * MM_TO_PT;
        const trimYPt = sheetHeightPt - item.trim_box.y2 * MM_TO_PT;
        const trimWidthPt = item.trim_width_mm * MM_TO_PT;
        const trimHeightPt = item.trim_height_mm * MM_TO_PT;

        if (slotType === 'PRODUCT') {
          const embedded = embeddedSourcesCache.get(item.pdf_source_url);

          if (embedded && embedded.front) {
            // Draw embedded vector source page (Page 1 / Front)
            if (item.rotation_deg === 90) {
              pageFront.drawPage(embedded.front, {
                x: itemXPt + itemWWithBleedPt,
                y: itemYPt,
                width: itemHWithBleedPt,
                height: itemWWithBleedPt,
                rotate: degrees(90),
              });
            } else {
              pageFront.drawPage(embedded.front, {
                x: itemXPt,
                y: itemYPt,
                width: itemWWithBleedPt,
                height: itemHWithBleedPt,
              });
            }
          } else {
            // Error Placeholder box
            pageFront.drawRectangle({
              x: trimXPt,
              y: trimYPt,
              width: trimWidthPt,
              height: trimHeightPt,
              color: rgb(0.99, 0.94, 0.94),
              borderColor: rgb(0.85, 0.2, 0.2),
              borderWidth: 1,
            });

            pageFront.drawText('BLAD ZRODLA PDF', {
              x: trimXPt + 6,
              y: trimYPt + trimHeightPt - 16,
              size: 7,
              font: fontHelveticaBold,
              color: rgb(0.85, 0.2, 0.2),
            });

            pageFront.drawText(
              (embedded?.error || 'Nie udalo sie pobrac pliku zrodlowego').slice(0, 45),
              {
                x: trimXPt + 6,
                y: trimYPt + trimHeightPt - 28,
                size: 5,
                font: fontHelvetica,
                color: rgb(0.4, 0.1, 0.1),
              }
            );

            pageFront.drawText(`URL: ${item.pdf_source_url.slice(0, 38)}`, {
              x: trimXPt + 6,
              y: trimYPt + 8,
              size: 4.5,
              font: fontHelvetica,
              color: rgb(0.5, 0.2, 0.2),
            });
          }

          // Bleed slug info (trimmed after cut)
          pageFront.drawText(`ORD: ${item.order_id} | #${index + 1}`, {
            x: itemXPt + 1,
            y: itemYPt + 1.5,
            size: 3.8,
            font: fontHelveticaBold,
            color: rgb(0.2, 0.25, 0.35),
          });

          // Draw Netto Crop Marks
          drawCropMarks(pageFront, trimXPt, trimYPt, trimWidthPt, trimHeightPt);
        } else if (slotType === 'STACK_COVER') {
          // STACK_COVER card (Gelato style stack cover card)
          pageFront.drawRectangle({
            x: trimXPt,
            y: trimYPt,
            width: trimWidthPt,
            height: trimHeightPt,
            color: rgb(1, 1, 1),
            borderColor: rgb(0.1, 0.1, 0.1),
            borderWidth: 0.5,
          });

          const stackStr = `${item.stack_number || 1}/${item.total_stacks || 8}`;

          // Stack Title Box
          pageFront.drawText('Stack', {
            x: trimXPt + 10,
            y: trimYPt + trimHeightPt - 22,
            size: 11,
            font: fontHelveticaBold,
            color: rgb(0, 0, 0),
          });

          pageFront.drawText(stackStr, {
            x: trimXPt + 10,
            y: trimYPt + trimHeightPt - 38,
            size: 14,
            font: fontHelveticaBold,
            color: rgb(0, 0, 0),
          });

          // Details
          pageFront.drawText(String(item.order_id), {
            x: trimXPt + 10,
            y: trimYPt + trimHeightPt - 55,
            size: 10,
            font: fontHelveticaBold,
            color: rgb(0, 0, 0),
          });

          pageFront.drawText(`Quantity: ${item.order_quantity || 0}`, {
            x: trimXPt + 10,
            y: trimYPt + trimHeightPt - 68,
            size: 8,
            font: fontHelveticaBold,
            color: rgb(0, 0, 0),
          });

          pageFront.drawText('FLAT CARD (2 PAGES)', {
            x: trimXPt + 10,
            y: trimYPt + trimHeightPt - 80,
            size: 7.5,
            font: fontHelveticaBold,
            color: rgb(0, 0, 0),
          });

          pageFront.drawText(`Size: ${item.product_specs?.size || '105x148-mm'}`, {
            x: trimXPt + 10,
            y: trimYPt + trimHeightPt - 90,
            size: 7,
            font: fontHelvetica,
            color: rgb(0.2, 0.2, 0.2),
          });

          pageFront.drawText(`Paper: ${item.product_specs?.paper_weight_gsm || 300}-gsm-uncoated`, {
            x: trimXPt + 10,
            y: trimYPt + trimHeightPt - 100,
            size: 7,
            font: fontHelvetica,
            color: rgb(0.2, 0.2, 0.2),
          });

          pageFront.drawText('Coating: none', {
            x: trimXPt + 10,
            y: trimYPt + trimHeightPt - 110,
            size: 7,
            font: fontHelvetica,
            color: rgb(0.2, 0.2, 0.2),
          });

          pageFront.drawText(`Plate: ${item.plate_id || '2954502725'}`, {
            x: trimXPt + 10,
            y: trimYPt + trimHeightPt - 120,
            size: 7,
            font: fontHelvetica,
            color: rgb(0.2, 0.2, 0.2),
          });

          if (item.customer_reference) {
            pageFront.drawText(item.customer_reference, {
              x: trimXPt + 10,
              y: trimYPt + trimHeightPt - 132,
              size: 8,
              font: fontHelveticaBold,
              color: rgb(0, 0, 0),
            });
          }

          pageFront.drawText(`Order ID: ${item.order_id}`, {
            x: trimXPt + 10,
            y: trimYPt + trimHeightPt - 144,
            size: 7,
            font: fontHelvetica,
            color: rgb(0.3, 0.3, 0.3),
          });

          pageFront.drawText('gelato-create', {
            x: trimXPt + 10,
            y: trimYPt + trimHeightPt - 154,
            size: 7,
            font: fontHelvetica,
            color: rgb(0.3, 0.3, 0.3),
          });

          pageFront.drawText(item.order_index === 1 ? 'WC' : 'Q0', {
            x: trimXPt + 10,
            y: trimYPt + trimHeightPt - 166,
            size: 8,
            font: fontHelveticaBold,
            color: rgb(0, 0, 0),
          });

          pageFront.drawText(item.job_label || 'Print job 1/2', {
            x: trimXPt + 10,
            y: trimYPt + trimHeightPt - 178,
            size: 8,
            font: fontHelveticaBold,
            color: rgb(0, 0, 0),
          });

          // Sorting instruction box at bottom
          pageFront.drawRectangle({
            x: trimXPt + 6,
            y: trimYPt + 10,
            width: trimWidthPt - 12,
            height: 38,
            color: rgb(0.96, 0.96, 0.96),
            borderColor: rgb(0.8, 0.8, 0.8),
            borderWidth: 0.5,
          });

          pageFront.drawText(`Dispatch date: ${item.dispatch_date || '2026-08-24'}`, {
            x: trimXPt + 10,
            y: trimYPt + 36,
            size: 6.5,
            font: fontHelvetica,
            color: rgb(0.3, 0.3, 0.3),
          });

          pageFront.drawText('Remove this top card during sorting', {
            x: trimXPt + 10,
            y: trimYPt + 18,
            size: 6.5,
            font: fontHelveticaBold,
            color: rgb(0.8, 0.1, 0.1),
          });

          drawCropMarks(pageFront, trimXPt, trimYPt, trimWidthPt, trimHeightPt);
        } else if (slotType === 'ORDER_INFO_PANEL') {
          // 1. ORDER_INFO_PANEL
          pageFront.drawRectangle({
            x: trimXPt,
            y: trimYPt,
            width: trimWidthPt,
            height: trimHeightPt,
            color: rgb(1, 1, 1),
            borderColor: rgb(0.1, 0.15, 0.2),
            borderWidth: 1.2,
          });

          // CMYK Calibration bar
          const segW = trimWidthPt / 4;
          pageFront.drawRectangle({ x: trimXPt, y: trimYPt + trimHeightPt - 6, width: segW, height: 6, color: rgb(0, 0.8, 1) });
          pageFront.drawRectangle({ x: trimXPt + segW, y: trimYPt + trimHeightPt - 6, width: segW, height: 6, color: rgb(1, 0, 0.8) });
          pageFront.drawRectangle({ x: trimXPt + segW * 2, y: trimYPt + trimHeightPt - 6, width: segW, height: 6, color: rgb(1, 0.9, 0) });
          pageFront.drawRectangle({ x: trimXPt + segW * 3, y: trimYPt + trimHeightPt - 6, width: segW, height: 6, color: rgb(0.1, 0.1, 0.1) });

          pageFront.drawText('PANEL INFORMACYJNY ZAMOWIENIA', {
            x: trimXPt + 4,
            y: trimYPt + trimHeightPt - 16,
            size: 7,
            font: fontHelveticaBold,
            color: rgb(0.05, 0.1, 0.2),
          });

          pageFront.drawText(`Order ID: ${item.order_id} (Naklad: ${item.order_quantity?.toLocaleString() || 0} szt.)`, {
            x: trimXPt + 4,
            y: trimYPt + trimHeightPt - 26,
            size: 6.5,
            font: fontHelveticaBold,
            color: rgb(0.1, 0.4, 0.8),
          });

          pageFront.drawText(`Klient: ${item.customer_reference || 'Drukarnia Partnerska'}`, {
            x: trimXPt + 4,
            y: trimYPt + trimHeightPt - 36,
            size: 6,
            font: fontHelvetica,
            color: rgb(0.2, 0.25, 0.35),
          });

          pageFront.drawText(`Plate ID: ${item.plate_id || 'JOB-PLATE'}`, {
            x: trimXPt + 4,
            y: trimYPt + trimHeightPt - 46,
            size: 6,
            font: fontHelvetica,
            color: rgb(0.2, 0.25, 0.35),
          });

          pageFront.drawText(`Spec: ${item.product_specs?.size} | ${item.product_specs?.paper_weight_gsm}g | ${item.product_specs?.finish?.slice(0, 24)}`, {
            x: trimXPt + 4,
            y: trimYPt + trimHeightPt - 56,
            size: 5.5,
            font: fontHelvetica,
            color: rgb(0.3, 0.35, 0.45),
          });

          drawCropMarks(pageFront, trimXPt, trimYPt, trimWidthPt, trimHeightPt);
        } else if (slotType === 'WASTE_SLOT') {
          // 2. WASTE_SLOT
          pageFront.drawRectangle({
            x: trimXPt,
            y: trimYPt,
            width: trimWidthPt,
            height: trimHeightPt,
            color: rgb(1, 1, 1),
            borderColor: rgb(0.95, 0.75, 0.1),
            borderWidth: 1.5,
          });

          pageFront.drawText('[ SLOT ODPADU ]', {
            x: trimXPt + trimWidthPt / 2 - 28,
            y: trimYPt + trimHeightPt / 2 - 3,
            size: 7,
            font: fontHelveticaBold,
            color: rgb(0.8, 0.6, 0.05),
          });

          drawCropMarks(pageFront, trimXPt, trimYPt, trimWidthPt, trimHeightPt);
        } else if (slotType === 'NEXT_ORDER_START_MARKER') {
          // 3. NEXT_ORDER_START_MARKER
          pageFront.drawRectangle({
            x: trimXPt,
            y: trimYPt,
            width: trimWidthPt,
            height: trimHeightPt,
            color: rgb(1, 0.9, 0.2),
            borderColor: rgb(0.85, 0.65, 0.05),
            borderWidth: 1,
          });

          pageFront.drawText('POLACZENIE ZLECEN', {
            x: trimXPt + trimWidthPt / 2 - 30,
            y: trimYPt + trimHeightPt / 2 - 3,
            size: 6.5,
            font: fontHelveticaBold,
            color: rgb(0.55, 0.4, 0.05),
          });

          drawCropMarks(pageFront, trimXPt, trimYPt, trimWidthPt, trimHeightPt);
        } else if (slotType === 'ORDER_END_MARKER') {
          // 4. ORDER_END_MARKER
          pageFront.drawRectangle({
            x: trimXPt,
            y: trimYPt,
            width: trimWidthPt,
            height: trimHeightPt,
            color: rgb(1, 0.9, 0.2),
            borderColor: rgb(0.85, 0.65, 0.05),
            borderWidth: 1,
          });

          drawBarcode1D(pageFront, item.job_label || 'ORDER-END', trimXPt + 8, trimYPt + trimHeightPt - 22, 12, trimWidthPt - 16);

          pageFront.drawText(item.job_label || `Print job ${item.order_index}/${item.total_orders}`, {
            x: trimXPt + 8,
            y: trimYPt + trimHeightPt - 32,
            size: 7,
            font: fontHelveticaBold,
            color: rgb(0, 0, 0),
          });

          pageFront.drawText('ZNACZNIK KONCA ZLECENIA', {
            x: trimXPt + 8,
            y: trimYPt + 6,
            size: 5.5,
            font: fontHelveticaBold,
            color: rgb(0.45, 0.35, 0.05),
          });

          drawCropMarks(pageFront, trimXPt, trimYPt, trimWidthPt, trimHeightPt);
        }
      });

      // Draw Cut Lines on Front
      if (sheetLayout.cut_lines && sheetLayout.cut_lines.length > 0) {
        sheetLayout.cut_lines.forEach((cut) => {
          const startX = cut.start_mm.x * MM_TO_PT;
          const startY = sheetHeightPt - cut.start_mm.y * MM_TO_PT;
          const endX = cut.end_mm.x * MM_TO_PT;
          const endY = sheetHeightPt - cut.end_mm.y * MM_TO_PT;

          pageFront.drawLine({
            start: { x: startX, y: startY },
            end: { x: endX, y: endY },
            thickness: 0.5,
            color: rgb(0.85, 0.2, 0.2),
          });
        });
      }

      // Draw Optical Marks on Front
      if (sheetLayout.optical_marks && sheetLayout.optical_marks.length > 0) {
        sheetLayout.optical_marks.forEach((mark) => {
          const markX = mark.x_mm * MM_TO_PT;
          const markY = sheetHeightPt - mark.y_mm * MM_TO_PT;
          const radiusPt = (mark.radius_mm || 2.5) * MM_TO_PT;

          pageFront.drawCircle({
            x: markX,
            y: markY,
            size: radiusPt,
            borderColor: rgb(0, 0, 0),
            borderWidth: 0.75,
          });

          if (mark.type === 'CROSSHAIR') {
            pageFront.drawLine({
              start: { x: markX - radiusPt * 1.4, y: markY },
              end: { x: markX + radiusPt * 1.4, y: markY },
              thickness: 0.5,
              color: rgb(0, 0, 0),
            });
            pageFront.drawLine({
              start: { x: markX, y: markY - radiusPt * 1.4 },
              end: { x: markX, y: markY + radiusPt * 1.4 },
              thickness: 0.5,
              color: rgb(0, 0, 0),
            });
          } else {
            pageFront.drawCircle({
              x: markX,
              y: markY,
              size: radiusPt * 0.4,
              color: rgb(0, 0, 0),
            });
          }
        });
      }

      // Front Header Slug & Plate ID
      const plateIdText = job.result.sheets[0]?.placed_items[0]?.plate_id || job.id;
      const plateSlugFront = `${plateIdText} sheet ${sheetLayout.sheet_index}/${job.result.sheets.length}`;
      pageFront.drawText(plateSlugFront, {
        x: sheetWidthPt - 140,
        y: sheetHeightPt - 12,
        size: 8,
        font: fontHelvetica,
        color: rgb(0, 0, 0),
      });

      const slugTextFront = `POD IMPOSITION | Job ID: ${job.id} | Workflow: ${job.workflow} | ${sheetLayout.sheet_name} [FRONT / AWERS] | Yield: ${sheetLayout.sheet_yield_percentage}%`;
      pageFront.drawText(slugTextFront, {
        x: marginPt,
        y: sheetHeightPt - marginPt / 2 - 3,
        size: 7,
        font: fontHelvetica,
        color: rgb(0.3, 0.35, 0.45),
      });

      // ==========================================
      // --- SIDE 2: BACK (REWERS / DUPLEX) ---
      // ==========================================
      const pageBack = pdfDoc.addPage([sheetWidthPt, sheetHeightPt]);

      // Raw Sheet Background
      pageBack.drawRectangle({
        x: 0,
        y: 0,
        width: sheetWidthPt,
        height: sheetHeightPt,
        color: rgb(0.99, 0.99, 0.99),
      });

      // Gripper Margin on Back
      pageBack.drawRectangle({
        x: 0,
        y: 0,
        width: sheetWidthPt,
        height: gripperHeightPt,
        color: rgb(0.93, 0.94, 0.96),
        borderColor: rgb(0.8, 0.83, 0.88),
        borderWidth: 0.5,
      });

      pageBack.drawText(
        `GRIPPER EDGE / LAPKA MASZYNY (${job.sheet?.gripper_margin_mm || 15} mm) - BACK [REWERS]`,
        {
          x: 15,
          y: Math.max(4, gripperHeightPt / 2 - 4),
          size: 8,
          font: fontHelveticaBold,
          color: rgb(0.45, 0.5, 0.58),
        }
      );

      // Sheet Margin Box on Back
      pageBack.drawRectangle({
        x: marginPt,
        y: gripperHeightPt,
        width: sheetWidthPt - marginPt * 2,
        height: sheetHeightPt - gripperHeightPt - marginPt,
        borderColor: rgb(0.85, 0.88, 0.92),
        borderWidth: 0.5,
      });

      // Render Placed Items on BACK (Horizontally Mirrored for Work & Turn duplex registration)
      sheetLayout.placed_items.forEach((item, index) => {
        const slotType = item.slot_type || 'PRODUCT';

        // Mirrored X for Duplex sheetwise / work & turn
        const backX_mm = sheetLayout.width_mm - (item.x_mm + item.width_with_bleed_mm);
        const backItemXPt = backX_mm * MM_TO_PT;
        const itemYPt = sheetHeightPt - (item.y_mm + item.height_with_bleed_mm) * MM_TO_PT;
        const itemWWithBleedPt = item.width_with_bleed_mm * MM_TO_PT;
        const itemHWithBleedPt = item.height_with_bleed_mm * MM_TO_PT;

        const backTrimX_mm = sheetLayout.width_mm - item.trim_box.x2;
        const backTrimXPt = backTrimX_mm * MM_TO_PT;
        const trimYPt = sheetHeightPt - item.trim_box.y2 * MM_TO_PT;
        const trimWidthPt = item.trim_width_mm * MM_TO_PT;
        const trimHeightPt = item.trim_height_mm * MM_TO_PT;

        if (slotType === 'PRODUCT') {
          const embedded = embeddedSourcesCache.get(item.pdf_source_url);

          if (embedded && embedded.back) {
            // Draw embedded vector source page (Page 2 / Back)
            if (item.rotation_deg === 90) {
              pageBack.drawPage(embedded.back, {
                x: backItemXPt + itemWWithBleedPt,
                y: itemYPt,
                width: itemHWithBleedPt,
                height: itemWWithBleedPt,
                rotate: degrees(90),
              });
            } else {
              pageBack.drawPage(embedded.back, {
                x: backItemXPt,
                y: itemYPt,
                width: itemWWithBleedPt,
                height: itemHWithBleedPt,
              });
            }
          } else {
            pageBack.drawRectangle({
              x: backTrimXPt,
              y: trimYPt,
              width: trimWidthPt,
              height: trimHeightPt,
              color: rgb(0.99, 0.94, 0.94),
              borderColor: rgb(0.85, 0.2, 0.2),
              borderWidth: 1,
            });

            pageBack.drawText('BLAD ZRODLA PDF (REWERS)', {
              x: backTrimXPt + 6,
              y: trimYPt + trimHeightPt - 16,
              size: 7,
              font: fontHelveticaBold,
              color: rgb(0.85, 0.2, 0.2),
            });
          }

          // Bleed slug info
          pageBack.drawText(`ORD: ${item.order_id} | #${index + 1} [REWERS]`, {
            x: backItemXPt + 1,
            y: itemYPt + 1.5,
            size: 3.8,
            font: fontHelveticaBold,
            color: rgb(0.2, 0.25, 0.35),
          });

          drawCropMarks(pageBack, backTrimXPt, trimYPt, trimWidthPt, trimHeightPt);
        } else if (slotType === 'STACK_COVER') {
          // STACK_COVER back side (blank white card with crop marks)
          pageBack.drawRectangle({
            x: backTrimXPt,
            y: trimYPt,
            width: trimWidthPt,
            height: trimHeightPt,
            color: rgb(1, 1, 1),
            borderColor: rgb(0.9, 0.9, 0.9),
            borderWidth: 0.5,
          });

          drawCropMarks(pageBack, backTrimXPt, trimYPt, trimWidthPt, trimHeightPt);
        } else if (slotType === 'ORDER_INFO_PANEL') {
          // Info panel back side
          pageBack.drawRectangle({
            x: backTrimXPt,
            y: trimYPt,
            width: trimWidthPt,
            height: trimHeightPt,
            color: rgb(0.98, 0.98, 0.98),
            borderColor: rgb(0.7, 0.75, 0.8),
            borderWidth: 0.75,
          });

          pageBack.drawText('PANEL INFORMACYJNY (REWERS)', {
            x: backTrimXPt + 6,
            y: trimYPt + trimHeightPt / 2,
            size: 6,
            font: fontHelveticaBold,
            color: rgb(0.4, 0.45, 0.55),
          });

          drawCropMarks(pageBack, backTrimXPt, trimYPt, trimWidthPt, trimHeightPt);
        } else if (slotType === 'WASTE_SLOT') {
          pageBack.drawRectangle({
            x: backTrimXPt,
            y: trimYPt,
            width: trimWidthPt,
            height: trimHeightPt,
            color: rgb(1, 1, 1),
            borderColor: rgb(0.95, 0.75, 0.1),
            borderWidth: 1.5,
          });

          pageBack.drawText('[ SLOT ODPADU - REWERS ]', {
            x: backTrimXPt + trimWidthPt / 2 - 35,
            y: trimYPt + trimHeightPt / 2 - 3,
            size: 6.5,
            font: fontHelveticaBold,
            color: rgb(0.8, 0.6, 0.05),
          });

          drawCropMarks(pageBack, backTrimXPt, trimYPt, trimWidthPt, trimHeightPt);
        } else if (slotType === 'NEXT_ORDER_START_MARKER') {
          pageBack.drawRectangle({
            x: backTrimXPt,
            y: trimYPt,
            width: trimWidthPt,
            height: trimHeightPt,
            color: rgb(1, 0.9, 0.2),
            borderColor: rgb(0.85, 0.65, 0.05),
            borderWidth: 1,
          });

          pageBack.drawText('POLACZENIE ZLECEN (REWERS)', {
            x: backTrimXPt + trimWidthPt / 2 - 40,
            y: trimYPt + trimHeightPt / 2 - 3,
            size: 6,
            font: fontHelveticaBold,
            color: rgb(0.55, 0.4, 0.05),
          });

          drawCropMarks(pageBack, backTrimXPt, trimYPt, trimWidthPt, trimHeightPt);
        } else if (slotType === 'ORDER_END_MARKER') {
          pageBack.drawRectangle({
            x: backTrimXPt,
            y: trimYPt,
            width: trimWidthPt,
            height: trimHeightPt,
            color: rgb(1, 0.9, 0.2),
            borderColor: rgb(0.85, 0.65, 0.05),
            borderWidth: 1,
          });

          drawBarcode1D(pageBack, item.job_label || 'ORDER-END', backTrimXPt + 8, trimYPt + trimHeightPt - 22, 12, trimWidthPt - 16);

          pageBack.drawText(`${item.job_label || `Print job ${item.order_index}/${item.total_orders}`} [REWERS]`, {
            x: backTrimXPt + 8,
            y: trimYPt + trimHeightPt - 32,
            size: 6.5,
            font: fontHelveticaBold,
            color: rgb(0, 0, 0),
          });

          drawCropMarks(pageBack, backTrimXPt, trimYPt, trimWidthPt, trimHeightPt);
        }
      });

      // Mirrored Cut lines on Back
      if (sheetLayout.cut_lines && sheetLayout.cut_lines.length > 0) {
        sheetLayout.cut_lines.forEach((cut) => {
          const backStartX_mm = cut.type === 'VERTICAL' ? sheetLayout.width_mm - cut.start_mm.x : cut.start_mm.x;
          const backEndX_mm = cut.type === 'VERTICAL' ? sheetLayout.width_mm - cut.end_mm.x : cut.end_mm.x;

          const startX = backStartX_mm * MM_TO_PT;
          const startY = sheetHeightPt - cut.start_mm.y * MM_TO_PT;
          const endX = backEndX_mm * MM_TO_PT;
          const endY = sheetHeightPt - cut.end_mm.y * MM_TO_PT;

          pageBack.drawLine({
            start: { x: startX, y: startY },
            end: { x: endX, y: endY },
            thickness: 0.5,
            color: rgb(0.85, 0.2, 0.2),
          });
        });
      }

      // Back Header Slug & Plate ID
      const plateSlugBack = `${plateIdText} sheet ${sheetLayout.sheet_index}/${job.result.sheets.length}`;
      pageBack.drawText(plateSlugBack, {
        x: sheetWidthPt - 140,
        y: sheetHeightPt - 12,
        size: 8,
        font: fontHelvetica,
        color: rgb(0, 0, 0),
      });

      const slugTextBack = `POD IMPOSITION | Job ID: ${job.id} | Workflow: ${job.workflow} | ${sheetLayout.sheet_name} [BACK / REWERS] | Yield: ${sheetLayout.sheet_yield_percentage}%`;
      pageBack.drawText(slugTextBack, {
        x: marginPt,
        y: sheetHeightPt - marginPt / 2 - 3,
        size: 7,
        font: fontHelvetica,
        color: rgb(0.3, 0.35, 0.45),
      });
    }

    // 6. Serialize and stream final PDF (useObjectStreams: false ensures maximum compatibility with Adobe Acrobat and RIPs)
    const pdfBytes = await pdfDoc.save({ useObjectStreams: false });

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(pdfBytes.byteLength),
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

