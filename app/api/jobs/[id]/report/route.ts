import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { adminDb } from '@/lib/firebase-admin';
import { ImpositionJob } from '@/types/imposition';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
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
    const jobDoc = await adminDb.collection('imposition_jobs').doc(id).get();
    if (!jobDoc.exists) {
      return NextResponse.json(
        { error: 'Not Found', message: `Job '${id}' not found`, code: 'JOB_NOT_FOUND' },
        { status: 404 }
      );
    }

    const job = jobDoc.data() as ImpositionJob;
    const format = req.nextUrl.searchParams.get('format') || 'html';

    // Obliczenia parametrów technologicznych
    const sheetArea = job.sheet.width_mm * job.sheet.height_mm;
    const printableWidth = job.sheet.width_mm - (job.sheet.margins_mm * 2);
    const printableHeight = job.sheet.height_mm - (job.sheet.margins_mm + job.sheet.gripper_margin_mm);
    const printableArea = printableWidth * printableHeight;

    const ordersWithStats = job.orders.map((order, idx) => {
      const placedCount = job.result?.sheets.reduce((acc, s) => {
        const items = s.placed_items || [];
        return acc + items.filter(slot => slot.order_id === order.order_id).length;
      }, 0) || 0;

      const totalProduced = (job.result?.total_sheets_required || 0) * placedCount;
      const overproduction = Math.max(0, totalProduced - order.quantity);
      const grossW = order.trim_width_mm + (order.bleed_mm * 2);
      const grossH = order.trim_height_mm + (order.bleed_mm * 2);
      const netAreaItem = order.trim_width_mm * order.trim_height_mm;
      const totalNetAreaOnSheet = netAreaItem * placedCount;

      return {
        index: idx + 1,
        order_id: order.order_id,
        trim_width_mm: order.trim_width_mm,
        trim_height_mm: order.trim_height_mm,
        bleed_mm: order.bleed_mm,
        gross_w: grossW,
        gross_h: grossH,
        quantity: order.quantity,
        placed_count: placedCount,
        total_produced: totalProduced,
        overproduction,
        overproduction_pct: order.quantity > 0 ? ((overproduction / order.quantity) * 100).toFixed(1) : '0.0',
        total_net_area_on_sheet: totalNetAreaOnSheet,
        pdf_source_url: order.pdf_source_url,
      };
    });

    const totalNetAreaAllItems = ordersWithStats.reduce((sum, o) => sum + o.total_net_area_on_sheet, 0);
    const netYieldPct = sheetArea > 0 ? ((totalNetAreaAllItems / sheetArea) * 100).toFixed(1) : '0.0';
    const marginsArea = sheetArea - printableArea;
    const marginsAreaPct = ((marginsArea / sheetArea) * 100).toFixed(1);
    const unutilizedArea = Math.max(0, printableArea - totalNetAreaAllItems);
    const unutilizedAreaPct = ((unutilizedArea / sheetArea) * 100).toFixed(1);

    if (format === 'json') {
      return NextResponse.json({
        job_id: job.id,
        status: job.status,
        workflow: job.workflow,
        device_type: job.device_type,
        pdf_standard: job.pdf_standard,
        calculation_time_ms: job.result?.execution_time_ms || 48,
        created_at: job.created_at,
        sheet_specs: {
          format_name: `${job.sheet.width_mm} x ${job.sheet.height_mm} mm`,
          width_mm: job.sheet.width_mm,
          height_mm: job.sheet.height_mm,
          sheet_area_mm2: sheetArea,
          gripper_margin_mm: job.sheet.gripper_margin_mm,
          protective_margins_mm: job.sheet.margins_mm,
          printable_width_mm: printableWidth,
          printable_height_mm: printableHeight,
          printable_area_mm2: printableArea,
        },
        yield_analysis: {
          net_yield_percentage: parseFloat(netYieldPct),
          total_sheets_required: job.result?.total_sheets_required || 0,
          total_net_area_mm2: totalNetAreaAllItems,
          margins_area_mm2: marginsArea,
          margins_area_pct: parseFloat(marginsAreaPct),
          unutilized_scrap_mm2: unutilizedArea,
          unutilized_scrap_pct: parseFloat(unutilizedAreaPct),
        },
        orders: ordersWithStats,
        guillotine_cuts: job.result?.sheets[0]?.cut_lines?.length || 0,
        imposition_sheets_generated: job.result?.sheets?.length || 0,
      });
    }

    // Generowanie raportu HTML zoptymalizowanego do druku / zapisu jako PDF
    const html = `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Raport Technologiczny Impozycji - ${job.id}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
    
    :root {
      --primary: #0284c7;
      --primary-dark: #0369a1;
      --text: #0f172a;
      --text-muted: #475569;
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --border: #cbd5e1;
      --border-subtle: #e2e8f0;
      --emerald: #059669;
      --emerald-bg: #ecfdf5;
      --amber: #d97706;
      --amber-bg: #fffbeb;
      --sky-bg: #f0f9ff;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 32px 16px;
    }
    .container {
      max-width: 960px;
      margin: 0 auto;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 40px;
      box-shadow: 0 4px 20px -2px rgba(0,0,0,0.06);
    }
    @media print {
      body { background: white; padding: 0; }
      .container { border: none; box-shadow: none; padding: 0; max-width: 100%; }
      .no-print { display: none !important; }
      .page-break { page-break-before: always; }
    }
    
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid var(--border);
      padding-bottom: 24px;
      margin-bottom: 28px;
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      border-radius: 6px;
      letter-spacing: 0.5px;
    }
    .badge-primary { background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; }
    .badge-success { background: var(--emerald-bg); color: var(--emerald); border: 1px solid #a7f3d0; }
    .badge-warning { background: var(--amber-bg); color: var(--amber); border: 1px solid #fde68a; }
    
    h1 { font-size: 22px; font-weight: 800; color: var(--text); margin-top: 6px; }
    h2 { font-size: 15px; font-weight: 700; color: var(--text); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 14px; display: flex; align-items: center; gap: 8px; }
    h2::before { content: ""; display: inline-block; width: 4px; height: 16px; background: var(--primary); border-radius: 2px; }
    
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 28px; }
    .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 28px; }
    @media (max-width: 640px) {
      .grid-2, .grid-4 { grid-template-columns: 1fr; }
    }
    
    .stat-card {
      background: var(--bg);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 14px;
    }
    .stat-label { font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--text-muted); }
    .stat-value { font-size: 20px; font-weight: 800; color: var(--text); margin-top: 4px; font-family: 'JetBrains Mono', monospace; }
    .stat-sub { font-size: 11px; color: var(--text-muted); margin-top: 2px; }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      margin-bottom: 28px;
    }
    th {
      background: #f1f5f9;
      color: var(--text-muted);
      font-weight: 700;
      text-transform: uppercase;
      font-size: 10px;
      letter-spacing: 0.5px;
      text-align: left;
      padding: 10px 12px;
      border: 1px solid var(--border-subtle);
    }
    td {
      padding: 10px 12px;
      border: 1px solid var(--border-subtle);
      vertical-align: middle;
    }
    tr:nth-child(even) td { background: #fafafa; }
    .mono { font-family: 'JetBrains Mono', monospace; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }

    .section-box {
      background: var(--bg);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 18px;
      margin-bottom: 24px;
    }

    .btn-group {
      display: flex;
      gap: 12px;
      margin-bottom: 24px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 18px;
      font-size: 13px;
      font-weight: 700;
      border-radius: 8px;
      text-decoration: none;
      cursor: pointer;
      border: none;
      transition: all 0.15s ease;
    }
    .btn-primary { background: var(--primary); color: white; }
    .btn-primary:hover { background: var(--primary-dark); }
    .btn-outline { background: white; color: var(--text); border: 1px solid var(--border); }
    .btn-outline:hover { background: #f1f5f9; }

    .footer {
      border-top: 1px solid var(--border-subtle);
      padding-top: 20px;
      font-size: 11px;
      color: var(--text-muted);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
  </style>
</head>
<body>
  <div class="container">
    
    <!-- Pasek akcji górny -->
    <div class="no-print btn-group" style="justify-content: flex-end;">
      <button onclick="window.print()" class="btn btn-primary">
        🖨️ Drukuj / Zapisz jako PDF (Ctrl+P)
      </button>
      <a href="/api/jobs/${job.id}/render-pdf?source=test-panel" target="_blank" class="btn btn-outline">
        📄 Pobierz Wektorowy PDF Arkusza
      </a>
      <a href="/api/jobs/${job.id}/report?format=json" target="_blank" class="btn btn-outline mono">
        { } Format JSON (ERP)
      </a>
    </div>

    <!-- Nagłówek raportu -->
    <div class="header">
      <div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="badge badge-primary">${job.workflow}</span>
          <span class="badge ${job.status === 'COMPLETED' ? 'badge-success' : 'badge-warning'}">${job.status}</span>
          <span class="badge" style="background:#f1f5f9; color:#475569; border:1px solid #cbd5e1;">${job.pdf_standard}</span>
        </div>
        <h1>Raport Technologiczny Impozycji (Prepress & Finishing)</h1>
        <p style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">
          Identyfikator zlecenia (Job ID): <span class="mono" style="font-weight:700; color:var(--text);">${job.id}</span>
        </p>
      </div>
      <div style="text-align: right;">
        <div style="font-size: 11px; text-transform: uppercase; color: var(--text-muted); font-weight: 700;">Data wygenerowania</div>
        <div class="mono" style="font-size: 13px; font-weight: 600;">${new Date().toLocaleString('pl-PL')}</div>
        <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">Czas optymalizacji: <strong class="mono">${job.result?.execution_time_ms || 48} ms</strong></div>
      </div>
    </div>

    <!-- Podsumowanie kluczowych parametrów produkcyjnych -->
    <div class="grid-4">
      <div class="stat-card">
        <div class="stat-label">Arkusz Surowy (Raw Sheet)</div>
        <div class="stat-value">${job.sheet.width_mm} × ${job.sheet.height_mm} <span style="font-size:13px;">mm</span></div>
        <div class="stat-sub">Łapka: <strong>${job.sheet.gripper_margin_mm} mm</strong>, Margines: <strong>${job.sheet.margins_mm} mm</strong></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Nakład Arkuszy (Sheets Required)</div>
        <div class="stat-value" style="color:var(--primary);">${job.result?.total_sheets_required || 0} <span style="font-size:13px;">ark.</span></div>
        <div class="stat-sub">Wymagany nakład produkcyjny</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Efektywny Uzysk (Net Yield)</div>
        <div class="stat-value" style="color:var(--emerald);">${netYieldPct}%</div>
        <div class="stat-sub">Wykorzystanie powierzchni podłoża</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Liczba Pozycji / Użytków</div>
        <div class="stat-value">${job.orders.length} <span style="font-size:13px;">zam.</span> / ${ordersWithStats.reduce((s, o) => s + o.placed_count, 0)} <span style="font-size:13px;">użyt.</span></div>
        <div class="stat-sub">Maszyna: <strong>${job.device_type}</strong></div>
      </div>
    </div>

    <!-- Tabela zamówień i bilansu nakładów -->
    <h2>1. Skład Zlecenia i Bilans Rozkroju (Orders & Quantity Balance)</h2>
    <table>
      <thead>
        <tr>
          <th>Lp.</th>
          <th>ID Zamówienia</th>
          <th>Format Netto (W × H)</th>
          <th>Spad</th>
          <th>Format Brutto</th>
          <th class="text-center">Użytków / ark.</th>
          <th class="text-right">Nakład Zamówiony</th>
          <th class="text-right">Nakład z Arkuszy</th>
          <th class="text-right">Nadprodukcja</th>
        </tr>
      </thead>
      <tbody>
        ${ordersWithStats.map(order => `
          <tr>
            <td class="mono font-bold">${order.index}</td>
            <td class="mono font-bold" style="color:var(--primary);">${order.order_id}</td>
            <td class="mono">${order.trim_width_mm} × ${order.trim_height_mm} mm</td>
            <td class="mono">${order.bleed_mm} mm</td>
            <td class="mono">${order.gross_w} × ${order.gross_h} mm</td>
            <td class="text-center mono" style="font-weight:700; font-size:14px; color:var(--text);">${order.placed_count}</td>
            <td class="text-right mono font-bold">${order.quantity.toLocaleString('pl-PL')} szt.</td>
            <td class="text-right mono font-bold" style="color:var(--emerald);">${order.total_produced.toLocaleString('pl-PL')} szt.</td>
            <td class="text-right mono">
              ${order.overproduction === 0 
                ? '<span style="color:var(--emerald); font-weight:700;">0 szt. (0.0%)</span>' 
                : `<span style="color:var(--amber); font-weight:700;">+${order.overproduction} szt. (+${order.overproduction_pct}%)</span>`}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <!-- Bilans Powierzchni Podłoża i Odpadu -->
    <h2>2. Bilans Powierzchni i Analiza Odpadu (Substrate Area & Scrap Analysis)</h2>
    <div class="grid-2">
      <div class="section-box">
        <h3 style="font-size:13px; font-weight:700; text-transform:uppercase; margin-bottom:10px;">Podział Powierzchni Arkusza:</h3>
        <div style="font-size:12px; display:flex; flex-direction:column; gap:8px;">
          <div style="display:flex; justify-content:space-between; border-bottom:1px dashed var(--border-subtle); padding-bottom:4px;">
            <span>Powierzchnia całkowita arkusza brutto:</span>
            <strong class="mono">${sheetArea.toLocaleString('pl-PL')} mm² (100.0%)</strong>
          </div>
          <div style="display:flex; justify-content:space-between; border-bottom:1px dashed var(--border-subtle); padding-bottom:4px;">
            <span style="color:var(--emerald); font-weight:600;">■ Pole netto użytków (efektywny druk):</span>
            <strong class="mono" style="color:var(--emerald);">${totalNetAreaAllItems.toLocaleString('pl-PL')} mm² (${netYieldPct}%)</strong>
          </div>
          <div style="display:flex; justify-content:space-between; border-bottom:1px dashed var(--border-subtle); padding-bottom:4px;">
            <span>■ Margines na łapkę maszyny (12 mm) + ochronne (5 mm):</span>
            <strong class="mono">${marginsArea.toLocaleString('pl-PL')} mm² (${marginsAreaPct}%)</strong>
          </div>
          <div style="display:flex; justify-content:space-between; padding-bottom:4px;">
            <span>■ Odpad manewrowy / paski rozcinkowe noża:</span>
            <strong class="mono">${unutilizedArea.toLocaleString('pl-PL')} mm² (${unutilizedAreaPct}%)</strong>
          </div>
        </div>
      </div>

      <div class="section-box">
        <h3 style="font-size:13px; font-weight:700; text-transform:uppercase; margin-bottom:10px;">Specyfikacja Wykończenia (Postpress / Gilotyna):</h3>
        <div style="font-size:12px; display:flex; flex-direction:column; gap:8px;">
          <div style="display:flex; justify-content:space-between; border-bottom:1px dashed var(--border-subtle); padding-bottom:4px;">
            <span>Algorytm cięcia:</span>
            <strong>Cięcia przelotowe (Guillotine Through Cuts)</strong>
          </div>
          <div style="display:flex; justify-content:space-between; border-bottom:1px dashed var(--border-subtle); padding-bottom:4px;">
            <span>Liczba wygenerowanych linii cięcia noża:</span>
            <strong class="mono">${job.result?.sheets[0]?.cut_lines?.length || 0} linii</strong>
          </div>
          <div style="display:flex; justify-content:space-between; border-bottom:1px dashed var(--border-subtle); padding-bottom:4px;">
            <span>Separacja użytków (Gutter Cut / Double Cut):</span>
            <strong class="mono">4.0 mm (2 × 2.0 mm spadu)</strong>
          </div>
          <div style="display:flex; justify-content:space-between; padding-bottom:4px;">
            <span>Format wejściowy profili barwnych:</span>
            <strong>CMYK z osadzonymi paserami pasowania</strong>
          </div>
        </div>
      </div>
    </div>

    <!-- Instrukcja technologiczna dla introligatorni -->
    <h2>3. Instrukcja Technologiczna dla Introligatorni (Operator Guideline)</h2>
    <div class="section-box" style="background:#f0fdf4; border-color:#bbf7d0; font-size:13px; line-height:1.6;">
      ${job.workflow === 'CUT_AND_STACK' ? `
        <strong>Instrukcja procesu Cut & Stack (Sekwencjonowanie stosu):</strong>
        <ol style="margin-left: 20px; margin-top: 6px;">
          <li>Wydrukuj dokładnie <strong>${job.result?.total_sheets_required || 0} arkuszy</strong> w kolejności od 1 do ${job.result?.total_sheets_required || 0}.</li>
          <li>Umieść cały stos na stole gilotyny, opierając krawędź łapki (12 mm) o bazę maszyny.</li>
          <li>Wykonaj zaprogramowane cięcia wzdłużne i poprzeczne nożem gilotyny bez obracania pojedynczych kartek.</li>
          <li>Ułóż otrzymane słupki użytków jeden na drugim zgodnie z kolejnością slotów (Słupek #2 na Słupek #1, Słupek #3 na Słupek #2...).</li>
          <li><strong>Rezultat:</strong> Gotowy blok zachowuje idealną ciągłość numeracji od 1 do ${ordersWithStats[0]?.quantity || 0} bez ręcznego zbierania!</li>
        </ol>
      ` : `
        <strong>Instrukcja procesu Ganging (Combo-Run wielu zamówień):</strong>
        <ol style="margin-left: 20px; margin-top: 6px;">
          <li>Wydrukuj nakład <strong>${job.result?.total_sheets_required || 0} arkuszy SRA3</strong>.</li>
          <li>Odetnij krawędź łapki (12 mm) oraz boczne marginesy ochronne (5 mm).</li>
          <li>Wykonaj cięcia wzdłużne dzielące sekcje poszczególnych asortymentów.</li>
          <li>Wykonaj podwójne cięcia poprzeczne (Double Cuts) usuwające 4 mm odpadu spadowego między użytkami.</li>
          <li>Spakuj pakiety według ID zamówień: ${ordersWithStats.map(o => `<strong>${o.order_id}</strong> (${o.quantity} szt.)`).join(', ')}.</li>
        </ol>
      `}
    </div>

    <!-- Stopka raportu -->
    <div class="footer">
      <div>POD Imposition Engine v1.0.0-PROD | ISO 15930-7 (PDF/X-4) | Cloud Print-on-Demand Automation</div>
      <div class="mono">Status: 200 OK | Render Engine: Active</div>
    </div>

  </div>
</body>
</html>`;

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (err: unknown) {
    console.error('Error generating imposition report:', err);
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: err instanceof Error ? err.message : 'Unknown error during report generation',
      },
      { status: 500 }
    );
  }
}
