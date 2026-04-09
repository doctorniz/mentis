/**
 * Convert Fabric.js simplified path commands (canvas space, zoomed) to PDF-space points.
 * Fabric's pencil often emits M/L but can emit Q/C after simplification; the old
 * seg[1]/seg[2] mapping dropped curve endpoints so pdf-lib wrote zero line segments.
 */
export function fabricPathCommandsToPdfPoints(
  segments: ReadonlyArray<ReadonlyArray<string | number>>,
  zoom: number,
): { x: number; y: number }[] {
  const z = zoom || 1
  const out: { x: number; y: number }[] = []
  let curX = 0
  let curY = 0
  let subStartX = 0
  let subStartY = 0

  const push = (x: number, y: number) => {
    out.push({ x: x / z, y: y / z })
  }

  for (const seg of segments) {
    const cmd = String(seg[0])
    if (cmd === 'M') {
      curX = Number(seg[1])
      curY = Number(seg[2])
      subStartX = curX
      subStartY = curY
      push(curX, curY)
    } else if (cmd === 'L') {
      curX = Number(seg[1])
      curY = Number(seg[2])
      push(curX, curY)
    } else if (cmd === 'Q') {
      const x1 = Number(seg[1])
      const y1 = Number(seg[2])
      const x2 = Number(seg[3])
      const y2 = Number(seg[4])
      const steps = 8
      for (let i = 1; i <= steps; i++) {
        const t = i / steps
        const mt = 1 - t
        const x = mt * mt * curX + 2 * mt * t * x1 + t * t * x2
        const y = mt * mt * curY + 2 * mt * t * y1 + t * t * y2
        push(x, y)
      }
      curX = x2
      curY = y2
    } else if (cmd === 'C') {
      const x1 = Number(seg[1])
      const y1 = Number(seg[2])
      const x2 = Number(seg[3])
      const y2 = Number(seg[4])
      const x3 = Number(seg[5])
      const y3 = Number(seg[6])
      const steps = 12
      for (let i = 1; i <= steps; i++) {
        const t = i / steps
        const mt = 1 - t
        const x =
          mt * mt * mt * curX +
          3 * mt * mt * t * x1 +
          3 * mt * t * t * x2 +
          t * t * t * x3
        const y =
          mt * mt * mt * curY +
          3 * mt * mt * t * y1 +
          3 * mt * t * t * y2 +
          t * t * t * y3
        push(x, y)
      }
      curX = x3
      curY = y3
    } else if (cmd === 'Z' || cmd === 'z') {
      if (out.length > 0 && (curX !== subStartX || curY !== subStartY)) {
        push(subStartX, subStartY)
      }
      curX = subStartX
      curY = subStartY
    }
  }

  return out
}
