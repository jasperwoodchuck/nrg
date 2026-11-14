import type { CSSProperties, ReactNode } from 'react'

type TopographyProps = {
  color?: string
  lineCount?: number
  lineWidth?: number
  elevation?: number
  foreground?: number
  tilt?: number
  speed?: number
  direction?: 'forward' | 'backward' | 'left' | 'right'
  glow?: number
  depthOfField?: number
  fog?: number
  hoverEffect?: 'lift' | 'trace' | 'light'
  clickEffect?: 'pulse' | 'peak' | 'none'
  scale?: number
  detail?: number
  morph?: number
  brightness?: number
  markers?: 'plus' | 'dots' | 'none'
  mouseRadius?: number
  mouseStrength?: number
  parallax?: number
  className?: string
  style?: CSSProperties
}

declare function Topography(props: TopographyProps): ReactNode

export default Topography
