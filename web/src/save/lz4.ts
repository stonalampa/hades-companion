/**
 * LZ4 block decompression (no frame header), as used for the Lua state in
 * Hades save files. Grows the output as needed; the save doesn't store the size.
 */
export function lz4Block(src: Uint8Array): Uint8Array {
  let out = new Uint8Array(Math.max(src.length * 6, 1024))
  let o = 0
  const ensure = (n: number) => {
    if (o + n <= out.length) return
    const bigger = new Uint8Array(Math.max(out.length * 2, o + n))
    bigger.set(out.subarray(0, o))
    out = bigger
  }
  const length = (base: number, i: number): [number, number] => {
    let n = base
    if (base === 15) {
      let b: number
      do {
        b = src[i++]
        n += b
      } while (b === 255)
    }
    return [n, i]
  }

  let i = 0
  while (i < src.length) {
    const token = src[i++]
    let lit: number
    ;[lit, i] = length(token >> 4, i)
    ensure(lit)
    out.set(src.subarray(i, i + lit), o)
    o += lit
    i += lit
    if (i >= src.length) break // last sequence has literals only
    const offset = src[i] | (src[i + 1] << 8)
    i += 2
    if (offset === 0 || offset > o) throw new Error('lz4: bad offset')
    let match: number
    ;[match, i] = length(token & 15, i)
    match += 4
    ensure(match)
    // Byte by byte: matches may overlap their own output.
    for (let k = 0, from = o - offset; k < match; k++) out[o++] = out[from + k]
  }
  return out.subarray(0, o)
}
