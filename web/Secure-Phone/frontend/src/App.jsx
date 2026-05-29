import './App.css'

import { useEffect, useMemo, useRef, useState } from 'react'

function pad2(n) {
  return String(n).padStart(2, '0')
}

function getClockString(date) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

function StatusBar({ time }) {
  return (
    <div className="statusbar" aria-hidden="true">
      <div className="statusbar__left">{time}</div>
      <div className="statusbar__right">
        <div className="icon icon--signal">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="icon icon--wifi">
          <span />
          <span />
          <span />
        </div>
        <div className="icon icon--battery">
          <div className="battery__body">
            <div className="battery__fill" />
          </div>
          <div className="battery__cap" />
        </div>
      </div>
    </div>
  )
}

function AppButton({ label, sublabel, onClick, iconClassName }) {
  return (
    <button className="appbtn" type="button" onClick={onClick}>
      <div className={`appbtn__icon ${iconClassName || ''}`} aria-hidden="true">
        <span className="appbtn__glyph" />
      </div>
      <div className="appbtn__text">
        <div className="appbtn__label">{label}</div>
        <div className="appbtn__sublabel">{sublabel}</div>
      </div>
    </button>
  )
}

function GalleryApp({ onClose, fileParam, onChangeFile }) {
  const photos = useMemo(
    () => [
      { name: 'photo1.jpg', title: 'IMG_0001' },
      { name: 'photo2.jpg', title: 'IMG_0002' },
      { name: 'photo3.jpg', title: 'IMG_0003' },
      { name: 'photo4.jpg', title: 'IMG_0004' },
      { name: 'photo5.jpg', title: 'IMG_0005' },
      { name: 'photo6.jpg', title: 'IMG_0006' },
    ],
    []
  )

  const activeName = fileParam || photos[0].name
  const activePhoto = photos.find((p) => p.name === activeName) || {
    name: activeName,
    title: activeName,
  }

  const [fileView, setFileView] = useState({
    status: 'idle',
    kind: 'image',
    src: null,
    text: null,
    error: null,
  })

  useEffect(() => {
    let isActive = true
    let objectUrl = null

    async function loadFile() {
      setFileView({ status: 'loading', kind: 'image', src: null, text: null, error: null })
      try {
        const r = await fetch(`/api/gallery?file=${encodeURIComponent(activeName)}`)
        if (!r.ok) throw new Error(`HTTP ${r.status}`)

        const contentType = r.headers.get('content-type') || ''
        if (contentType.includes('text/plain')) {
          const text = await r.text()
          if (!isActive) return
          setFileView({ status: 'ready', kind: 'text', src: null, text, error: null })
          return
        }

        const blob = await r.blob()
        objectUrl = URL.createObjectURL(blob)
        if (!isActive) return
        setFileView({ status: 'ready', kind: 'image', src: objectUrl, text: null, error: null })
      } catch (e) {
        if (!isActive) return
        setFileView({ status: 'error', kind: 'image', src: null, text: null, error: String(e) })
      }
    }

    loadFile()
    return () => {
      isActive = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [activeName])

  return (
    <div className="app app--gallery" role="dialog" aria-label="Gallery">
      <div className="app__top">
        <div className="app__title">Gallery</div>
        <button className="app__close" type="button" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="source-hint" aria-hidden="true">
        Example: /app/gallery?file=photo1.jpg
      </div>

      <div className="gallery__viewer">
        <div className="gallery__viewerTitle">{activePhoto.title}</div>
        {fileView.status === 'loading' && <div className="hint">Loading...</div>}
        {fileView.status === 'error' && (
          <div className="error">File load failed: {fileView.error}</div>
        )}
        {fileView.status === 'ready' && fileView.kind === 'image' && (
          <img className="gallery__img" src={fileView.src} alt={activePhoto.title} />
        )}
        {fileView.status === 'ready' && fileView.kind === 'text' && (
          <pre className="gallery__text" aria-label="Text file">
            {fileView.text}
          </pre>
        )}
      </div>

      <div className="gallery__grid">
        {photos.map((p) => (
          <button
            key={p.name}
            type="button"
            className={
              p.name === activePhoto.name
                ? 'gallery__thumb gallery__thumb--active'
                : 'gallery__thumb'
            }
            onClick={() => onChangeFile(p.name)}
          >
            <img
              src={`/api/gallery?file=${encodeURIComponent(p.name)}`}
              alt={p.title}
              loading="lazy"
            />
          </button>
        ))}
      </div>
    </div>
  )
}

function DevLogsApp({ onClose, devlogId, onChangeId }) {
  const [state, setState] = useState({ status: 'idle', data: null, error: null })

  async function load() {
    setState({ status: 'loading', data: null, error: null })
    try {
      const r = await fetch(`/api/devlogs?id=${encodeURIComponent(devlogId)}`, {
        credentials: 'include',
      })
      if (!r.ok) {
        let msg = `${r.status} ${r.statusText}`
        try {
          const j = await r.json()
          msg = j && j.error ? j.error : msg
        } catch {
          // ignore
        }
        setState({ status: 'error', data: null, error: msg })
        return
      }
      const j = await r.json()
      setState({ status: 'ok', data: j, error: null })
    } catch (e) {
      setState({ status: 'error', data: null, error: String(e) })
    }
  }

  useEffect(() => {
    load()
  }, [devlogId])

  return (
    <div className="app app--devlogs" role="dialog" aria-label="DevLogs">
      <div className="app__top">
        <div className="app__title">DevLogs</div>
        <button className="app__close" type="button" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="devlogs__meta">
        <div className="devlogs__channel">
          Channel:
          <input
            className="devlogs__input"
            value={devlogId}
            onChange={(e) => onChangeId(e.target.value)}
            inputMode="numeric"
            pattern="[0-9]*"
            aria-label="Channel ID"
          />
        </div>
        <button className="devlogs__refresh" type="button" onClick={load}>
          Refresh
        </button>
      </div>

      <div className="devlogs__body">
        {state.status === 'loading' && <div className="hint">Loading...</div>}
        {state.status === 'error' && (
          <div className="error">
            Access denied or conversation not found.
            <div className="error__detail">{state.error}</div>
          </div>
        )}
        {state.status === 'ok' && Array.isArray(state.data) && (
          <div className="chat">
            {state.data.map((m, idx) => (
              <div key={idx} className="chat__msg">
                <div className="chat__hdr">
                  <span className="chat__from">{m.from}</span>
                  <span className="chat__to">→ {m.to}</span>
                  <span className="chat__ts">{m.timestamp}</span>
                </div>
                <div className="chat__text">{m.message}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function App() {
  const [time, setTime] = useState(() => getClockString(new Date()))
  const [pin, setPin] = useState('')
  const [lastDigitIndex, setLastDigitIndex] = useState(-1)
  const [showLastDigit, setShowLastDigit] = useState(false)
  const [openApp, setOpenApp] = useState(null)
  const [devlogId, setDevlogId] = useState('1')
  const [galleryFile, setGalleryFile] = useState('photo1.jpg')
  const [unlockState, setUnlockState] = useState({
    loading: false,
    message: null,
    flag: null,
    rawError: null,
  })
  const dotsRef = useRef(null)
  const hideTimerRef = useRef(null)

  useEffect(() => {
    const t = setInterval(() => setTime(getClockString(new Date())), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (dotsRef.current) {
      dotsRef.current.scrollLeft = dotsRef.current.scrollWidth
    }
  }, [pin])

  useEffect(() => {
    function syncFromUrl() {
      const path = window.location.pathname
      const params = new URLSearchParams(window.location.search)
      if (path === '/app/gallery') {
        setOpenApp('gallery')
        setGalleryFile(params.get('file') || 'photo1.jpg')
      } else if (path === '/app/devlogs') {
        setOpenApp('devlogs')
        setDevlogId(params.get('id') || '1')
      } else {
        setOpenApp(null)
      }
    }

    syncFromUrl()
    window.addEventListener('popstate', syncFromUrl)
    return () => window.removeEventListener('popstate', syncFromUrl)
  }, [])

  function openAppWithUrl(appName) {
    if (!appName) {
      window.history.pushState({ app: null }, '', '/')
      setOpenApp(null)
      return
    }

    if (appName === 'devlogs') {
      const id = devlogId || '1'
      window.history.pushState({ app: appName, id }, '', `/app/devlogs?id=${id}`)
      setOpenApp('devlogs')
      return
    }

    if (appName === 'gallery') {
      const file = galleryFile || 'photo1.jpg'
      window.history.pushState({ app: appName, file }, '', `/app/gallery?file=${file}`)
      setOpenApp('gallery')
      return
    }

    window.history.pushState({ app: appName }, '', `/app/${appName}`)
    setOpenApp(appName)
  }

  function updateDevlogId(next) {
    const cleaned = String(next).replace(/\D/g, '')
    const finalId = cleaned || '1'
    setDevlogId(cleaned)
    if (openApp === 'devlogs') {
      window.history.replaceState({ app: 'devlogs', id: finalId }, '', `/app/devlogs?id=${finalId}`)
    }
  }

  function updateGalleryFile(next) {
    const value = next ? String(next) : 'photo1.jpg'
    setGalleryFile(value)
    if (openApp === 'gallery') {
      window.history.replaceState({ app: 'gallery', file: value }, '', `/app/gallery?file=${value}`)
    }
  }

  function addDigit(d) {
    if (pin.length >= 64) return
    setPin((p) => {
      const next = p + d
      setLastDigitIndex(next.length - 1)
      setShowLastDigit(true)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      hideTimerRef.current = setTimeout(() => setShowLastDigit(false), 700)
      return next
    })
    setUnlockState((s) => ({ ...s, message: null, rawError: null }))
  }

  function delDigit() {
    setPin('')
    setLastDigitIndex(-1)
    setShowLastDigit(false)
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    setUnlockState((s) => ({ ...s, message: null, rawError: null }))
  }

  async function submit() {
    if (unlockState.loading) return
    setUnlockState({ loading: true, message: null, flag: null, rawError: null })
    try {
      const r = await fetch('/api/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ pin }),
      })

      const contentType = r.headers.get('content-type') || ''
      if (contentType.includes('application/json')) {
        const j = await r.json()
        if (j && j.success) {
          setUnlockState({ loading: false, message: null, flag: j.flag, rawError: null })
        } else {
          setUnlockState({
            loading: false,
            message: (j && j.message) || 'Incorrect PIN',
            flag: null,
            rawError: null,
          })
        }
      } else {
        const text = await r.text()
        setUnlockState({
          loading: false,
          message: 'SQL error',
          flag: null,
          rawError: text,
        })
      }
    } catch (e) {
      setUnlockState({ loading: false, message: 'Network error', flag: null, rawError: String(e) })
    }
  }

  return (
    <div className="page" onKeyDown={(e) => e.preventDefault()} tabIndex={-1}>
      <div className="phone" role="application" aria-label="Phone">
        <div className="phone__screen">
          <StatusBar time={time} />

          <div className="lock">
            <div className="lock__headline">
              This device is protected by a high-security system
            </div>

            <div className="lock__panel">
              <div className="lock__title">PIN</div>
              <div className="dots" aria-label="Entered PIN" ref={dotsRef}>
                {pin.split('').map((digit, i) =>
                  showLastDigit && i === lastDigitIndex ? (
                    <span key={i} className="digit">
                      {digit}
                    </span>
                  ) : (
                    <span key={i} className="dot" />
                  )
                )}
                {pin.length === 0 && <span className="dots__hint">••••</span>}
              </div>

              {unlockState.flag && (
                <div className="flag" role="status">
                  {unlockState.flag}
                </div>
              )}
              {!unlockState.flag && unlockState.message && (
                <div className="msg" role="status">
                  {unlockState.message}
                </div>
              )}
              {!unlockState.flag && unlockState.rawError && (
                <pre className="raw" aria-label="SQLite error message">
                  {unlockState.rawError}
                </pre>
              )}
            </div>

            <div className="keypad" aria-label="Numeric keypad">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', null, '0', null].map(
                (d, i) =>
                  d ? (
                    <button key={d} type="button" className="key" onClick={() => addDigit(d)}>
                      {d}
                    </button>
                  ) : (
                    <div key={`empty-${i}`} className="key key--ghost" aria-hidden="true" />
                  )
              )}
            </div>

            <div className="actions">
              <button type="button" className="action" onClick={delDigit}>
                Clear
              </button>
              <button
                type="button"
                className="action action--primary"
                onClick={submit}
                disabled={unlockState.loading}
              >
                {unlockState.loading ? 'Checking...' : 'Unlock'}
              </button>
            </div>

            <div className="quickApps" aria-label="Unlocked access">
              <AppButton
                label="Gallery"
                sublabel="Unlocked"
                iconClassName="appbtn__icon--gallery"
                onClick={() => openAppWithUrl('gallery')}
              />
              <AppButton
                label="DevLogs"
                sublabel="Unlocked"
                iconClassName="appbtn__icon--devlogs"
                onClick={() => openAppWithUrl('devlogs')}
              />
            </div>
          </div>

          {openApp === 'gallery' && (
            <GalleryApp
              onClose={() => openAppWithUrl(null)}
              fileParam={galleryFile}
              onChangeFile={updateGalleryFile}
            />
          )}
          {openApp === 'devlogs' && (
            <DevLogsApp
              onClose={() => openAppWithUrl(null)}
              devlogId={devlogId || '1'}
              onChangeId={updateDevlogId}
            />
          )}
        </div>
      </div>
    </div>
  )
}

export default App
