import { readFile, writeFile } from 'fs/promises'
import { produce } from 'immer'

const manifestPath = './manifest.json'
const file = await readFile(manifestPath)
const manifest = JSON.parse(file)

async function convert(target, manifest) {
  switch (target) {
    case 'chrome':
      console.log('Converting manifest to chrome style...')
      return produce(manifest, (draft) => {
        delete manifest.browser_specific_settings
      })
    case 'firefox':
      console.log('Converting manifest to firefox style...')
      return produce(manifest, (draft) => {
        draft.background.scripts = [draft.background.service_worker]
        delete draft.background.service_worker
      })
    default:
      console.error('Invalid target! Must be chrome or firefox.')
      return { ...manifest }
  }
}

const newManifest = await (process.argv.includes('--firefox')
  ? convert('firefox', manifest)
  : convert('chrome', manifest))

const manifestString = JSON.stringify(newManifest, null, 2) + '\n'
await writeFile(manifestPath, manifestString)
console.log('Finished writing')
