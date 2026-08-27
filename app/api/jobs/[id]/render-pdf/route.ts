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
      const totalBars = Math.min(26, Math.floor(maxBarcodeWidth / (barWidth * 1.8)));

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

    // Helper: Draw vector Barcode Scanner Gun Icon (Gelato Sheet 1 top-left indicator)
    const drawScannerGunIcon = (targetPage: any, x: number, y: number, scale = 0.85) => {
      // Scanner head body
      targetPage.drawRectangle({
        x: x,
        y: y + 8 * scale,
        width: 18 * scale,
        height: 10 * scale,
        borderColor: rgb(0, 0, 0),
        borderWidth: 1.2 * scale,
        color: rgb(1, 1, 1),
      });

      // Scanner nose
      targetPage.drawLine({
        start: { x: x + 18 * scale, y: y + 8 * scale },
        end: { x: x + 18 * scale, y: y + 18 * scale },
        thickness: 2 * scale,
        color: rgb(0, 0, 0),
      });

      // Handle (angled down)
      targetPage.drawLine({
        start: { x: x + 5 * scale, y: y + 8 * scale },
        end: { x: x - 2 * scale, y: y - 8 * scale },
        thickness: 3 * scale,
        color: rgb(0, 0, 0),
      });

      // Handle bottom base
      targetPage.drawRectangle({
        x: x - 5 * scale,
        y: y - 10 * scale,
        width: 7 * scale,
        height: 2.5 * scale,
        color: rgb(0, 0, 0),
      });

      // Trigger
      targetPage.drawLine({
        start: { x: x + 5 * scale, y: y + 4 * scale },
        end: { x: x + 8 * scale, y: y + 1 * scale },
        thickness: 1.2 * scale,
        color: rgb(0, 0, 0),
      });

      // Laser scan beam rays
      targetPage.drawLine({
        start: { x: x + 21 * scale, y: y + 16 * scale },
        end: { x: x + 28 * scale, y: y + 19 * scale },
        thickness: 0.8 * scale,
        color: rgb(0, 0, 0),
      });
      targetPage.drawLine({
        start: { x: x + 21 * scale, y: y + 13 * scale },
        end: { x: x + 30 * scale, y: y + 13 * scale },
        thickness: 0.8 * scale,
        color: rgb(0, 0, 0),
      });
      targetPage.drawLine({
        start: { x: x + 21 * scale, y: y + 10 * scale },
        end: { x: x + 28 * scale, y: y + 7 * scale },
        thickness: 0.8 * scale,
        color: rgb(0, 0, 0),
      });
    };

    // Helper: Draw standard Gelato 4-corner hairline registration mark (Pasery spasowania)
    const drawRegistrationMark = (targetPage: any, x: number, y: number) => {
      const r = 2.5 * MM_TO_PT;
      targetPage.drawCircle({ x, y, size: r, borderColor: rgb(0, 0, 0), borderWidth: 0.45 });
      targetPage.drawLine({ start: { x: x - r * 1.6, y }, end: { x: x + r * 1.6, y }, thickness: 0.45, color: rgb(0, 0, 0) });
      targetPage.drawLine({ start: { x, y: y - r * 1.6 }, end: { x, y: y + r * 1.6 }, thickness: 0.45, color: rgb(0, 0, 0) });
    };

    // Helper: Draw standard Hairline Crop Marks (Znaczniki cięcia netto)
    const drawCropMarks = (
      targetPage: any,
      trimXPt: number,
      trimYPt: number,
      trimWidthPt: number,
      trimHeightPt: number
    ) => {
      const cropLen = 7;
      const cropOffset = 1.5;

      // Top-Left
      targetPage.drawLine({
        start: { x: trimXPt, y: trimYPt + trimHeightPt + cropOffset },
        end: { x: trimXPt, y: trimYPt + trimHeightPt + cropOffset + cropLen },
        thickness: 0.4,
        color: rgb(0, 0, 0),
      });
      targetPage.drawLine({
        start: { x: trimXPt - cropOffset - cropLen, y: trimYPt + trimHeightPt },
        end: { x: trimXPt - cropOffset, y: trimYPt + trimHeightPt },
        thickness: 0.4,
        color: rgb(0, 0, 0),
      });

      // Top-Right
      targetPage.drawLine({
        start: { x: trimXPt + trimWidthPt, y: trimYPt + trimHeightPt + cropOffset },
        end: { x: trimXPt + trimWidthPt, y: trimYPt + trimHeightPt + cropOffset + cropLen },
        thickness: 0.4,
        color: rgb(0, 0, 0),
      });
      targetPage.drawLine({
        start: { x: trimXPt + trimWidthPt + cropOffset, y: trimYPt + trimHeightPt },
        end: { x: trimXPt + trimWidthPt + cropOffset + cropLen, y: trimYPt + trimHeightPt },
        thickness: 0.4,
        color: rgb(0, 0, 0),
      });

      // Bottom-Left
      targetPage.drawLine({
        start: { x: trimXPt, y: trimYPt - cropOffset - cropLen },
        end: { x: trimXPt, y: trimYPt - cropOffset },
        thickness: 0.4,
        color: rgb(0, 0, 0),
      });
      targetPage.drawLine({
        start: { x: trimXPt - cropOffset - cropLen, y: trimYPt },
        end: { x: trimXPt - cropOffset, y: trimYPt },
        thickness: 0.4,
        color: rgb(0, 0, 0),
      });

      // Bottom-Right
      targetPage.drawLine({
        start: { x: trimXPt + trimWidthPt, y: trimYPt - cropOffset - cropLen },
        end: { x: trimXPt + trimWidthPt, y: trimYPt - cropOffset },
        thickness: 0.4,
        color: rgb(0, 0, 0),
      });
      targetPage.drawLine({
        start: { x: trimXPt + trimWidthPt + cropOffset, y: trimYPt },
        end: { x: trimXPt + trimWidthPt + cropOffset + cropLen, y: trimYPt },
        thickness: 0.4,
        color: rgb(0, 0, 0),
      });
    };

    // Helper: Draw Color Calibration Bar (kostkowy pasek kontroli barwnej)
    const drawColorControlBar = (targetPage: any, x: number, y: number, width: number, height: number, isVertical = false) => {
      const colors = [
        rgb(0, 0.85, 0.95),   // Cyan
        rgb(0.95, 0.1, 0.65),  // Magenta
        rgb(1, 0.95, 0.05),   // Yellow
        rgb(0.1, 0.1, 0.1),   // Black
        rgb(0.4, 0.8, 0.3),   // Green
        rgb(0.2, 0.4, 0.9),   // Blue
        rgb(0.9, 0.4, 0.1),   // Orange
        rgb(0.6, 0.3, 0.7),   // Violet
      ];

      if (isVertical) {
        const segH = height / colors.length;
        colors.forEach((c, idx) => {
          targetPage.drawRectangle({
            x,
            y: y + idx * segH,
            width,
            height: segH,
            color: c,
          });
        });
      } else {
        const segW = width / colors.length;
        colors.forEach((c, idx) => {
          targetPage.drawRectangle({
            x: x + idx * segW,
            y,
            width: segW,
            height,
            color: c,
          });
        });
      }
    };

    // 5. Render each sheet layout onto DUPLEX PDF pages (Front & Back)
    for (const sheetLayout of job.result.sheets) {
      const sheetWidthPt = sheetLayout.width_mm * MM_TO_PT;
      const sheetHeightPt = sheetLayout.height_mm * MM_TO_PT;
      const plateIdText = job.result.sheets[0]?.placed_items[0]?.plate_id || (job.id ? job.id.replace(/\D/g, '').slice(-10) : '1000000001');

      // ==========================================
      // --- SIDE 1: FRONT (AWERS) ---
      // ==========================================
      const pageFront = pdfDoc.addPage([sheetWidthPt, sheetHeightPt]);

      // Clean White Sheet Background
      pageFront.drawRectangle({
        x: 0,
        y: 0,
        width: sheetWidthPt,
        height: sheetHeightPt,
        color: rgb(1, 1, 1),
      });

      // Top-Left Margin on Sheet 1: Barcode + Scanner Icon
      if (sheetLayout.sheet_index === 1) {
        drawBarcode1D(pageFront, plateIdText, 25, sheetHeightPt - 25, 14, 45);
        pageFront.drawText(plateIdText, {
          x: 28,
          y: sheetHeightPt - 34,
          size: 6,
          font: fontHelveticaBold,
          color: rgb(0, 0, 0),
        });
        drawScannerGunIcon(pageFront, 25, sheetHeightPt - 52, 0.75);
      }

      // Render Placed Items on FRONT
      sheetLayout.placed_items.forEach((item) => {
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
            // Fallback placeholder if missing
            pageFront.drawRectangle({
              x: trimXPt,
              y: trimYPt,
              width: trimWidthPt,
              height: trimHeightPt,
              color: rgb(0.98, 0.98, 0.98),
            });
          }

          // Draw Netto Crop Marks
          drawCropMarks(pageFront, trimXPt, trimYPt, trimWidthPt, trimHeightPt);
        } else if (slotType === 'STACK_COVER') {
          // STACK_COVER card (Gelato style stack cover card with off-white card, metadata, artwork thumbnail and yellow footer)
          pageFront.drawRectangle({
            x: trimXPt,
            y: trimYPt,
            width: trimWidthPt,
            height: trimHeightPt,
            color: rgb(0.985, 0.975, 0.945), // Subtle Gelato warm cream card background
          });

          const stackStr = `${item.stack_number || 1}/${item.total_stacks || 6}`;

          // Stack Title Header (Top-center/left)
          pageFront.drawText('Stack', {
            x: trimXPt + trimWidthPt / 2 - 14,
            y: trimYPt + trimHeightPt - 14,
            size: 9.5,
            font: fontHelveticaBold,
            color: rgb(0, 0, 0),
          });

          pageFront.drawText(stackStr, {
            x: trimXPt + trimWidthPt / 2 - 12,
            y: trimYPt + trimHeightPt - 26,
            size: 12,
            font: fontHelveticaBold,
            color: rgb(0, 0, 0),
          });

          // Stack 1/6: Left column metadata
          if (item.stack_number === 1) {
            pageFront.drawText(String(item.barcode_value || item.order_id || '5871285154'), {
              x: trimXPt + 8,
              y: trimYPt + trimHeightPt - 38,
              size: 8,
              font: fontHelveticaBold,
              color: rgb(0, 0, 0),
            });

            pageFront.drawText(`Quantity: ${item.order_quantity || 60}`, {
              x: trimXPt + 8,
              y: trimYPt + trimHeightPt - 49,
              size: 7.5,
              font: fontHelveticaBold,
              color: rgb(0, 0, 0),
            });

            pageFront.drawText('FLAT CARD (2 PAGES)', {
              x: trimXPt + 8,
              y: trimYPt + trimHeightPt - 59,
              size: 6.5,
              font: fontHelveticaBold,
              color: rgb(0, 0, 0),
            });

            pageFront.drawText(`Size: ${item.product_specs?.size || '141x141-mm'}`, {
              x: trimXPt + 8,
              y: trimYPt + trimHeightPt - 68,
              size: 6,
              font: fontHelvetica,
              color: rgb(0.2, 0.2, 0.2),
            });

            pageFront.drawText(`Paper: ${item.product_specs?.paper_weight_gsm || 300}-gsm-uncoated`, {
              x: trimXPt + 8,
              y: trimYPt + trimHeightPt - 77,
              size: 6,
              font: fontHelvetica,
              color: rgb(0.2, 0.2, 0.2),
            });

            pageFront.drawText('Coating: none', {
              x: trimXPt + 8,
              y: trimYPt + trimHeightPt - 86,
              size: 6,
              font: fontHelvetica,
              color: rgb(0.2, 0.2, 0.2),
            });

            pageFront.drawText(`Plate: ${item.plate_id || plateIdText}`, {
              x: trimXPt + 8,
              y: trimYPt + trimHeightPt - 95,
              size: 6,
              font: fontHelvetica,
              color: rgb(0.2, 0.2, 0.2),
            });

            if (item.customer_reference) {
              pageFront.drawText(item.customer_reference, {
                x: trimXPt + 8,
                y: trimYPt + trimHeightPt - 105,
                size: 6.5,
                font: fontHelveticaBold,
                color: rgb(0.1, 0.2, 0.6),
              });
            }

            pageFront.drawText(`Order ID: ${item.order_id}`, {
              x: trimXPt + 8,
              y: trimYPt + trimHeightPt - 114,
              size: 6,
              font: fontHelvetica,
              color: rgb(0.3, 0.3, 0.3),
            });

            // Blue HI Badge
            pageFront.drawRectangle({
              x: trimXPt + 8,
              y: trimYPt + trimHeightPt - 146,
              width: 18,
              height: 18,
              color: rgb(0.2, 0.55, 0.9),
            });
            pageFront.drawText('HI', {
              x: trimXPt + 12,
              y: trimYPt + trimHeightPt - 141,
              size: 8,
              font: fontHelveticaBold,
              color: rgb(1, 1, 1),
            });

            pageFront.drawText('Print job 1/2', {
              x: trimXPt + 8,
              y: trimYPt + trimHeightPt - 156,
              size: 6.5,
              font: fontHelveticaBold,
              color: rgb(0, 0, 0),
            });

            pageFront.drawText('Qty: 0', {
              x: trimXPt + 90,
              y: trimYPt + trimHeightPt - 150,
              size: 6.5,
              font: fontHelveticaBold,
              color: rgb(0, 0, 0),
            });

            pageFront.drawText(`Print job: ${item.order_id}`, {
              x: trimXPt + 70,
              y: trimYPt + trimHeightPt - 156,
              size: 6,
              font: fontHelvetica,
              color: rgb(0, 0, 0),
            });
          }

          // Artwork Thumbnail on STACK_COVER
          const embedded = embeddedSourcesCache.get(item.pdf_source_url);
          if (embedded && embedded.front) {
            const thumbW = item.stack_number === 1 ? 38 * MM_TO_PT : 44 * MM_TO_PT;
            const thumbH = item.stack_number === 1 ? 38 * MM_TO_PT : 44 * MM_TO_PT;
            const thumbX = item.stack_number === 1 ? trimXPt + trimWidthPt - thumbW - 10 : trimXPt + (trimWidthPt - thumbW) / 2;
            const thumbY = trimYPt + trimHeightPt - thumbH - 34;

            if (item.rotation_deg === 90) {
              pageFront.drawPage(embedded.front, {
                x: thumbX + thumbW,
                y: thumbY,
                width: thumbH,
                height: thumbW,
                rotate: degrees(90),
              });
            } else {
              pageFront.drawPage(embedded.front, {
                x: thumbX,
                y: thumbY,
                width: thumbW,
                height: thumbH,
              });
            }

            // Thumbnail Color bars & subtle frame
            drawColorControlBar(pageFront, thumbX - 5, thumbY, 3, thumbH, true);
            pageFront.drawRectangle({
              x: thumbX,
              y: thumbY,
              width: thumbW,
              height: thumbH,
              borderColor: rgb(0.85, 0.85, 0.85),
              borderWidth: 0.4,
            });
          }

          // Yellow Bottom Info Banner
          const footerH = 34;
          pageFront.drawRectangle({
            x: trimXPt,
            y: trimYPt,
            width: trimWidthPt,
            height: footerH,
            color: rgb(1, 0.95, 0.05), // #FFE600
          });

          pageFront.drawText(`Dispatch date: ${item.dispatch_date || '2026-08-26'}`, {
            x: trimXPt + trimWidthPt / 2 - 40,
            y: trimYPt + footerH - 10,
            size: 6.5,
            font: fontHelveticaBold,
            color: rgb(0, 0, 0),
          });

          pageFront.drawText('FLAT CARD (2 PAGES)', {
            x: trimXPt + trimWidthPt / 2 - 35,
            y: trimYPt + footerH - 18,
            size: 5.5,
            font: fontHelvetica,
            color: rgb(0, 0, 0),
          });

          pageFront.drawText(`Paper: ${item.product_specs?.paper_weight_gsm || 300}-gsm-uncoated`, {
            x: trimXPt + trimWidthPt / 2 - 38,
            y: trimYPt + footerH - 24,
            size: 5.5,
            font: fontHelvetica,
            color: rgb(0, 0, 0),
          });

          pageFront.drawText(`Size: ${item.product_specs?.size || '141x141-mm'}`, {
            x: trimXPt + trimWidthPt / 2 - 25,
            y: trimYPt + footerH - 30,
            size: 5.5,
            font: fontHelvetica,
            color: rgb(0, 0, 0),
          });

          pageFront.drawText('Remove this top card during sorting', {
            x: trimXPt + trimWidthPt / 2 - 50,
            y: trimYPt - 8,
            size: 6.5,
            font: fontHelvetica,
            color: rgb(0, 0, 0),
          });

          drawCropMarks(pageFront, trimXPt, trimYPt, trimWidthPt, trimHeightPt);
        } else if (slotType === 'ORDER_INFO_PANEL') {
          // ORDER_INFO_PANEL (Gelato production header card)
          // Background and CMYK bars extend to the BLEED box (+3mm each side per printer feedback),
          // while text labels below remain anchored to the trim box for readability.
          pageFront.drawRectangle({
            x: itemXPt,
            y: itemYPt,
            width: itemWWithBleedPt,
            height: itemHWithBleedPt,
            color: rgb(1, 1, 1),
          });

          // Top and Bottom CMYK Bars (on bleed box)
          drawColorControlBar(pageFront, itemXPt, itemYPt + itemHWithBleedPt - 5, itemWWithBleedPt, 5);
          drawColorControlBar(pageFront, itemXPt, itemYPt, itemWWithBleedPt, 5);
          drawColorControlBar(pageFront, itemXPt, itemYPt + 5, 4, itemHWithBleedPt - 10, true);
          drawColorControlBar(pageFront, itemXPt + itemWWithBleedPt - 4, itemYPt + 5, 4, itemHWithBleedPt - 10, true);

          pageFront.drawText(String(item.barcode_value || item.order_id || plateIdText), {
            x: trimXPt + 8,
            y: trimYPt + trimHeightPt - 16,
            size: 8,
            font: fontHelveticaBold,
            color: rgb(0, 0, 0),
          });

          pageFront.drawText(`Quantity: ${item.order_quantity || 60}`, {
            x: trimXPt + trimWidthPt - 65,
            y: trimYPt + trimHeightPt - 16,
            size: 7.5,
            font: fontHelveticaBold,
            color: rgb(0, 0, 0),
          });

          pageFront.drawText('FLAT CARD (2 PAGES)', {
            x: trimXPt + 8,
            y: trimYPt + trimHeightPt - 32,
            size: 6.5,
            font: fontHelveticaBold,
            color: rgb(0, 0, 0),
          });

          pageFront.drawText(`Size: ${item.product_specs?.size || '141x141-mm'}`, {
            x: trimXPt + 8,
            y: trimYPt + trimHeightPt - 41,
            size: 6,
            font: fontHelvetica,
            color: rgb(0.2, 0.2, 0.2),
          });

          pageFront.drawText(`Paper: ${item.product_specs?.paper_weight_gsm || 300}-gsm-uncoated`, {
            x: trimXPt + 8,
            y: trimYPt + trimHeightPt - 50,
            size: 6,
            font: fontHelvetica,
            color: rgb(0.2, 0.2, 0.2),
          });

          pageFront.drawText('Coating: none', {
            x: trimXPt + 8,
            y: trimYPt + trimHeightPt - 59,
            size: 6,
            font: fontHelvetica,
            color: rgb(0.2, 0.2, 0.2),
          });

          pageFront.drawText(`Plate: ${item.plate_id || plateIdText}`, {
            x: trimXPt + 8,
            y: trimYPt + trimHeightPt - 68,
            size: 6,
            font: fontHelvetica,
            color: rgb(0.2, 0.2, 0.2),
          });

          if (item.customer_reference) {
            pageFront.drawText(item.customer_reference, {
              x: trimXPt + 8,
              y: trimYPt + trimHeightPt - 78,
              size: 6.5,
              font: fontHelveticaBold,
              color: rgb(0.1, 0.2, 0.6),
            });
          }

          pageFront.drawText(`Order ID: ${item.order_id}`, {
            x: trimXPt + 8,
            y: trimYPt + trimHeightPt - 87,
            size: 6,
            font: fontHelvetica,
            color: rgb(0.3, 0.3, 0.3),
          });

          // Badge (HI or J7)
          const isFirstJob = item.order_index === 1;
          pageFront.drawRectangle({
            x: trimXPt + 8,
            y: trimYPt + trimHeightPt - 130,
            width: 18,
            height: 18,
            color: isFirstJob ? rgb(0.2, 0.55, 0.9) : rgb(0.15, 0.75, 0.4),
          });
          pageFront.drawText(isFirstJob ? 'HI' : 'J7', {
            x: trimXPt + 12,
            y: trimYPt + trimHeightPt - 125,
            size: 8,
            font: fontHelveticaBold,
            color: rgb(1, 1, 1),
          });

          pageFront.drawText(isFirstJob ? 'Print job 1/2' : 'Print job 2/2', {
            x: trimXPt + 8,
            y: trimYPt + trimHeightPt - 142,
            size: 6.5,
            font: fontHelveticaBold,
            color: rgb(0, 0, 0),
          });

          pageFront.drawText('Qty: 0', {
            x: trimXPt + trimWidthPt - 32,
            y: trimYPt + trimHeightPt - 136,
            size: 6.5,
            font: fontHelveticaBold,
            color: rgb(0, 0, 0),
          });

          pageFront.drawText(`Print job: ${item.order_id}`, {
            x: trimXPt + trimWidthPt - 68,
            y: trimYPt + trimHeightPt - 142,
            size: 6,
            font: fontHelvetica,
            color: rgb(0, 0, 0),
          });

          drawCropMarks(pageFront, trimXPt, trimYPt, trimWidthPt, trimHeightPt);
        } else if (slotType === 'WASTE_SLOT') {
          // WASTE_SLOT (Front: Solid Bright Yellow Card #FFE600)
          pageFront.drawRectangle({
            x: trimXPt,
            y: trimYPt,
            width: trimWidthPt,
            height: trimHeightPt,
            color: rgb(1, 0.95, 0.05),
          });

          drawCropMarks(pageFront, trimXPt, trimYPt, trimWidthPt, trimHeightPt);
        }
      });

      // Hairline Registration Marks - all 4 corners, offset 3mm from sheet edge (per printer feedback)
      {
        const regOffset = 3 * MM_TO_PT;
        drawRegistrationMark(pageFront, regOffset, regOffset); // Bottom-Left
        drawRegistrationMark(pageFront, sheetWidthPt - regOffset, regOffset); // Bottom-Right
        drawRegistrationMark(pageFront, regOffset, sheetHeightPt - regOffset); // Top-Left
        drawRegistrationMark(pageFront, sheetWidthPt - regOffset, sheetHeightPt - regOffset); // Top-Right
      }

      // Vertical Margin Marks: "No protection" in light cyan
      pageFront.drawText('No protection', {
        x: 12,
        y: sheetHeightPt / 2 - 40,
        size: 13,
        font: fontHelvetica,
        color: rgb(0.1, 0.85, 0.95),
        rotate: degrees(90),
      });

      pageFront.drawText('No protection', {
        x: sheetWidthPt - 10,
        y: sheetHeightPt / 2 + 40,
        size: 13,
        font: fontHelvetica,
        color: rgb(0.1, 0.85, 0.95),
        rotate: degrees(270),
      });

      // Red Sheet Index Slug at Top Right
      const plateSlugFront = `${plateIdText}        sheet ${sheetLayout.sheet_index}/${job.result.sheets.length}`;
      pageFront.drawText(plateSlugFront, {
        x: sheetWidthPt - 110,
        y: sheetHeightPt - 8,
        size: 6,
        font: fontHelvetica,
        color: rgb(0.85, 0.15, 0.15),
      });

      // Vertical Red Slug on Right Margin
      pageFront.drawText(plateIdText, {
        x: sheetWidthPt - 6,
        y: sheetHeightPt - 50,
        size: 6,
        font: fontHelvetica,
        color: rgb(0.85, 0.15, 0.15),
        rotate: degrees(270),
      });
      pageFront.drawText(`sheet ${sheetLayout.sheet_index}/${job.result.sheets.length}`, {
        x: sheetWidthPt - 6,
        y: sheetHeightPt - 85,
        size: 6,
        font: fontHelvetica,
        color: rgb(0.85, 0.15, 0.15),
        rotate: degrees(270),
      });

      // ==========================================
      // --- SIDE 2: BACK (REWERS / DUPLEX) ---
      // ==========================================
      const pageBack = pdfDoc.addPage([sheetWidthPt, sheetHeightPt]);

      // Clean White Sheet Background on Back
      pageBack.drawRectangle({
        x: 0,
        y: 0,
        width: sheetWidthPt,
        height: sheetHeightPt,
        color: rgb(1, 1, 1),
      });

      // Render Placed Items on BACK (Horizontally Mirrored for Duplex sheetwise registration)
      sheetLayout.placed_items.forEach((item) => {
        const slotType = item.slot_type || 'PRODUCT';

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
              color: rgb(0.98, 0.98, 0.98),
            });
          }

          drawCropMarks(pageBack, backTrimXPt, trimYPt, trimWidthPt, trimHeightPt);
        } else if (slotType === 'STACK_COVER') {
          // STACK_COVER back side: Blank white with crop marks
          drawCropMarks(pageBack, backTrimXPt, trimYPt, trimWidthPt, trimHeightPt);
        } else if (slotType === 'ORDER_INFO_PANEL') {
          // ORDER_INFO_PANEL back side: White card surrounded by Thick Vibrant Yellow Warning Border (Gelato signature)
          const borderWidthPt = 6;
          pageBack.drawRectangle({
            x: backTrimXPt,
            y: trimYPt,
            width: trimWidthPt,
            height: trimHeightPt,
            color: rgb(1, 0.95, 0.05), // #FFE600
          });

          pageBack.drawRectangle({
            x: backTrimXPt + borderWidthPt,
            y: trimYPt + borderWidthPt,
            width: trimWidthPt - borderWidthPt * 2,
            height: trimHeightPt - borderWidthPt * 2,
            color: rgb(1, 1, 1),
            borderColor: rgb(0.9, 0.9, 0.9),
            borderWidth: 0.3,
          });

          drawCropMarks(pageBack, backTrimXPt, trimYPt, trimWidthPt, trimHeightPt);
        } else if (slotType === 'WASTE_SLOT') {
          // WASTE_SLOT back side: Solid Yellow Card with Barcode & Job Label (Gelato signature)
          pageBack.drawRectangle({
            x: backTrimXPt,
            y: trimYPt,
            width: trimWidthPt,
            height: trimHeightPt,
            color: rgb(1, 0.95, 0.05), // #FFE600
          });

          const isFirstJob = item.order_index === 1;
          pageBack.drawText(isFirstJob ? 'Print job 1/2' : 'Print job 2/2', {
            x: backTrimXPt + 15,
            y: trimYPt + trimHeightPt - 24,
            size: 7.5,
            font: fontHelveticaBold,
            color: rgb(0, 0, 0),
          });

          // Badge on back (HI or J7)
          pageBack.drawRectangle({
            x: backTrimXPt + 15,
            y: trimYPt + 52,
            width: 18,
            height: 18,
            color: isFirstJob ? rgb(0.2, 0.55, 0.9) : rgb(0.15, 0.75, 0.4),
          });

          pageBack.drawText(isFirstJob ? 'HI' : 'J7', {
            x: backTrimXPt + 19,
            y: trimYPt + 57,
            size: 8,
            font: fontHelveticaBold,
            color: rgb(1, 1, 1),
          });

          const wasteBarcode = isFirstJob ? '7112210864' : '7112210972';
          drawBarcode1D(pageBack, wasteBarcode, backTrimXPt + 15, trimYPt + 22, 18, 55);

          pageBack.drawText(wasteBarcode, {
            x: backTrimXPt + 18,
            y: trimYPt + 12,
            size: 6,
            font: fontHelvetica,
            color: rgb(0, 0, 0),
          });

          drawCropMarks(pageBack, backTrimXPt, trimYPt, trimWidthPt, trimHeightPt);
        }
      });

      // Hairline Registration Marks - all 4 corners, offset 3mm from sheet edge (per printer feedback)
      {
        const regOffset = 3 * MM_TO_PT;
        drawRegistrationMark(pageBack, regOffset, regOffset); // Bottom-Left
        drawRegistrationMark(pageBack, sheetWidthPt - regOffset, regOffset); // Bottom-Right
        drawRegistrationMark(pageBack, regOffset, sheetHeightPt - regOffset); // Top-Left
        drawRegistrationMark(pageBack, sheetWidthPt - regOffset, sheetHeightPt - regOffset); // Top-Right
      }

      // Vertical Red Slug on Right Margin (Back)
      pageBack.drawText(plateIdText, {
        x: sheetWidthPt - 6,
        y: sheetHeightPt - 50,
        size: 6,
        font: fontHelvetica,
        color: rgb(0.85, 0.15, 0.15),
        rotate: degrees(270),
      });
      pageBack.drawText(`sheet ${sheetLayout.sheet_index}/${job.result.sheets.length}`, {
        x: sheetWidthPt - 6,
        y: sheetHeightPt - 85,
        size: 6,
        font: fontHelvetica,
        color: rgb(0.85, 0.15, 0.15),
        rotate: degrees(270),
      });

      // Red Sheet Index Slug at Top Right
      const plateSlugBack = `${plateIdText}        sheet ${sheetLayout.sheet_index}/${job.result.sheets.length}`;
      pageBack.drawText(plateSlugBack, {
        x: sheetWidthPt - 110,
        y: sheetHeightPt - 8,
        size: 6,
        font: fontHelvetica,
        color: rgb(0.85, 0.15, 0.15),
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

