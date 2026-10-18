// The quote form. It checks the fields, prepares the inspiration photos
// (photo-processor.js redraws each as WebP, which drops its location and
// other EXIF data), passes Cloudflare Turnstile and sends the inquiry to the
// cake-quote Edge Function, which saves it for Ellah to read in the Hub.
// Every sentence it shows is in the page: the field errors and #quote-says.

import { processOne } from './photo-processor.js'

const TURNSTILE = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
const MAX_PHOTOS = 3
const FIELDS = ['name', 'email', 'phone', 'date', 'occasion', 'guests', 'venue', 'budget', 'details']

const form = document.querySelector('.form[data-send]')
if (form) start(form)

function start(form) {
  const $ = (id) => document.getElementById(id)
  const says = (key) => $('quote-says').content.querySelector(`[data-say="${key}"]`).textContent
  const status = form.querySelector('.form__status')
  const say = (key) => { status.textContent = key ? says(key) : '' }
  const button = form.querySelector('button[type="submit"]')
  const input = $('inspo'), hint = $('inspo-hint'), list = $('inspo-photos'), clear = $('inspo-clear')
  const hintText = hint.textContent

  // The page's own messages replace the browser's.
  form.noValidate = true
  // Send works once this script runs; without it the browser would post the
  // details to the page's own host.
  button.disabled = false

  // From today to three years ahead, in the visitor's calendar.
  const day = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const now = new Date()
  form.elements.date.min = day(now)
  form.elements.date.max = day(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1095))

  /* ── field errors ─────────────────────────────────────────────────────── */
  const control = (name) => name === 'photos' ? input : form.elements[name]

  // Shows the error with this id under its field, or none.
  function mark(name, id) {
    const c = control(name)
    for (const e of c.closest('.field').querySelectorAll('.field__error')) e.hidden = e.id !== id
    const described = (c.getAttribute('aria-describedby') || '').split(' ').filter((x) => x && !x.startsWith('err-'))
    if (id) described.push(id)
    if (described.length) c.setAttribute('aria-describedby', described.join(' '))
    else c.removeAttribute('aria-describedby')
    if (id) c.setAttribute('aria-invalid', 'true')
    else c.removeAttribute('aria-invalid')
  }

  function problem(name) {
    const c = form.elements[name], v = c.validity
    const blank = c.required && !c.value.trim()
    if (name === 'date') return blank || v.badInput ? 'err-date' : v.valid ? null : 'err-date-range'
    if (name === 'budget') return null
    return blank || !v.valid ? `err-${name}` : null
  }

  // Marks every field that isn't right; returns the first.
  function review() {
    let first = null
    for (const name of FIELDS) {
      const id = problem(name)
      mark(name, id)
      if (id && !first) first = name
    }
    return first
  }

  for (const t of ['input', 'change']) {
    form.addEventListener(t, (ev) => {
      if (FIELDS.includes(ev.target.name) && ev.target.hasAttribute('aria-invalid')) mark(ev.target.name, null)
    })
  }

  // A field the server refused. False when the page has no words for it.
  function refused(name) {
    const id = name === 'date' ? 'err-date-range' : `err-${name}`
    if (!$(id)) return false
    mark(name, id)
    control(name).focus()
    say('')
    return true
  }

  /* ── photos ───────────────────────────────────────────────────────────── */
  let photos = []      // { blob, url }: the WebP that is sent, and its preview
  let preparing = null // while the latest choice is being prepared
  let turn = 0

  function showPhotos(text) {
    list.replaceChildren(...photos.map((p) => {
      const li = document.createElement('li')
      const img = new Image(88, 88)
      img.alt = ''
      img.src = p.url
      li.append(img)
      return li
    }))
    list.hidden = !photos.length
    clear.hidden = !photos.length
    hint.textContent = text
  }

  function dropPhotos() {
    for (const p of photos) URL.revokeObjectURL(p.url)
    photos = []
  }

  async function choose(files) {
    const mine = ++turn
    mark('photos', null)
    dropPhotos()
    showPhotos(files.length ? says('photos-preparing') : hintText)
    if (!files.length) { preparing = null; return }
    // One at a time, so a phone keeps its memory.
    const job = (async () => {
      const out = []
      let bad = 0
      for (const file of files.slice(0, MAX_PHOTOS)) {
        try {
          const { variants } = await processOne(file)
          out.push({ blob: variants.full.blob, url: URL.createObjectURL(variants.thumb.blob) })
        } catch {
          bad++
        }
      }
      return { out, bad }
    })()
    preparing = job
    const { out, bad } = await job
    if (mine !== turn) { for (const p of out) URL.revokeObjectURL(p.url); return }
    preparing = null
    photos = out
    if (!out.length) input.value = ''
    const notes = [
      out.length ? says(`photos-${out.length}`) : '',
      files.length > MAX_PHOTOS ? says('photos-extra') : '',
      bad ? says(bad === 1 ? 'photos-bad' : 'photos-bad-some') : '',
    ]
    showPhotos(notes.filter(Boolean).join(' ') || hintText)
  }

  function clearPhotos() {
    turn++
    preparing = null
    input.value = ''
    dropPhotos()
    showPhotos(hintText)
    mark('photos', null)
  }

  input.addEventListener('change', () => choose([...input.files]))
  clear.addEventListener('click', () => { clearPhotos(); input.focus() })

  /* ── Turnstile ────────────────────────────────────────────────────────── */
  // Loaded and run only when the visitor sends. Usually it passes unseen;
  // when it needs a tick, its box shows above the button.
  const check = $('quote-check')
  let loading = null, widget = null, waiting = null

  const settle = (fn, value) => {
    check.hidden = true
    const w = waiting
    waiting = null
    w?.[fn](value)
  }
  const spamCheckFailed = () => Object.assign(new Error('turnstile'), { turnstile: true })

  function loadTurnstile() {
    if (window.turnstile) return Promise.resolve(window.turnstile)
    loading ??= new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = TURNSTILE
      s.async = true
      s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile')))
      s.onerror = () => { loading = null; s.remove(); reject(new Error('turnstile')) }
      document.head.append(s)
    })
    return loading
  }

  async function token() {
    const turnstile = await loadTurnstile()
    return new Promise((resolve, reject) => {
      waiting = { resolve, reject }
      if (widget !== null) { turnstile.reset(widget); return } // a token is good for one send
      widget = turnstile.render(check, {
        sitekey: form.dataset.sitekey,
        action: 'quote',
        appearance: 'interaction-only',
        theme: 'light',
        size: 'flexible',
        callback: (t) => settle('resolve', t),
        'error-callback': () => { settle('reject', spamCheckFailed()); return true },
        'timeout-callback': () => settle('reject', spamCheckFailed()),
        'before-interactive-callback': () => { check.hidden = false; say('check') },
        'after-interactive-callback': () => { check.hidden = true; say('sending') },
      })
    })
  }

  /* ── sending ──────────────────────────────────────────────────────────── */
  let sending = false

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault()
    if (sending) return
    const first = review()
    if (first) { control(first).focus(); say(''); return }
    sending = true
    button.setAttribute('aria-disabled', 'true')
    try {
      if (preparing) { say('photos-preparing'); await preparing }
      say('sending')
      const body = new FormData()
      for (const name of FIELDS) body.set(name, form.elements[name].value)
      body.set('leave_blank', form.elements.leave_blank.value)
      body.set('token', await token())
      photos.forEach((p, i) => body.append('photos', p.blob, `${i + 1}.webp`))
      const res = await fetch(form.dataset.send, {
        method: 'POST', body, signal: AbortSignal.timeout ? AbortSignal.timeout(60e3) : undefined,
      })
      const out = await res.json().catch(() => ({}))
      if (res.ok && out.ok) return done()
      if (res.status === 413 && refused('photos')) return
      if (out.error === 'field' && refused(out.field)) return
      say(['turnstile', 'busy', 'paused'].includes(out.error) ? out.error : 'failed')
    } catch (err) {
      say(err?.turnstile ? 'turnstile' : 'failed')
    } finally {
      sending = false
      button.removeAttribute('aria-disabled')
    }
  })

  function done() {
    form.hidden = true
    $('quote-sent').hidden = false
    say('')
    $('quote-sent-title').focus()
  }

  $('quote-again').addEventListener('click', () => {
    form.reset()
    clearPhotos()
    for (const name of FIELDS) mark(name, null)
    $('quote-sent').hidden = true
    form.hidden = false
    form.elements.name.focus()
  })
}
