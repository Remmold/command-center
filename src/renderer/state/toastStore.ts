import { create } from 'zustand'

const SHOWN_FOR_MS = 6000

export interface Toast {
  id: number
  text: string
}

interface ToastState {
  toasts: Toast[]
  show: (text: string) => void
  dismiss: (id: number) => void
}

let nextId = 1

/** Short-lived messages about something the app did by itself, e.g. a finished take-over. */
export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  show: (text) => {
    const id = nextId++
    set((s) => ({ toasts: [...s.toasts, { id, text }] }))
    setTimeout(() => get().dismiss(id), SHOWN_FOR_MS)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}))
