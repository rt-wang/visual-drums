import { useEffect, useRef } from 'react'
import { useStore } from '../store'
import {
  GRID_BBOX,
  Instrument,
  INSTRUMENTS,
  INSTRUMENT_LABELS,
  STEPS,
} from '../types'

export default function OverlayCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const muteFadeRef = useRef<Record<Instrument, number>>({
    kick: 1,
    snare: 1,
    ch: 1,
    oh: 1,
    rim: 1,
  })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.floor(window.innerWidth * dpr)
      canvas.height = Math.floor(window.innerHeight * dpr)
      canvas.style.width = window.innerWidth + 'px'
      canvas.style.height = window.innerHeight + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const draw = () => {
      const W = window.innerWidth
      const H = window.innerHeight
      const state = useStore.getState()

      ctx.clearRect(0, 0, W, H)

      // Dark veil over the video.
      ctx.fillStyle = 'rgba(0,0,0,0.22)'
      ctx.fillRect(0, 0, W, H)

      const gx = GRID_BBOX.x0 * W
      const gy = GRID_BBOX.y0 * H
      const gw = (GRID_BBOX.x1 - GRID_BBOX.x0) * W
      const gh = (GRID_BBOX.y1 - GRID_BBOX.y0) * H
      const cellW = gw / STEPS
      const cellH = gh / INSTRUMENTS.length

      // Ease mute fades toward target opacities.
      for (const inst of INSTRUMENTS) {
        const target = state.muted[inst] ? 0.3 : 1
        const current = muteFadeRef.current[inst]
        muteFadeRef.current[inst] = current + (target - current) * 0.18
      }

      // Glass panel background.
      ctx.fillStyle = 'rgba(18,20,32,0.28)'
      ctx.fillRect(gx, gy, gw, gh)
      ctx.strokeStyle = 'rgba(255,255,255,0.28)'
      ctx.lineWidth = 1
      ctx.strokeRect(gx + 0.5, gy + 0.5, gw - 1, gh - 1)

      // Playhead column.
      const ph = state.playheadStep
      if (ph >= 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.10)'
        ctx.fillRect(gx + ph * cellW, gy, cellW, gh)
      }

      // Row lines.
      ctx.lineWidth = 1
      for (let r = 1; r < INSTRUMENTS.length; r++) {
        ctx.beginPath()
        ctx.moveTo(gx, gy + r * cellH)
        ctx.lineTo(gx + gw, gy + r * cellH)
        ctx.strokeStyle = 'rgba(255,255,255,0.12)'
        ctx.stroke()
      }
      // Column lines (emphasized on beats).
      for (let c = 1; c < STEPS; c++) {
        ctx.beginPath()
        ctx.moveTo(gx + c * cellW, gy)
        ctx.lineTo(gx + c * cellW, gy + gh)
        ctx.strokeStyle =
          c % 4 === 0 ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.08)'
        ctx.stroke()
      }

      // Cells + row labels.
      INSTRUMENTS.forEach((inst, r) => {
        const fade = muteFadeRef.current[inst]
        const row = state.grid[inst]
        for (let c = 0; c < STEPS; c++) {
          const cx = gx + c * cellW + cellW / 2
          const cy = gy + r * cellH + cellH / 2
          drawCell(
            ctx,
            inst,
            cx,
            cy,
            cellW,
            cellH,
            row[c],
            c === ph,
            fade
          )
        }

        ctx.save()
        ctx.globalAlpha = Math.max(0.5, fade)
        ctx.fillStyle = 'rgba(255,255,255,0.75)'
        ctx.font = '11px system-ui, -apple-system, sans-serif'
        ctx.textAlign = 'right'
        ctx.textBaseline = 'middle'
        ctx.fillText(INSTRUMENT_LABELS[inst], gx - 10, gy + r * cellH + cellH / 2)
        ctx.restore()
      })

      // Hover rings (edit mode only).
      if (state.mode === 'edit') {
        for (const h of state.hovers) {
          const r = INSTRUMENTS.indexOf(h.instrument)
          const cx = gx + h.step * cellW + cellW / 2
          const cy = gy + r * cellH + cellH / 2
          ctx.beginPath()
          ctx.arc(cx, cy, Math.min(cellW, cellH) * 0.48, 0, Math.PI * 2)
          ctx.strokeStyle = 'rgba(120,220,255,0.9)'
          ctx.lineWidth = 2
          ctx.stroke()
        }
      }

      // Fingertip markers.
      for (const f of state.fingerOverlays) {
        const px = f.tip.x * W
        const py = f.tip.y * H
        const rad = f.pinching ? 14 : f.extended ? 9 : 7
        ctx.beginPath()
        ctx.arc(px, py, rad, 0, Math.PI * 2)
        ctx.fillStyle = f.pinching
          ? 'rgba(255,220,80,0.9)'
          : f.extended
            ? 'rgba(120,220,255,0.85)'
            : f.curled
              ? 'rgba(255,120,120,0.75)'
              : 'rgba(200,200,200,0.6)'
        ctx.fill()
        ctx.strokeStyle = 'rgba(0,0,0,0.55)'
        ctx.lineWidth = 1.2
        ctx.stroke()
      }

      rafRef.current = requestAnimationFrame(draw)
    }
    rafRef.current = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={canvasRef} className="overlay-canvas" />
}

