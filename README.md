# Print on Demand (POD) Imposition Backend API

Produkcyjny backend API dla systemów poligraficznych typu **Print on Demand (POD)**, stworzony do automatycznej impozycji (montażu elektronicznego arkuszy), optymalizacji rozkroju papieru (*2D bin packing & ganging*) oraz sekwencjonowania arkuszy (*Cut and Stack*).

System został zaprojektowany do bezproblemowej integracji z zewnętrznymi platformami produkcyjnymi (np. działającymi w chmurze **Microsoft Azure**), wywołującymi API przez HTTPS z uwierzytelnianiem kluczem API (`X-API-Key`).

---

## 🏗️ Architektura Systemu

```
                                +-------------------------------------------+
                                |      Zewnętrzny System POD (Azure)        |
                                +-------------------------------------------+
                                                      │
                                                      │ HTTPS (X-API-Key)
                                                      │ POST /api/jobs
                                                      ▼
                      +───────────────────────────────────────────────────────────────+
                      |                 Next.js 15 App Router                         |
                      |   - Route Handlers (/api/jobs, /api/jobs/[id])                |
                      |   - Walidacja Zod (Sheet, Bleed, PDF URLs)                   |
                      |   - Zarządzanie stanem i asynchroniczność (202 Accepted)     |
                      |   - Wewnętrzny Panel Testowy dla operatorów i devopsów        |
                      +───────────────────────────────────────────────────────────────+
                                        │                           │
                   Zapis / Odczyt stanu │                           │ Delegacja ciężkich obliczeń
                                        ▼                           ▼
                      +──────────────────────────+     +──────────────────────────────+
                      |     Google Firestore     |     |   Python FastAPI Service     |
                      |  Kolekcja:               |     |   (Google Cloud Run)         |
                      |  `imposition_jobs`       |     |  - PyMuPDF / reportlab / shapely
                      |  Statusy: QUEUED,        |     |  - Algorytmy gilotynowe 2D   |
                      |  PROCESSING, COMPLETED   |     |  - Generowanie PDF/X-4/PDF/X-1a
                      +──────────────────────────+     +──────────────────────────────+
                                                                    │
                                                                    ▼
                                                       +──────────────────────────────+
                                                       | Google Cloud Storage (GCS)   |
                                                       | Wynikowe pliki produkcyjne   |
                                                       +──────────────────────────────+
```

---

## 🚀 Kluczowe Cechy Poligraficzne

1. **Dwa dedykowane silniki impozycji (Workflow):**
   - **`GANGING` (Combo-Run):** Łączenie wielu zamówień o różnych nakładach na jednym dużym arkuszu (np. B1/B2/SRA3) z automatycznym wyliczaniem mnożników nakładu, minimalizującym odpad papieru.
   - **`CUT_AND_STACK`:** Matematyczne sekwencjonowanie wieloużytkowe (np. 120 stron na arkuszach SRA3), gwarantujące, że po pocięciu całego stosu w gilotynie i nałożeniu słupków na siebie zachowana jest idealna kolejność numeryczna ($1..M$) bez ręcznego tasowania.

2. **Dwa typy urządzeń wykańczających (`device_type`):**
   - **`GUILLOTINE`:** Wyznaczanie prostych cięć krawędź-do-krawędzi (przelotowych) dla standardowych gilotyn jednonożowych.
   - **`CNC_PLOTTER`:** Wyznaczanie wektorowych ścieżek cięcia `CutContour` oraz optycznych znaczników pasowania (crosshairs / kropki rejestracyjne) dla stołów tnąco-frezujących (np. Zünd, Kongsberg, Summa).

3. **Standardy wyjściowe PDF:**
   - **`PDF/X-4`:** Zgodność z nowoczesnym workflow RIP, zachowanie warstw i przezroczystości.
   - **`PDF/X-1a`:** Rygorystyczny profil separacji CMYK pod tradycyjne naświetlarki CTP (Computer-to-Plate).

4. **Pobieranie plików z dowolnego źródła:**
   - Obsługa publicznych i pre-signed URL (np. Azure Blob Storage SAS tokens, AWS S3, Cloudflare R2).

---

## 💻 Lokalne Środowisko Uruchomieniowe

### Wymagania wstępne
- **Node.js**: v20+ lub v22+
- **Menedżer pakietów**: `npm` lub `bun`

### Krok 1: Instalacja zależności
```bash
npm install
```

### Krok 2: Konfiguracja zmiennych środowiskowych
Skopiuj plik `.env.example` do `.env.local`:
```bash
cp .env.example .env.local
```

