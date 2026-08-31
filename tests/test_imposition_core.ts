import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson, planImposition, sha256Hex, type PlanRequestV1 } from '../packages/imposition-core/src';

const baseRequest = (overrides: Partial<PlanRequestV1> = {}): PlanRequestV1 => ({
  contract_version: '1.0',
  algorithm: {
    name: 'avanti-rect-v1',
    objective: 'MIN_SHEETS_THEN_WASTE_THEN_CUTS',
    tie_break: 'INPUT_ORDER_THEN_ITEM_ID_THEN_Y_THEN_X_THEN_ROTATION',
  },
  workflow: { kind: 'N_UP' },
  sheet: {
    width_um: 320_000,
    height_um: 220_000,
    printable_insets_um: { top: 10_000, right: 10_000, bottom: 10_000, left: 10_000 },
    gripper_edge: 'NONE',
  },
  spacing: { horizontal_um: 5_000, vertical_um: 5_000 },
  duplex: { mode: 'DUPLEX', tumble: 'FLIP_SHORT_EDGE', back_rotation_deg: 0 },
  items: [{
    item_id: 'A', source_ref: 'asset:A', quantity: 17,
    trim: { width_um: 90_000, height_um: 50_000 },
    bleed_um: { top: 3_000, right: 3_000, bottom: 3_000, left: 3_000 },
    allowed_rotations_deg: [0, 90], priority: 0,
    sides: { kind: 'PAIRED', front_page: 1, back_page: 2 },
  }],
  ...overrides,
});

function assertGeometry(request: PlanRequestV1) {
  const response = planImposition(request);
  assert.equal(response.ok, true);
  if (!response.ok) return;
  for (const pattern of response.plan.patterns) {
    const box = pattern.sheet.printable_box;
    for (const placement of pattern.placements) {
      const p = placement.footprint_box;
      assert.ok(p.x_um >= box.x_um && p.y_um >= box.y_um);
      assert.ok(p.x_um + p.width_um <= box.x_um + box.width_um);
      assert.ok(p.y_um + p.height_um <= box.y_um + box.height_um);
    }
    for (let i = 0; i < pattern.placements.length; i++) for (let j = i + 1; j < pattern.placements.length; j++) {
      const a = pattern.placements[i].footprint_box, b = pattern.placements[j].footprint_box;
      const overlaps = a.x_um < b.x_um + b.width_um && a.x_um + a.width_um > b.x_um && a.y_um < b.y_um + b.height_um && a.y_um + a.height_um > b.y_um;
      assert.equal(overlaps, false, `placements ${i} and ${j} overlap`);
    }
  }
}

