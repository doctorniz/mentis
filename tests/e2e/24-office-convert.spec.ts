import { test, expect, openVaultFile, writeVaultFile } from './fixtures'

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const REL = 'http://schemas.openxmlformats.org/package/2006/relationships'

async function docxBase64(): Promise<string> {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
      `</Types>`,
  )
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0"?><Relationships xmlns="${REL}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  )
  zip.file(
    'word/document.xml',
    `<?xml version="1.0"?><w:document xmlns:w="${W}"><w:body>` +
      `<w:p><w:r><w:t>The flumoxicated quarterly report</w:t></w:r></w:p>` +
      `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Key result</w:t></w:r></w:p>` +
      `</w:body></w:document>`,
  )
  return zip.generateAsync({ type: 'base64' })
}

async function pptxBase64(): Promise<string> {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  const ns =
    `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ` +
    `xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"`
  zip.file(
    'ppt/slides/slide1.xml',
    `<?xml version="1.0"?><p:sld ${ns}><p:cSld><p:spTree>` +
      `<p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>Launch plan</a:t></a:r></a:p></p:txBody></p:sp>` +
      `</p:spTree></p:cSld></p:sld>`,
  )
  return zip.generateAsync({ type: 'base64' })
}

test.describe('24 — Office view and convert', () => {
  test('24.1 A Word document opens read-only and converts to a sibling Markdown note', async ({
    vaultPage: page,
  }) => {
    await writeVaultFile(page, 'Report.docx', await docxBase64(), { base64: true })
    await openVaultFile(page, 'Report.docx')

    const preview = page.frameLocator('iframe[title="Document preview"]')
    await expect(preview.getByText('The flumoxicated quarterly report')).toBeVisible({
      timeout: 15_000,
    })

    await page.getByRole('button', { name: 'Convert to Markdown' }).click()

    const tree = page.getByRole('tree', { name: 'Vault file tree' })
    await expect(tree.getByRole('button', { name: 'Report', exact: true })).toHaveCount(2, {
      timeout: 10_000,
    })
    await expect(page.locator('.tiptap, .ProseMirror').first()).toContainText(
      'The flumoxicated quarterly report',
      { timeout: 10_000 },
    )
    await expect(page.locator('.tiptap, .ProseMirror').first()).toContainText('Key result')
  })

  test('24.2 Converting again never overwrites: the second copy is numbered', async ({
    vaultPage: page,
  }) => {
    await writeVaultFile(page, 'Report.docx', await docxBase64(), { base64: true })
    await writeVaultFile(page, 'Report.md', 'My own notes')
    await openVaultFile(page, 'Report.docx')
    await page.getByRole('button', { name: 'Convert to Markdown' }).click()

    const tree = page.getByRole('tree', { name: 'Vault file tree' })
    await expect(tree.getByRole('button', { name: 'Report 2', exact: true })).toBeVisible({
      timeout: 10_000,
    })
  })

  test('24.3 A PowerPoint file converts to .slides.md from the tree context menu', async ({
    vaultPage: page,
  }) => {
    await writeVaultFile(page, 'Talk.pptx', await pptxBase64(), { base64: true })
    const tree = page.getByRole('tree', { name: 'Vault file tree' })
    await tree.getByRole('button', { name: 'Talk', exact: true }).first().click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Convert to slides' }).click()

    // The new deck opens in the slides editor.
    await expect(page.locator('.cm-content')).toContainText('# Launch plan', { timeout: 10_000 })
    await expect(page.locator('.cm-content')).toContainText('marp: true')
  })

  test('24.4 Files without a converter get no Convert item', async ({ vaultPage: page }) => {
    await writeVaultFile(page, 'Plain.md', '# Plain')
    const tree = page.getByRole('tree', { name: 'Vault file tree' })
    await tree.getByRole('button', { name: 'Plain', exact: true }).first().click({
      button: 'right',
    })
    await expect(page.getByRole('menuitem', { name: 'Rename' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: /Convert to/ })).toHaveCount(0)
  })
})
