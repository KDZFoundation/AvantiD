# Plan Wdrożenia Silnika Impozycji Poligraficznej (Python + Cloud Run)

Dokument opisuje architekturę, dobór technologii i plan wdrożenia produkcyjnego mikroserwisu impozycji prepress opartego na języku Python i środowisku Google Cloud Run.

---

## 1. Architektura Systemu

```
       [ Zewnętrzne API / E-commerce / ERP Drukarni / Nasz Next.js Frontend ]
                                     │
                                     ▼  HTTPS / REST / gRPC
                     ┌───────────────────────────────┐
                     │     Google Cloud Run          │
                     │  (FastAPI + Celery/RQ Worker) │
                     └───────────────┬───────────────┘
                                     │
         ┌───────────────────────────┼───────────────────────────┐
         ▼                           ▼                           ▼
┌──────────────────┐       ┌──────────────────┐        ┌──────────────────┐
│  Cloud Storage   │       │  C++ PDF Core    │        │  Algorytmy       │
│  (GCS Bucket)    │       │  (PyMuPDF /      │        │  Optymalizacji   │
│  Input & Output  │       │   pikepdf/qpdf / │        │  - Rect Packing  │
│  PDF/X-4 CMYK    │       │   Ghostscript)   │        │  - Cut & Stack   │
└──────────────────┘       └──────────────────┘        │  - N-Up Ganging  │
                                                       └──────────────────┘
```

---

## 2. Stos Technologiczny (Prepress & Performance)

W branży poligraficznej kluczowe jest **nieprzekształcanie** i **nierekompresowanie** rastrów oraz zachowanie profili barwnych ICC, kolorów dodatkowych (Pantone/Spot colors), overprintu i linii cięcia (*CutContour*).

| Warstwa | Technologia | Zastosowanie w poligrafii |
| :--- | :--- | :--- |
| **API Framework** | **FastAPI** (Python 3.11/3.12 + Uvicorn) | Asynchroniczny, lekki, walidacja Pydantic v2 (kompatybilny ze schematami z naszego obecnego API). |
| **Rdzeń operacji PDF** | **pikepdf** (oparty o C++ `QPDF`) + **PyMuPDF** (`fitz`) | Bezstratne manipulowanie obiektami, łączenie drzew stron jako Form XObject, zachowanie OutputIntent (PDF/X-4, PDF/X-1a). |
| **Silnik matematyczny impozycji** | **NumPy** + **rectpack** / `ortools` | Algorytmy pakowania 2D (Guillotine Bin Packing, Best-Fit, MaxRects) oraz algorytm sekwencjonowania kolumnowego Cut & Stack. |
| **Generowanie paserów i znaczników** | **ReportLab** / **pikepdf Content Streams** | Wektorowe znaczniki pasowania (Registration Black / All Separation), linie cięcia, kody kreskowe 1D/2D (Code128, DataMatrix, QR z ID zamówienia dla gilotyn Polar/Wohlenberg). |
| **Storage & I/O** | **Google Cloud Storage (GCS)** | Przesyłanie strumieniowe dużych plików PDF (zlecenia wielogigabajtowe) z wykorzystaniem Signed URLs. |

---

## 3. Struktura Modułów Silnika Python

```
pod-imposition-engine/
├── app/
│   ├── main.py                     # FastAPI aplikacja i routery
│   ├── api/
│   │   └── v1/
│   │       ├── impose.py           # Endpointy /jobs, /impose, /preview
│   │       └── health.py           # Cloud Run liveness/readiness probe
│   ├── core/
│   │   ├── config.py               # Zmienne środowiskowe, limity pamięci
│   │   └── gcs.py                  # Klient Google Cloud Storage
│   ├── engine/
│   │   ├── algorithms/
│   │   │   ├── cut_and_stack.py    # Algorytm Cut & Stack (słupki gilotynowe)
│   │   │   ├── ganging.py          # Algorytm 2D guillotine nesting (Combo-Run)
│   │   │   └── booklet.py          # Zszywka zeszytowa / broszury (saddle-stitch)
│   │   ├── marks/
│   │   │   ├── crop_marks.py       # Znaczniki cięcia z offsetem
│   │   │   ├── registration.py     # Pasery drukarskie CMYK + Pantone
│   │   │   ├── slugs.py            # Paski informacyjne z metadanymi zlecenia
│   │   │   └── barcodes.py         # Kody sterujące maszyn wykańczających
│   │   ├── pdf_builder.py          # pikepdf/QPDF Form XObject compositor
│   │   └── validator.py            # Weryfikacja PDF/X i profili ICC (Preflight)
│   └── schemas/
│       ├── job.py                  # Modele zlecenia (SRA3, B1, B2, spad, formaty)
│       └── result.py               # Metadane JSON wynikowej impozycji
├── Dockerfile                      # Zoptymalizowany obraz multi-stage Debian
├── requirements.txt
└── tests/
    ├── test_cut_and_stack.py
    └── test_pdf_integrity.py       # Testy sum MD5 osadzonych obrazów
```

