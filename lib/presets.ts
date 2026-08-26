import { ImpositionJobPayload } from '@/types/imposition';

export interface PresetDef {
  id: string;
  name: string;
  badge: string;
  description: string;
  payload: ImpositionJobPayload;
}

export const PRESETS: PresetDef[] = [
  {
    id: 'gelato-production-orders',
    name: 'Produkcja Gelato Cut & Stack (Arkusz SRA3 480x330mm)',
    badge: 'GELATO CUT & STACK / SRA3',
    description: 'Impozycja wielozleceniowa Gelato POD w technologii Cut & Stack: 9 arkuszy (18 stron) na arkuszu SRA3 (480x330mm), 8 słupków (4x2), karty rozdzielające STACK COVER, panele zleceń i separatory końcowe.',
    payload: {
      name: 'Gelato Cut & Stack (480x330mm SRA3)',
      workflow: 'CUT_AND_STACK',
      device_type: 'GUILLOTINE',
      pdf_standard: 'PDF/X-4',
      sheet: {
        name: 'SRA3 Arkusz Drukarski (480x330mm)',
        width_mm: 480.0,
        height_mm: 330.0,
        margins_mm: 5.0,
        gripper_margin_mm: 0.0,
        paper_weight_gsm: 300,
        grain_direction: 'LONG',
      },
      orders: [
        {
          order_id: '5871240242',
          customer_reference: 'Achim Strob',
          pdf_source_url: '/test-assets/print_job_1.pdf',
          trim_width_mm: 105.0,
          trim_height_mm: 148.0,
          bleed_mm: 3.0,
          quantity: 40,
          custom_label: 'FLAT CARD (2 PAGES)',
          paper_weight_gsm: 300,
          paper_finish: 'uncoated',
        },
        {
          order_id: '5871240280',
          customer_reference: 'Annett Eppert',
          pdf_source_url: '/test-assets/print_job_2.pdf',
          trim_width_mm: 105.0,
          trim_height_mm: 148.0,
          bleed_mm: 3.0,
          quantity: 20,
          custom_label: 'FLAT CARD (2 PAGES)',
          paper_weight_gsm: 300,
          paper_finish: 'uncoated',
        },
      ],
    },
  },
  {
    id: 'ganging-b1-combo',
    name: 'Combo-Run B1 (Ganging + Gilotyna)',
    badge: 'GANGING / GUILLOTINE',
    description: '4 różne zlecenia o różnych nakładach (10k, 5k, 2.5k) na arkuszu offsetowym B1 (1000x700 mm) z minimalizacją odpadu.',
    payload: {
      workflow: 'GANGING',
      device_type: 'GUILLOTINE',
      pdf_standard: 'PDF/X-4',
      sheet: {
        width_mm: 1000.0,
        height_mm: 700.0,
        margins_mm: 5.0,
        gripper_margin_mm: 0.0,
        paper_weight_gsm: 300,
        grain_direction: 'LONG',
      },
      orders: [
        {
          order_id: 'ORD-AZURE-FLYER-A6-10K',
          pdf_source_url: 'https://podstorage.blob.core.windows.net/orders/flyer_a6_cmyk.pdf',
          trim_width_mm: 105.0,
          trim_height_mm: 148.0,
          bleed_mm: 3.0,
          quantity: 10000,
          custom_label: 'Ulotka A6 Promocyjna',
        },
        {
          order_id: 'ORD-AZURE-FLYER-DL-5K',
          pdf_source_url: 'https://podstorage.blob.core.windows.net/orders/flyer_dl_cmyk.pdf',
          trim_width_mm: 99.0,
          trim_height_mm: 210.0,
          bleed_mm: 3.0,
          quantity: 5000,
          custom_label: 'Ulotka DL Menu',
        },
        {
          order_id: 'ORD-AZURE-CARD-90X50-2.5K',
          pdf_source_url: 'https://podstorage.blob.core.windows.net/orders/business_cards.pdf',
          trim_width_mm: 90.0,
          trim_height_mm: 50.0,
          bleed_mm: 3.0,
          quantity: 2500,
          custom_label: 'Wizytówki Firmowe Soft-Touch',
        },
        {
          order_id: 'ORD-AZURE-POSTCARD-A6-2.5K',
          pdf_source_url: 'https://podstorage.blob.core.windows.net/orders/postcard_a6.pdf',
          trim_width_mm: 105.0,
          trim_height_mm: 148.0,
          bleed_mm: 3.0,
          quantity: 2500,
          custom_label: 'Pocztówka Podziękowanie',
        },
      ],
    },
  },
  {
    id: 'cut-and-stack-tickets',
    name: 'Bilety / Broszura (Cut & Stack)',
    badge: 'CUT & STACK / 120 STRON',
    description: 'Sekwencjonowanie 120 numerowanych użytków na arkuszu cyfrowym SRA3 (450x320 mm) z zachowaniem ciągłej kolejności po pocięciu.',
    payload: {
      workflow: 'CUT_AND_STACK',
      device_type: 'GUILLOTINE',
      pdf_standard: 'PDF/X-4',
      sheet: {
        width_mm: 450.0,
        height_mm: 320.0,
        margins_mm: 4.0,
        gripper_margin_mm: 0.0,
        paper_weight_gsm: 170,
      },
      orders: [
        {
          order_id: 'ORD-AZURE-TICKETS-001-120',
          pdf_source_url: 'https://podstorage.blob.core.windows.net/orders/numbered_tickets_1_to_120.pdf',
          trim_width_mm: 140.0,
          trim_height_mm: 65.0,
          bleed_mm: 3.0,
          quantity: 120,
          custom_label: 'Bilety Festiwalowe Numerowane 1..120',
        },
      ],
    },
  },
  {
    id: 'cnc-labels-contour',
    name: 'Etykiety wykrojnikowe (CNC + CutContour)',
    badge: 'CNC PLOTTER / CUTCONTOUR',
    description: 'Nesting z warstwą wektorową CutContour oraz optycznymi znacznikami pasowania dla stołowego plotera tnąco-frezującego.',
    payload: {
      workflow: 'GANGING',
      device_type: 'CNC_PLOTTER',
      pdf_standard: 'PDF/X-4',
      sheet: {
        width_mm: 700.0,
        height_mm: 500.0,
        margins_mm: 8.0,
        gripper_margin_mm: 0.0,
        paper_weight_gsm: 220,
      },
      orders: [
        {
          order_id: 'ORD-AZURE-STICKER-HEX-3K',
          pdf_source_url: 'https://podstorage.blob.core.windows.net/orders/sticker_diecut_hex.pdf',
          trim_width_mm: 85.0,
          trim_height_mm: 85.0,
          bleed_mm: 3.0,
          quantity: 3000,
          custom_label: 'Naklejka Hexagon Vinyl',
        },
        {
          order_id: 'ORD-AZURE-STICKER-OVAL-1.5K',
          pdf_source_url: 'https://podstorage.blob.core.windows.net/orders/sticker_diecut_oval.pdf',
          trim_width_mm: 120.0,
          trim_height_mm: 70.0,
          bleed_mm: 3.0,
          quantity: 1500,
          custom_label: 'Naklejka Owalna Hologram',
        },
      ],
    },
  },
  {
    id: 'offset-ctp-pdfx1a',
    name: 'Naświetlanie CTP (PDF/X-1a CMYK)',
    badge: 'PDF/X-1a / CTP OFFSET',
    description: 'Rygorystyczny profil PDF/X-1a (spłaszczone przezroczystości, separacje CMYK) pod płyty naświetlarki CTP.',
    payload: {
      workflow: 'GANGING',
      device_type: 'GUILLOTINE',
      pdf_standard: 'PDF/X-1a',
      sheet: {
        width_mm: 880.0,
        height_mm: 630.0,
        margins_mm: 5.0,
        gripper_margin_mm: 0.0,
        paper_weight_gsm: 250,
      },
      orders: [
        {
          order_id: 'ORD-AZURE-CATALOG-COVER',
          pdf_source_url: 'https://podstorage.blob.core.windows.net/orders/catalog_cover_b2.pdf',
          trim_width_mm: 210.0,
          trim_height_mm: 297.0,
          bleed_mm: 3.0,
          quantity: 4000,
          custom_label: 'Okładka Katalogu B2 (PDF/X-1a)',
        },
      ],
    },
  },
];
