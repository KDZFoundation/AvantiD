# 📊 Raport Audytu Jakości Kodu i Architektury Systemu
**Projekt:** Print on Demand (POD) Imposition Backend API
**Technologie:** Next.js 15 (App Router), TypeScript, Firebase Admin / Firestore, Zod, pdf-lib
**Data audytu:** Luty 2025
**Audytor:** Jules (Lead Software Engineer)

---

## 📄 Podsumowanie Menedżerskie (Executive Summary)

Przeprowadzono kompleksowy audyt techniczny repozytorium **POD Imposition Backend API**. System pełni rolę produkcyjnego backendu poligraficznego odpowiedzialnego za automatyczną impozycję (montaż elektroniczny arkuszy), optymalizację rozkroju papieru (*2D bin packing & ganging*), sekwencjonowanie arkuszy (*Cut and Stack*) oraz generowanie wektorowych plików produkcyjnych PDF/X.

### Ocena Ogólna Architektury: **8.5 / 10**

#### Kluczowe zalety:
1. **Model Architektoniczny:** Bardzo wysoka separacja odpowiedzialności – mikroserwisowa integracja z hybrydowym przeliczaniem po stronie Node.js / Python Cloud Run.
2. **Standard Poligraficzny:** Zgodność z realnymi wymogami prepress (obsługa spadów *Bleed Box*, formatu netto *Trim Box*, znaczników pasowania, paserów oraz sekwencjonowania *Cut and Stack*).
3. **Bezpieczeństwo i Izolacja Bazy Data:** Reguły Firestore (`firestore.rules`) w pełni blokują dostęp z przeglądarki (`allow read, write: if false;`), zmuszając do zapisu wyłącznie przez Firebase Admin SDK po stronie serwera.
4. **Resilience (Mechanizm Fallback Store):** Wbudowany magazyn in-memory (`lib/job-store.ts`) przejmuje zapytania bez wywoływania awarii aplikacji w przypadku przekroczenia darmowych limitów odczytów/zapisów Firestore (`RESOURCE_EXHAUSTED`).

---

## 🏗️ 1. Analiza Architektury i Wzorców Projektowych

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
                      |   - Zarządzanie stanem i fallback in-memory                    |
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

* **Separacja Warstw:** Ścisły podział na typy (`types/imposition.ts`), walidację schematów (`lib/validation.ts`), silnik obliczeniowy (`lib/imposition-engine.ts`), warstwę persystencji (`lib/job-store.ts`) i obsługę żądań HTTP (`app/api/`).
* **Obsługa Błędów HTTP:** Wszystkie endpointy zwracają spójny JSON z ujednoliconą strukturą błędów (`error`, `message`, `code`, `issues`).

---

## 🔒 2. Bezpieczeństwo i Uwierzytelnianie

### Mocne strony:
* **Uwierzytelnianie kluczem API:** Zastosowanie nagłówków `X-API-Key` oraz wsparcie dla nagłówka `Authorization: Bearer <TOKEN>`.
* **Ochrona przed wyciekiem sekretów:** Żadne klucze nie są zahardkodowane w kodzie źródłowym. Brak skonfigurowanego `POD_API_SECRET_KEY` zgłasza błąd `500 Server Misconfigured`.
* **Izolacja Firestore:** Dostęp do Firestore jest odcięty z zewnątrz na poziomie Firebase Rules (`allow read, write: if false`).

### Wskazane obszary poprawy:
* **Brak timing-safe comparison:** W pliku `lib/auth.ts` porównanie kluczy API odbywa się przy użyciu standardowego operatora przyrównania `===`:
  ```typescript
  if (token === configuredSecret) { ... }
  ```
  *Rekomendacja:* Użycie `crypto.timingSafeEqual` zapobiegającego atakom typu *timing attack*.
* **Brak natywnego Rate Limitingu na endpointach API:** Endpoint `POST /api/jobs` nie posiada natywnego dławienia żądań (np. z użyciem `Upstash Redis` lub wbudowanego w middleware licznika w pętli).

---

## 📐 3. Logika Poligraficzna i Algorytmy (Prepress Engineering)

### Impozycja `GANGING` (Combo-Run):
* Algorytm wylicza najlepszą orientację (0° vs 90°) dla arkusza docelowego (`calculateBestOrientation`).
* Uwzględnia margines łapki maszyny (`gripper_margin_mm`) oraz bezpieczny odstęp między użytkami na cięcie gilotynowe.
* Automatycznie wstawia techniczne sekwencje arkuszowe: `ORDER_INFO_PANEL`, `PRODUCT`, `WASTE_SLOT`, `NEXT_ORDER_START_MARKER`, `ORDER_END_MARKER`.

### Impozycja `CUT_AND_STACK`:
* Prawidłowa kalkulacja głębokości stosu: $S = \lceil M / N \rceil$.
* Układ stron gwarantuje, że po jednorazowym pocięciu całego stosu na gilotynie i nałożeniu użytków na siebie zachowana jest pełna kolejność numeryczna ($1..M$) bez ręcznego przebierania stron.

### Generowanie plików PDF (`app/api/jobs/[id]/render-pdf/route.ts`):
* Wykorzystanie biblioteki `pdf-lib` do tworzenia dwustronnego PDF (Awers / Rewers z poziomym odbiciem lustrzanym dla druku dwustronnego).
* Generowanie paserów pasowania, znaczników cięcia netto (*Crop Marks*), pasków kontroli barwnej CMYK oraz kodów kreskowych 1D.

---

## 🔍 4. Znalezione Usterki / Code Smells

1. **Typy w paramaterach dynamicznych App Router (Next.js 15):**
   W plikach `app/api/jobs/[id]/route.ts`, `render-pdf/route.ts`, `cancel/route.ts` oraz `report/route.ts` zastosowano poprawny dla Next.js 15 typ `params: Promise<{ id: string }>`.
2. **Obsługa błędów typowania `any`:**
   W niektórych miejscach (`catch (err: any)`) stosowany jest typ `any` zamiast bezpieczniejszego `unknown` z rzutowaniem typów (`err instanceof Error`).
3. **Pliki tymczasowe WIF w `/tmp`:**
   W `lib/firebase-admin.ts` w przypadku Workload Identity Federation plik konfiguracyjny jest zapisywany w `/tmp`. W środowiskach bezdyskowej konteneryzacji warto to monitorować.

---

## 🛠️ 5. Rekomendacje Rozwojowe (Roadmap)

| Priorytet | Obszar | Rekomendacja |
| :--- | :--- | :--- |
| 🔴 **Wysoki** | **Bezpieczeństwo** | Wdrożenie `crypto.timingSafeEqual` w `lib/auth.ts` do weryfikacji kluczy API. |
| 🟠 **Średni** | **Wydajność** | Wdrożenie middleware z Rate Limitingiem (`Upstash` / `Redis`) dla API. |
| 🟠 **Średni** | **Testy** | Dodanie testów jednostkowych (Jest / Vitest) dla algorytmów w `lib/imposition-engine.ts`. |
| 🟢 **Niski** | **Typowanie** | Zamiana typów `any` na `unknown` w blokach `try-catch`. |

---
*Raport wygenerowany automatycznie przez narzędzie audytowe Jules.*
