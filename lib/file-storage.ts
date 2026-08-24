import { PDFDocument } from 'pdf-lib';

export interface StoredFileMeta {
  id: string;
  filename: string;
  size: number;
  mimeType: string;
  uploadedAt: string;
  pageCount: number;
  widthMm: number;
  heightMm: number;
  bleedMm: number;
  dataBase64: string;
}

// Global in-memory storage for active session uploads
const globalFileStore = new Map<string, StoredFileMeta>();

export function storeFile(meta: StoredFileMeta): void {
  globalFileStore.set(meta.id, meta);
}

export function getFile(id: string): StoredFileMeta | undefined {
  return globalFileStore.get(id);
}

export function getAllFiles(): StoredFileMeta[] {
  return Array.from(globalFileStore.values());
}

export function deleteFile(id: string): boolean {
  return globalFileStore.delete(id);
}

/**
 * Converts PDF Points (1/72 inch) to Millimeters
 */
export function pointsToMm(points: number): number {
  return Number(((points * 25.4) / 72).toFixed(1));
}

/**
 * Converts Millimeters to PDF Points (1/72 inch)
 */
export function mmToPoints(mm: number): number {
  return (mm * 72) / 25.4;
}

/**
 * Inspects a PDF buffer using pdf-lib to extract dimensions, bleed, and page count
 */
export async function inspectPdfBuffer(buffer: ArrayBuffer | Uint8Array) {
  const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const pageCount = pdfDoc.getPageCount();

  let widthMm = 105.0;
  let heightMm = 148.0;
  let bleedMm = 2.0;

  if (pageCount > 0) {
    const firstPage = pdfDoc.getPage(0);
    const { width, height } = firstPage.getSize();
    
    // Check if TrimBox and BleedBox are present
    const mediaBox = firstPage.getMediaBox();
    const trimBox = firstPage.getTrimBox();
    const bleedBox = firstPage.getBleedBox();

    const mediaWidthMm = pointsToMm(mediaBox.width);
    const mediaHeightMm = pointsToMm(mediaBox.height);
    const trimWidthMm = pointsToMm(trimBox.width);
    const trimHeightMm = pointsToMm(trimBox.height);

    // If TrimBox is distinct and smaller than MediaBox, derive bleed
    if (trimWidthMm > 0 && trimWidthMm < mediaWidthMm) {
      widthMm = trimWidthMm;
      heightMm = trimHeightMm;
      bleedMm = Number(((mediaWidthMm - trimWidthMm) / 2).toFixed(1));
    } else {
      // Standard page size without explicit TrimBox
      widthMm = pointsToMm(width);
      heightMm = pointsToMm(height);
      bleedMm = 2.0; // standard default assumption for print files
    }
  }

  return {
    pageCount,
    widthMm,
    heightMm,
    bleedMm,
  };
}
