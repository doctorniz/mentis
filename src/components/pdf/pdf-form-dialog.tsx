'use client'

import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Button } from '@/components/ui/button'
import { getFormFields, fillFormFields } from '@/lib/pdf/page-operations'

interface FormField {
  name: string
  type: string
  value: string
}

export function PdfFormDialog({
  open,
  onOpenChange,
  pdfBytes,
  onSave,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  pdfBytes: Uint8Array | null
  onSave: (newBytes: Uint8Array) => void
}) {
  const [fields, setFields] = useState<FormField[]>([])
  const [values, setValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    if (!pdfBytes) {
      setLoading(false)
      setFields([])
      setValues({})
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    void getFormFields(pdfBytes)
      .then((f) => {
        setFields(f)
        const init: Record<string, string> = {}
        for (const field of f) init[field.name] = field.value
        setValues(init)
      })
      .finally(() => setLoading(false))
  }, [open, pdfBytes])

  async function handleSave() {
    if (!pdfBytes) return
    setLoading(true)
    try {
      const newBytes = await fillFormFields(pdfBytes, values)
      onSave(newBytes)
      onOpenChange(false)
    } catch {
      setError('Could not apply form changes. The file may be protected or use an unsupported form type.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[199] bg-black/40" />
        <Dialog.Content className="border-border-strong bg-bg fixed top-1/2 left-1/2 z-[200] w-[min(100%,500px)] max-h-[80vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border p-5 shadow-lg">
          <Dialog.Title className="text-fg text-sm font-semibold">
            Form fields
          </Dialog.Title>
          <Dialog.Description className="text-fg-secondary sr-only">
            View or edit fillable PDF form fields when this document includes them.
          </Dialog.Description>

          {loading && <p className="text-fg-muted mt-3 text-sm">Checking this PDF for form fields…</p>}
          {error && (
            <p className="text-fg-secondary border-border bg-bg-secondary mt-3 rounded-md border px-3 py-2 text-sm">
              {error}
            </p>
          )}

          {!loading && !pdfBytes && (
            <p className="text-fg-muted mt-3 text-sm">
              PDF isn’t loaded yet. Close this dialog and open <span className="text-fg">Form fields</span> again in a
              moment.
            </p>
          )}

          {!loading && pdfBytes && fields.length === 0 && !error && (
            <p className="text-fg-muted mt-3 text-sm leading-relaxed">
              No fillable fields showed up for this file — that’s normal for many PDFs. If the document uses a complex
              or XFA-only form, we may not detect it here. You can still use highlight, pen, text boxes, and signatures.
            </p>
          )}

          {!loading && fields.length > 0 && (
            <div className="mt-3 space-y-3">
              {fields.map((field) => (
                <label key={field.name} className="flex flex-col gap-1">
                  <span className="text-fg-secondary text-xs">
                    {field.name}{' '}
                    <span className="text-fg-muted">({field.type})</span>
                  </span>
                  {field.type.includes('Check') ? (
                    <input
                      type="checkbox"
                      checked={values[field.name] === 'checked' || values[field.name] === 'true'}
                      onChange={(e) =>
                        setValues((v) => ({
                          ...v,
                          [field.name]: e.target.checked ? 'checked' : 'unchecked',
                        }))
                      }
                      className="accent-accent size-4"
                    />
                  ) : (
                    <input
                      value={values[field.name] ?? ''}
                      onChange={(e) =>
                        setValues((v) => ({ ...v, [field.name]: e.target.value }))
                      }
                      className="border-border bg-bg-secondary text-fg rounded-md border px-2 py-1.5 text-sm"
                    />
                  )}
                </label>
              ))}
            </div>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleSave()} disabled={loading || fields.length === 0}>
              Fill & Save
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
