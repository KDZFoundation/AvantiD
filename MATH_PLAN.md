# Specyfikacja Matematyczna i Algorytmiczna Silnika Impozycji (POD Imposition Engine)

Dokument zawiera kompletny zestaw wzorów matematycznych, definicji geometrii oraz algorytmów układania użytków (ganging i cut-and-stack), opracowany na podstawie standardów poligraficznych ISO 15930 (PDF/X), wytycznych Callas Software / pdfimpose (z serwera Context7) oraz najlepszych praktyk inżynierii druku POD (Print on Demand).

---

## 1. Wymiary Użytku Brutto i Spady (Bleed Box Calculation)

Każdy zamawiany produkt charakteryzuje się wymiarem netto (po obcięciu) $W_{\text{trim}} \times H_{\text{trim}}$ oraz spadkiem drukarskim $b$ (rozszerzeniem tła dla noża gilotyny).

### 1.1 Wymiary Brutto (Z Uwzględnieniem Spadów)
Dla kąta obrotu $\theta = 0^\circ$:
$$W_{\text{gross}} = W_{\text{trim}} + 2 \cdot b$$
$$H_{\text{gross}} = H_{\text{trim}} + 2 \cdot b$$

Dla kąta obrotu $\theta = 90^\circ$:
$$W_{\text{gross}, 90} = H_{\text{trim}} + 2 \cdot b$$
$$H_{\text{gross}, 90} = W_{\text{trim}} + 2 \cdot b$$

---

## 2. Obszar Drukowalny Arkusza i Margines Łapki (Gripper Margin & Printable Area)

Arkusz papieru o wymiarach $W_{\text{sheet}} \times H_{\text{sheet}}$ posiada:
- Margines boczny/ochronny: $m$ (zazwyczaj $5.0 \text{ mm}$)
- Margines łapki maszyny drukarskiej (Gripper Edge Margin): $m_{\text{gripper}}$ (zazwyczaj $10.0\text{--}12.0 \text{ mm}$ przy dolnej krawędzi arkusza $y = 0$)
- Szczelinę rozcinkową między użytkami (Gutter / Inter-item Gap): $g$ (dla noża podwójnego $g \ge 2 \cdot b$, np. $6.0 \text{ mm}$; dla wspólnej linii cięcia $g = 0$)

### 2.1 Granice Obszaru Drukowalnego (Printable Bounds)
Przy założeniu łapki maszyny na dolnej krawędzi ($y \in [0, m_{\text{gripper}}]$):
$$X_{\text{min}} = m, \quad X_{\text{max}} = W_{\text{sheet}} - m$$
$$Y_{\text{min}} = m_{\text{gripper}}, \quad Y_{\text{max}} = H_{\text{sheet}} - m$$

Szerokość i wysokość obszaru drukowalnego:
$$W_{\text{printable}} = X_{\text{max}} - X_{\text{min}} = W_{\text{sheet}} - 2 \cdot m$$
$$H_{\text{printable}} = Y_{\text{max}} - Y_{\text{min}} = H_{\text{sheet}} - m - m_{\text{gripper}}$$

---

## 3. Optymalizacja Orientacji (0° vs 90°) i Wymiarów Siatki (Grid Optimization)

W celu maksymalizacji liczby użytków na pojedynczym arkuszu, silnik wyznacza pojemność siatki dla obu orientacji.

### 3.1 Liczba Kolumn i Wierszy dla Orientacji 0°
$$N_{\text{cols}, 0} = \max\left(1, \left\lfloor \frac{W_{\text{printable}} + g}{W_{\text{gross}} + g} \right\rfloor\right)$$
$$N_{\text{rows}, 0} = \max\left(1, \left\lfloor \frac{H_{\text{printable}} + g}{H_{\text{gross}} + g} \right\rfloor\right)$$
$$N_{\text{total}, 0} = N_{\text{cols}, 0} \cdot N_{\text{rows}, 0}$$