---

## 4. Zasada Działania Bezstratnego Kompozytora (C++ pikepdf)

Zamiast rastrować lub przepisywać pliki od nowa, silnik tworzy nowy dokument nadrzędny (arkusz matka) i referencjonuje strony wejściowe jako obiekty `Form XObject`:

1. **Preflight wejścia**: Sprawdzenie `TrimBox`, `BleedBox`, `MediaBox` i obecności profili ICC.
2. **Kalkulacja siatki**: Wyliczenie transformacji afinicznej (macierz translacji $X, Y$ i rotacji $0^\circ / 90^\circ / 180^\circ$).
3. **Kopiowanie zasobów**: Skopiowanie strumieni stron i ich tablic `Resources` (czcionki, obrazy, przestrzenie barwne) bez ich dekompresji.
4. **Wstrzyknięcie warstwy znaczników**: Dodanie strumienia `Do /XObject` oraz wyrysowanie paserów kolorem `/Separation /All`.
5. **OutputIntent PDF/X**: Dołączenie profilu znormalizowanego (np. `ISO Coated v2 300% (ECI)` lub `FOGRA51`).

---

## 5. Konfiguracja Cloud Run & DevOps

### 5.1 Specyfikacja kontenera Dockerfile
```dockerfile
FROM python:3.12-slim-bookworm AS base

# Instalacja natywnych bibliotek C/C++ dla QPDF, MuPDF i czcionek poligraficznych
RUN apt-get update && apt-get install -y --no-install-recommends \
    libqpdf-dev \
    libmupdf-dev \
    ghostscript \
    fonts-dejavu-core \
    libxml2-dev \
    libxslt1-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Cloud Run nasłuchuje na porcie 8080 (lub zmiennej PORT)
ENV PORT=8080
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "2"]
```

### 5.2 Parametry wdrożenia na Cloud Run
- **Pamięć RAM**: `2 GiB` – `4 GiB` (dla ciężkich plików arkuszy offsetowych B1 z wieloma PDF-ami w 300+ DPI).
- **CPU**: `2 vCPU` (współbieżność do 10 jednoczesnych procesów na instancję).
- **Timeout**: `300s` (dla złożonych zleceń z kilkuset stronami).
- **Skalowanie**: `min-instances: 0` (oszczędność kosztów), `max-instances: 50`.
- **Obsługa plików**: Przetwarzanie w pamięci RAM (`/dev/shm` lub `io.BytesIO`) lub w katalogu `/tmp` (tymczasowy ramdisk Cloud Run).

---

## 6. Roadmapa Wdrożenia Krok po Kroku

1. **Krok 1: Rdzeń Cut & Stack i Ganging w Pythonie (1–2 dni)**
   - Implementacja logiki cięcia blokowego (Cut & Stack) w Pythonie z `pikepdf`.
   - Generowanie paserów, linii cięcia (CropMarks) i metadanych zlecenia na marginesie arkusza.
   - Testy jednostkowe z plikami testowymi z drukarni (`print_job_1.pdf`, `print_job_2.pdf`).

2. **Krok 2: Endpointy FastAPI i integracja z Cloud Storage (1 dzień)**
   - Utworzenie endpointów REST API: `POST /v1/impose`, `POST /v1/validate`.
   - Integracja z Google Cloud Storage (pobieranie PDF po Signed URL, zapis gotowej impozycji do bucketa).

3. **Krok 3: Konteneryzacja i wdrożenie na Cloud Run (1 dzień)**
   - Przygotowanie zoptymalizowanego Dockerfile.
   - Konfiguracja Secret Managera (klucze API, uprawnienia IAM do GCS).
   - Wdrożenie na środowisko deweloperskie i testy wydajnościowe (benchmark czasu generowania arkusza).

4. **Krok 4: Integracja z panelem webowym (Next.js)**
   - Podłączenie panelu operatorskiego bezpośrednio do instancji Cloud Run zamiast silnika lokalnego/in-memory.
