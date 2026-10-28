import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { formatDate, todayISO } from '../src/format.ts'

const shots = path.join('test-results', 'screenshots')
const files = path.join('test-results', 'files')

test.beforeAll(() => {
  mkdirSync(shots, { recursive: true })
  mkdirSync(files, { recursive: true })
  writeFileSync(path.join(files, 'painting.png'), paintFixture(3000, 1800))
})

test('add, edit, search, both PDFs, and backup restore', async ({ page }) => {
  const external: string[] = []
  page.on('request', (request) => {
    const url = request.url()
    if (url.startsWith('data:') || url.startsWith('blob:')) return
    const host = new URL(url).hostname
    if (host !== '127.0.0.1' && host !== 'localhost') external.push(url)
  })

  await page.goto('./')
  await expect(page).toHaveTitle("Fred's Art Catalog")
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', "Fred's Art")
  await expect(page.getByRole('heading', { name: "Fred's Art Catalog" })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Nothing in the catalog yet' })).toBeVisible()

  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(manifestHref).toBeTruthy()
  const manifestUrl = new URL(manifestHref!, page.url()).href
  const manifest = await (await page.request.get(manifestUrl)).json()
  expect(manifest.name).toBe("Fred's Art Catalog")
  expect(manifest.short_name).toBe("Fred's Art")
  expect(manifest.display).toBe('standalone')
  expect(manifest.start_url).toBe('/painting-catalog/')
  expect(manifest.scope).toBe('/painting-catalog/')
  expect(manifest.icons.length).toBeGreaterThan(0)
  expect(page.url()).toContain('/painting-catalog/')

  await page.getByRole('link', { name: 'Add a painting' }).click()
  await expect(page.getByRole('heading', { name: 'New painting' })).toBeVisible()
  await page.getByLabel('Title').fill('River Marker')
  await page.getByLabel('Artist').fill('Ken Adeyemi')
  await page.getByLabel('Width').fill('24.5')
  await page.getByLabel('Height').fill('18')
  await page.getByLabel('Depth').fill('1.25')
  await page.getByLabel('Medium').fill('Oil on canvas')
  await page.getByLabel('Storage location').fill('Rack C, slot 2')
  await page.getByLabel('Notes').fill('Keep upright. Search token glassine-marker-8841.')
  await page.getByLabel('Photo library').setInputFiles(path.join(files, 'painting.png'))
  await expect(page.getByAltText('Photo ready to save')).toBeVisible()
  await page.screenshot({ path: path.join(shots, 'add-form.png'), fullPage: true })
  await page.getByRole('button', { name: 'Save painting' }).click()

  await expect(page.getByRole('heading', { name: 'River Marker' })).toBeVisible()
  await expect(page.getByText('24.5 × 18 × 1.25 in')).toBeVisible()
  const detailPhoto = page.getByAltText('Photo of River Marker')
  await expect.poll(() => naturalWidth(detailPhoto)).toBe(2000)
  expect(await naturalHeight(detailPhoto)).toBe(1200)

  await page.getByRole('link', { name: 'Back' }).click()
  await page.getByRole('button', { name: 'Backup' }).click()
  await page.getByRole('button', { name: 'Add 6 sample paintings' }).click()
  await expect(page.getByRole('dialog').getByRole('status')).toHaveText('Added 6 sample paintings.')
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByRole('heading', { name: "Fred's Art Catalog" })).toBeVisible()
  await expect(page.getByText('7 paintings on this device')).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: path.join(shots, 'grid.png') })

  const card = page.getByRole('link', { name: /River Marker/ })
  await expect(card).toBeVisible()
  await expect(card).toContainText('24.5 × 18 × 1.25 in')
  await expect.poll(() => naturalWidth(card.locator('img'))).toBe(480)

  const search = page.getByRole('searchbox', { name: 'Search catalog' })
  await search.fill('glassine-marker-8841')
  await expect(page.getByRole('link', { name: /River Marker/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /North Window Study/ })).toHaveCount(0)
  await search.fill('Ken Adeyemi')
  await expect(page.getByRole('link', { name: /River Marker/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Harbor Gray/ })).toHaveCount(0)
  await search.fill('no-such-painting-zz')
  await expect(page.getByRole('heading', { name: /No paintings match/ })).toBeVisible()
  await search.fill('')
  await expect(page.getByRole('link', { name: /Night Orchard/ })).toBeVisible()

  await page.getByRole('radio', { name: 'Artist' }).click()
  await expect(page.getByRole('listitem').getByRole('heading')).toHaveText([
    'North Window Study',
    'Harbor Gray',
    'River Marker',
    'Red Over Plaster',
    'Late Garden',
    'Night Orchard',
    'Untitled (Ochre)',
  ])

  await page.getByRole('link', { name: /River Marker/ }).click()
  await page.getByRole('link', { name: 'Edit' }).click()
  await page.getByLabel('Title').fill('River Marker II')
  await page.getByLabel('Storage location').fill('Rack D, slot 1')
  await page.getByRole('button', { name: 'Save painting' }).click()
  await expect(page.getByRole('heading', { name: 'River Marker II' })).toBeVisible()
  await expect(page.getByText('Rack D, slot 1')).toBeVisible()

  await page.getByRole('link', { name: 'Edit' }).click()
  await page.getByLabel('Item number').fill('2')
  await page.getByRole('button', { name: 'Save painting' }).click()
  await expect(page.getByRole('alert')).toContainText('Item 2 is already used.')
  await page.getByRole('link', { name: 'Cancel' }).click()
  await expect(page.getByRole('heading', { name: 'River Marker II' })).toBeVisible()
  await expect(page.getByText('No. 1')).toBeVisible()

  await page.getByRole('link', { name: 'Back' }).click()
  const singlePdf = await exportPdf(page, 'single')
  const singleText = pdfText(singlePdf)
  const singlePage = pdfText(singlePdf, 2)
  expect(pdfPages(singlePdf)).toBe(8)
  expect(singleText).toContain("Fred's Art Catalog")
  expect(singleText).toContain(formatDate(todayISO()))
  expect(singleText).toContain('7 paintings')
  expect(singleText).toContain('Ordered by item number')
  expect(singleText).toContain('One painting per page')
  expect(singlePage).toContain('River Marker II')
  expect(singlePage).toContain('Ken Adeyemi')
  expect(singlePage).toContain('24.5 × 18 × 1.25 in')
  expect(singlePage).toContain('Oil on canvas')
  expect(singlePage).toContain('Rack D, slot 1')
  expect(singlePage).toContain('glassine-marker-8841')
  expect(singlePage).toContain('NO. 1')
  expect(pdfImages(singlePdf)).toBeGreaterThan(0)
  renderPdfPage(singlePdf, path.join(shots, 'pdf-one-per-page'))

  const gridPdf = await exportPdf(page, 'grid')
  const gridPage = pdfText(gridPdf, 2)
  expect(pdfPages(gridPdf)).toBe(3)
  expect(pdfText(gridPdf)).toContain('Six paintings per page')
  expect(gridPage).toContain('River Marker II')
  expect(gridPage).toContain('North Window Study')
  expect(gridPage).toContain('Red Over Plaster')
  expect(gridPage).toContain('Harbor Gray')
  expect(gridPage).toContain('24.5 × 18 × 1.25 in')
  expect(gridPage).toContain('No. 1')
  expect(pdfImages(gridPdf)).toBeGreaterThan(0)
  renderPdfPage(gridPdf, path.join(shots, 'pdf-grid'))

  await page.getByRole('button', { name: 'Backup' }).click()
  const zipPath = path.join(files, 'backup.zip')
  const jsonPath = path.join(files, 'backup.json')
  await downloadBackup(page, 'Create .zip backup', zipPath)
  await downloadBackup(page, 'Create .json backup', jsonPath)
  const raw = JSON.parse(readFileSync(jsonPath, 'utf8')) as {
    format: string
    paintings: unknown[]
    photos: Array<{ full: string }>
  }
  expect(raw.format).toBe('painting-catalog')
  expect(raw.paintings).toHaveLength(7)
  expect(raw.photos).toHaveLength(7)
  expect(JSON.stringify(raw.paintings)).toContain('River Marker II')
  expect(typeof raw.photos[0].full).toBe('string')
  expect(raw.photos[0].full.length).toBeGreaterThan(100)
  await page.getByRole('button', { name: 'Close' }).click()

  await page.getByRole('link', { name: /River Marker II/ }).click()
  await page.getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('heading', { name: 'River Marker II' })).toBeVisible()
  await page.getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('button', { name: 'Delete painting' }).click()
  await expect(page.getByRole('status')).toContainText('Deleted item 1.')
  await expect(page.getByText('6 paintings on this device')).toBeVisible()
  await expect(page.getByRole('link', { name: /River Marker II/ })).toHaveCount(0)

  await restore(page, jsonPath)
  await expect(page.getByRole('link', { name: /River Marker II/ })).toBeVisible()
  await page.getByRole('link', { name: /River Marker II/ }).click()
  await page.getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('button', { name: 'Delete painting' }).click()
  await expect(page.getByText('6 paintings on this device')).toBeVisible()
  await restore(page, zipPath)
  await expect(page.getByText('7 paintings on this device')).toBeVisible()
  const restored = page.getByRole('link', { name: /River Marker II/ })
  await expect(restored).toContainText('24.5 × 18 × 1.25 in')
  await expect.poll(() => naturalWidth(restored.locator('img'))).toBe(480)

  expect(external).toEqual([])
  const artifactDir = '/opt/cursor/artifacts/screenshots'
  mkdirSync(artifactDir, { recursive: true })
  for (const name of ['grid.png', 'add-form.png', 'pdf-one-per-page.png', 'pdf-grid.png']) {
    cpSync(path.join(shots, name), path.join(artifactDir, name))
  }
})

