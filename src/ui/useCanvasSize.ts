import { useEffect, useState, type RefObject } from 'react'

/** Tracks the canvas' CSS size and returns a device-pixel backing size. */
export function useCanvasSize(ref: RefObject<HTMLCanvasElement | null>) {
  const [size, setSize] = useState({ w: 1, h: 1 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const dpr = window.devicePixelRatio || 1
      const r = el.getBoundingClientRect()
      setSize({ w: Math.round(r.width * dpr), h: Math.round(r.height * dpr) })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return size
}
