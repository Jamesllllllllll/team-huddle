import { useRef, useState, useEffect } from 'react'
import { flushSync } from 'react-dom'
import clsx from 'clsx'
import { Button } from '~/components/ui/button'
import { Textarea } from '~/components/ui/textarea'

export function EditableText({
  fieldName,
  value,
  inputClassName,
  inputLabel,
  buttonClassName,
  buttonLabel,
  onChange,
  editState,
  minHeight,
  disabled = false,
}: {
  fieldName: string
  value: string
  inputClassName: string
  inputLabel: string
  buttonClassName: string
  buttonLabel: string
  onChange: (value: string) => void
  editState?: [boolean, (value: boolean) => void]
  minHeight?: string
  disabled?: boolean
}) {
  const localEditState = useState(false)
  const [edit, setEdit] = editState || localEditState
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [computedFontSize, setComputedFontSize] = useState<{ fontSize: string; lineHeight: string } | null>(null)
  // Local state to track the current display value - updates immediately as user types
  const [displayValue, setDisplayValue] = useState(value)
  const pendingSaveRef = useRef<string | null>(null)

  // Exit edit mode if component becomes disabled while editing
  useEffect(() => {
    if (disabled && edit) {
      setEdit(false)
    }
  }, [disabled, edit])

  // Sync displayValue with prop value when value changes externally (e.g., after optimistic update completes)
  // But don't reset if we just saved a value that's pending
  useEffect(() => {
    // Only sync if we're not editing and the value prop changed
    if (!edit) {
      // If we have a pending save and the new value matches it, clear the pending flag
      if (pendingSaveRef.current !== null && value === pendingSaveRef.current) {
        pendingSaveRef.current = null
        // displayValue should already match, but ensure it does
        setDisplayValue(value)
      } else if (pendingSaveRef.current === null && value !== displayValue) {
        // Only sync if we don't have a pending save (value changed externally)
        setDisplayValue(value)
      }
    }
  }, [value, edit, displayValue])

  // When entering edit mode, copy the computed font size from the button to the textarea
  useEffect(() => {
    if (edit && computedFontSize && inputRef.current) {
      inputRef.current.style.fontSize = computedFontSize.fontSize
      inputRef.current.style.lineHeight = computedFontSize.lineHeight
      // Adjust height after setting font size
      if (inputRef.current) {
        inputRef.current.style.height = 'auto'
        inputRef.current.style.height = `${inputRef.current.scrollHeight}px`
      }
    }
  }, [edit, computedFontSize])

  return edit ? (
    <form
      onSubmit={(event) => {
        event.preventDefault()

        const trimmed = inputRef.current!.value.trim()
        if (trimmed !== '') {
          setDisplayValue(trimmed)
          pendingSaveRef.current = trimmed
          onChange(trimmed)
        }

        flushSync(() => {
          setEdit(false)
        })

        buttonRef.current?.focus()
      }}
    >
      <Textarea
        required
        ref={inputRef}
        aria-label={inputLabel}
        name={fieldName}
        value={displayValue}
        onChange={(e) => {
          // Update local state immediately as user types
          setDisplayValue(e.target.value)
          // Adjust height to fit content
          if (inputRef.current) {
            inputRef.current.style.height = 'auto'
            inputRef.current.style.height = `${inputRef.current.scrollHeight}px`
          }
        }}
        rows={1}
        className={clsx(
          'h-auto min-h-0 overflow-hidden resize-none',
          inputClassName,
          // Override Textarea's default text-base md:text-sm to allow custom text size classes to work
          inputClassName.includes('text-') && 'text-[length:inherit] md:text-[length:inherit]',
        )}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            // Reset to original value on escape
            setDisplayValue(value)
            pendingSaveRef.current = null
            flushSync(() => {
              setEdit(false)
            })
            buttonRef.current?.focus()
          }
        }}
        onBlur={() => {
          const trimmed = inputRef.current?.value.trim() ?? ''
          if (trimmed !== '' && trimmed !== value) {
            // Update display value and save
            setDisplayValue(trimmed)
            pendingSaveRef.current = trimmed
            onChange(trimmed)
          } else if (trimmed === '') {
            // Reset to original if empty
            setDisplayValue(value)
            pendingSaveRef.current = null
          }
          setEdit(false)
        }}
      />
    </form>
  ) : (
    <Button
      aria-label={buttonLabel}
      type="button"
      ref={buttonRef}
      onClick={() => {
        if (disabled) return
        // Get the computed font size from the button before entering edit mode
        if (buttonRef.current) {
          const computedStyle = window.getComputedStyle(buttonRef.current)
          setComputedFontSize({
            fontSize: computedStyle.fontSize,
            lineHeight: computedStyle.lineHeight,
          })
        }
        // Initialize display value with current value when entering edit mode
        setDisplayValue(value)
        flushSync(() => {
          setEdit(true)
        })
        // Adjust height after entering edit mode
        if (inputRef.current) {
          inputRef.current.style.height = 'auto'
          inputRef.current.style.height = `${inputRef.current.scrollHeight}px`
        }
        inputRef.current?.select()
      }}
      disabled={disabled}
      className={clsx(
        'w-full justify-start whitespace-normal wrap-break-word bg-transparent px-0 text-left text-sm font-normal shadow-none',
        buttonClassName,
        disabled && 'cursor-default',
      )}
      variant="ghost"
    >
      {displayValue ? <span className="whitespace-normal wrap-break-word">{displayValue}</span> : (
        <span className="italic">Tap to edit planning item</span>
      )}
    </Button>
  )
}
