import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Download,
  Film,
  Map,
  ImagePlus,
  MapPinned,
  Play,
  RotateCcw,
  Sparkles,
  Upload,
  Video,
} from 'lucide-react'
import './App.css'

type Photo = {
  id: string
  url: string
  name: string
  label: string
  size: number
}

type RenderImage = {
  id: string
  img: HTMLImageElement
  label: string
}

type Aspect = 'landscape' | 'portrait' | 'square'
type Motion = 'smooth' | 'cinematic' | 'fast'

const sampleRooms = [
  'Entry / foyer',
  'Living room',
  'Kitchen sightline',
  'Primary bedroom',
  'Back patio',
]

const aspectSizes: Record<Aspect, { w: number; h: number; label: string }> = {
  landscape: { w: 1280, h: 720, label: '16:9 listing video' },
  portrait: { w: 1080, h: 1920, label: '9:16 reels' },
  square: { w: 1080, h: 1080, label: '1:1 feed' },
}

const motionProfiles: Record<Motion, { seconds: number; overlap: number; label: string }> = {
  smooth: { seconds: 3.2, overlap: 0.82, label: 'Smooth walk' },
  cinematic: { seconds: 4.6, overlap: 1.15, label: 'Cinematic glide' },
  fast: { seconds: 2.25, overlap: 0.58, label: 'Fast social cut' },
}

