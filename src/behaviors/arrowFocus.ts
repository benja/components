import {isFocusable, iterateFocusableElements} from '../utils/iterateFocusableElements'
import {polyfill as eventListenerSignalPolyfill} from '../polyfills/eventListenerSignal'
import {isMacOS} from '../utils/userAgent'
import {uniqueId} from '../utils/uniqueId'

eventListenerSignalPolyfill()

export type Direction = 'previous' | 'next'

export type FocusMovementKeys =
  | 'ArrowLeft'
  | 'ArrowDown'
  | 'ArrowUp'
  | 'ArrowRight'
  | 'h'
  | 'j'
  | 'k'
  | 'l'
  | 'a'
  | 's'
  | 'w'
  | 'd'
  | 'Tab'
  | 'Home'
  | 'End'
  | 'PageUp'
  | 'PageDown'

export const KeyBits = {
  // Left and right arrow keys (previous and next, respectively)
  ArrowHorizontal: 0b000000001,

  // Up and down arrow keys (previous and next, respectively)
  ArrowVertical: 0b000000010,

  // The "J" and "K" keys (next and previous, respectively)
  JK: 0b000000100,

  // The "H" and "L" keys (previous and next, respectively)
  HL: 0b000001000,

  // The Home and End keys (previous and next, respectively, to end)
  HomeAndEnd: 0b000010000,

  // The PgUp and PgDn keys (previous and next, respectively, to end)
  PageUpDown: 0b100000000,

  // The "W" and "S" keys (previous and next, respectively)
  WS: 0b000100000,

  // The "A" and "D" keys (previous and next, respectively)
  AD: 0b001000000,

  // The Tab key (next)
  Tab: 0b010000000,

  // These are set below
  ArrowAll: 0,
  HJKL: 0,
  WASD: 0,
  All: 0
}
KeyBits.ArrowAll = KeyBits.ArrowHorizontal | KeyBits.ArrowVertical
KeyBits.HJKL = KeyBits.JK | KeyBits.HL
KeyBits.WASD = KeyBits.WS | KeyBits.AD
KeyBits.All = KeyBits.ArrowAll | KeyBits.HJKL | KeyBits.HomeAndEnd | KeyBits.PageUpDown | KeyBits.WASD | KeyBits.Tab

const KEY_TO_BIT = {
  ArrowLeft: 0b00000001,
  ArrowDown: 0b00000010,
  ArrowUp: 0b00000010,
  ArrowRight: 0b00000001,
  h: 0b00001000,
  j: 0b00000100,
  k: 0b00000100,
  l: 0b00001000,
  a: 0b01000000,
  s: 0b00100000,
  w: 0b00100000,
  d: 0b01000000,
  Tab: 0b10000000,
  Home: 0b00010000,
  End: 0b00010000,
  PageUp: 0b100000000,
  PageDown: 0b100000000
} as {[k in FocusMovementKeys]: number}

const KEY_TO_DIRECTION = {
  ArrowLeft: 'previous',
  ArrowDown: 'next',
  ArrowUp: 'previous',
  ArrowRight: 'next',
  h: 'previous',
  j: 'next',
  k: 'previous',
  l: 'next',
  a: 'previous',
  s: 'next',
  w: 'previous',
  d: 'next',
  Tab: 'next',
  Home: 'previous',
  End: 'next',
  PageUp: 'previous',
  PageDown: 'next'
} as {[k in FocusMovementKeys]: Direction}

/**
 * Options that control the behavior of the arrow focus behavior.
 */
export interface ArrowFocusOptions {
  /**
   * If true, when the last element in the container is focused, focusing the _next_ item
   * should cause the first element in the container to be focused. Likewise, if the first
   * item in the list is focused, focusing the _previous_ item should cause the last element
   * in the container to be focused. Default: false.
   */
  circular?: boolean

  /**
   * If set, this will be called to get the next focusable element. If this function
   * returns null, we will try to determine the next direction outselves. Use the
   * `bindKeys` option to customize which keys are listened to.
   *
   * The function can accept a Direction, indicating the direction focus should move,
   * a boolean indicating whether or not focus should move to the end of the list of
   * elements in the given direction, the HTMLElement that was previously focused, and
   * lastly the `KeyboardEvent` object created by the original `"keydown"` event.
   *
   * The `toEnd` argument is true if:
   *   - Home or End key used
   *   - Command key used (macOS)
   *   - Control key used (Windows or Linux)
   */
  getNextFocusable?: (
    direction: Direction,
    toEnd: boolean,
    from: Element | undefined,
    event: KeyboardEvent
  ) => HTMLElement | undefined

