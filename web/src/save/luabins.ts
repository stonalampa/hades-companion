/**
 * Decoder for luabins, the Lua value serialisation in Hades save files.
 * Tags: '-' nil, '0' false, '1' true, 'N' double, 'S' string (u32 length),
 * 'T' table (i32 array size, i32 hash size, then that many key/value pairs).
 * Tables become plain objects; number keys become strings ("1", "2.5").
 */
export type LuaValue = null | boolean | number | string | LuaTable
export interface LuaTable {
  [key: string]: LuaValue
}

export function decodeLuabins(buf: Uint8Array): LuaValue[] {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const utf8 = new TextDecoder()
  let p = 0

  const value = (): LuaValue => {
    const tag = buf[p++]
    switch (tag) {
      case 0x2d: // '-'
        return null
      case 0x30: // '0'
        return false
      case 0x31: // '1'
        return true
      case 0x4e: {
        // 'N'
        const n = view.getFloat64(p, true)
        p += 8
        return n
      }
      case 0x53: {
        // 'S'
        const len = view.getUint32(p, true)
        p += 4
        const s = utf8.decode(buf.subarray(p, p + len))
        p += len
        return s
      }
      case 0x54: {
        // 'T'
        const n = view.getInt32(p, true) + view.getInt32(p + 4, true)
        p += 8
        const t: LuaTable = {}
        for (let i = 0; i < n; i++) {
          const k = value()
          t[String(k)] = value()
        }
        return t
      }
      default:
        throw new Error(`luabins: unknown tag 0x${tag?.toString(16)} at ${p - 1}`)
    }
  }

  const count = buf[p++]
  const out: LuaValue[] = []
  for (let i = 0; i < count; i++) out.push(value())
  if (p !== buf.length) throw new Error(`luabins: ${buf.length - p} trailing bytes`)
  return out
}