function App() {
  const [photos, setPhotos] = useState<Photo[]>([])
  const [floorPlan, setFloorPlan] = useState<string | null>(null)
  const [floorPlanName, setFloorPlanName] = useState<string>('')
  const [aspect, setAspect] = useState<Aspect>('landscape')
  const [motion, setMotion] = useState<Motion>('smooth')
  const [autoPath, setAutoPath] = useState(true)
  const [showMiniMap, setShowMiniMap] = useState(true)
  const [status, setStatus] = useState('Drop listing photos to begin. Everything stays in your browser.')
  const [isRecording, setIsRecording] = useState(false)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animationRef = useRef<number | null>(null)
  const photoInputRef = useRef<HTMLInputElement | null>(null)
  const planInputRef = useRef<HTMLInputElement | null>(null)
  const imagesRef = useRef<RenderImage[]>([])
  const floorImageRef = useRef<HTMLImageElement | null>(null)

  const outputSize = aspectSizes[aspect]
  const profile = motionProfiles[motion]
  const estimatedDuration = Math.max(1, photos.length) * profile.seconds

  const orderedLabels = useMemo(
    () => photos.map((photo, index) => photo.label || `Room ${index + 1}`),
    [photos],
  )

  useEffect(() => {
    let cancelled = false
    async function load() {
      const loaded = await Promise.all(
        photos.map(
          (photo) =>
            new Promise<RenderImage>((resolve) => {
              const img = new Image()
              img.crossOrigin = 'anonymous'
              img.onload = () => resolve({ id: photo.id, img, label: photo.label })
              img.onerror = () => resolve({ id: photo.id, img, label: photo.label })
              img.src = photo.url
            }),
        ),
      )
      if (!cancelled) {
        imagesRef.current = loaded
        setStatus(
          loaded.length
            ? `${loaded.length} photo${loaded.length === 1 ? '' : 's'} loaded. Previewing a connected camera path.`
            : 'Drop listing photos to begin. Everything stays in your browser.',
        )
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [photos])

  useEffect(() => {
    if (!floorPlan) {
      floorImageRef.current = null
      return
    }
    const img = new Image()
    img.onload = () => {
      floorImageRef.current = img
    }
    img.src = floorPlan
  }, [floorPlan])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let start = performance.now()
    const drawLoop = (now: number) => {
      const elapsed = (now - start) / 1000
      drawFrame(ctx, canvas, elapsed, false)
      animationRef.current = requestAnimationFrame(drawLoop)
    }
    animationRef.current = requestAnimationFrame(drawLoop)
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
      start = 0
    }
  // drawFrame is intentionally defined in-component so it sees current upload/object-url state.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [aspect, motion, showMiniMap, autoPath, photos])

  useEffect(() => {
    return () => {
      photos.forEach((photo) => URL.revokeObjectURL(photo.url))
      if (floorPlan) URL.revokeObjectURL(floorPlan)
      if (downloadUrl) URL.revokeObjectURL(downloadUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const importPhotos = (files: FileList | File[]) => {
    const next = Array.from(files)
      .filter((file) => file.type.startsWith('image/'))
      .map((file, idx) => ({
        id: `${file.name}-${file.size}-${Date.now()}-${idx}`,
        url: URL.createObjectURL(file),
        name: file.name,
        label: inferLabel(file.name, photos.length + idx),
        size: file.size,
      }))
    setPhotos((existing) => [...existing, ...next])
  }

  const onPhotoInput = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) importPhotos(event.target.files)
    event.target.value = ''
  }

  const onFloorInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (floorPlan) URL.revokeObjectURL(floorPlan)
    setFloorPlan(URL.createObjectURL(file))
    setFloorPlanName(file.name)
    setAutoPath(true)
    event.target.value = ''
  }

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    importPhotos(event.dataTransfer.files)
  }

  const updateLabel = (id: string, label: string) => {
    setPhotos((list) => list.map((photo) => (photo.id === id ? { ...photo, label } : photo)))
  }

  const movePhoto = (index: number, direction: -1 | 1) => {
    setPhotos((list) => {
      const target = index + direction
      if (target < 0 || target >= list.length) return list
      const next = [...list]
      const [item] = next.splice(index, 1)
      next.splice(target, 0, item)
      return next
    })
  }

  const clearProject = () => {
    photos.forEach((photo) => URL.revokeObjectURL(photo.url))
    if (floorPlan) URL.revokeObjectURL(floorPlan)
    if (downloadUrl) URL.revokeObjectURL(downloadUrl)
    setPhotos([])
    setFloorPlan(null)
    setFloorPlanName('')
    setDownloadUrl(null)
    setStatus('Reset. Add property photos to create a new walkthrough.')
  }

  const exportVideo = async () => {
    const canvas = canvasRef.current
    if (!canvas || isRecording) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const stream = canvas.captureStream(30)
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm'
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 })
    const chunks: Blob[] = []
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data)
    }
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' })
      if (downloadUrl) URL.revokeObjectURL(downloadUrl)
      const url = URL.createObjectURL(blob)
      setDownloadUrl(url)
      setStatus(`Exported ${(blob.size / 1024 / 1024).toFixed(1)} MB WebM walkthrough.`)
      stream.getTracks().forEach((track) => track.stop())
      setIsRecording(false)
    }

    setIsRecording(true)
    setStatus('Rendering video frames… keep this tab open.')
    recorder.start()
    const total = estimatedDuration
    const fps = 30
    for (let frame = 0; frame <= total * fps; frame += 1) {
      drawFrame(ctx, canvas, frame / fps, true)
      await wait(1000 / fps)
    }
    recorder.stop()
  }

  function drawFrame(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    elapsed: number,
    exporting: boolean,
  ) {
    canvas.width = outputSize.w
    canvas.height = outputSize.h
    const w = canvas.width
    const h = canvas.height
    const images = imagesRef.current
    const n = Math.max(images.length, 1)
    const segment = profile.seconds
    const total = n * segment
    const t = exporting ? Math.min(elapsed, total - 0.001) : elapsed % total
    const idx = Math.min(n - 1, Math.floor(t / segment))
    const nextIdx = (idx + 1) % n
    const local = (t % segment) / segment
    const ease = easeInOutCubic(local)
    const transitionStart = profile.overlap / segment
    const transition = Math.max(0, (local - (1 - transitionStart)) / transitionStart)

    drawBackdrop(ctx, w, h)
    if (images.length) {
      drawRoom(ctx, images[idx], idx, ease, w, h, 1)
      if (transition > 0 && images.length > 1) {
        drawDoorwayTransition(ctx, transition, w, h)
        ctx.save()
        ctx.globalAlpha = Math.min(1, transition * 1.12)
        drawRoom(ctx, images[nextIdx], nextIdx, easeInOutCubic(transition), w, h, 1)
        ctx.restore()
      }
    } else {
      drawSampleRoom(ctx, w, h, elapsed)
    }

    drawGlassFrame(ctx, w, h)
    drawHud(ctx, w, h, (images.length ? images[idx]?.label : '') || photos[idx]?.label || 'Upload photos to start', idx, n, local)
    if (showMiniMap) drawMiniMap(ctx, w, h, idx, n, local, floorImageRef.current)
    drawBottomRibbon(ctx, w, h, orderedLabels, idx)
  }

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div className="eyebrow"><Sparkles size={16} /> SnapTour-style listing walkthrough builder</div>
        <h1>Turn property photos into a connected walkthrough video.</h1>
        <p>
          Upload listing photos, optionally add a floor plan, arrange the room order, preview the camera path,
          then export a WebM video. No server upload — the prototype runs locally in your browser.
        </p>
        <div className="hero-actions">
          <button className="primary" onClick={() => photoInputRef.current?.click()}>
            <ImagePlus size={18} /> Add photos
          </button>
          <button className="secondary" onClick={() => planInputRef.current?.click()}>
            <Map size={18} /> Add floor plan
          </button>
        </div>
        <input ref={photoInputRef} className="hidden" type="file" accept="image/*" multiple onChange={onPhotoInput} />
        <input ref={planInputRef} className="hidden" type="file" accept="image/*" onChange={onFloorInput} />
      </section>

      <section className="workspace">
        <aside className="controls-card">
          <div
            className={`drop-zone ${isDragging ? 'dragging' : ''}`}
            onDragOver={(event) => {
              event.preventDefault()
              setIsDragging(true)
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            onClick={() => photoInputRef.current?.click()}
          >
            <Upload size={28} />
            <strong>Drop room photos here</strong>
            <span>JPG, PNG, HEIC-converted, or WebP</span>
          </div>

          <div className="setting-grid">
            <label>
              <span>Output shape</span>
              <select value={aspect} onChange={(event) => setAspect(event.target.value as Aspect)}>
                {Object.entries(aspectSizes).map(([key, value]) => (
                  <option key={key} value={key}>{value.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Camera motion</span>
              <select value={motion} onChange={(event) => setMotion(event.target.value as Motion)}>
                {Object.entries(motionProfiles).map(([key, value]) => (
                  <option key={key} value={key}>{value.label}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="toggle-row">
            <label><input type="checkbox" checked={autoPath} onChange={(event) => setAutoPath(event.target.checked)} /> Auto-map path</label>
            <label><input type="checkbox" checked={showMiniMap} onChange={(event) => setShowMiniMap(event.target.checked)} /> Mini floor-path overlay</label>
          </div>

          <div className="plan-chip">
            <MapPinned size={18} />
            {floorPlan ? <span>Floor plan: {floorPlanName}</span> : <span>No floor plan yet — using generated path</span>}
          </div>

          <div className="room-list">
            <div className="list-head">
              <strong>Walkthrough order</strong>
              <span>{photos.length || sampleRooms.length} stops</span>
            </div>
            {photos.length ? photos.map((photo, index) => (
              <div className="room-item" key={photo.id}>
                <img src={photo.url} alt="" />
                <input value={photo.label} onChange={(event) => updateLabel(photo.id, event.target.value)} />
                <div className="reorder">
                  <button aria-label="Move room up" onClick={() => movePhoto(index, -1)} disabled={index === 0}><ArrowUp size={14} /></button>
                  <button aria-label="Move room down" onClick={() => movePhoto(index, 1)} disabled={index === photos.length - 1}><ArrowDown size={14} /></button>
                </div>
              </div>
            )) : sampleRooms.map((room, index) => (
              <div className="room-item ghost" key={room}>
                <div className="sample-thumb">{index + 1}</div>
                <span>{room}</span>
              </div>
            ))}
          </div>

          <div className="export-card">
            <div>
              <strong>{estimatedDuration.toFixed(0)}s estimated video</strong>
              <p>{status}</p>
            </div>
            <div className="export-actions">
              <button className="primary" onClick={exportVideo} disabled={isRecording}>
                <Video size={18} /> {isRecording ? 'Rendering…' : 'Export WebM'}
              </button>
              {downloadUrl && <a className="download" href={downloadUrl} download="property-walkthrough.webm"><Download size={18} /> Download</a>}
              <button className="secondary icon-only" onClick={clearProject} title="Reset project"><RotateCcw size={18} /></button>
            </div>
          </div>
        </aside>

        <section className="preview-card">
          <div className="preview-toolbar">
            <div><Film size={18} /> Live walkthrough preview</div>
            <button onClick={() => setStatus('Preview refreshed with the current room order.')}><Play size={16} /> Preview loop</button>
          </div>
          <canvas ref={canvasRef} className="video-canvas" aria-label="Walkthrough video preview" />
        </section>
      </section>
    </main>
  )
}

function inferLabel(name: string, index: number) {
  const clean = name
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b(img|dsc|photo|listing|final|copy)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  return clean ? titleCase(clean) : `Room ${index + 1}`
}

function titleCase(value: string) {
  return value.replace(/\w\S*/g, (text) => text[0].toUpperCase() + text.slice(1).toLowerCase())
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function easeInOutCubic(x: number) {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}

function drawBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const gradient = ctx.createLinearGradient(0, 0, w, h)
  gradient.addColorStop(0, '#06192f')
  gradient.addColorStop(0.45, '#0a5ea8')
  gradient.addColorStop(1, '#7ee8fa')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, w, h)
  for (let i = 0; i < 16; i += 1) {
    ctx.fillStyle = `rgba(255,255,255,${0.02 + i * 0.004})`
    ctx.beginPath()
    ctx.arc((w * (i * 97 % 100)) / 100, (h * (i * 41 % 100)) / 100, w * (0.04 + (i % 5) * 0.01), 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawRoom(ctx: CanvasRenderingContext2D, room: RenderImage | undefined, index: number, ease: number, w: number, h: number, alpha: number) {
  if (!room?.img?.naturalWidth) {
    drawSampleRoom(ctx, w, h, ease + index)
    return
  }
  const img = room.img
  const pad = Math.min(w, h) * 0.055
  const frameW = w - pad * 2
  const frameH = h - pad * 2
  const scale = Math.max(frameW / img.naturalWidth, frameH / img.naturalHeight) * (1.06 + ease * 0.1)
  const sourceW = frameW / scale
  const sourceH = frameH / scale
  const pathX = Math.sin((index * 1.7 + ease) * Math.PI) * img.naturalWidth * 0.08
  const pathY = Math.cos((index * 0.9 + ease) * Math.PI) * img.naturalHeight * 0.045
  const sx = clamp(img.naturalWidth / 2 - sourceW / 2 + pathX, 0, img.naturalWidth - sourceW)
  const sy = clamp(img.naturalHeight / 2 - sourceH / 2 + pathY, 0, img.naturalHeight - sourceH)

  ctx.save()
  roundRect(ctx, pad, pad, frameW, frameH, Math.min(44, pad * 0.75))
  ctx.clip()
  ctx.globalAlpha = alpha
  ctx.translate(w / 2, h / 2)
  ctx.transform(1, 0.015 * Math.sin(ease * Math.PI), 0.018 * Math.cos(ease * Math.PI), 1, 0, 0)
  ctx.drawImage(img, sx, sy, sourceW, sourceH, -frameW / 2, -frameH / 2, frameW, frameH)
  drawVignette(ctx, frameW, frameH)
  ctx.restore()
}

function drawSampleRoom(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const pad = Math.min(w, h) * 0.055
  const fw = w - pad * 2
  const fh = h - pad * 2
  ctx.save()
  roundRect(ctx, pad, pad, fw, fh, 40)
  ctx.clip()
  const wall = ctx.createLinearGradient(0, pad, 0, h - pad)
  wall.addColorStop(0, '#dbe8dd')
  wall.addColorStop(0.58, '#edf3ed')
  wall.addColorStop(0.59, '#a2603a')
  wall.addColorStop(1, '#d39258')
  ctx.fillStyle = wall
  ctx.fillRect(pad, pad, fw, fh)
  ctx.fillStyle = '#f7fafc'
  ctx.fillRect(w * 0.63, h * 0.21, w * 0.17, h * 0.56)
  ctx.fillStyle = '#2d3748'
  ctx.fillRect(w * 0.79, h * 0.23, w * 0.025, h * 0.52)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(w * 0.18 + Math.sin(t) * 16, h * 0.23, w * 0.14, h * 0.24)
  ctx.strokeStyle = '#805a3b'
  ctx.lineWidth = 8
  ctx.strokeRect(w * 0.18 + Math.sin(t) * 16, h * 0.23, w * 0.14, h * 0.24)
  for (let x = 0; x < 8; x += 1) {
    ctx.strokeStyle = 'rgba(85,45,15,.15)'
    ctx.beginPath()
    ctx.moveTo(pad, h * 0.67 + x * 26)
    ctx.lineTo(w - pad, h * 0.6 + x * 16)
    ctx.stroke()
  }
  drawVignette(ctx, fw, fh)
  ctx.restore()
}

function drawDoorwayTransition(ctx: CanvasRenderingContext2D, progress: number, w: number, h: number) {
  const p = easeInOutCubic(progress)
  ctx.save()
  ctx.globalAlpha = 1 - p * 0.6
  ctx.fillStyle = 'rgba(0,0,0,.42)'
  ctx.fillRect(0, 0, w, h)
  ctx.globalCompositeOperation = 'destination-out'
  const doorW = w * (0.18 + p * 0.86)
  const doorH = h * (0.25 + p * 0.9)
  roundRect(ctx, w / 2 - doorW / 2, h / 2 - doorH / 2, doorW, doorH, 30 + p * 80)
  ctx.fill()
  ctx.restore()
}

function drawGlassFrame(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const pad = Math.min(w, h) * 0.055
  ctx.save()
  ctx.lineWidth = Math.max(7, Math.min(w, h) * 0.012)
  ctx.strokeStyle = 'rgba(255,255,255,.55)'
  roundRect(ctx, pad, pad, w - pad * 2, h - pad * 2, Math.min(44, pad * 0.75))
  ctx.stroke()
  ctx.lineWidth = 2
  ctx.strokeStyle = 'rgba(1,24,50,.38)'
  ctx.stroke()
  ctx.restore()
}

function drawHud(ctx: CanvasRenderingContext2D, w: number, h: number, label: string, index: number, total: number, local: number) {
  const pad = Math.min(w, h) * 0.055
  ctx.save()
  ctx.fillStyle = 'rgba(3, 15, 32, .64)'
  roundRect(ctx, pad * 1.35, pad * 1.28, Math.min(w * 0.48, 520), 74, 20)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = `700 ${Math.max(24, w * 0.025)}px Inter, system-ui, sans-serif`
  ctx.fillText(label, pad * 1.7, pad * 1.85)
  ctx.font = `500 ${Math.max(14, w * 0.012)}px Inter, system-ui, sans-serif`
  ctx.fillStyle = 'rgba(255,255,255,.72)'
  ctx.fillText(`Stop ${index + 1} of ${total} • connected camera path`, pad * 1.7, pad * 2.32)
  ctx.fillStyle = 'rgba(255,255,255,.22)'
  roundRect(ctx, pad * 1.7, pad * 2.48, Math.min(w * 0.34, 420), 7, 10)
  ctx.fill()
  ctx.fillStyle = '#62e6ff'
  roundRect(ctx, pad * 1.7, pad * 2.48, Math.min(w * 0.34, 420) * local, 7, 10)
  ctx.fill()
  ctx.restore()
}

function drawMiniMap(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  index: number,
  total: number,
  local: number,
  floor: HTMLImageElement | null,
) {
  const size = Math.min(w, h) * 0.22
  const x = w - size - Math.min(w, h) * 0.09
  const y = h - size - Math.min(w, h) * 0.12
  ctx.save()
  ctx.fillStyle = 'rgba(255,255,255,.82)'
  roundRect(ctx, x, y, size, size, 22)
  ctx.fill()
  ctx.strokeStyle = 'rgba(8, 26, 48, .18)'
  ctx.lineWidth = 2
  ctx.stroke()
  if (floor?.naturalWidth) {
    ctx.save()
    roundRect(ctx, x + 8, y + 8, size - 16, size - 16, 16)
    ctx.clip()
    ctx.globalAlpha = 0.45
    ctx.drawImage(floor, x + 8, y + 8, size - 16, size - 16)
    ctx.restore()
  } else {
    ctx.strokeStyle = 'rgba(8, 26, 48, .28)'
    ctx.lineWidth = 3
    ctx.strokeRect(x + size * 0.12, y + size * 0.16, size * 0.34, size * 0.31)
    ctx.strokeRect(x + size * 0.52, y + size * 0.14, size * 0.32, size * 0.35)
    ctx.strokeRect(x + size * 0.2, y + size * 0.56, size * 0.59, size * 0.28)
  }
  const points = Array.from({ length: total }, (_, i) => {
    const angle = -Math.PI * 0.85 + (i / Math.max(1, total - 1)) * Math.PI * 1.7
    return { px: x + size / 2 + Math.cos(angle) * size * 0.32, py: y + size / 2 + Math.sin(angle) * size * 0.28 }
  })
  ctx.strokeStyle = '#0879ff'
  ctx.lineWidth = 5
  ctx.lineCap = 'round'
  ctx.beginPath()
  points.forEach((p, i) => (i ? ctx.lineTo(p.px, p.py) : ctx.moveTo(p.px, p.py)))
  ctx.stroke()
  points.forEach((p, i) => {
    ctx.fillStyle = i <= index ? '#042f5f' : '#fff'
    ctx.strokeStyle = '#0879ff'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(p.px, p.py, i === index ? 10 : 7, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  })
  const current = points[index] || points[0]
  const next = points[(index + 1) % total] || current
  const cx = current.px + (next.px - current.px) * local
  const cy = current.py + (next.py - current.py) * local
  ctx.fillStyle = '#62e6ff'
  ctx.beginPath()
  ctx.arc(cx, cy, 8, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawBottomRibbon(ctx: CanvasRenderingContext2D, w: number, h: number, labels: string[], index: number) {
  if (!labels.length) return
  const pad = Math.min(w, h) * 0.055
  const y = h - pad * 0.96
  ctx.save()
  ctx.fillStyle = 'rgba(0, 10, 25, .56)'
  roundRect(ctx, pad, y - 34, w - pad * 2, 44, 18)
  ctx.fill()
  const max = Math.min(labels.length, 5)
  ctx.font = `600 ${Math.max(13, w * 0.011)}px Inter, system-ui, sans-serif`
  for (let i = 0; i < max; i += 1) {
    const labelIndex = (index + i) % labels.length
    ctx.fillStyle = i === 0 ? '#ffffff' : 'rgba(255,255,255,.56)'
    ctx.fillText(`${i === 0 ? 'Now' : 'Next'}: ${labels[labelIndex]}`, pad + 22 + i * ((w - pad * 2) / max), y - 7)
  }
  ctx.restore()
}

function drawVignette(ctx: CanvasRenderingContext2D, fw: number, fh: number) {
  const g = ctx.createRadialGradient(0, 0, Math.min(fw, fh) * 0.1, 0, 0, Math.max(fw, fh) * 0.7)
  g.addColorStop(0, 'rgba(255,255,255,0)')
  g.addColorStop(1, 'rgba(0,0,0,.34)')
  ctx.fillStyle = g
  ctx.fillRect(-fw / 2, -fh / 2, fw, fh)
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max))
}

export default App