  /**
   * Called to decide if a focusable element is allowed to participate in the arrow
   * key focus behavior.
   *
   * By default, all focusable elements within the given container will participate
   * in the arrow key focus behavior. If you need to withold some elements from
   * particpation, implement this callback to return false for those elements.
   */
  focusableElementFilter?: (element: HTMLElement) => boolean

  /**
   * Bit flags that identify keys that will be bound to. Each available key either
   * moves focus to the "next" element or the "previous" element, so it is best
   * to only bind the keys that make sense to move focus in your UI. Use the `KeyBits`
   * object to discover supported keys.
   *
   * Use the bitwise "OR" operator (`|`) to combine key types. For example,
   * `KeyBits.WASD | KeyBits.HJKL` represents all of W, A, S, D, H, J, K, and L.
   *
   * A note on KeyBits.PageUpDown: This behavior does not support paging, so by default
   * using these keys will result in the same behavior as Home and End. To override this
   * behavior, implement `getNextFocusable`.
   *
   * The default for this setting is `KeyBits.ArrowVertical | KeyBits.HomeAndEnd`, unless
   * `getNextFocusable` is provided, in which case `KeyBits.ArrowAll | KeyBits.HomeAndEnd`
   * is used as the default.
   */
  bindKeys?: number

  /**
   * If provided, this signal can be used to disable the behavior and remove any
   * event listeners.
   */
  abortSignal?: AbortSignal

  /**
   * If activeDescendantOptions.controllingElement is supplied, do not move focus or alter
   * `tabindex` on any element. Instead, manage `aria-activedescendant`, `aria-selected`,
   * and `aria-controls` according to the ARIA best practices guidelines.
   * @see https://www.w3.org/TR/wai-aria-practices-1.1/#kbd_focus_activedescendant
   *
   * The given `controllingElement` will be given an `aria-controls` attribute that
   * references the ID of the `container`. Additionally, it will be given an
   * `aria-activedescendant` attribute that references the ID of the currently-active
   * descendant.
   */
  activeDescendantOptions?: {
    /**
     * The element that will retain focus as other elements become active.
     */
    controllingElement: HTMLElement

    /**
     * Called each time the active descendant changes. Note that either of the parameters
     * may be undefined, e.g. when an element in the container first becomes active, or
     * when the controlling element becomes unfocused.
     */
    onActiveDescendantChanged?: (
      newActiveDescendant: HTMLElement | undefined,
      previousActiveDescendant: HTMLElement | undefined
    ) => void
  }

  /**
   * This option allows customization of the behavior that determines which of the
   * focusable elements should be focused when focus enters the container via the Tab key.
   *
   * When set to "first", whenever focus enters the container via Tab, we will focus the
   * first focusable element. When set to "previous", the most recently focused element
   * will be focused (fallback to first if there was no previous).
   *
   * If a function is provided, this function should return the HTMLElement intended
   * to receive focus. This is useful if you want to focus the currently "selected"
   * item or element.
   *
   * Default: "previous"
   *
   * For more information, @see https://www.w3.org/TR/wai-aria-practices-1.1/#kbd_general_within
   */
  focusInStrategy?: 'first' | 'previous' | ((previousFocusedElement: Element) => HTMLElement | undefined)
}

function getDirection(keyboardEvent: KeyboardEvent) {
  const direction = KEY_TO_DIRECTION[keyboardEvent.key as keyof typeof KEY_TO_DIRECTION]
  if (keyboardEvent.key === 'Tab' && keyboardEvent.shiftKey) {
    return 'previous'
  }
  return direction
}

/**
 * There are some situations where we do not want various keys to affect focus. This function
 * checks for those situations.
 * 1. Home and End should not move focus when a text input or textarea is active
 * 2. Keys that would normally type characters into an input or navigate a select element should be ignored
 * 3. The down arrow should not move focus when a select is active since that normally invokes the dropdown (?)
 * 4. Page Up and Page Down within a textarea should not have any effect
 * 5. When in a text input or textarea, left should only move focus if the cursor is at the beginning of the input
 * 6. When in a text input or textarea, right should only move focus if the cursor is at the end of the input
 * 7. When in a textarea, up and down should only move focus if cursor is at the beginning or end, respectively.
 * @param keyboardEvent
 * @param activeElement
 */
