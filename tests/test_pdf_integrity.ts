import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { PDFDocument, PDFRawStream, PDFName } from 'pdf-lib';
import { POST as createJobHandler } from '../app/api/jobs/route';
import { GET as renderPdfHandler } from '../app/api/jobs/[id]/render-pdf/route';
import { safeCompare, validateApiKey } from '../lib/auth';

// Ensure test environment secrets are initialized
process.env.POD_API_SECRET_KEY = 'test_secure_pod_api_key_for_ci_2026';
process.env.INTERNAL_TEST_PANEL_SECRET = 'test_secure_internal_panel_password_2026';

describe('1. Security & Timing-Safe Comparison Tests', () => {
  it('safeCompare correctly compares identical strings and rejects differing strings or lengths', () => {
    const key = 'secret_key_abc_123';
    assert.strictEqual(safeCompare(key, key), true, 'Identical strings must return true');
    assert.strictEqual(safeCompare(key, 'secret_key_abc_124'), false, 'Differing last char must return false');
    assert.strictEqual(safeCompare(key, 'secret_key_abc'), false, 'Shorter string must return false');
    assert.strictEqual(safeCompare(key, 'secret_key_abc_123_extra'), false, 'Longer string must return false');
    assert.strictEqual(safeCompare('', key), false, 'Empty string must return false');
    assert.strictEqual(safeCompare(null as any, key), false, 'Null must return false');
    assert.strictEqual(safeCompare(undefined as any, key), false, 'Undefined must return false');
  });

  it('validateApiKey accepts timing-safe valid headers and rejects unauthorized requests', () => {
    // Valid X-API-Key
    const validReq = new NextRequest('http://localhost:3000/api/jobs', {
      headers: { 'x-api-key': 'test_secure_pod_api_key_for_ci_2026' },
    });
    const auth1 = validateApiKey(validReq);
    assert.strictEqual(auth1.isAuthenticated, true);
    assert.strictEqual(auth1.source, 'AZURE_EXTERNAL_POD');

    // Valid Bearer Authorization
    const bearerReq = new NextRequest('http://localhost:3000/api/jobs', {
      headers: { authorization: 'Bearer test_secure_pod_api_key_for_ci_2026' },
    });
    const auth2 = validateApiKey(bearerReq);
    assert.strictEqual(auth2.isAuthenticated, true);

    // Invalid Key
    const invalidReq = new NextRequest('http://localhost:3000/api/jobs', {
      headers: { 'x-api-key': 'invalid_secret_key' },
    });
    const auth3 = validateApiKey(invalidReq);
    assert.strictEqual(auth3.isAuthenticated, false);
    assert.strictEqual(auth3.source, 'UNAUTHORIZED');
  });
});

