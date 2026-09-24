// Dikdörtgen / nokta / dörtgen yardımcıları. Tüm koordinatlar sayfanın
// görüntülenen uzayındadır (sol üst köşe 0,0; y aşağı doğru artar; birim nokta).

export function rect(x0, y0, x1, y1) {
  return [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)];
}

export function norm(r) {
  return rect(r[0], r[1], r[2], r[3]);
}

export const width = (r) => r[2] - r[0];
export const height = (r) => r[3] - r[1];
export const area = (r) => Math.max(0, width(r)) * Math.max(0, height(r));

export function isEmpty(r) {
  return !r || r[2] <= r[0] || r[3] <= r[1];
}

export function contains(r, p) {
  return p[0] >= r[0] && p[0] <= r[2] && p[1] >= r[1] && p[1] <= r[3];
}

export function intersect(a, b) {
  return [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
}

export function intersects(a, b) {
  return !isEmpty(intersect(a, b));
}

export function union(a, b) {
  if (!a) return b ? b.slice() : null;
  if (!b) return a.slice();
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}

export function inflate(r, d) {
  return [r[0] - d, r[1] - d, r[2] + d, r[3] + d];
}

export function offset(r, dx, dy) {
  return [r[0] + dx, r[1] + dy, r[2] + dx, r[3] + dy];
}

export function quadToRect(q) {
  const xs = [q[0], q[2], q[4], q[6]];
  const ys = [q[1], q[3], q[5], q[7]];
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

export function rectToQuad(r) {
  // mupdf sırası: ul, ur, ll, lr
  return [r[0], r[1], r[2], r[1], r[0], r[3], r[2], r[3]];
}

export function center(r) {
  return [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2];
}

export function transformPoint(p, m) {
  return [p[0] * m[0] + p[1] * m[2] + m[4], p[0] * m[1] + p[1] * m[3] + m[5]];
}

export function transformRect(r, m) {
  const pts = [
    transformPoint([r[0], r[1]], m), transformPoint([r[2], r[1]], m),
    transformPoint([r[0], r[3]], m), transformPoint([r[2], r[3]], m),
  ];
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

export function concat(a, b) {
  return [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4],
    a[4] * b[1] + a[5] * b[3] + b[5],
  ];
}

export function invert(m) {
  const det = m[0] * m[3] - m[1] * m[2];
  if (!det) return [1, 0, 0, 1, 0, 0];
  const a = m[3] / det, b = -m[1] / det, c = -m[2] / det, d = m[0] / det;
  return [a, b, c, d, -m[4] * a - m[5] * c, -m[4] * b - m[5] * d];
}

export function rotation(deg) {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r), s = Math.sin(r);
  return [c, s, -s, c, 0, 0];
}

/** Bir dikdörtgeni diğerinin içine oranı koruyarak ortalar. */
export function fitInside(inner, box) {
  const iw = inner[0], ih = inner[1];
  const bw = width(box), bh = height(box);
  if (iw <= 0 || ih <= 0) return box.slice();
  const s = Math.min(bw / iw, bh / ih);
  const w = iw * s, h = ih * s;
  const x = box[0] + (bw - w) / 2, y = box[1] + (bh - h) / 2;
  return [x, y, x + w, y + h];
}

/** Bir noktayı eski dikdörtgenden yenisine orantılı taşır (yeniden boyutlandırma). */
export function mapPoint(p, from, to) {
  const sx = width(from) ? width(to) / width(from) : 1;
  const sy = height(from) ? height(to) / height(from) : 1;
  return [to[0] + (p[0] - from[0]) * sx, to[1] + (p[1] - from[1]) * sy];
}

export const round = (v, n = 2) => Math.round(v * 10 ** n) / 10 ** n;
