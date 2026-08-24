# Print on Demand (POD) Imposition Backend API

Produkcyjny backend API dla systemów poligraficznych typu **Print on Demand (POD)**, stworzony do automatycznej impozycji (montażu elektronicznego arkuszy), optymalizacji rozkroju papieru (*2D bin packing & ganging*) oraz sekwencjonowania arkuszy (*Cut and Stack*).

System został zaprojektowany do bezproblemowej integracji z zewnętrznymi platformami produkcyjnymi (np. działającymi w chmurze **Microsoft Azure**), wywołującymi API przez HTTPS z uwierzytelnianiem kluczem API (`X-API-Key`).

---

## 🔒 Bezpieczeństwo i Architektura

1. **Baza Danych Firestore z Pełną Izolacją:**
   - Reguły `firestore.rules` całkowicie blokują bezpośredni dostęp z poziomu przeglądarki (`allow read, write: if false;`).
   - Wszystkie operacje zapisu i odczytu bazy odbywają się po stronie serwera przez **Firebase Admin SDK** z uprawnieniami Service Account.
2. **Klucze API i Zmienne Środowiskowe:**
   - Autoryzacja żądań bazuje na zmiennej środowiskowej `POD_API_SECRET_KEY` (oraz opcjonalnym `INTERNAL_TEST_PANEL_SECRET` dla panelu wewnętrznego).
   - W kodzie źródłowym nie ma żadnych zahardkodowanych kluczy. Jeśli zmienna `POD_API_SECRET_KEY` nie zostanie skonfigurowana, API zgłasza błąd `500 Server Misconfigured`.

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
                      |   - Firebase Admin SDK (server-side Firestore access)         |
                      +───────────────────────────────────────────────────────────────+
                                        │                           │
                   Zapis / Odczyt stanu │                           │ Delegacja ciężkich obliczeń
                   (Firebase Admin SDK) │                           │
                                        ▼                           ▼
                      +──────────────────────────+     +──────────────────────────────+
                      |     Google Firestore     |     |   Python FastAPI Service     |
                      |  Kolekcja:               |     |   (Google Cloud Run)         |
                      |  `imposition_jobs`       |     |  - PyMuPDF / reportlab / shapely
                      |  (Dostęp tylko serwer)   |     |  - Algorytmy gilotynowe 2D   |
                      |  Statusy: QUEUED,        |     |  - Generowanie PDF/X-4/PDF/X-1a
                      |  PROCESSING, COMPLETED   |     +──────────────────────────────+
                      +──────────────────────────+                  │
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

---

## 💻 Lokalne Środowisko Uruchomieniowe

### Wymagania wstępne
- **Node.js**: v20+ lub v22+
- **Menedżer pakietów**: `npm` lub `bun`
- **Google Cloud Platform Project** z aktywnym Firestore

### Krok 1: Instalacja zależności
```bash
npm install
```

### Krok 2: Generowanie bezpiecznych kluczy i konfiguracja `.env.local`

1. Wygeneruj bezpieczne, losowe klucze kryptograficzne w terminalu:
   ```bash
   # Generowanie klucza API dla integracji z Azure POD
   openssl rand -hex 32

   # Generowanie sekretu dla wewnętrznego panelu testowego
   openssl rand -hex 32
   ```

2. Skopiuj szablon zmiennych środowiskowych:
   ```bash
   cp .env.example .env.local
   ```

3. Uzupełnij wygenerowane wartości w pliku `.env.local` (lub w **Secret Managerze / App Settings** w środowisku produkcyjnym):
   ```env
   # Bezpieczny klucz wymagany w nagłówku X-API-Key od klienta zewnętrznego
   POD_API_SECRET_KEY="tutaj_wklej_wygenerowany_klucz_32_bajty"

   # Opcjonalny sekret dla panelu testowego
   INTERNAL_TEST_PANEL_SECRET="tutaj_wklej_sekret_panelu_testowego"
   ```

### Krok 3: Konfiguracja Google Cloud Service Account dla Firebase Admin SDK

Aby serwer Next.js (API routes) mógł komunikować się z bazą Firestore przy całkowicie zablokowanych regułach publicznych:

1. Przejdź do [Google Cloud Console](https://console.cloud.google.com/) lub [Firebase Console](https://console.firebase.google.com/).
2. Wejdź w **Project Settings** -> zakładka **Service accounts**.
3. Kliknij **Generate new private key** (Wygeneruj nowy klucz prywatny) – pobierzesz plik JSON z kluczem konta usługi.
4. **NIGDY nie commituj pobranego pliku JSON do repozytorium!**
5. Wklej całą zawartość pliku JSON jako jedną linię do zmiennej środowiskowej w `.env.local`:
   ```env
   GOOGLE_APPLICATION_CREDENTIALS_JSON='{"type":"service_account","project_id":"twoj-projekt",...}'
   ```
   *(W środowisku Google Cloud Run/App Engine zmienna ta nie jest wymagana, jeśli usługa korzysta z domyślnego Service Account powiązanego z projektem GCP).*

### Krok 4: Uruchomienie serwera deweloperskiego
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
  - `X-API-Key: <TWÓJ_POD_API_SECRET_KEY>`

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
- **Nagłówki:** `X-API-Key: <TWÓJ_POD_API_SECRET_KEY>`

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
- **Nagłówki:** `X-API-Key: <TWÓJ_POD_API_SECRET_KEY>`

---

### 4. Anulowanie zlecenia
- **Metoda:** `POST`
- **Endpoint:** `/api/jobs/{id}/cancel`
- **Nagłówki:** `X-API-Key: <TWÓJ_POD_API_SECRET_KEY>`

---

## 📑 Surowy format OpenAPI 3.1
Pełny plik specyfikacji OpenAPI w formacie JSON jest dostępny pod endpointem:
```
GET /api/openapi.json
```
Możesz zaimportować ten link bezpośrednio do **Postmana**, **Swagger Editora** lub **Azure API Management**.
