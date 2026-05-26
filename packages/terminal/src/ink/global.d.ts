import type { ReactNode, Ref } from 'react'
import type { DOMElement } from './dom.js'
import type { ClickEvent } from './events/click-event.js'
import type { FocusEvent } from './events/focus-event.js'
import type { KeyboardEvent } from './events/keyboard-event.js'
import type { Styles, TextStyles } from './styles.js'

type InkSharedProps = {
  children?: ReactNode
}

type InkBoxProps = InkSharedProps & {
  ref?: Ref<DOMElement>
  style?: Styles
  tabIndex?: number
  autoFocus?: boolean
  stickyScroll?: boolean
  onClick?: (event: ClickEvent) => void
  onFocus?: (event: FocusEvent) => void
  onFocusCapture?: (event: FocusEvent) => void
  onBlur?: (event: FocusEvent) => void
  onBlurCapture?: (event: FocusEvent) => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  onKeyDown?: (event: KeyboardEvent) => void
  onKeyDownCapture?: (event: KeyboardEvent) => void
}

type InkTextProps = InkSharedProps & {
  style?: Styles
  textStyles?: TextStyles
}

type InkRootProps = InkSharedProps

type InkVirtualTextProps = InkSharedProps

type InkLinkProps = InkSharedProps & {
  href: string
}

type InkRawAnsiProps = {
  rawText: string
  rawWidth: number
  rawHeight: number
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'ink-box': InkBoxProps
      'ink-text': InkTextProps
      'ink-root': InkRootProps
      'ink-virtual-text': InkVirtualTextProps
      'ink-link': InkLinkProps
      'ink-raw-ansi': InkRawAnsiProps
    }
  }
}

export {}