describe('2. PDF Imposition & Asset Stream Integrity Verification', () => {
  // Helper to extract raw image stream hashes and metadata from any PDFDocument
  async function extractRawImageStreams(pdfDoc: PDFDocument) {
    const streams: Array<{
      objectNumber: number;
      subtype?: string;
      width?: number;
      height?: number;
      colorSpace?: string;
      byteLength: number;
      md5: string;
      sha256: string;
      rawBytes: Uint8Array;
    }> = [];

    for (const [ref, obj] of pdfDoc.context.enumerateIndirectObjects()) {
      if (obj instanceof PDFRawStream || (obj && typeof (obj as any).getContents === 'function')) {
        const dict = (obj as any).dict;
        const subtype = dict?.lookup(PDFName.of('Subtype'))?.toString();
        const width = dict?.lookup(PDFName.of('Width'))?.toString();
        const height = dict?.lookup(PDFName.of('Height'))?.toString();
        const colorSpace = dict?.lookup(PDFName.of('ColorSpace'))?.toString();

        const rawBytes: Uint8Array = (obj as any).getContents();
        const md5 = crypto.createHash('md5').update(rawBytes).digest('hex');
        const sha256 = crypto.createHash('sha256').update(rawBytes).digest('hex');

        streams.push({
          objectNumber: ref.objectNumber,
          subtype,
          width: width ? parseInt(width, 10) : undefined,
          height: height ? parseInt(height, 10) : undefined,
          colorSpace,
          byteLength: rawBytes.length,
          md5,
          sha256,
          rawBytes,
        });
      }
    }
    return streams;
  }

  it('Full pipeline test: POST /api/jobs -> GET /api/jobs/{id}/render-pdf embeds source images 1:1 without alteration', async () => {
    const asset1Path = path.join(process.cwd(), 'public', 'test-assets', 'print_job_1.pdf');
    const asset2Path = path.join(process.cwd(), 'public', 'test-assets', 'print_job_2.pdf');

    assert.ok(fs.existsSync(asset1Path), `Asset 1 does not exist at ${asset1Path}`);
    assert.ok(fs.existsSync(asset2Path), `Asset 2 does not exist at ${asset2Path}`);

    // Load source assets directly to catalog their exact expected image streams
    const srcDoc1 = await PDFDocument.load(fs.readFileSync(asset1Path));
    const srcDoc2 = await PDFDocument.load(fs.readFileSync(asset2Path));

    const src1Streams = await extractRawImageStreams(srcDoc1);
    const src2Streams = await extractRawImageStreams(srcDoc2);

    // Filter to actual image objects (Subtype /Image or having width & height)
    const expectedSrc1Images = src1Streams.filter((s) => s.subtype === '/Image' || (s.width && s.height));
    const expectedSrc2Images = src2Streams.filter((s) => s.subtype === '/Image' || (s.width && s.height));

    console.log(`\n[Integrity Test] Source 1 (CMYK JPEG) Image Streams (${expectedSrc1Images.length}):`);
    expectedSrc1Images.forEach((img) =>
      console.log(`  Obj #${img.objectNumber} | ${img.width}x${img.height} | ${img.byteLength} bytes | MD5: ${img.md5}`)
    );

    console.log(`\n[Integrity Test] Source 2 (ICC + SMask) Image Streams (${expectedSrc2Images.length}):`);
    expectedSrc2Images.forEach((img) =>
      console.log(`  Obj #${img.objectNumber} | ${img.width}x${img.height} | ${img.byteLength} bytes | MD5: ${img.md5}`)
    );

    assert.ok(expectedSrc1Images.length > 0, 'Source 1 must contain at least 1 image object');
    assert.ok(expectedSrc2Images.length > 0, 'Source 2 must contain at least 1 image object');

    // 1. Create Imposition Job via POST /api/jobs
    const jobPayload = {
      name: 'CI Integrity Test Imposition Job',
      workflow: 'GANGING',
      device_type: 'GUILLOTINE',
      pdf_standard: 'PDF/X-4',
      sheet: {
        width_mm: 750,
        height_mm: 530,
        margins_mm: 10,
        gripper_margin_mm: 0,
      },
      orders: [
        {
          order_id: 'CI_ORD_001',
          quantity: 20,
          trim_width_mm: 141,
          trim_height_mm: 141,
          bleed_mm: 2,
          pdf_source_url: '/test-assets/print_job_1.pdf',
        },
        {
          order_id: 'CI_ORD_002',
          quantity: 20,
          trim_width_mm: 141,
          trim_height_mm: 141,
          bleed_mm: 2,
          pdf_source_url: '/test-assets/print_job_2.pdf',
        },
      ],
    };

    const postReq = new NextRequest('http://localhost:3000/api/jobs', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': 'test_secure_pod_api_key_for_ci_2026',
      },
      body: JSON.stringify(jobPayload),
    });

    const postRes = await createJobHandler(postReq);
    assert.ok(
      postRes.status === 200 || postRes.status === 201,
      `POST /api/jobs must return status 200 or 201 (got ${postRes.status})`
    );

    const jobData = await postRes.json();
    assert.ok(jobData.job_id, 'Job ID must be returned');
    assert.strictEqual(jobData.status, 'COMPLETED');

    console.log(`\n[Integrity Test] Created job: ${jobData.job_id}`);

    // 2. Render Imposition PDF via GET /api/jobs/{id}/render-pdf
    const renderReq = new NextRequest(`http://localhost:3000/api/jobs/${jobData.job_id}/render-pdf`, {
      method: 'GET',
      headers: {
        'x-api-key': 'test_secure_pod_api_key_for_ci_2026',
      },
    });

    const renderRes = await renderPdfHandler(renderReq, {
      params: Promise.resolve({ id: jobData.job_id }),
    });

    assert.strictEqual(renderRes.status, 200, 'GET /api/jobs/{id}/render-pdf must return status 200');
    assert.strictEqual(renderRes.headers.get('content-type'), 'application/pdf');

    const pdfBuffer = Buffer.from(await renderRes.arrayBuffer());
    assert.ok(pdfBuffer.length > 50000, `Rendered PDF must be non-empty (got ${pdfBuffer.length} bytes)`);

    // 3. Inspect generated PDF Document and extract all image streams
    const outDoc = await PDFDocument.load(pdfBuffer);
    assert.ok(outDoc.getPageCount() > 0, 'Rendered PDF must contain at least 1 page');

    const outStreams = await extractRawImageStreams(outDoc);
    const outStreamMd5Set = new Set(outStreams.map((s) => s.md5));
    const outStreamSha256Set = new Set(outStreams.map((s) => s.sha256));

    console.log(`\n[Integrity Test] Rendered PDF contains ${outDoc.getPageCount()} pages and ${outStreams.length} stream objects.`);

    // 4. Verify that EVERY expected image stream from Source 1 is present byte-for-byte in the output PDF
    for (const expectedImg of expectedSrc1Images) {
      const matchFound = outStreamMd5Set.has(expectedImg.md5) && outStreamSha256Set.has(expectedImg.sha256);
      if (!matchFound) {
        throw new Error(
          `[CRITICAL INTEGRITY FAILURE] Source 1 image (Obj #${expectedImg.objectNumber}, ${expectedImg.width}x${expectedImg.height}, MD5: ${expectedImg.md5}) was NOT found in output PDF!`
        );
      }
      console.log(`  ✓ Source 1 Image Verified: Obj #${expectedImg.objectNumber} (${expectedImg.width}x${expectedImg.height}) MD5: ${expectedImg.md5}`);
    }

    // 5. Verify that EVERY expected image stream from Source 2 is present byte-for-byte in the output PDF
    for (const expectedImg of expectedSrc2Images) {
      const matchFound = outStreamMd5Set.has(expectedImg.md5) && outStreamSha256Set.has(expectedImg.sha256);
      if (!matchFound) {
        throw new Error(
          `[CRITICAL INTEGRITY FAILURE] Source 2 image (Obj #${expectedImg.objectNumber}, ${expectedImg.width}x${expectedImg.height}, MD5: ${expectedImg.md5}) was NOT found in output PDF!`
        );
      }
      console.log(`  ✓ Source 2 Image Verified: Obj #${expectedImg.objectNumber} (${expectedImg.width}x${expectedImg.height}) MD5: ${expectedImg.md5}`);
    }

    console.log('\n[Integrity Test] ALL source image streams verified 100% byte-for-byte in generated imposition PDF.\n');
  });
});
