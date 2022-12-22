import { atom, selector } from 'recoil'
import _ from 'lodash'
import { ToastState } from '../components/shared/Toast'

export const maskState = atom<File | undefined>({
  key: 'maskState',
  default: undefined,
})

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

interface AppState {
  file: File | undefined
  disableShortCuts: boolean
  isInpainting: boolean
  isInteractiveSeg: boolean
  isInteractiveSegRunning: boolean
  interactiveSegClicks: number[][]
}

export const appState = atom<AppState>({
  key: 'appState',
  default: {
    file: undefined,
    disableShortCuts: false,
    isInpainting: false,
    isInteractiveSeg: false,
    isInteractiveSegRunning: false,
    interactiveSegClicks: [],
  },
})

export const propmtState = atom<string>({
  key: 'promptState',
  default: '',
})

export const negativePropmtState = atom<string>({
  key: 'negativePromptState',
  default: '',
})

export const isInpaintingState = selector({
  key: 'isInpainting',
  get: ({ get }) => {
    const app = get(appState)
    return app.isInpainting
  },
  set: ({ get, set }, newValue: any) => {
    const app = get(appState)
    set(appState, { ...app, isInpainting: newValue })
  },
})

export const fileState = selector({
  key: 'fileState',
  get: ({ get }) => {
    const app = get(appState)
    return app.file
  },
  set: ({ get, set }, newValue: any) => {
    const app = get(appState)
    set(appState, {
      ...app,
      file: newValue,
      interactiveSegClicks: [],
      isInteractiveSeg: false,
      isInteractiveSegRunning: false,
    })
  },
})

export const isInteractiveSegState = selector({
  key: 'isInteractiveSegState',
  get: ({ get }) => {
    const app = get(appState)
    return app.isInteractiveSeg
  },
  set: ({ get, set }, newValue: any) => {
    const app = get(appState)
    set(appState, { ...app, isInteractiveSeg: newValue })
  },
})

export const isInteractiveSegRunningState = selector({
  key: 'isInteractiveSegRunningState',
  get: ({ get }) => {
    const app = get(appState)
    return app.isInteractiveSegRunning
  },
  set: ({ get, set }, newValue: any) => {
    const app = get(appState)
    set(appState, { ...app, isInteractiveSegRunning: newValue })
  },
})

export const interactiveSegClicksState = selector({
  key: 'interactiveSegClicksState',
  get: ({ get }) => {
    const app = get(appState)
    return app.interactiveSegClicks
  },
  set: ({ get, set }, newValue: any) => {
    const app = get(appState)
    set(appState, { ...app, interactiveSegClicks: newValue })
  },
})

export const croperState = atom<Rect>({
  key: 'croperState',
  default: {
    x: 0,
    y: 0,
    width: 512,
    height: 512,
  },
})

export const croperX = selector({
  key: 'croperX',
  get: ({ get }) => get(croperState).x,
  set: ({ get, set }, newValue: any) => {
    const rect = get(croperState)
    set(croperState, { ...rect, x: newValue })
  },
})

export const croperY = selector({
  key: 'croperY',
  get: ({ get }) => get(croperState).y,
  set: ({ get, set }, newValue: any) => {
    const rect = get(croperState)
    set(croperState, { ...rect, y: newValue })
  },
})

export const croperHeight = selector({
  key: 'croperHeight',
  get: ({ get }) => get(croperState).height,
  set: ({ get, set }, newValue: any) => {
    const rect = get(croperState)
    set(croperState, { ...rect, height: newValue })
  },
})

export const croperWidth = selector({
  key: 'croperWidth',
  get: ({ get }) => get(croperState).width,
  set: ({ get, set }, newValue: any) => {
    const rect = get(croperState)
    set(croperState, { ...rect, width: newValue })
  },
})

interface ToastAtomState {
  open: boolean
  desc: string
  state: ToastState
  duration: number
}

export const toastState = atom<ToastAtomState>({
  key: 'toastState',
  default: {
    open: false,
    desc: '',
    state: 'default',
    duration: 3000,
  },
})

export const shortcutsState = atom<boolean>({
  key: 'shortcutsState',
  default: false,
})

const ROOT_STATE_KEY = 'settingsState4'