### 3.2 Liczba Kolumn i Wierszy dla Orientacji 90°
$$N_{\text{cols}, 90} = \max\left(1, \left\lfloor \frac{W_{\text{printable}} + g}{W_{\text{gross}, 90} + g} \right\rfloor\right)$$
$$N_{\text{rows}, 90} = \max\left(1, \left\lfloor \frac{H_{\text{printable}} + g}{H_{\text{gross}, 90} + g} \right\rfloor\right)$$
$$N_{\text{total}, 90} = N_{\text{cols}, 90} \cdot N_{\text{rows}, 90}$$

### 3.3 Kryterium Wyboru Orientacji
$$\theta_{\text{best}} = \begin{cases} 90^\circ & \text{jeśli } N_{\text{total}, 90} > N_{\text{total}, 0} \\ 0^\circ & \text{w przeciwnym wypadku} \end{cases}$$

Oznaczmy wybrane wartości jako $N_{\text{cols}}$, $N_{\text{rows}}$, $W_{\text{item\_total}}$, $H_{\text{item\_total}}$.

---

## 4. Wyśrodkowanie Siatki na Arkuszu (Grid Bounding Box & Centering Offsets)

Całkowite wymiary zajmowane przez siatkę użytków wynosić będą:
$$W_{\text{grid}} = N_{\text{cols}} \cdot W_{\text{item\_total}} + (N_{\text{cols}} - 1) \cdot g$$
$$H_{\text{grid}} = N_{\text{rows}} \cdot H_{\text{item\_total}} + (N_{\text{rows}} - 1) \cdot g$$

Wyśrodkowanie wewnątrz obszaru drukowalnego z zachowaniem marginesu łapki:
$$X_{\text{offset}} = \text{round}\left(X_{\text{min}} + \frac{W_{\text{printable}} - W_{\text{grid}}}{2}, 2\right)$$
$$Y_{\text{offset}} = \text{round}\left(Y_{\text{min}} + \frac{H_{\text{printable}} - H_{\text{grid}}}{2}, 2\right)$$

---

## 5. Precyzyjne Współrzędne Slotów: Bleed Box i Trim Box

Dla użytku zlokalizowanego w kolumnie $c \in [0, N_{\text{cols}} - 1]$ oraz wierszu $r \in [0, N_{\text{rows}} - 1]$:

### 5.1 Współrzędne Bleed Box (Brutto)
$$x_{1, \text{bleed}} = X_{\text{offset}} + c \cdot (W_{\text{item\_total}} + g)$$
$$y_{1, \text{bleed}} = Y_{\text{offset}} + r \cdot (H_{\text{item\_total}} + g)$$
$$x_{2, \text{bleed}} = x_{1, \text{bleed}} + W_{\text{item\_total}}$$
$$y_{2, \text{bleed}} = y_{1, \text{bleed}} + H_{\text{item\_total}}$$

### 5.2 Współrzędne Trim Box (Netto po Obcięciu)
$$x_{1, \text{trim}} = x_{1, \text{bleed}} + b$$
$$y_{1, \text{trim}} = y_{1, \text{bleed}} + b$$
$$x_{2, \text{trim}} = x_{2, \text{bleed}} - b$$
$$y_{2, \text{trim}} = y_{2, \text{bleed}} - b$$

---

## 6. Linie Cięcia Gilotynowego (Guillotine Cut Line Formulas)

Gilotyna jednonożowa realizuje cięcia przelotowe (edge-to-edge). Linie cięcia netto (Trim Marks) wyznaczane są precyzyjnie na krawędziach **Trim Boxa** (a nie zewnętrznej ramki spadowej Bleed Box), aby wyeliminować pozostawianie marginesu spadu po obcięciu:

- **Cięcia poziome (Horizontal Cuts):**
  $$y \in \{ y_{1, \text{trim}}^{(i)}, y_{2, \text{trim}}^{(i)} \} \quad \text{dla wszystkich użytków } i$$
  Wektor cięcia: od $(0, y)$ do $(W_{\text{sheet}}, y)$.

- **Cięcia pionowe (Vertical Cuts):**
  $$x \in \{ x_{1, \text{trim}}^{(i)}, x_{2, \text{trim}}^{(i)} \} \quad \text{dla wszystkich użytków } i$$
  Wektor cięcia: od $(x, 0)$ do $(x, H_{\text{sheet}})$.