function shouldIgnoreFocusHandling(keyboardEvent: KeyboardEvent, activeElement: Element | null) {
  const key = keyboardEvent.key

  // Get the number of characters in `key`, accounting for double-wide UTF-16 chars. If keyLength
  // is 1, we can assume it's a "printable" character. Otherwise it's likely a control character.
  // One exception is the Tab key, which is technically printable, but browsers generally assign
  // its function to move focus rather than type a <TAB> character.
  const keyLength = [...key].length

  const isTextInput =
    (activeElement instanceof HTMLInputElement && activeElement.type === 'text') ||
    activeElement instanceof HTMLTextAreaElement
  const isSelect = activeElement instanceof HTMLSelectElement

  // If we would normally type a character into an input, ignore
  // Also, Home and End keys should never affect focus when in a text input
  if (isTextInput && (keyLength === 1 || key === 'Home' || key === 'End')) {
    return true
  }

  // Since down arrow normally opens a select, and regular characters change the selection, ignore those
  // Maybe: Allow Cmd/Ctrl as the escape hatch for down arrow? Can't be Alt since this is a common gesture for
  //        opening the dropdown on Windows.
  if (
    isSelect &&
    ((key === 'ArrowDown' && !(isMacOS() ? keyboardEvent.metaKey : keyboardEvent.ctrlKey)) || keyLength === 1)
  ) {
    return true
  }

  // Ignore page up and page down for textareas
  if (activeElement instanceof HTMLTextAreaElement && (key === 'PageUp' || key === 'PageDown')) {
    return true
  }

  if (isTextInput) {
    const textInput = activeElement as HTMLInputElement | HTMLTextAreaElement
    const cursorAtStart = textInput.selectionStart === 0 && textInput.selectionEnd === 0
    const cursorAtEnd =
      textInput.selectionStart === textInput.value.length && textInput.selectionEnd === textInput.value.length

    // When in a text area or text input, only move focus left/right if at beginning/end of the field
    if (key === 'ArrowLeft' && !cursorAtStart) {
      return true
    }
    if (key === 'ArrowRight' && !cursorAtEnd) {
      return true
    }

    // When in a text area, only move focus up/down if at beginning/end of the field
    if (textInput instanceof HTMLTextAreaElement) {
      if (key === 'ArrowUp' && !cursorAtStart) {
        return true
      }
      if (key === 'ArrowDown' && !cursorAtEnd) {
        return true
      }
    }
  }

  return false
}