function drawCell(
  ctx: CanvasRenderingContext2D,
  inst: Instrument,
  cx: number,
  cy: number,
  cellW: number,
  cellH: number,
  active: boolean,
  onPlayhead: boolean,
  fade: number
) {
  const size = Math.min(cellW, cellH) * 0.34
  ctx.save()
  ctx.globalAlpha = fade

  const stroke = active
    ? onPlayhead
      ? 'rgba(255,255,255,1)'
      : 'rgba(255,255,255,0.92)'
    : 'rgba(255,255,255,0.32)'
  const fill = onPlayhead
    ? 'rgba(255,245,190,0.95)'
    : 'rgba(255,200,120,0.85)'

  ctx.strokeStyle = stroke
  ctx.lineWidth = active && onPlayhead ? 2.6 : 1.6

  if (active && onPlayhead) {
    ctx.shadowColor = 'rgba(255,220,140,0.9)'
    ctx.shadowBlur = 12
  }

  switch (inst) {
    case 'kick': {
      ctx.beginPath()
      ctx.arc(cx, cy, size, 0, Math.PI * 2)
      if (active) {
        ctx.fillStyle = fill
        ctx.fill()
      }
      ctx.stroke()
      break
    }
    case 'snare': {
      const s = size
      ctx.beginPath()
      ctx.rect(cx - s, cy - s, s * 2, s * 2)
      if (active) {
        ctx.fillStyle = fill
        ctx.fill()
      }
      ctx.stroke()
      break
    }
    case 'ch': {
      ctx.beginPath()
      ctx.moveTo(cx - size, cy)
      ctx.lineTo(cx + size, cy)
      ctx.lineWidth = active ? 4.5 : 2
      ctx.strokeStyle = active ? fill : stroke
      ctx.stroke()
      break
    }
    case 'oh': {
      ctx.beginPath()
      ctx.arc(cx, cy, size, 0, Math.PI * 2)
      ctx.stroke()
      if (active) {
        ctx.beginPath()
        ctx.arc(cx, cy, size * 0.5, 0, Math.PI * 2)
        ctx.fillStyle = fill
        ctx.fill()
      }
      break
    }
    case 'rim': {
      ctx.beginPath()
      ctx.moveTo(cx, cy - size)
      ctx.lineTo(cx + size, cy)
      ctx.lineTo(cx, cy + size)
      ctx.lineTo(cx - size, cy)
      ctx.closePath()
      if (active) {
        ctx.fillStyle = fill
        ctx.fill()
      }
      ctx.stroke()
      break
    }
  }

  ctx.restore()
}
