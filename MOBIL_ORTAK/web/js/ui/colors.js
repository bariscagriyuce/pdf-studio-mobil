// Motor rengi ([r, g, b], 0..1) → CSS rengi
export function cssColorOf(c, alpha = 1) {
  if (!c || !c.length) return "none";
  const v = c.length === 1 ? [c[0], c[0], c[0]] : c.slice(0, 3);
  return `rgba(${v.map((x) => Math.round(x * 255)).join(",")},${alpha})`;
}
