import { invoke } from '@tauri-apps/api/core'

/** The capture hotkey as the desktop shell reports it. */
export interface HotkeyStatus {
  hotkey: string
  label: string
  /** False when another app already holds it. */
  registered: boolean
}

export interface DesktopSettings {
  hotkey: HotkeyStatus
  launchAtLogin: boolean
  loginPromptAnswered: boolean
}

/** Desktop only (src-tauri/src/overlay.rs). Loaded only inside Tauri. */
export const getDesktopSettings = () => invoke<DesktopSettings>('desktop_settings_get')

/** Use this hotkey for capture, or the default. Rejects with a message if another app holds it. */
export const setCaptureHotkey = (hotkey: string | null) =>
  invoke<HotkeyStatus>('capture_hotkey_set', { hotkey })

/** Start at login (hidden, in the tray) or not. Resolves to whether it now does. */
export const setLaunchAtLogin = (enabled: boolean) =>
  invoke<boolean>('launch_at_login_set', { enabled })

export const answerLoginPrompt = () => invoke<void>('login_prompt_answer')
