declare module 'react-signature-canvas' {
  import { Component } from 'react'

  export interface SignatureCanvasProps {
    canvasProps?: React.CanvasHTMLAttributes<HTMLCanvasElement>
    clearOnResize?: boolean
    penColor?: string
    backgroundColor?: string
  }

  export default class SignatureCanvas extends Component<SignatureCanvasProps> {
    clear(): void
    isEmpty(): boolean
    toDataURL(type?: string, encoderOptions?: number): string
  }
}
