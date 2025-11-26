/* eslint-env node */
import { Buffer } from 'node:buffer'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const scriptTagMatcher = /<script\s+type="module"[^>]*src="(?<src>[^"]+)"[^>]*>\s*<\/script>/i
const cssTagMatcher = /<link\s+rel="stylesheet"[^>]*href="(?<href>[^"]+)"[^>]*>/i

const IMAGE_MIME = new Map([
  ['png', 'image/png'],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['gif', 'image/gif'],
  ['svg', 'image/svg+xml'],
  ['webp', 'image/webp'],
])

const stripQuery = (value: string) => value.replace(/[?#].*$/, '')
const normalizeAssetPath = (value: string) => stripQuery(value).replace(/^\.?\//, '')

const candidateBundlePaths = (assetPath: string) => {
  const cleaned = normalizeAssetPath(assetPath)
  const filename = cleaned.split('/').pop() ?? cleaned
  return [
    cleaned,
    filename,
    `assets/${filename}`,
  ]
}

const findAssetSource = (assetPath: string, bundle: Record<string, any>) => {
  for (const candidate of candidateBundlePaths(assetPath)) {
    const found = bundle[candidate]
    if (found?.type === 'asset') {
      const source = found.source
      const buffer = typeof source === 'string' ? Buffer.from(source) : Buffer.from(source)
      return buffer.toString('base64')
    }
  }
  return null
}

const toDataUri = (assetPath: string, bundle: Record<string, any>) => {
  if (!assetPath || assetPath.startsWith('data:') || assetPath.startsWith('http://') || assetPath.startsWith('https://')) {
    return assetPath
  }

  const extMatch = stripQuery(assetPath).match(/\.([a-z0-9]+)$/i)
  if (!extMatch) return assetPath

  const mime = IMAGE_MIME.get(extMatch[1].toLowerCase())
  if (!mime) return assetPath

  const base64 = findAssetSource(assetPath, bundle)
  return base64 ? `data:${mime};base64,${base64}` : assetPath
}

const inlineImageLiterals = (content: string, bundle: Record<string, any>) =>
  content.replace(/(["'`])(?<path>(?:\.{0,2}\/)?(?:assets\/)?[^"'`]+?\.(?:png|jpe?g|gif|svg|webp))\1/g, (match, quote, path) => {
    const inlined = toDataUri(path, bundle)
    return `${quote}${inlined}${quote}`
  })

const inlineCssUrls = (content: string, bundle: Record<string, any>) =>
  content.replace(/url\((['"]?)(?<path>(?:\.{0,2}\/)?(?:assets\/)?[^)'"]+?\.(?:png|jpe?g|gif|svg|webp))\1\)/g, (match, quote, path) => {
    const inlined = toDataUri(path, bundle)
    return `url(${quote}${inlined}${quote})`
  })

const offlineBundlePlugin = () => ({
  name: 'offline-bundle',
  apply: 'build',
  enforce: 'post',
  generateBundle(_options: unknown, bundle: Record<string, any>) {
    const htmlAsset = Object.values(bundle).find(
      (asset: any) => asset.type === 'asset' && asset.fileName === 'index.html' && typeof asset.source === 'string',
    ) as { source: string } | undefined

    if (!htmlAsset) {
      this.warn('offline-bundle: index.html not found; skipping inline step.')
      return
    }

    let html = htmlAsset.source
    const scriptMatch = html.match(scriptTagMatcher)

    if (!scriptMatch?.groups?.src) {
      this.error('offline-bundle: unable to locate the bundled script tag in index.html.')
      return
    }

    const scriptPath = normalizeAssetPath(scriptMatch.groups.src)
    const scriptChunk = bundle[scriptPath]

    if (!scriptChunk || scriptChunk.type !== 'chunk') {
      this.error(`offline-bundle: unable to locate script chunk "${scriptPath}".`)
      return
    }

    const scriptContent = inlineImageLiterals(scriptChunk.code, bundle)
    const inlineScriptTag = `<script type="module">
${scriptContent}
</script>`
    html = html.replace(scriptTagMatcher, () => inlineScriptTag)

    const cssMatch = html.match(cssTagMatcher)
    if (cssMatch?.groups?.href) {
      const cssPath = normalizeAssetPath(cssMatch.groups.href)
      const cssAsset = bundle[cssPath]

      if (cssAsset?.type === 'asset' && typeof cssAsset.source === 'string') {
        const cssContent = inlineCssUrls(inlineImageLiterals(cssAsset.source, bundle), bundle)
        const inlineStyleTag = `<style>
${cssContent}
</style>`
        html = html.replace(cssTagMatcher, () => inlineStyleTag)
      } else {
        this.warn(`offline-bundle: unable to locate CSS asset "${cssPath}". Leaving link tag untouched.`)
      }
    }

    htmlAsset.source = html
  },
})

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), offlineBundlePlugin()],
})
