/* handle-table-pagination.paged.js - table header repeat + continued label + orphan note fix */
class RepeatTableHeadersHandler extends Paged.Handler {
  constructor(chunker, polisher, caller) {
    super(chunker, polisher, caller)
    this.splitTablesRefs = []
    this.chunker = null
  }

  afterPageLayout(pageElement, page, breakToken, chunker) {
    this.chunker = chunker
    this.splitTablesRefs = []
    if (!breakToken) return

    const node = breakToken.node
    const tables = this.findAllAncestors(node, "table")
    if (node && node.tagName === "TABLE") tables.push(node)
    if (tables.length === 0) return

    this.splitTablesRefs = tables.map(t => t.dataset.ref).filter(Boolean)

    let thead = node && node.tagName === "THEAD" ? node : this.findFirstAncestor(node, "thead")
    if (thead) {
      const lastTheadNode = thead.hasChildNodes() ? thead.lastChild : thead
      breakToken.node = this.nodeAfter(lastTheadNode, chunker.source)
    }

    this.hideEmptyTables(pageElement, node)
  }

  layout(rendered, layout) {
    // 1) Repeat headers and add continued label for split tables
    this.splitTablesRefs.forEach(ref => {
      const renderedTable = rendered.querySelector("[data-ref='" + ref + "']")
      if (!renderedTable) return
      if (renderedTable.hasAttribute("repeated-headers")) return

      const sourceTable = this.chunker && this.chunker.source
        ? this.chunker.source.querySelector("[data-ref='" + ref + "']")
        : null
      if (!sourceTable) return

      const thead = sourceTable.querySelector("thead")
      if (!thead) return

      renderedTable.insertBefore(thead.cloneNode(true), renderedTable.firstChild)
      renderedTable.setAttribute("repeated-headers", "true")

      // Insert spacer + label (once per continued fragment)
      const prev = renderedTable.previousElementSibling
      const alreadyHasSpacer = prev && prev.classList && prev.classList.contains("mm-table-continued-spacer")
      if (!alreadyHasSpacer) {
        const h2 = this.getNearestPrevH2Text(sourceTable)
        const title = h2 ? `${h2} - forts. från föregående sida` : "Forts. från föregående sida"

        const spacer = document.createElement("div")
        spacer.className = "mm-table-continued-spacer"
        spacer.innerHTML = `<span class="mm-table-continued-label">${this.escapeHtml(title)}</span>`
        renderedTable.parentNode.insertBefore(spacer, renderedTable)
      }
    })

    // 2) Orphan note fix:
    // If a page starts with (or very early contains) a mm-table-note,
    // ensure it gets a continued spacer and mark it for CSS padding.
    this.fixOrphanNotes(rendered)
  }

  fixOrphanNotes(rendered) {
    const notes = rendered.querySelectorAll(".mm-table-note")
    if (!notes || notes.length === 0) return

    // Find first "significant" element in the page content
    const firstBlock = this.getFirstBlockElement(rendered)
    if (!firstBlock) return

    // We only treat it as orphan if the first block is a note,
    // OR the note appears before any table/h2 in the rendered flow.
    // This avoids touching normal notes after tables mid-page.
    let orphanNote = null

    if (firstBlock.classList && firstBlock.classList.contains("mm-table-note")) {
      orphanNote = firstBlock
    } else {
      // If the first note exists and is placed very early, treat as orphan
      const firstNote = notes[0]
      // Heuristic: if note is within the first ~2 direct children, call it orphan
      const parent = firstNote.parentElement
      if (parent) {
        const kids = Array.from(parent.children || [])
        const idx = kids.indexOf(firstNote)
        if (idx >= 0 && idx <= 1) orphanNote = firstNote
      }
    }

    if (!orphanNote) return

    // If there's already a spacer, do nothing
    const prev = orphanNote.previousElementSibling
    const alreadyHasSpacer = prev && prev.classList && prev.classList.contains("mm-table-continued-spacer")
    if (!alreadyHasSpacer) {
      const title = this.findOrphanTitleFromSource(orphanNote) || "Forts. från föregående sida"

      const spacer = document.createElement("div")
      spacer.className = "mm-table-continued-spacer mm-orphan-note-spacer"
      spacer.innerHTML = `<span class="mm-table-continued-label">${this.escapeHtml(title)}</span>`
      orphanNote.parentNode.insertBefore(spacer, orphanNote)
    }

    orphanNote.classList.add("mm-orphan-note")
  }

