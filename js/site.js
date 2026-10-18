// The menu on small screens and the portfolio filter. The quote form has
// its own module, quote.js. Loaded in <head> so the menu is collapsed before
// the first paint.

document.documentElement.classList.add('js')

document.addEventListener('DOMContentLoaded', () => {
  const head = document.querySelector('.site-head')
  const toggle = document.querySelector('.menu-toggle')
  if (head && toggle) {
    const setOpen = open => {
      head.classList.toggle('is-open', open)
      toggle.setAttribute('aria-expanded', String(open))
      toggle.textContent = open ? 'Close' : 'Menu'
    }
    toggle.addEventListener('click', () => setOpen(!head.classList.contains('is-open')))
    // Escape closes the open menu and gives the focus back to its button.
    head.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || !head.classList.contains('is-open')) return
      setOpen(false)
      toggle.focus()
    })
  }

  const filters = document.querySelector('.filters')
  if (filters) {
    const items = [...document.querySelectorAll('.wall__item')]
    const empty = document.querySelector('.wall-empty')
    const status = document.querySelector('.wall-status')
    const show = (key, announce) => {
      for (const b of filters.querySelectorAll('button')) {
        b.setAttribute('aria-pressed', String(b.dataset.filter === key))
      }
      let shown = 0
      for (const item of items) {
        item.hidden = key !== 'all' && item.dataset.occasion !== key
        if (item.hidden) continue
        // Rows of two: the wide photo swaps sides each row, every other row sits lower.
        const row = Math.floor(shown / 2)
        item.classList.toggle('wall__item--wide', shown % 2 === row % 2)
        item.classList.toggle('wall__item--low', row % 2 === 1)
        shown++
      }
      if (empty) empty.hidden = shown > 0
      if (status && announce) status.textContent = shown === 1 ? '1 cake' : `${shown} cakes`
    }
    const choose = key => {
      show(key, true)
      history.replaceState(null, '', location.pathname + (key === 'all' ? '' : `#${key}`))
    }
    filters.addEventListener('click', event => {
      const button = event.target.closest('button')
      if (button) choose(button.dataset.filter)
    })
    // The button hides with the message, so the focus moves to All.
    empty?.querySelector('button')?.addEventListener('click', () => {
      choose('all')
      filters.querySelector('[data-filter="all"]').focus()
    })
    const start = location.hash.slice(1)
    show(filters.querySelector(`[data-filter="${CSS.escape(start)}"]`) ? start : 'all', false)
  }
})