export function arrowFocus(container: HTMLElement, options?: ArrowFocusOptions): AbortController {
  const tabbableElements: HTMLElement[] = []
  const savedTabIndex = new WeakMap<HTMLElement, string | null>()
  const bindKeys =
    options?.bindKeys ?? (options?.getNextFocusable ? KeyBits.ArrowAll : KeyBits.ArrowVertical) | KeyBits.HomeAndEnd
  const circular = options?.circular ?? false
  const focusInStrategy = options?.focusInStrategy ?? 'previous'
  const activeDescendantControl = options?.activeDescendantOptions?.controllingElement
  const activeDescendantCallback = options?.activeDescendantOptions?.onActiveDescendantChanged

  // We are going to keep track of all tabbable elements we've encountered. This will be
  // necessary if one of these elements is removed from the container and subsequently
  // re-added. Since we are settings tabindex="-1" on each of these elements, once it
  // re-enters the container, we will not otherwise recognize it as a tabbable element.
  // This implementation makes the assumption that once something is identified as a
  // tabbable element, it will always be a tabbable element.
  const allSeenTabbableElements = new WeakSet<HTMLElement>()

  function updateTabIndex(from?: HTMLElement, to?: HTMLElement) {
    if (!activeDescendantControl) {
      from?.setAttribute('tabindex', '-1')
      to?.setAttribute('tabindex', '0')
    }
  }

  function setActiveDescendant(from: HTMLElement | undefined, to: HTMLElement) {
    if (!to.id) {
      to.setAttribute('id', uniqueId())
    }
    currentFocusedElement = to
    activeDescendantControl?.setAttribute('aria-activedescendant', to.id)

    activeDescendantCallback?.(to, from)
  }

  function suspendActiveDescendant() {
    activeDescendantControl?.removeAttribute('aria-activedescendant')
    activeDescendantSuspended = true
    activeDescendantCallback?.(undefined, currentFocusedElement)
    currentFocusedElement = undefined
  }

  function beginFocusManagement(...elements: HTMLElement[]) {
    const filteredElements = elements.filter(e => options?.focusableElementFilter?.(e) ?? true)
    if (filteredElements.length === 0) {
      return
    }
    // Insert all elements atomically. Assume that all passed elements are well-ordered.
    const insertIndex = tabbableElements.findIndex(
      e => (e.compareDocumentPosition(filteredElements[0]) & Node.DOCUMENT_POSITION_PRECEDING) > 0
    )
    console.log('insert index: ' + insertIndex)
    tabbableElements.splice(insertIndex === -1 ? tabbableElements.length : insertIndex, 0, ...filteredElements)
    for (const element of filteredElements) {
      // Set tabindex="-1" on all tabbable elements, but save the original
      // value in case we need to disable the behavior
      if (!savedTabIndex.has(element)) {
        savedTabIndex.set(element, element.getAttribute('tabindex'))
      }
      element.setAttribute('tabindex', '-1')

      allSeenTabbableElements.add(element)
    }
  }

  function endFocusManagement(element: HTMLElement) {
    const tabbableElementIndex = tabbableElements.findIndex(e => e === element)
    if (tabbableElementIndex >= 0) {
      tabbableElements.splice(tabbableElementIndex, 1)

      // If removing the last-focused element, set tabindex=0 to the first element in the list.
      if (element.getAttribute('tabindex') === '0' && tabbableElements.length > 0) {
        updateTabIndex(undefined, tabbableElements[0])
        currentFocusedElement = tabbableElements[0]
        currentFocusedIndex = 0
      }
    }
    savedTabIndex.delete(element)
  }

  // Take all tabbable elements within container under management
  beginFocusManagement(...iterateFocusableElements(container))

  console.log(tabbableElements)

  // Open the first tabbable element for tabbing
  updateTabIndex(undefined, tabbableElements[0])

  // If the DOM structure of the container changes, make sure we keep our state up-to-date
  // with respect to the focusable elements cache and its order
  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      for (const addedNode of mutation.addedNodes) {
        if (addedNode instanceof HTMLElement && (isFocusable(addedNode) || allSeenTabbableElements.has(addedNode))) {
          beginFocusManagement(addedNode)
        }
      }
      for (const removedNode of mutation.removedNodes) {
        if (removedNode instanceof HTMLElement && savedTabIndex.has(removedNode)) {
          endFocusManagement(removedNode)
        }
      }
    }
  })

  observer.observe(container, {
    subtree: true,
    childList: true
  })

  const controller = new AbortController()
  const signal = options?.abortSignal ?? controller.signal

  // When using activedescendant focusing, the first focus-in is caused by our listeners
  // meaning we have to approach zero. This is safe since we clamp the value before using it.
  let currentFocusedIndex = 0
  let activeDescendantSuspended = activeDescendantControl ? true : false
  let currentFocusedElement = activeDescendantControl ? undefined : tabbableElements[0]

  let elementIndexFocusedByClick: number | undefined = undefined
  container.addEventListener(
    'mousedown',
    event => {
      // Since focusin is only called when focus changes, we need to make sure the clicked
      // element isn't already focused.
      if (event.target instanceof HTMLElement && event.target !== document.activeElement) {
        elementIndexFocusedByClick = tabbableElements.findIndex(e => e === event.target)
      }
    },
    {signal}
  )

  // This is called whenever focus enters the container
  container.addEventListener(
    'focusin',
    event => {
      if (event.target instanceof HTMLElement) {
        // If a click initiated the focus movement, we always want to set our internal state
        // to reflect the clicked element as the currently focused one.
        if (elementIndexFocusedByClick != undefined) {
          if (elementIndexFocusedByClick >= 0) {
            if (tabbableElements[elementIndexFocusedByClick] !== currentFocusedElement) {
              updateTabIndex(currentFocusedElement, tabbableElements[elementIndexFocusedByClick])
            }
            currentFocusedIndex = elementIndexFocusedByClick
          }
          elementIndexFocusedByClick = undefined
        } else {
          // Set tab indexes and internal state based on the focus handling strategy
          if (focusInStrategy === 'previous') {
            updateTabIndex(currentFocusedElement, event.target)
          } else if (focusInStrategy === 'first') {
            if (
              event.relatedTarget instanceof Element &&
              !container.contains(event.relatedTarget) &&
              event.target !== tabbableElements[0]
            ) {
              // Regardless of the previously focused element, if we're coming from outside the
              // container, put focus onto the first element.
              currentFocusedIndex = 0
              tabbableElements[0].focus()
            } else {
              updateTabIndex(currentFocusedElement, event.target)
            }
          } else if (typeof focusInStrategy === 'function') {
            if (event.relatedTarget instanceof Element && !container.contains(event.relatedTarget)) {
              const elementToFocus = focusInStrategy(event.relatedTarget)
              const requestedFocusElementIndex = tabbableElements.findIndex(e => e === elementToFocus)
              if (requestedFocusElementIndex >= 0 && elementToFocus instanceof HTMLElement) {
                currentFocusedIndex = requestedFocusElementIndex

                // Since we are calling focus() this handler will run again synchronously. Therefore,
                // we don't want to let this invocation finish since it will clobber the value of
                // currentFocusedElement.
                elementToFocus.focus()
                return
              } else {
                // Should we warn here?
                console.warn('Element requested is not a known focusable element.')
              }
            } else {
              updateTabIndex(currentFocusedElement, event.target)
            }
          }
        }

        currentFocusedElement = event.target
      }
    },
    {signal}
  )

  // Handles keypresses only when the container has active focus
  const keyboardEventRecipient = activeDescendantControl ?? container
  keyboardEventRecipient.addEventListener(
    'keydown',
    event => {
      if (event.key in KEY_TO_DIRECTION) {
        const keyBit = KEY_TO_BIT[event.key as keyof typeof KEY_TO_BIT]

        // Check if the pressed key (keyBit) is one that is being used for focus (bindKeys)
        if (
          !event.defaultPrevented &&
          (keyBit & bindKeys) > 0 &&
          !shouldIgnoreFocusHandling(event, document.activeElement)
        ) {
          const isMac = isMacOS()

          // These conditions decide if we should move focus to the first/last element in the container
          const toEnd =
            event.key === 'Home' ||
            event.key === 'End' ||
            (event.key !== 'Tab' && ((isMac && event.metaKey) || (!isMac && event.ctrlKey))) ||
            event.key === 'PageUp' ||
            event.key === 'PageDown'

          // Moving forward or backward?
          const direction = getDirection(event)

          let nextElementToFocus: HTMLElement | undefined = undefined

          if (activeDescendantSuspended) {
            activeDescendantSuspended = false
            nextElementToFocus = tabbableElements[currentFocusedIndex]
          } else {
            // If there is a custom function that retrieves the next focusable element, try calling that first.
            if (options?.getNextFocusable) {
              nextElementToFocus = options.getNextFocusable(
                direction,
                toEnd,
                document.activeElement ?? undefined,
                event
              )
            }
            if (!nextElementToFocus) {
              const lastFocusedIndex = currentFocusedIndex
              if (direction === 'previous') {
                if (toEnd) {
                  currentFocusedIndex = 0
                } else {
                  currentFocusedIndex -= 1
                }
              } else if (direction === 'next') {
                if (toEnd) {
                  currentFocusedIndex = tabbableElements.length - 1
                } else {
                  currentFocusedIndex += 1
                }
              }
              if (currentFocusedIndex < 0) {
                // Tab should never cause focus to circle. Use focusTrap for that behavior.
                if (circular && event.key !== 'Tab') {
                  currentFocusedIndex = tabbableElements.length - 1
                } else {
                  if (activeDescendantControl) {
                    suspendActiveDescendant()
                  }
                  currentFocusedIndex = 0
                }
              }
              if (currentFocusedIndex >= tabbableElements.length) {
                if (circular && event.key !== 'Tab') {
                  currentFocusedIndex = 0
                } else {
                  currentFocusedIndex = tabbableElements.length - 1
                }
              }
              if (lastFocusedIndex !== currentFocusedIndex) {
                nextElementToFocus = tabbableElements[currentFocusedIndex]
              }
            }
          }

          if (nextElementToFocus) {
            if (activeDescendantControl) {
              console.log('Current focused index: ' + currentFocusedIndex)
              console.log("Current", currentFocusedElement)
              console.log("next", nextElementToFocus)
              setActiveDescendant(currentFocusedElement, nextElementToFocus)
            } else {
              nextElementToFocus.focus()
            }
          }
          // Tab should always allow escaping from this container, so only
          // preventDefault if tab key press already resulted in a focus movement
          if (event.key !== 'Tab' || nextElementToFocus) {
            event.preventDefault()
          }
        }
      }
    },
    {signal}
  )
  if (activeDescendantControl) {
    activeDescendantControl.addEventListener('focusout', () => {
      suspendActiveDescendant()
    })
  }
  return controller
}