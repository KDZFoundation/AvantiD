# Deterministyczny silnik impozycji AvantiD — wymagania i kontrakt v1

Status: kontrakt zaakceptowany; implementacja referencyjna w `packages/imposition-core`  
Zakres: czysty planer geometrii i kolejności; bez renderowania PDF, API, bazy danych, storage i kolejek

## 1. Cel

Silnik ma być przenośną, deterministyczną funkcją domenową:

```ts
planImposition(request: PlanRequestV1): PlanResponseV1
```

Dla tego samego poprawnego wejścia, tej samej wersji algorytmu i tej samej implementacji kontraktu wynik ma być identyczny bajtowo po kanonicznej serializacji JSON. Funkcja nie wykonuje I/O, nie odczytuje zegara, zmiennych środowiskowych ani stanu globalnego i nie generuje identyfikatorów losowych.

## 2. Co już istnieje w AvantiD

Repozytorium zawiera:

- `lib/imposition-engine.ts`: obliczanie orientacji, osobne ścieżki `GANGING` i `CUT_AND_STACK`, rozmieszczanie slotów, linie cięcia i podstawowe statystyki;
- `types/imposition.ts`: wspólny model zlecenia, planu, danych renderera i danych operacyjnych;
- `lib/validation.ts`: walidację Zod payloadu HTTP;
- `app/api/jobs/[id]/render-pdf/route.ts`: kompozycję PDF i logikę rewersu;
- `tests/test_pdf_integrity.ts`: test całego API i zachowania strumieni obrazów w PDF;
- presety i panel testowy zależne od obecnego kontraktu aplikacji.

To jest wartościowy prototyp, lecz obecny `imposition-engine.ts` nie spełnia wymagań czystego, deterministycznego planera:

1. Łączy obliczenia z Firestore, HTTP, zmiennymi środowiskowymi, `Date.now()`, datą produkcji i adresem endpointu renderującego.
2. Przyjmuje `pdf_source_url` i emituje dane prezentacyjne/produkcyjne, które nie są potrzebne matematyce układu.
3. `GANGING` nie jest ogólnym 2D bin packingiem. Układa kolejkę różnych formatów według siatki pierwszego elementu arkusza, co może powodować kolizje albo wyjście poza arkusz.
4. Dla dużych nakładów stosuje próbkowanie i heurystyczne proporcje, więc wynik nie opisuje dokładnie całej produkcji.
5. `CUT_AND_STACK` zakłada geometrię pierwszego zamówienia dla wszystkich zamówień oraz miesza politykę kart informacyjnych i separatorów z algorytmem sekwencjonowania.
6. `gripper_margin_mm` jest deklarowany, ale nie wpływa na obszar dostępny; `gutter_mm` występuje w typach, lecz nie w schemacie Zod; ganging ma odstęp `6 mm` wpisany na stałe.
7. Wymuszenie `Math.max(1, ...)` pozwala zwrócić slot nawet wtedy, gdy użytek fizycznie nie mieści się na arkuszu.
8. Układ współrzędnych, reguły dupleksu, dokładność liczb i tie-breakery nie są częścią kontraktu.
9. Linie cięcia są wyprowadzane jako pełne linie arkusza, ale nie ma dowodu wykonalności kolejnych etapów gilotynowych.
10. Metryki wykorzystania i odpadu są niespójne: bazują na polu netto, obejmują sloty techniczne, a część wyników pochodzi tylko z pierwszego arkusza.
11. Testy nie obejmują deterministyczności, braku kolizji, granic arkusza, zachowania liczby egzemplarzy, permutacji dupleksu ani własności cut-and-stack.

## 3. Inspiracja z planera Podróżówki

Do zachowania jako wzorzec architektoniczny:

- stabilna kolejność elementów wejściowych;
- oddzielenie pozycji slotu od zawartości renderowanej;
- jawna, testowalna permutacja rewersu dla sposobu odwracania arkusza;
- przetwarzanie arkusz po arkuszu zamiast utrzymywania wszystkich bitmap w pamięci;
- identyczne znaczenie slotu na froncie i rewersie.

Poza zakresem i bez kopiowania: Supabase, modele zamówień i QR, komponenty React, `html2canvas`, pobieranie assetów, nazewnictwo biznesowe, generowanie PDF oraz infrastruktura wdrożeniowa Podróżówki.

## 4. Granice odpowiedzialności

### Rdzeń planera

- waliduje wyłącznie reguły domenowe potrzebne do planowania;
- normalizuje kolejność i orientacje;
- wyznacza wzorce arkuszy, liczbę powtórzeń, pozycje, transformacje front/rewers;
- wyznacza plan cięcia, kolejność stosów i dokładne bilanse egzemplarzy;
- zwraca ostrzeżenia domenowe i deterministyczny fingerprint planu.