Uzupełnij kluczowe zmienne:
```env
# Klucz wymagany w nagłówku X-API-Key
POD_API_SECRET_KEY="pod_live_secret_key_poligrafia_2026"

# (Opcjonalnie) Zewnętrzny mikroserwis Python Cloud Run
PYTHON_IMPOSITION_SERVICE_URL=""
PYTHON_IMPOSITION_SERVICE_API_KEY=""

# Bucket GCS dla gotowych plików PDF
GCS_OUTPUT_BUCKET="pod-imposition-production-outputs"
```

### Krok 3: Uruchomienie serwera deweloperskiego
```bash
npm run dev
```
Aplikacja oraz Panel Testowy będą dostępne pod adresem: `http://localhost:3000`.

---

## 📡 Specyfikacja REST API

### 1. Złożenie zlecenia impozycji
- **Metoda:** `POST`
- **Endpoint:** `/api/jobs`
- **Nagłówki:**
  - `Content-Type: application/json`
  - `X-API-Key: <TWÓJ_KLUCZ_API>`

#### Przykładowy Payload JSON:
```json
{
  "workflow": "GANGING",
  "device_type": "GUILLOTINE",
  "pdf_standard": "PDF/X-4",
  "sheet": {
    "width_mm": 1000.0,
    "height_mm": 700.0,
    "margins_mm": 5.0,
    "gripper_margin_mm": 15.0
  },
  "orders": [
    {
      "order_id": "ORD-AZURE-FLYER-A6-10K",
      "pdf_source_url": "https://podstorage.blob.core.windows.net/orders/flyer_a6.pdf",
      "trim_width_mm": 105.0,
      "trim_height_mm": 148.0,
      "bleed_mm": 2.0,
      "quantity": 10000
    },
    {
      "order_id": "ORD-AZURE-CARD-90X50-2.5K",
      "pdf_source_url": "https://podstorage.blob.core.windows.net/orders/business_cards.pdf",
      "trim_width_mm": 90.0,
      "trim_height_mm": 50.0,
      "bleed_mm": 2.0,
      "quantity": 2500
    }
  ]
}
```

#### Odpowiedź `202 Accepted`:
```json
{
  "job_id": "job_1724497800_x9a8b7",
  "status": "QUEUED",
  "workflow": "GANGING",
  "device_type": "GUILLOTINE",
  "pdf_standard": "PDF/X-4",
  "status_url": "https://api.twojadomena.pl/api/jobs/job_1724497800_x9a8b7",
  "created_at": "2026-08-24T10:15:00.000Z",
  "message": "Imposition job accepted and queued for optimization."
}
```

---

### 2. Sprawdzenie statusu i wyników zlecenia
- **Metoda:** `GET`
- **Endpoint:** `/api/jobs/{id}`
- **Nagłówki:** `X-API-Key: <TWÓJ_KLUCZ_API>`

#### Odpowiedź `200 OK` (po zakończeniu obliczeń):
```json
{
  "job_id": "job_1724497800_x9a8b7",
  "status": "COMPLETED",
  "workflow": "GANGING",
  "device_type": "GUILLOTINE",
  "pdf_standard": "PDF/X-4",
  "created_at": "2026-08-24T10:15:00.000Z",
  "completed_at": "2026-08-24T10:15:01.200Z",
  "result": {
    "yield_percentage": 91.4,
    "waste_percentage": 8.6,
    "total_waste_sqm": 0.0602,
    "sheet_run_count": 2500,
    "download_pdf_url": "https://storage.googleapis.com/pod-imposition-production-outputs/impositions/job_1724497800_x9a8b7_output_pdf_x_4.pdf",
    "pdf_standard": "PDF/X-4",
    "workflow_details": {
      "combo_run_multipliers": {
        "ORD-AZURE-FLYER-A6-10K": { "ordered": 10000, "per_sheet": 4, "total_printed": 10000, "overprint_count": 0 },
        "ORD-AZURE-CARD-90X50-2.5K": { "ordered": 2500, "per_sheet": 1, "total_printed": 2500, "overprint_count": 0 }
      }
    }
  }
}
```

---

### 3. Pobranie listy zleceń
- **Metoda:** `GET`
- **Endpoint:** `/api/jobs?status=COMPLETED&workflow=GANGING&limit=50`

---

### 4. Anulowanie zlecenia
- **Metoda:** `POST`
- **Endpoint:** `/api/jobs/{id}/cancel`

---

## 📑 Surowy format OpenAPI 3.1
Pełny plik specyfikacji OpenAPI w formacie JSON jest dostępny pod endpointem:
```
GET /api/openapi.json
```
Możesz zaimportować ten link bezpośrednio do **Postmana**, **Swagger Editora** lub **Azure API Management**.
