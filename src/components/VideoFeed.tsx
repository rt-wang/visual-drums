import { useEffect, useRef } from 'react'
import { useHandLandmarker } from '../vision/useHandLandmarker'

export default function VideoFeed() {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    let stream: MediaStream | null = null
    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720, facingMode: 'user' },
          audio: false,
        })
        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          await video.play()
        }
      } catch (err) {
        console.error('getUserMedia failed', err)
      }
    })()

    return () => {
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  useHandLandmarker(videoRef)

  return (
    <video
      ref={videoRef}
      className="video-feed"
      playsInline
      muted
      autoPlay
    />
  )
}