---

## 7. Model Ganging Workflow (Combo-Run Ratio Balancing)

W procesie łączonego druku wielozleceniowego (Ganging / Combo-Run) na arkuszu matce rozmieszczane są różne zamówienia $k \in \{1, \dots, K\}$ o nakładach $Q_1, Q_2, \dots, Q_K$.

### 7.1 Przydział Slotów na Arkuszu
Niech $S_k$ będzie liczbą slotów typu `PRODUCT` przydzielonych dla zamówienia $k$ na arkuszu matce.

Wymagana liczba przelotów maszyny (nakład arkuszy matek):
$$R_{\text{runs}} = \max_{k \in \{1, \dots, K\}} \left( \left\lceil \frac{Q_k}{S_k} \right\rceil \right)$$

Łączna liczba wyprodukowanych egzemplarzy dla zamówienia $k$:
$$P_k = S_k \cdot R_{\text{runs}}$$

Nadprodukcja (Overprint):
$$O_k = P_k - Q_k$$

---

## 8. Model Cut & Stack Workflow (Multi-Up Sequence Stacking)

Dla prac wielostronicowych (książki, bilety, kalendarze), użytki układa się w sekwencję głęboką (Vertical Column Stacking).

Niech $N_{\text{stream}}$ oznacza całkowitą liczbę elementów w strumieniu produkcyjnym (wliczając karty okładkowe STACK COVER oraz separatory WASTE SLOT).

Głębokość stosu arkuszy (Stack Depth / Number of Sheets):
$$D_{\text{stack}} = \left\lceil \frac{N_{\text{stream}}}{N_{\text{slots}}} \right\rceil$$

Indeks elementu ze strumienia produkcyjnego $I_{\text{stream}} \in [0, N_{\text{stream}} - 1]$ przypisany do slotu $s \in [0, N_{\text{slots}} - 1]$ na arkuszu $p \in [0, D_{\text{stack}} - 1]$:
$$I_{\text{stream}}(s, p) = s \cdot D_{\text{stack}} + p$$

Po pocięciu stosu arkuszy gilotyną, nałożenie słupków $s = 0, 1, \dots, N_{\text{slots}}-1$ na siebie daje idealnie posortowany ciąg od $0$ do $N_{\text{stream}}-1$.

---

## 9. Wskaźniki Wydajności Materiałowej (Yield & Waste Calculations)

Powierzchnie przeliczane są na metry kwadratowe ($\text{m}^2$):

1. **Powierzchnia arkusza surowego:**
   $$A_{\text{sheet}} = \frac{W_{\text{sheet}} \cdot H_{\text{sheet}}}{1\,000\,000} \quad [\text{m}^2]$$

2. **Powierzchnia netto pojedynczego użytku $i$:**
   $$A_{\text{net}, i} = \frac{W_{\text{trim}, i} \cdot H_{\text{trim}, i}}{1\,000\,000} \quad [\text{m}^2]$$

3. **Wykorzystana powierzchnia netto na jednym arkuszu:**
   $$A_{\text{used\_sheet}} = \sum_{i \in \text{PRODUCT}} A_{\text{net}, i} \quad [\text{m}^2]$$

4. **Łączna powierzchnia netto wykorzystana w całym nakładzie:**
   $$A_{\text{total\_used}} = A_{\text{used\_sheet}} \cdot R_{\text{runs}} \quad [\text{m}^2]$$

5. **Łączna powierzchnia odpadu surowca w całym nakładzie:**
   $$A_{\text{total\_waste}} = (A_{\text{sheet}} - A_{\text{used\_sheet}}) \cdot R_{\text{runs}} \quad [\text{m}^2]$$

6. **Procentowy uzysk materiałowy (Net Yield Percentage):**
   $$Y_{\text{pct}} = \text{round}\left(\frac{A_{\text{used\_sheet}}}{A_{\text{sheet}}} \cdot 100\%, 1\right)$$

7. **Procentowy odpad surowca (Waste Percentage):**
   $$W_{\text{pct}} = 100\% - Y_{\text{pct}}$$

---
