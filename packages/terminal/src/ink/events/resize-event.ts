import { TerminalEvent } from './terminal-event.js'

export class ResizeEvent extends TerminalEvent {
  readonly width: number
  readonly height: number

  constructor(width: number, height: number) {
    super('resize', { bubbles: false, cancelable: false })
    this.width = width
    this.height = height
  }
}
