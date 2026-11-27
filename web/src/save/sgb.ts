import { decodeLuabins, type LuaTable } from './luabins'
import { lz4Block } from './lz4'

/** Hades I save header (Profile1.sav), little-endian, strings with u32 length. */
export interface SaveHeader {
  version: number
  /** Unix seconds. */
  timestamp: number
  location: string
  runs: number
  metaPoints: number
  shrinePoints: number
  godMode: boolean
  hellMode: boolean
}

/** Reads an "SGB1" save: header, then the LZ4-compressed luabins Lua state. */
export function readSave(bytes: Uint8Array): { header: SaveHeader; lua: LuaTable } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const utf8 = new TextDecoder()
  if (utf8.decode(bytes.subarray(0, 4)) !== 'SGB1') throw new Error('Not a Hades save file (no SGB1 signature)')
  let p = 8 // signature + checksum
  const u32 = () => {
    const v = view.getUint32(p, true)
    p += 4
    return v
  }
  const str = () => {
    const n = u32()
    const s = utf8.decode(bytes.subarray(p, p + n))
    p += n
    return s
  }
  const version = u32()
  if (version < 16) throw new Error(`Unsupported save version ${version}`)
  const timestamp = Number(view.getBigUint64(p, true))
  p += 8
  const location = str()
  const runs = u32()
  const metaPoints = u32()
  const shrinePoints = u32()
  const godMode = bytes[p++] !== 0
  const hellMode = bytes[p++] !== 0
  const keys = u32()
  for (let i = 0; i < keys; i++) str() // Lua keys (selected Mirror talents etc.), unused
  str() // current map
  str() // next map
  const size = u32()
  const [lua] = decodeLuabins(lz4Block(bytes.subarray(p, p + size)))
  if (!lua || typeof lua !== 'object') throw new Error('Save has no Lua state')
  return {
    header: { version, timestamp, location, runs, metaPoints, shrinePoints, godMode, hellMode },
    lua,
  }
}
