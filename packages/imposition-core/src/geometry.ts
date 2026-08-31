import type { PlanRequestV1, RectV1, Rotation, SurfacePlacementV1 } from './contract';

export function orientedSize(item: PlanRequestV1['items'][number], rotation: Rotation) {
  const width = item.trim.width_um + item.bleed_um.left + item.bleed_um.right;
  const height = item.trim.height_um + item.bleed_um.top + item.bleed_um.bottom;
  return rotation === 0 ? { width, height } : { width: height, height: width };
}

export function printableBox(request: PlanRequestV1): RectV1 {
  const i = request.sheet.printable_insets_um;
  return {
    x_um: i.left,
    y_um: i.top,
    width_um: request.sheet.width_um - i.left - i.right,
    height_um: request.sheet.height_um - i.top - i.bottom,
  };
}

export function trimBox(item: PlanRequestV1['items'][number], footprint: RectV1, rotation: Rotation): RectV1 {
  if (rotation === 0) return {
    x_um: footprint.x_um + item.bleed_um.left,
    y_um: footprint.y_um + item.bleed_um.top,
    width_um: item.trim.width_um,
    height_um: item.trim.height_um,
  };
  return {
    x_um: footprint.x_um + item.bleed_um.bottom,
    y_um: footprint.y_um + item.bleed_um.left,
    width_um: item.trim.height_um,
    height_um: item.trim.width_um,
  };
}

export function surfacePlacement(
  request: PlanRequestV1,
  footprint: RectV1,
  rotation: Rotation,
  page: number,
  back: boolean,
): SurfacePlacementV1 {
  let x = footprint.x_um;
  let y = footprint.y_um;
  const w = footprint.width_um;
  const h = footprint.height_um;
  let extra180 = false;
  if (back && request.duplex.mode === 'DUPLEX') {
    const landscape = request.sheet.width_um >= request.sheet.height_um;
    const mirrorY = request.duplex.tumble === 'FLIP_LONG_EDGE' ? landscape : !landscape;
    if (mirrorY) y = request.sheet.height_um - y - h;
    else x = request.sheet.width_um - x - w;
    extra180 = request.duplex.back_rotation_deg === 180;
  }
  if (rotation === 0 && !extra180) return { page, transform: { a: 1, b: 0, c: 0, d: 1, tx_um: x, ty_um: y } };
  if (rotation === 90 && !extra180) return { page, transform: { a: 0, b: 1, c: -1, d: 0, tx_um: x + w, ty_um: y } };
  if (rotation === 0) return { page, transform: { a: -1, b: 0, c: 0, d: -1, tx_um: x + w, ty_um: y + h } };
  return { page, transform: { a: 0, b: -1, c: 1, d: 0, tx_um: x, ty_um: y + h } };
}