### Adaptery poza rdzeniem

- HTTP/OpenAPI, autoryzacja i statusy zleceń;
- Firestore, GCS, Azure, Cloud Run, kolejki i retry;
- pobieranie i preflight PDF, interpretacja TrimBox/BleedBox/MediaBox;
- renderowanie PDF/PDF-X, profile ICC, separacje, overprint i fonty;
- rysowanie paserów, kodów, slugów oraz warstw CutContour;
- daty, nazwy plików, URL-e wyników i telemetryka czasu wykonania.

Adapter może przełożyć wynik preflightu PDF na `source_ref` i wymiary wejściowe, a renderer może przełożyć `PlanV1` na PDF. Żaden z nich nie zmienia geometrii planu.

## 5. Niezmienniki v1

1. Wszystkie odległości są całkowitymi mikrometrami (`um`), bez liczb zmiennoprzecinkowych. `1 mm = 1000 um`.
2. Początek układu współrzędnych leży w lewym górnym rogu arkusza; `x` rośnie w prawo, `y` w dół.
3. Prostokąty są półotwarte: `[x, x + width) × [y, y + height)`.
4. `footprint` placementu obejmuje trim, spady i wymagany odstęp technologiczny. Footprinty nie mogą się przecinać ani wykraczać poza `printable_box`.
5. Dozwolone obroty są jawne; v1 dopuszcza tylko `0` i `90` stopni.
6. Każdy fizyczny egzemplarz produktu ma dokładnie jedno pochodzenie: `item_id` i numer kopii.
7. Liczba dobrych egzemplarzy nie może być mniejsza od `quantity`; nadprodukcja jest jawna per item.
8. Slot pusty/techniczny ma własny typ i nigdy nie jest liczony jako dobry egzemplarz.
9. Transformacja rewersu wynika wyłącznie z `duplex.mode` i wymiarów arkusza; nie zależy od renderera.
10. Wszystkie tablice wyniku mają zdefiniowaną kolejność. Implementacja nie polega na kolejności map/hash-table.
11. Brak wykonalnego układu zwraca błąd domenowy; nigdy ujemny offset ani placement poza arkuszem.
12. Metryki są liczone z całego przebiegu, jako liczby całkowite (`area_um2`) lub ułamki w punktach bazowych (`0..10000`).

## 6. Wejście — `PlanRequestV1`

```ts
type Um = number; // integer >= 0, JSON-safe integer

interface PlanRequestV1 {
  contract_version: "1.0";
  algorithm: {
    name: "avanti-rect-v1";
    objective: "MIN_SHEETS_THEN_WASTE_THEN_CUTS";
    tie_break: "INPUT_ORDER_THEN_ITEM_ID_THEN_Y_THEN_X_THEN_ROTATION";
  };
  workflow:
    | { kind: "N_UP" }
    | {
        kind: "CUT_AND_STACK";
        stack_order: "ROW_MAJOR" | "COLUMN_MAJOR";
        pad_last_stack: boolean;
      };
  sheet: {
    width_um: Um;
    height_um: Um;
    printable_insets_um: {
      top: Um;
      right: Um;
      bottom: Um;
      left: Um;
    };
    gripper_edge: "NONE" | "TOP" | "RIGHT" | "BOTTOM" | "LEFT";
  };
  spacing: {
    horizontal_um: Um;
    vertical_um: Um;
  };
  duplex:
    | { mode: "SIMPLEX" }
    | {
        mode: "DUPLEX";
        tumble: "FLIP_LONG_EDGE" | "FLIP_SHORT_EDGE";
        back_rotation_deg: 0 | 180;
      };
  items: PlanItemV1[];
}

interface PlanItemV1 {
  item_id: string;                 // unikalny, stabilny identyfikator domenowy
  source_ref: string;              // nieprzezroczysty klucz dla adaptera; nie URL
  quantity: number;                // integer 1..10_000_000
  trim: { width_um: Um; height_um: Um };
  bleed_um: { top: Um; right: Um; bottom: Um; left: Um };
  allowed_rotations_deg: readonly (0 | 90)[];
  priority: number;                // integer; mniejsza wartość wcześniej
  sides:
    | { kind: "SINGLE"; front_page: number }
    | { kind: "PAIRED"; front_page: number; back_page: number };
}
```

Reguły wejścia:

