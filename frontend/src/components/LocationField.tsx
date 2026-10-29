import { useEffect, useState } from 'react'
import { geocode } from '../api'
import type { Coord, Location } from '../types'

type Suggestion = { label: string; coordinate: Coord }
export function LocationField({ id, label, value, onChange }: { id: string; label: string; value: Location; onChange: (next: Location) => void }) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [state, setState] = useState<'idle' | 'loading' | 'empty' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  useEffect(() => {
    if (value.coordinate || value.label.trim().length < 3) { setSuggestions([]); setState('idle'); return }
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setState('loading')
      try {
        const items = await geocode(value.label.trim(), controller.signal)
        setSuggestions(items); setState(items.length ? 'idle' : 'empty'); setOpen(true); setActive(-1)
      } catch (error) { if (!controller.signal.aborted) { setState('error'); setMessage(error instanceof Error ? error.message : 'Search failed'); setOpen(true) } }
    }, 300)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [value.label, value.coordinate])
  const select = (item: Suggestion) => { onChange(item); setSuggestions([]); setOpen(false); setState('idle') }
  return <div className="location-field">
    <label htmlFor={id}>{label}</label>
    <input id={id} value={value.label} autoComplete="off" role="combobox" aria-autocomplete="list" aria-expanded={open && (suggestions.length > 0 || state !== 'idle')} aria-controls={`${id}-list`} aria-activedescendant={active >= 0 ? `${id}-option-${active}` : undefined} placeholder={label === 'Origin' ? 'City or street address' : 'Where are you headed?'} onChange={event => { setSuggestions([]); setState('idle'); onChange({ label: event.target.value, coordinate: null }); setOpen(true) }} onFocus={() => { if (suggestions.length) setOpen(true) }} onKeyDown={event => {
      if (event.key === 'ArrowDown' && suggestions.length) { event.preventDefault(); setOpen(true); setActive(index => Math.min(index + 1, suggestions.length - 1)) }
      if (event.key === 'ArrowUp' && suggestions.length) { event.preventDefault(); setActive(index => Math.max(index - 1, 0)) }
      if (event.key === 'Enter' && open && active >= 0) { event.preventDefault(); select(suggestions[active]) }
      if (event.key === 'Escape') setOpen(false)
    }} />
    {value.coordinate && <span className="selected-tick" aria-label="Location selected">✓</span>}
    {open && (suggestions.length > 0 || state !== 'idle') && <div id={`${id}-list`} role="listbox" className="suggestions">
      {state === 'loading' && <div className="suggestion-note">Searching…</div>}
      {state === 'empty' && <div className="suggestion-note">No locations found. Try a fuller address.</div>}
      {state === 'error' && <div className="suggestion-note error-text">{message}</div>}
      {suggestions.map((item, index) => <button type="button" role="option" aria-selected={index === active} id={`${id}-option-${index}`} key={`${item.label}-${index}`} className={index === active ? 'suggestion active' : 'suggestion'} onMouseDown={event => event.preventDefault()} onClick={() => select(item)}>{item.label}</button>)}
    </div>}
  </div>
}