  // Best-effort: map orphan note back to source to get nearest previous H2
  findOrphanTitleFromSource(orphanNoteRendered) {
    if (!this.chunker || !this.chunker.source) return ""

    // We try to find the closest preceding H2 in the rendered DOM,
    // and if present use that. If not, fall back to source scan.
    const local = this.findPrevH2Text(orphanNoteRendered)
    if (local) return `${local} - forts. från föregående sida`

    // Fallback: use last H2 in source before the first table-note text match (best effort)
    const noteText = (orphanNoteRendered.textContent || "").trim().slice(0, 80)
    if (!noteText) return ""

    const source = this.chunker.source
    const sourceNotes = source.querySelectorAll(".mm-table-note")
    let match = null
    sourceNotes.forEach(n => {
      if (match) return
      const t = (n.textContent || "").trim()
      if (t && noteText && t.indexOf(noteText) !== -1) match = n
    })
    if (!match) return ""

    const h2 = this.getNearestPrevH2Text(match)
    if (!h2) return ""
    return `${h2} - forts. från föregående sida`
  }

  findPrevH2Text(el) {
    let cur = el
    while (cur) {
      let prev = cur.previousElementSibling
      while (prev) {
        if (prev.tagName === "H2") return (prev.textContent || "").trim()
        prev = prev.previousElementSibling
      }
      cur = cur.parentElement
    }
    return ""
  }

  getFirstBlockElement(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
      acceptNode: (node) => {
        if (!node || !node.tagName) return NodeFilter.FILTER_SKIP
        // skip paged wrapper nodes if present
        if (node.classList && (node.classList.contains("pagedjs_page") || node.classList.contains("pagedjs_margin"))) {
          return NodeFilter.FILTER_SKIP
        }
        // accept first real element
        return NodeFilter.FILTER_ACCEPT
      }
    })
    return walker.nextNode()
  }

  getNearestPrevH2Text(node) {
    let el = node
    while (el) {
      let prev = el.previousElementSibling
      while (prev) {
        if (prev.tagName === "H2") return (prev.textContent || "").trim()
        prev = prev.previousElementSibling
      }
      el = el.parentElement
    }
    return ""
  }

  escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;")
  }

  hideEmptyTables(pageElement, breakTokenNode) {
    this.splitTablesRefs.forEach(ref => {
      const table = pageElement.querySelector("[data-ref='" + ref + "']")
      if (!table) return
      const firstRow = table.querySelector("tbody > tr")
      if (!firstRow || this.refEquals(firstRow.firstElementChild, breakTokenNode)) {
        table.style.visibility = "hidden"
        table.style.position = "absolute"
        const spacer = table.nextSibling
        if (spacer) {
          spacer.style.visibility = "hidden"
          spacer.style.position = "absolute"
        }
      }
    })
  }

  refEquals(a, b) {
    return a && b && a.dataset && b.dataset && a.dataset.ref === b.dataset.ref
  }

  findFirstAncestor(element, selector) {
    while (element && element.parentNode && element.parentNode.nodeType === 1) {
      if (element.parentNode.matches(selector)) return element.parentNode
      element = element.parentNode
    }
    return null
  }

  findAllAncestors(element, selector) {
    const ancestors = []
    while (element && element.parentNode && element.parentNode.nodeType === 1) {
      if (element.parentNode.matches(selector)) ancestors.unshift(element.parentNode)
      element = element.parentNode
    }
    return ancestors
  }

  nodeAfter(node, limiter) {
    if (limiter && node === limiter) return
    let significantNode = this.nextSignificantNode(node)
    if (significantNode) return significantNode
    if (!node.parentNode) return
    while ((node = node.parentNode)) {
      if (limiter && node === limiter) return
      significantNode = this.nextSignificantNode(node)
      if (significantNode) return significantNode
    }
  }

  nextSignificantNode(node) {
    while ((node = node.nextSibling)) {
      if (!this.isIgnorable(node)) return node
    }
    return null
  }

  isIgnorable(node) {
    return node.nodeType === 8 || (node.nodeType === 3 && !(/[^\t\n\r ]/.test(node.textContent)))
  }
}

Paged.registerHandlers(RepeatTableHeadersHandler)
