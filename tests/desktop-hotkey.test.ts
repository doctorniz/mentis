import { describe, expect, it } from 'vitest'
import { hotkeyFromEvent, hotkeyLabel, type KeyLike } from '@/modules/desktop/hotkey'

const key = (code: string, mods: Partial<KeyLike> = {}): KeyLike => ({
  code,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...mods,
})

describe('hotkeyFromEvent', () => {
  it('records modifiers in a fixed order, then the key code', () => {
    expect(hotkeyFromEvent(key('KeyM', { shiftKey: true, ctrlKey: true, altKey: true }))).toEqual({
      kind: 'hotkey',
      hotkey: 'Ctrl+Alt+Shift+KeyM',
    })
    expect(hotkeyFromEvent(key('Space', { metaKey: true, shiftKey: true }))).toEqual({
      kind: 'hotkey',
      hotkey: 'Shift+Super+Space',
    })
  })

  it('waits while only modifiers are held', () => {
    expect(hotkeyFromEvent(key('ControlLeft', { ctrlKey: true }))).toEqual({ kind: 'incomplete' })
  })

  it('refuses a key without Ctrl, Alt or Cmd/Win, which would capture ordinary typing', () => {
    expect(hotkeyFromEvent(key('KeyA')).kind).toBe('invalid')
    expect(hotkeyFromEvent(key('KeyA', { shiftKey: true })).kind).toBe('invalid')
  })

  it('refuses keys the shell cannot register', () => {
    expect(hotkeyFromEvent(key('IntlRo', { ctrlKey: true })).kind).toBe('invalid')
  })
})

describe('hotkeyLabel', () => {
  it('reads like the keys', () => {
    expect(hotkeyLabel('Ctrl+Alt+Shift+KeyM')).toBe('Ctrl+Alt+Shift+M')
    expect(hotkeyLabel('Ctrl+Digit1')).toBe('Ctrl+1')
    expect(hotkeyLabel('CmdOrCtrl+Shift+Space')).toMatch(/^(Ctrl|Cmd)\+Shift\+Space$/)
  })
})
