import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'
import type { PosePoint } from '../types'

const assetUrl = (path: string) => new URL(`${import.meta.env.BASE_URL}${path}`, document.baseURI).href
const wasmRoot = assetUrl('mediapipe/wasm')
const modelUrl = assetUrl('models/pose_landmarker_lite.task')
let landmarkerPromise: Promise<PoseLandmarker> | undefined

export function loadPoseLandmarker(onProgress?: (message: string) => void): Promise<PoseLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      onProgress?.('Loading pose model…')
      const fileset = await FilesetResolver.forVisionTasks(wasmRoot)
      const landmarker = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: modelUrl, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.45,
        minPosePresenceConfidence: 0.45,
        minTrackingConfidence: 0.45,
      }).catch(async (gpuError: unknown) => {
        console.warn('GPU pose inference unavailable; retrying with CPU.', gpuError)
        return PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: modelUrl, delegate: 'CPU' },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.45,
          minPosePresenceConfidence: 0.45,
          minTrackingConfidence: 0.45,
        })
      })
      onProgress?.('Pose model ready')
      return landmarker
    })().catch((error: unknown) => {
      landmarkerPromise = undefined
      throw error
    })
  }
  return landmarkerPromise
}

export function detectPose(landmarker: PoseLandmarker, video: HTMLVideoElement): PosePoint[] | null {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth === 0) return null
  const result = landmarker.detectForVideo(video, performance.now())
  const pose = result.landmarks[0]
  if (!pose) return null
  return pose.map((point) => ({
    x: point.x,
    y: point.y,
    z: point.z,
    visibility: point.visibility ?? 0,
  }))
}