test('opens offline after the app shell is cached', async ({ page }) => {
  const external: string[] = []
  page.on('request', (request) => {
    const url = request.url()
    if (url.startsWith('data:') || url.startsWith('blob:')) return
    const host = new URL(url).hostname
    if (host !== '127.0.0.1' && host !== 'localhost') external.push(url)
  })
  await page.goto('./')
  await expect(page.getByRole('heading', { name: "Fred's Art Catalog" })).toBeVisible()
  await page.waitForFunction(
    async () => {
      const registration = await navigator.serviceWorker.getRegistration()
      return Boolean(registration?.active)
    },
    undefined,
    { timeout: 30_000 },
  )
  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) {
    await page.reload()
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))
  }
  const worker = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration()
    return {
      scope: registration?.scope ?? '',
      script: registration?.active?.scriptURL ?? '',
    }
  })
  expect(worker.scope).toContain('/painting-catalog/')
  expect(worker.script).toContain('/painting-catalog/sw.js')
  await page.context().setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: "Fred's Art Catalog" })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Nothing in the catalog yet' })).toBeVisible()
  expect(external).toEqual([])
})

async function exportPdf(page: Page, layout: 'single' | 'grid'): Promise<string> {
  await page.getByRole('button', { name: 'Export PDF' }).click()
  if (layout === 'grid') await page.getByRole('radio', { name: /Six per page/ }).click()
  await page.getByRole('button', { name: 'Create PDF' }).click()
  const save = page.getByRole('button', { name: 'Save file' })
  await expect(save).toBeVisible({ timeout: 60_000 })
  const [download] = await Promise.all([page.waitForEvent('download'), save.click()])
  const target = path.join(files, layout === 'single' ? 'one-per-page.pdf' : 'grid.pdf')
  await download.saveAs(target)
  await page.getByRole('button', { name: 'Close' }).click()
  return target
}

