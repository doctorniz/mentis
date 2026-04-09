import type { FileSystemAdapter } from '@/lib/fs'
import type { Signature } from '@/types/pdf'
import { SIGNATURES_DIR } from '@/types/vault'

const INDEX_FILE = `${SIGNATURES_DIR}/index.json`

export async function loadSignatures(vaultFs: FileSystemAdapter): Promise<Signature[]> {
  try {
    const raw = await vaultFs.readTextFile(INDEX_FILE)
    return JSON.parse(raw) as Signature[]
  } catch {
    return []
  }
}

export async function saveSignatures(vaultFs: FileSystemAdapter, sigs: Signature[]): Promise<void> {
  await vaultFs.mkdir(SIGNATURES_DIR)
  await vaultFs.writeTextFile(INDEX_FILE, JSON.stringify(sigs, null, 2))
}

export async function addSignatureToVault(
  vaultFs: FileSystemAdapter,
  sig: Signature,
): Promise<void> {
  const sigs = await loadSignatures(vaultFs)
  sigs.push(sig)
  await saveSignatures(vaultFs, sigs)
}

export async function removeSignatureFromVault(
  vaultFs: FileSystemAdapter,
  id: string,
): Promise<void> {
  const sigs = await loadSignatures(vaultFs)
  await saveSignatures(vaultFs, sigs.filter((s) => s.id !== id))
}
