import { it } from 'vitest'
import { buildRoadNetwork, descentLength, hairpinApexes } from '../../src/world/roadNetwork'

it('road stats', () => {
  const net = buildRoadNetwork()
  const rows: string[] = []
  for (const e of net.edges) {
    let maxG = 0
    for (let i = 1; i < e.points.length; i++) {
      const dh = Math.abs(e.points[i].y - e.points[i - 1].y)
      const dd = e.dist[i] - e.dist[i - 1]
      maxG = Math.max(maxG, dh / dd)
    }
    const minR = Math.min(...e.radius.map(Math.abs))
    rows.push(`${e.id.padEnd(14)} len=${e.length.toFixed(0).padStart(5)} grade=${(maxG * 100).toFixed(1)}% minR=${minR.toFixed(1)} hairpins=${hairpinApexes(e).length}`)
  }
  for (const r of ['automation', 'platform', 'systems'] as const) rows.push(`descent ${r}: ${descentLength(net, r).toFixed(0)} m`)
  console.log(rows.join('\n'))
})
