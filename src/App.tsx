import { useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import decodeImage from './assets/decode.webp'
import './App.css'

type Point = {
  x: number
  y: number
}

function clampToBounds(value: number) {
  return Math.min(100, Math.max(0, value))
}

function App() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [points, setPoints] = useState<Point[]>([])
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null)

  const getRelativePoint = (event: ReactMouseEvent<HTMLDivElement>): Point | null => {
    const bounds = containerRef.current?.getBoundingClientRect()
    if (!bounds) {
      return null
    }

    const x = clampToBounds(((event.clientX - bounds.left) / bounds.width) * 100)
    const y = clampToBounds(((event.clientY - bounds.top) / bounds.height) * 100)

    return { x, y }
  }

  const handleCanvasClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const point = getRelativePoint(event)
    if (!point) {
      return
    }

    setPoints((current) => {
      if (current.length === 1) {
        setHoverPoint(null)
        return [current[0], point]
      }

      setHoverPoint(null)
      return [point]
    })
  }

  const handleCanvasMouseMove = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (points.length !== 1) {
      return
    }

    const point = getRelativePoint(event)
    if (point) {
      setHoverPoint(point)
    }
  }

  const handleCanvasMouseLeave = () => {
    if (points.length === 1) {
      setHoverPoint(null)
    }
  }

  const handleReset = () => {
    setPoints([])
    setHoverPoint(null)
  }

  const startPoint = points[0] ?? null
  const activeEndPoint = points.length === 2 ? points[1] : hoverPoint

  return (
    <div className="app">
      <h1>Point Linker</h1>
      <p className="instructions">
        Click once on the image to drop the first point. Move the cursor and click again to finish the line.
        Click a third time to start over, or use reset.
      </p>

      <div
        className="canvas"
        ref={containerRef}
        onClick={handleCanvasClick}
        onMouseMove={handleCanvasMouseMove}
        onMouseLeave={handleCanvasMouseLeave}
      >
        <img src={decodeImage} alt="Decode reference" className="canvas-image" />

        {startPoint && (
          <div
            className="marker"
            style={{ left: `${startPoint.x}%`, top: `${startPoint.y}%` }}
          />
        )}

        {startPoint && activeEndPoint && (
          <>
            <svg className="overlay" viewBox="0 0 100 100" preserveAspectRatio="none">
              <line
                x1={startPoint.x}
                y1={startPoint.y}
                x2={activeEndPoint.x}
                y2={activeEndPoint.y}
              />
            </svg>
            <div
              className="marker"
              style={{ left: `${activeEndPoint.x}%`, top: `${activeEndPoint.y}%` }}
            />
          </>
        )}
      </div>

      <div className="actions">
        <button type="button" onClick={handleReset}>
          Reset
        </button>
        {startPoint && (
          <span className="readout">
            Start: ({startPoint.x.toFixed(1)}%, {startPoint.y.toFixed(1)}%)
          </span>
        )}
        {points.length === 2 && (
          <span className="readout">
            End: ({points[1].x.toFixed(1)}%, {points[1].y.toFixed(1)}%)
          </span>
        )}
      </div>
    </div>
  )
}

export default App
