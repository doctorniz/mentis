const DIR = 'mentis-models'
const DONE_KEY = 'mentis:legacy-model-removed'

/**
 * The on-device chat model (a 2 GB file) is gone, and so is the screen that
 * could delete it. Remove what an earlier version downloaded, once. It lives
 * in the app's own storage, not in any vault.
 */
export async function removeLegacyDeviceModel(): Promise<void> {
  try {
    if (localStorage.getItem(DONE_KEY)) return
    if (!navigator.storage?.getDirectory) return
    const root = await navigator.storage.getDirectory()
    try {
      await root.removeEntry(DIR, { recursive: true })
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'NotFoundError')) throw err
    }
    localStorage.setItem(DONE_KEY, '1')
  } catch {
    /* try again next launch */
  }
}