async function downloadBackup(page: Page, button: string, target: string) {
  await page.getByRole('button', { name: button }).click()
  const save = page.getByRole('button', { name: 'Save file' })
  await expect(save).toBeVisible({ timeout: 60_000 })
  const [download] = await Promise.all([page.waitForEvent('download'), save.click()])
  await download.saveAs(target)
}

async function restore(page: Page, file: string) {
  await page.getByRole('button', { name: 'Backup' }).click()
  await page.getByLabel('Backup file').setInputFiles(file)
  await page.getByRole('button', { name: 'Replace catalog' }).click()
  await page.getByRole('button', { name: 'Replace everything' }).click()
  await expect(page.getByRole('status')).toContainText(/Restored \d+ paintings/)
}

function pdfText(file: string, pageNumber?: number): string {
  const args = pageNumber ? ['-f', String(pageNumber), '-l', String(pageNumber), '-layout', file, '-'] : ['-layout', file, '-']
  return execFileSync('pdftotext', args, { encoding: 'utf8' })
}

function pdfPages(file: string): number {
  const info = execFileSync('pdfinfo', [file], { encoding: 'utf8' })
  const match = /Pages:\s+(\d+)/.exec(info)
  return Number(match?.[1] ?? 0)
}

function pdfImages(file: string): number {
  const list = execFileSync('pdfimages', ['-list', file], { encoding: 'utf8' })
  return list.split('\n').filter((line) => /^\s*\d+/.test(line)).length
}

function renderPdfPage(file: string, prefix: string) {
  execFileSync('pdftoppm', ['-png', '-f', '2', '-l', '2', '-r', '130', '-singlefile', file, prefix])
}

async function naturalWidth(locator: Locator): Promise<number> {
  return locator.evaluate((img: HTMLImageElement) => img.naturalWidth)
}

async function naturalHeight(locator: Locator): Promise<number> {
  return locator.evaluate((img: HTMLImageElement) => img.naturalHeight)
}

function paintFixture(width: number, height: number): Buffer {
  const png = new PNG({ width, height })
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (width * y + x) << 2
      const band = y > height * 0.62
      png.data[i] = band ? 36 : 196
      png.data[i + 1] = band ? 28 : 122
      png.data[i + 2] = band ? 24 : 58
      png.data[i + 3] = 255
      if (x > width * 0.2 && x < width * 0.55 && y > height * 0.15 && y < height * 0.5) {
        png.data[i] = 246
        png.data[i + 1] = 241
        png.data[i + 2] = 234
      }
    }
  }
  return PNG.sync.write(png)
}
