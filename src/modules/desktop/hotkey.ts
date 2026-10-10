/**
 * The capture hotkey as typed into Settings. Hotkeys are stored the way the
 * desktop shell parses them: modifiers then the key's `KeyboardEvent.code`,
 * joined by `+` (`Ctrl+Alt+KeyM`, `Ctrl+Shift+Space`).
 */

/** Keys that are only modifiers: pressing one alone is not a hotkey yet. */
const MODIFIER_CODES = new Set([
  'ControlLeft',
  'ControlRight',
  'ShiftLeft',
  'ShiftRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight',
  'OSLeft',
  'OSRight',
])

/** Codes the shell can register as the key of a hotkey. */
const KEY_CODE =
  /^(Key[A-Z]|Digit\d|F([1-9]|1\d|2[0-4])|Space|Enter|Tab|Backspace|Insert|Delete|Home|End|PageUp|PageDown|Arrow(Up|Down|Left|Right)|Backquote|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash|Numpad\d)$/

export type RecordedHotkey =
  | { kind: 'hotkey'; hotkey: string }
  | { kind: 'incomplete' }
  | { kind: 'invalid'; reason: string }

export interface KeyLike {
  code: string
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
}

/**
 * The hotkey a key press makes. It needs Ctrl, Alt or Cmd/Win: a hotkey of
 * Shift alone, or no modifier, would capture ordinary typing everywhere.
 */
export function hotkeyFromEvent(e: KeyLike): RecordedHotkey {
  if (MODIFIER_CODES.has(e.code)) return { kind: 'incomplete' }
  if (!e.ctrlKey && !e.altKey && !e.metaKey) {
    return { kind: 'invalid', reason: 'Use Ctrl, Alt or the Windows/Cmd key with it' }
  }
  if (!KEY_CODE.test(e.code)) {
    return { kind: 'invalid', reason: 'That key cannot be part of a hotkey' }
  }
  const mods = [
    e.ctrlKey && 'Ctrl',
    e.altKey && 'Alt',
    e.shiftKey && 'Shift',
    e.metaKey && 'Super',
  ].filter(Boolean)
  return { kind: 'hotkey', hotkey: [...mods, e.code].join('+') }
}

const isMac = () => typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)

/** How a stored hotkey reads: `Ctrl+Alt+M`, `Cmd+Shift+Space`. */
export function hotkeyLabel(hotkey: string): string {
  return hotkey
    .split('+')
    .map((part) => {
      const p = part.trim()
      switch (p.toUpperCase()) {
        case 'CMDORCTRL':
        case 'CMDORCONTROL':
        case 'COMMANDORCONTROL':
        case 'COMMANDORCTRL':
          return isMac() ? 'Cmd' : 'Ctrl'
        case 'CTRL':
        case 'CONTROL':
          return 'Ctrl'
        case 'ALT':
        case 'OPTION':
          return 'Alt'
        case 'SHIFT':
          return 'Shift'
        case 'SUPER':
        case 'CMD':
        case 'COMMAND':
        case 'META':
          return isMac() ? 'Cmd' : 'Win'
        default:
          return p.replace(/^Key/, '').replace(/^Digit/, '')
      }
    })
    .join('+')
}
