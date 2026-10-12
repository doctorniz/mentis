import { useState } from 'react'
import { INPUT_CLS, Row } from '@/components/settings/fields'
import { getDrawWith, setDrawWith, type DrawWith } from '@/lib/browser/pen'

const HINTS: Record<DrawWith, string> = {
  auto: 'Fingers draw until you use a pen; then they only scroll and zoom, so a resting palm draws nothing.',
  pen: 'Only a pen draws; fingers scroll and zoom.',
  any: 'Fingers and pen both draw.',
}

/** Which pointers draw on the canvas and in PDF ink. Kept on this device. */
export default function PenSetting() {
  const [value, setValue] = useState<DrawWith>(getDrawWith)
  return (
    <div className="divide-border divide-y">
      <Row label="Draw with" hint={HINTS[value]}>
        <select
          aria-label="Draw with"
          value={value}
          onChange={(e) => {
            const next = e.target.value as DrawWith
            setDrawWith(next)
            setValue(next)
          }}
          className={INPUT_CLS}
        >
          <option value="auto">Automatic</option>
          <option value="pen">Pen only</option>
          <option value="any">Pen and finger</option>
        </select>
      </Row>
    </div>
  )
}