- `items` nie może być puste, a `item_id` musi być unikalne.
- Wymiary i pola spadu muszą być dodatnie/nieujemne i mieścić się w zakresie bezpiecznych liczb JSON.
- `front_page` i `back_page` są numerowane od 1.
- Wszystkie elementy jednego wywołania muszą należeć do jednego zgodnego przebiegu materiałowego. Papier, uszlachetnienie i profil maszyny są odpowiedzialnością adaptera grupującego.
- `CUT_AND_STACK` v1 wymaga identycznego footprintu wszystkich elementów po wybranej orientacji. Niezgodność zwraca błąd, zamiast cichego użycia wymiarów pierwszego elementu.
- `source_ref`, kolejność pól JSON i zewnętrzne ID zlecenia nie mogą wpływać na geometrię poza tie-breakiem przez `item_id`.

## 7. Wyjście — `PlanResponseV1`

```ts
type PlanResponseV1 =
  | { ok: true; plan: ImpositionPlanV1 }
  | { ok: false; errors: PlanIssueV1[] };

interface ImpositionPlanV1 {
  contract_version: "1.0";
  algorithm: { name: "avanti-rect-v1"; revision: string };
  coordinate_system: "TOP_LEFT_X_RIGHT_Y_DOWN_UM";
  plan_fingerprint: string; // lowercase SHA-256 kanonicznego planu bez tego pola
  patterns: SheetPatternV1[];
  item_totals: Array<{
    item_id: string;
    requested: number;
    planned_good: number;
    overrun: number;
  }>;
  totals: {
    physical_sheets: number;
    pattern_count: number;
    good_area_um2: number;
    occupied_area_um2: number;
    printable_area_um2: number;
    waste_area_um2: number;
    utilization_bp: number; // 0..10000; occupied / printable
  };
  finishing: {
    stack_order?: "ROW_MAJOR" | "COLUMN_MAJOR";
    stack_sequence?: number[];
    instructions: FinishingInstructionV1[];
  };
  warnings: PlanIssueV1[];
}

interface SheetPatternV1 {
  pattern_index: number;           // 0..N-1
  repeat_count: number;            // liczba fizycznych arkuszy tego wzorca
  sheet: {
    width_um: Um;
    height_um: Um;
    printable_box: RectV1;
  };
  placements: PlacementV1[];       // sort: y, x, item_id, placement_index
  cuts: CutOperationV1[];          // kolejność wykonania
  metrics: {
    good_area_um2_per_sheet: number;
    occupied_area_um2_per_sheet: number;
    waste_area_um2_per_sheet: number;
    utilization_bp: number;
  };
}

interface PlacementV1 {
  placement_index: number;
  slot_kind: "PRODUCT" | "BLANK" | "TECHNICAL";
  item_id?: string;
  source_ref?: string;
  copy: {
    first: number;                 // numer kopii dla pierwszego powtórzenia wzorca
    increment_per_repeat: number;  // 0 dla zwykłego N-up
  } | null;
  front: SurfacePlacementV1 | null; // null wyłącznie dla BLANK bez grafiki
  back: SurfacePlacementV1 | null;
  trim_box: RectV1;
  footprint_box: RectV1;
  rotation_deg: 0 | 90;
  stack_index: number | null;
}

interface SurfacePlacementV1 {
  page: number;
  transform: {
    a: -1 | 0 | 1;
    b: -1 | 0 | 1;
    c: -1 | 0 | 1;
    d: -1 | 0 | 1;
    tx_um: number;
    ty_um: number;
  };
}

interface RectV1 { x_um: Um; y_um: Um; width_um: Um; height_um: Um }

interface CutOperationV1 {
  order: number;
  axis: "HORIZONTAL" | "VERTICAL";
  position_um: Um;
  span: { from_um: Um; to_um: Um };
  through_cut: boolean;
  separates_placement_indexes: number[];
}

interface FinishingInstructionV1 {
  code: "PRINT" | "TURN" | "CUT" | "REMOVE_TECHNICAL" | "STACK";
  refs: number[];
}

interface PlanIssueV1 {
  code:
    | "INVALID_INPUT"
    | "DUPLICATE_ITEM_ID"
    | "ITEM_DOES_NOT_FIT"
    | "INCOMPATIBLE_CUT_AND_STACK_GEOMETRY"
    | "NO_FEASIBLE_LAYOUT"
    | "QUANTITY_OVERRUN"
    | "CUT_PLAN_NOT_GUILLOTINE_FEASIBLE";
  path: string;                    // JSON Pointer
  severity: "ERROR" | "WARNING";
  message: string;
  details?: Record<string, string | number | boolean>;
}
```

## 8. Semantyka dupleksu

Planner zapisuje transformację każdej strony, zamiast pozostawiać rendererowi domysł:

