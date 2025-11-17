import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const source = resolve('instrument.server.mjs')
const target = resolve('dist', 'server', 'instrument.server.mjs')

async function run() {
  try {
    await mkdir(dirname(target), { recursive: true })
    await copyFile(source, target)
    console.log(`Copied ${source} -> ${target}`)
  } catch (error) {
    console.error('Failed to copy instrument.server.mjs into build output', error)
    process.exitCode = 1
  }
}

await run()