describe('deterministic imposition core v1', () => {
  it('implements canonical JSON and SHA-256 without platform dependencies', () => {
    assert.equal(canonicalJson({ z: 1, a: [true, null] }), '{"a":[true,null],"z":1}');
    assert.equal(sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('returns byte-identical output and fingerprint across repeated runs', () => {
    const request = baseRequest();
    const first = planImposition(request);
    assert.equal(first.ok, true);
    const serialized = canonicalJson(first);
    for (let i = 0; i < 100; i++) assert.equal(canonicalJson(planImposition(request)), serialized);
  });

  it('packs mixed formats without overlap and preserves exact quantities', () => {
    const request = baseRequest({
      items: [
        ...baseRequest().items,
        {
          item_id: 'B', source_ref: 'asset:B', quantity: 9,
          trim: { width_um: 60_000, height_um: 60_000 },
          bleed_um: { top: 2_000, right: 2_000, bottom: 2_000, left: 2_000 },
          allowed_rotations_deg: [0, 90], priority: 1,
          sides: { kind: 'PAIRED', front_page: 1, back_page: 2 },
        },
      ],
    });
    assertGeometry(request);
    const response = planImposition(request);
    assert.equal(response.ok, true);
    if (response.ok) assert.deepEqual(response.plan.item_totals, [
      { item_id: 'A', requested: 17, planned_good: 17, overrun: 0 },
      { item_id: 'B', requested: 9, planned_good: 9, overrun: 0 },
    ]);
  });

  it('rejects an item that cannot fit instead of producing a negative offset', () => {
    const request = baseRequest();
    request.items[0].trim = { width_um: 500_000, height_um: 500_000 };
    const response = planImposition(request);
    assert.equal(response.ok, false);
    if (!response.ok) assert.equal(response.errors[0].code, 'ITEM_DOES_NOT_FIT');
  });

  it('encodes the duplex back transform in the plan', () => {
    for (const tumble of ['FLIP_SHORT_EDGE', 'FLIP_LONG_EDGE'] as const) {
      const request = baseRequest({
        duplex: { mode: 'DUPLEX', tumble, back_rotation_deg: 0 },
        items: [{ ...baseRequest().items[0], quantity: 1, allowed_rotations_deg: [0] }],
      });
      const response = planImposition(request);
      assert.equal(response.ok, true);
      if (!response.ok) continue;
      const placement = response.plan.patterns[0].placements[0];
      assert.ok(placement.front);
      assert.ok(placement.back);
      assert.notDeepEqual(placement.front?.transform, placement.back?.transform);
      assert.equal(placement.back?.page, 2);
      if (tumble === 'FLIP_SHORT_EDGE') {
        assert.equal(placement.back?.transform.tx_um, request.sheet.width_um - placement.footprint_box.x_um - placement.footprint_box.width_um);
        assert.equal(placement.back?.transform.ty_um, placement.footprint_box.y_um);
      } else {
        assert.equal(placement.back?.transform.tx_um, placement.footprint_box.x_um);
        assert.equal(placement.back?.transform.ty_um, request.sheet.height_um - placement.footprint_box.y_um - placement.footprint_box.height_um);
      }
    }
  });

  it('maintains geometry and quantity invariants over generated cases', () => {
    let state = 0x12345678;
    const next = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0);
    for (let sample = 0; sample < 40; sample++) {
      const itemCount = 1 + next() % 4;
      const items = Array.from({ length: itemCount }, (_, index) => ({
        item_id: `P${index}`,
        source_ref: `asset:P${index}`,
        quantity: 1 + next() % 50,
        trim: { width_um: 20_000 + next() % 80_000, height_um: 20_000 + next() % 80_000 },
        bleed_um: { top: 2_000, right: 2_000, bottom: 2_000, left: 2_000 },
        allowed_rotations_deg: [0, 90] as (0 | 90)[],
        priority: index,
        sides: { kind: 'PAIRED' as const, front_page: 1, back_page: 2 },
      }));
      const request = baseRequest({ items });
      assertGeometry(request);
      const response = planImposition(request);
      assert.equal(response.ok, true);
      if (response.ok) response.plan.item_totals.forEach((total) => {
        assert.equal(total.planned_good, total.requested);
        assert.equal(total.overrun, 0);
      });
    }
  });

  it('produces cut-and-stack columns whose stacked copies are sequential', () => {
    const request = baseRequest({
      workflow: { kind: 'CUT_AND_STACK', stack_order: 'ROW_MAJOR', pad_last_stack: true },
      sheet: {
        width_um: 220_000,
        height_um: 220_000,
        printable_insets_um: { top: 10_000, right: 10_000, bottom: 10_000, left: 10_000 },
        gripper_edge: 'NONE',
      },
      duplex: { mode: 'SIMPLEX' },
      spacing: { horizontal_um: 0, vertical_um: 0 },
      items: [{
        item_id: 'SEQ', source_ref: 'asset:seq', quantity: 10,
        trim: { width_um: 100_000, height_um: 100_000 },
        bleed_um: { top: 0, right: 0, bottom: 0, left: 0 },
        allowed_rotations_deg: [0], priority: 0,
        sides: { kind: 'SINGLE', front_page: 1 },
      }],
    });
    assertGeometry(request);
    const response = planImposition(request);
    assert.equal(response.ok, true);
    if (!response.ok) return;
    const stacks = new Map<number, number[]>();
    for (const pattern of response.plan.patterns) for (let repeat = 0; repeat < pattern.repeat_count; repeat++) {
      for (const placement of pattern.placements) {
        if (placement.slot_kind !== 'PRODUCT') continue;
        const values = stacks.get(placement.stack_index!) ?? [];
        values.push(placement.copy!.first + repeat * placement.copy!.increment_per_repeat);
        stacks.set(placement.stack_index!, values);
      }
    }
    const stacked = [...stacks.entries()].sort((a, b) => a[0] - b[0]).flatMap(([, copies]) => copies);
    assert.deepEqual(stacked, [1,2,3,4,5,6,7,8,9,10]);
    assert.equal(response.plan.totals.physical_sheets, 3);
  });
});