- `FLIP_LONG_EDGE`: odbicie pozycji względem osi zależnej od orientacji arkusza i zadeklarowanej krawędzi obrotu;
- `FLIP_SHORT_EDGE`: odbicie względem osi prostopadłej do krótkiej krawędzi;
- `back_rotation_deg` jest stosowane po odbiciu;
- transformacja musi mapować rewers na ten sam fizyczny wycięty użytek co front;
- test referencyjny ma oznaczać cztery narożniki każdego slotu i potwierdzać ich zgodność po fizycznym obrocie.

Kontrakt nie używa niejednoznacznych określeń „mirror horizontally” bez zdefiniowania układu współrzędnych i sposobu prowadzenia arkusza.

## 9. Determinizm i kanonizacja

1. Wejście jest normalizowane przez `priority`, pierwotny indeks wejścia i `item_id`.
2. Kandydaci układu są porównywani kolejno przez: liczbę arkuszy, odpad, liczbę cięć, indeks wejścia, `item_id`, `y`, `x`, obrót (`0` przed `90`).
3. Brak losowości i solverów wielowątkowych z niedeterministycznym limitem czasu w ścieżce v1.
4. Arytmetyka geometrii jest całkowita. Dzielenie zaokrągla się wyłącznie według jawnej reguły danego pola.
5. JSON do fingerprintu używa UTF-8, kluczy obiektów sortowanych leksykograficznie, tablic w kolejności kontraktowej i bez białych znaków.
6. Z fingerprintu wyłącza się tylko `plan_fingerprint`. Czas wykonania, timestampy, URL-e i losowe ID nie występują w planie.

Minimalizacja dotyczy deterministycznego zbioru kandydatów rozpatrywanych przez `avanti-rect-v1`; v1 nie deklaruje matematycznego optimum globalnego dla problemu NP-trudnego.

## 10. Kryteria akceptacji implementacji

- 100 powtórzeń każdego fixture daje ten sam fingerprint i identyczny JSON.
- Każdy placement mieści się w printable box; dowolna para footprintów nie nachodzi na siebie.
- Bilans dla każdego itemu: `planned_good = requested + overrun` i zgadza się z patternami oraz `repeat_count`.
- Element większy od printable box zwraca `ITEM_DOES_NOT_FIT`.
- Zamiana kolejności niepowiązanych pól JSON nie zmienia planu.
- Tie-breaker daje ten sam wynik na Node 20/22 i co najmniej Windows/Linux.
- Testy złote obejmują: 1-up, obrót 90°, ostatni częściowy arkusz, mieszane formaty N-up, kilka nakładów, simplex, oba tryby duplex, cut-and-stack oraz brak wykonalnego układu.
- Testy własnościowe obejmują granice, kolizje, bilans nakładu i parowanie front/rewers.
- Planer nie importuje `next`, `firebase`, `pdf-lib`, klientów HTTP ani modułu store.
- Renderer otrzymuje wyłącznie plan i resolver `source_ref`; nie przelicza pozycji ani permutacji.

## 11. Proponowana struktura implementacji

```text
packages/imposition-core/
  src/
    contract.ts          # typy bez zależności frameworkowych
    validate.ts          # walidacja domenowa
    canonicalize.ts      # stabilny JSON i fingerprint
    geometry.ts          # prostokąty, rotacje, transformacje dupleksu
    planners/
      n-up.ts
      cut-and-stack.ts
    finishing/
      guillotine.ts
    metrics.ts
    index.ts             # jedyny publiczny punkt wejścia
  test/
    fixtures/
    golden/
    properties/
```

Rdzeń powinien początkowo mieć zero zależności runtime. Zod może pozostać w adapterze HTTP; jeśli walidacja runtime ma należeć do pakietu, jej wynik musi być mapowany na stabilne kody `PlanIssueV1`.

## 12. Zakres pierwszej implementacji po akceptacji

1. Wydzielenie `packages/imposition-core` bez zmiany publicznego API AvantiD.
2. Implementacja kontraktu, kanonizacji, geometrii i walidacji.
3. Deterministyczny prostokątny N-up dla formatów mieszanych oraz poprawny bilans patternów/nakładów.
4. Cut-and-stack dla jednorodnego footprintu.
5. Jawne transformacje simplex/duplex.
6. Plan cięcia gilotynowego albo jawny błąd wykonalności.
7. Testy złote i własnościowe.
8. Adapter zgodności mapujący obecny `ImpositionJobPayload` na v1 i v1 na obecny renderer. Firestore/API/PDF pozostają poza rdzeniem.

Po tej migracji stary `runInternalLayoutEngine` może zostać usunięty dopiero po testach porównawczych i przełączeniu wszystkich wywołań na adapter.
