import AdmZip from 'adm-zip'
import { readFile, writeFile } from 'fs/promises'
import { produce } from 'immer'

const target = process.argv[2]
const manifestPath = `./dist/${target}/manifest.json`
const file = await readFile(manifestPath)
const manifest = JSON.parse(file)
const archivePath = `./dist/${target}/gif-scrubber_${manifest.version}_${target}.zip`

let newManifest = ''
switch (target) {
  case 'chrome':
    console.log('Converting manifest to chrome style...')
    newManifest = produce(manifest, (draft) => {
      delete manifest.browser_specific_settings
    })
    break
  case 'firefox':
    console.log('Converting manifest to firefox style...')
    newManifest = produce(manifest, (draft) => {
      draft.background.scripts = [draft.background.service_worker]
      delete draft.background.service_worker
    })
    break
  default:
    console.error('Invalid target! Must be chrome or firefox.')
}

const manifestString = JSON.stringify(newManifest, null, 2) + '\n'
await writeFile(manifestPath, manifestString)
console.log('Finished writing manifest.')

console.log('Archiving package...')
const zip = new AdmZip()
zip.addLocalFolder(`./dist/${target}`)
zip.writeZip(archivePath)
console.log('Finished writing archive.')
