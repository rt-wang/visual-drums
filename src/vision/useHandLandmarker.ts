import { RefObject, useEffect, useRef } from 'react'
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import { GestureProcessor } from './gestureProcessor'
import { emptyMutes, useStore } from '../store'

const WASM_BASE =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

export function useHandLandmarker(videoRef: RefObject<HTMLVideoElement>) {
  const processorRef = useRef<GestureProcessor | null>(null)
  const landmarkerRef = useRef<HandLandmarker | null>(null)
  const rafRef = useRef(0)
  const lastVideoTimeRef = useRef(-1)

  useEffect(() => {
    let mounted = true
    processorRef.current = new GestureProcessor()

    const loop = () => {
      const video = videoRef.current
      const hl = landmarkerRef.current
      const proc = processorRef.current
      if (!video || !hl || !proc || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(loop)
        return
      }
      if (video.currentTime !== lastVideoTimeRef.current) {
        lastVideoTimeRef.current = video.currentTime
        const nowMs = performance.now()
        try {
          const result = hl.detectForVideo(video, nowMs)
          const out = proc.process(result, nowMs)

          useStore.setState((s) => {
            const patch: Partial<typeof s> = {
              hovers: out.hovers,
              fingerOverlays: out.overlays,
            }
            if (out.mode !== s.mode) patch.mode = out.mode
            if (out.mode === 'mix') {
              patch.muted = out.muted
            } else if (Object.values(s.muted).some((v) => v)) {
              patch.muted = emptyMutes()
            }
            return patch
          })

          if (out.toggles.length > 0) {
            const toggleCell = useStore.getState().toggleCell
            for (const t of out.toggles) toggleCell(t.instrument, t.step)
          }
        } catch (err) {
          console.warn('detectForVideo error', err)
        }
      }
      rafRef.current = requestAnimationFrame(loop)
    }

    ;(async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(WASM_BASE)
        const hl = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MODEL_URL,
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: 2,
        })
        if (!mounted) {
          hl.close()
          return
        }
        landmarkerRef.current = hl
        rafRef.current = requestAnimationFrame(loop)
      } catch (err) {
        console.error('HandLandmarker init failed', err)
      }
    })()

    return () => {
      mounted = false
      cancelAnimationFrame(rafRef.current)
      landmarkerRef.current?.close()
      landmarkerRef.current = null
    }
  }, [videoRef])
}
