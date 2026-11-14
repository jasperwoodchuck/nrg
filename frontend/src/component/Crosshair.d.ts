import type { CSSProperties, ReactNode, RefObject } from 'react'

type CrosshairProps = {
  color?: string
  containerRef?: RefObject<HTMLElement | null> | null
  thickness?: number
  opacity?: number
  lineStyle?: 'solid' | 'dashed' | 'dotted'
  gap?: number
  fade?: number
  smoothing?: number
  showCoordinates?: boolean
  targetEffect?: 'lock' | 'glitch' | 'none'
  targetSelector?: string
  clickPulse?: boolean
  hideCursor?: boolean
  blendMode?: CSSProperties['mixBlendMode']
  className?: string
  style?: CSSProperties
}

declare function Crosshair(props: CrosshairProps): ReactNode

export default Crosshair
