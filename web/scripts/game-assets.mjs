// Copies locally generated game/Steam assets into public/local/ for dev.
// Never shipped: vite.config.ts strips dist/local on build.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'

const src = '../game-files/generated'
const dst = 'public/local'

rmSync(dst, { recursive: true, force: true })
mkdirSync(dst, { recursive: true })

const items = [
  ['text.en.json', true],
  ['icons', true],
  ['achievements.en.json', false], // from tools/steamschema (optional)
  ['achievement-icons', false],
]
for (const [name, required] of items) {
  if (!existsSync(`${src}/${name}`)) {
    if (required) console.warn(`missing ${src}/${name} — run the importer / icon extractor`)
    continue
  }
  cpSync(`${src}/${name}`, `${dst}/${name}`, { recursive: true })
  console.log(`copied ${name}`)
}
