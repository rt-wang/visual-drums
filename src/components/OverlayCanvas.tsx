import { useEffect, useRef } from 'react'
import { useStore } from '../store'
import {
  GRID_BBOX,
  Instrument,
  INSTRUMENTS,
  INSTRUMENT_LABELS,
  STEPS,
} from '../types'

type InstrumentTheme = {
  edge: string
  fill: string
  glow: string
  wash: string
  chip: string
}

const INST_THEME: Record<Instrument, InstrumentTheme> = {
  kick: {
    edge: 'rgba(240,181,96,0.92)',
    fill: 'rgba(240,181,96,0.9)',
    glow: 'rgba(240,181,96,0.34)',
    wash: 'rgba(240,181,96,0.08)',
    chip: 'rgba(240,181,96,0.16)',
  },
  snare: {
    edge: 'rgba(255,138,117,0.92)',
    fill: 'rgba(255,138,117,0.88)',
    glow: 'rgba(255,138,117,0.3)',
    wash: 'rgba(255,138,117,0.08)',
    chip: 'rgba(255,138,117,0.15)',
  },
  ch: {
    edge: 'rgba(106,215,255,0.95)',
    fill: 'rgba(106,215,255,0.92)',
    glow: 'rgba(106,215,255,0.3)',
    wash: 'rgba(106,215,255,0.08)',
    chip: 'rgba(106,215,255,0.15)',
  },
  oh: {
    edge: 'rgba(156,229,194,0.92)',
    fill: 'rgba(156,229,194,0.88)',
    glow: 'rgba(156,229,194,0.28)',
    wash: 'rgba(156,229,194,0.08)',
    chip: 'rgba(156,229,194,0.15)',
  },
  rim: {
    edge: 'rgba(202,221,112,0.92)',
    fill: 'rgba(202,221,112,0.9)',
    glow: 'rgba(202,221,112,0.28)',
    wash: 'rgba(202,221,112,0.08)',
    chip: 'rgba(202,221,112,0.15)',
  },
}

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

      const veil = ctx.createLinearGradient(0, 0, 0, H)
      veil.addColorStop(0, 'rgba(4,10,14,0.22)')
      veil.addColorStop(0.45, 'rgba(4,10,14,0.08)')
      veil.addColorStop(1, 'rgba(3,7,10,0.34)')
      ctx.fillStyle = veil
      ctx.fillRect(0, 0, W, H)

      const spotlight = ctx.createRadialGradient(
        W * 0.5,
        H * 0.52,
        Math.min(W, H) * 0.08,
        W * 0.5,
        H * 0.52,
        Math.max(W, H) * 0.58
      )
      spotlight.addColorStop(0, 'rgba(108,193,232,0.12)')
      spotlight.addColorStop(0.45, 'rgba(108,193,232,0.04)')
      spotlight.addColorStop(1, 'rgba(108,193,232,0)')
      ctx.fillStyle = spotlight
      ctx.fillRect(0, 0, W, H)

      const gx = GRID_BBOX.x0 * W
      const gy = GRID_BBOX.y0 * H
      const gw = (GRID_BBOX.x1 - GRID_BBOX.x0) * W
      const gh = (GRID_BBOX.y1 - GRID_BBOX.y0) * H
      const cellW = gw / STEPS
      const cellH = gh / INSTRUMENTS.length
      const panelRadius = Math.min(28, gh * 0.08)

      for (const inst of INSTRUMENTS) {
        const target = state.muted[inst] ? 0.3 : 1
        const current = muteFadeRef.current[inst]
        muteFadeRef.current[inst] = current + (target - current) * 0.18
      }

      ctx.save()
      ctx.shadowColor = 'rgba(0,0,0,0.34)'
      ctx.shadowBlur = 36
      drawRoundedRect(ctx, gx, gy, gw, gh, panelRadius)
      ctx.fillStyle = 'rgba(4,10,14,0.34)'
      ctx.fill()
      ctx.restore()

      const panelGrad = ctx.createLinearGradient(gx, gy, gx, gy + gh)
      panelGrad.addColorStop(0, 'rgba(12,22,30,0.56)')
      panelGrad.addColorStop(0.38, 'rgba(9,17,24,0.42)')
      panelGrad.addColorStop(1, 'rgba(5,10,15,0.62)')
      drawRoundedRect(ctx, gx, gy, gw, gh, panelRadius)
      ctx.fillStyle = panelGrad
      ctx.fill()

      ctx.save()
      ctx.globalAlpha = 0.85
      drawRoundedRect(ctx, gx + 1, gy + 1, gw - 2, gh - 2, panelRadius - 1)
      ctx.strokeStyle = 'rgba(198,225,241,0.18)'
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.restore()

      const sheen = ctx.createLinearGradient(gx, gy, gx, gy + gh * 0.22)
      sheen.addColorStop(0, 'rgba(255,255,255,0.09)')
      sheen.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.save()
      drawRoundedRect(ctx, gx + 1, gy + 1, gw - 2, gh * 0.24, panelRadius - 1)
      ctx.fillStyle = sheen
      ctx.fill()
      ctx.restore()

      for (let r = 0; r < INSTRUMENTS.length; r++) {
        const inst = INSTRUMENTS[r]
        const fade = muteFadeRef.current[inst]
        const rowY = gy + r * cellH

        ctx.save()
        ctx.globalAlpha = 0.9 * fade
        drawRoundedRect(
          ctx,
          gx + 6,
          rowY + 4,
          gw - 12,
          Math.max(0, cellH - 8),
          Math.min(18, cellH * 0.32)
        )
        ctx.fillStyle = INST_THEME[inst].wash
        ctx.fill()
        ctx.restore()
      }

      const ph = state.playheadStep
      if (ph >= 0) {
        const px = gx + ph * cellW
        const playheadGrad = ctx.createLinearGradient(px, gy, px + cellW, gy)
        playheadGrad.addColorStop(0, 'rgba(255,255,255,0.02)')
        playheadGrad.addColorStop(0.5, 'rgba(255,255,255,0.16)')
        playheadGrad.addColorStop(1, 'rgba(255,255,255,0.02)')
        ctx.fillStyle = playheadGrad
        ctx.fillRect(px, gy, cellW, gh)

        ctx.save()
        ctx.strokeStyle = 'rgba(255,255,255,0.28)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(px + cellW * 0.5, gy + 10)
        ctx.lineTo(px + cellW * 0.5, gy + gh - 10)
        ctx.stroke()
        ctx.restore()
      }

      ctx.lineWidth = 1
      for (let r = 1; r < INSTRUMENTS.length; r++) {
        ctx.beginPath()
        ctx.moveTo(gx + 8, gy + r * cellH)
        ctx.lineTo(gx + gw - 8, gy + r * cellH)
        ctx.strokeStyle = 'rgba(255,255,255,0.08)'
        ctx.stroke()
      }

      for (let c = 1; c < STEPS; c++) {
        ctx.beginPath()
        ctx.moveTo(gx + c * cellW, gy + 10)
        ctx.lineTo(gx + c * cellW, gy + gh - 10)
        ctx.strokeStyle =
          c % 4 === 0 ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.06)'
        ctx.stroke()
      }

      INSTRUMENTS.forEach((inst, r) => {
        const fade = muteFadeRef.current[inst]
        const row = state.grid[inst]
        const theme = INST_THEME[inst]

        for (let c = 0; c < STEPS; c++) {
          const cx = gx + c * cellW + cellW / 2
          const cy = gy + r * cellH + cellH / 2
          drawCell(
            ctx,
            inst,
            theme,
            cx,
            cy,
            cellW,
            cellH,
            row[c],
            c === ph,
            fade
          )
        }

        const chipW = Math.min(68, Math.max(50, cellW * 1.18))
        const chipH = Math.min(24, Math.max(18, cellH * 0.38))
        const chipX = gx + 10
        const chipY = gy + r * cellH + cellH * 0.5 - chipH * 0.5

        ctx.save()
        ctx.globalAlpha = Math.max(0.55, fade)
        drawRoundedRect(ctx, chipX, chipY, chipW, chipH, chipH / 2)
        ctx.fillStyle = theme.chip
        ctx.fill()
        ctx.strokeStyle = theme.edge
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.fillStyle = 'rgba(245,249,252,0.86)'
        ctx.font = '10px "SF Mono", "IBM Plex Mono", Menlo, monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(INSTRUMENT_LABELS[inst], chipX + chipW / 2, chipY + chipH / 2 + 0.5)
        ctx.restore()
      })

      if (state.mode === 'edit') {
        for (const h of state.hovers) {
          const r = INSTRUMENTS.indexOf(h.instrument)
          const cx = gx + h.step * cellW + cellW / 2
          const cy = gy + r * cellH + cellH / 2
          const theme = INST_THEME[h.instrument]

          ctx.save()
          ctx.shadowColor = theme.glow
          ctx.shadowBlur = 22
          ctx.beginPath()
          ctx.arc(cx, cy, Math.min(cellW, cellH) * 0.49, 0, Math.PI * 2)
          ctx.strokeStyle = theme.edge
          ctx.lineWidth = 2.2
          ctx.stroke()
          ctx.beginPath()
          ctx.arc(cx, cy, Math.min(cellW, cellH) * 0.26, 0, Math.PI * 2)
          ctx.fillStyle = theme.wash
          ctx.fill()
          ctx.restore()
        }
      }

      for (const f of state.fingerOverlays) {
        const px = f.tip.x * W
        const py = f.tip.y * H
        const theme = INST_THEME[f.instrument]
        const rad = f.pinching ? 14 : f.extended ? 9 : 7

        ctx.save()
        ctx.shadowColor = f.pinching ? 'rgba(240,181,96,0.46)' : theme.glow
        ctx.shadowBlur = f.pinching ? 24 : f.extended ? 14 : 0
        ctx.beginPath()
        ctx.arc(px, py, rad, 0, Math.PI * 2)
        ctx.fillStyle = f.pinching
          ? 'rgba(240,181,96,0.96)'
          : f.extended
            ? 'rgba(106,215,255,0.88)'
            : f.curled
              ? 'rgba(255,138,117,0.78)'
              : 'rgba(207,220,228,0.54)'
        ctx.fill()
        ctx.strokeStyle = 'rgba(5,10,14,0.55)'
        ctx.lineWidth = 1.3
        ctx.stroke()

        ctx.beginPath()
        ctx.arc(px, py, Math.max(2.2, rad * 0.28), 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255,255,255,0.72)'
        ctx.fill()
        ctx.restore()
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
  theme: InstrumentTheme,
  cx: number,
  cy: number,
  cellW: number,
  cellH: number,
  active: boolean,
  onPlayhead: boolean,
  fade: number
) {
  const size = Math.min(cellW, cellH) * 0.3
  ctx.save()
  ctx.globalAlpha = fade

  const stroke = active ? theme.edge : 'rgba(240,245,249,0.24)'
  const fill = active ? theme.fill : 'transparent'

  ctx.strokeStyle = stroke
  ctx.lineWidth = active && onPlayhead ? 2.4 : 1.45

  if (active) {
    ctx.shadowColor = theme.glow
    ctx.shadowBlur = onPlayhead ? 16 : 9
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
      ctx.lineWidth = active ? 4 : 2
      ctx.strokeStyle = active ? fill : 'rgba(240,245,249,0.26)'
      ctx.stroke()
      break
    }
    case 'oh': {
      ctx.beginPath()
      ctx.arc(cx, cy, size, 0, Math.PI * 2)
      ctx.stroke()
      if (active) {
        ctx.beginPath()
        ctx.arc(cx, cy, size * 0.48, 0, Math.PI * 2)
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

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number
) {
  const r = Math.min(radius, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}
