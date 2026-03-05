/* handle-table-pagination.paged3.js - stable: repeat table headers + continued label + orphan note fix (CSS-driven spacing) */
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

    this.splitTablesRefs = tables
      .map(t => (t && t.dataset ? t.dataset.ref : null))
      .filter(Boolean)

    let thead = (node && node.tagName === "THEAD") ? node : this.findFirstAncestor(node, "thead")
    if (thead) {
      const lastTheadNode = thead.hasChildNodes() ? thead.lastChild : thead
      breakToken.node = this.nodeAfter(lastTheadNode, chunker.source)
    }

    this.hideEmptyTables(pageElement, node)
  }

  layout(rendered, layout) {
    // 1) Orphan mm-table-note at top of a page (note moved alone to next page)
    this.fixOrphanNoteAtTop(rendered)

    // 2) Repeat table headers + continued label for real continued fragments only
    this.splitTablesRefs.forEach(ref => {
      const renderedTable = rendered.querySelector("[data-ref='" + ref + "']")
      if (!renderedTable) return
      if (renderedTable.hasAttribute("repeated-headers")) return

      // Only act on continued fragments (those usually miss THEAD after splitting)
      const alreadyHasThead = renderedTable.querySelector("thead")
      if (alreadyHasThead) return

      const sourceTable = (this.chunker && this.chunker.source)
        ? this.chunker.source.querySelector("[data-ref='" + ref + "']")
        : null
      if (!sourceTable) return

      const thead = sourceTable.querySelector("thead")
      if (!thead) return

      // Repeat header
      renderedTable.insertBefore(thead.cloneNode(true), renderedTable.firstChild)
      renderedTable.setAttribute("repeated-headers", "true")

      // Add spacer + label (only once per continued fragment)
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
  }

  // If the first meaningful element on the page is a mm-table-note, give it a continued label.
  // Spacing/padding must be controlled by CSS (no inline styles), to avoid doubled gaps.
  fixOrphanNoteAtTop(rendered) {
    const firstBlock = this.getFirstMeaningfulElement(rendered)

    // BONUSFIX: robust guard
    if (!firstBlock || !firstBlock.classList || !firstBlock.classList.contains("mm-table-note")) return

    const note = firstBlock

    // Avoid double work
    const prev = note.previousElementSibling
    const alreadyHasSpacer = prev && prev.classList && prev.classList.contains("mm-table-continued-spacer")
    if (!alreadyHasSpacer) {
      const prevH2 = this.findPrevH2Text(note)
      const title = prevH2 ? `${prevH2} - forts. från föregående sida` : "Forts. från föregående sida"

      const spacer = document.createElement("div")
      spacer.className = "mm-table-continued-spacer mm-orphan-note-spacer"
      spacer.innerHTML = `<span class="mm-table-continued-label">${this.escapeHtml(title)}</span>`

      note.parentNode.insertBefore(spacer, note)
    }

    note.classList.add("mm-orphan-note")
  }

  getFirstMeaningfulElement(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
      acceptNode: (node) => {
        if (!node || !node.tagName) return NodeFilter.FILTER_SKIP
        // Skip paged wrappers if present
        if (node.classList && (node.classList.contains("pagedjs_page") || node.classList.contains("pagedjs_margin"))) {
          return NodeFilter.FILTER_SKIP
        }
        // Ignore empty containers
        const txt = (node.textContent || "").replace(/\s+/g, "")
        if (!txt && node.children && node.children.length === 0) return NodeFilter.FILTER_SKIP
        return NodeFilter.FILTER_ACCEPT
      }
    })
    return walker.nextNode()
  }

  // Find nearest preceding H2 (walk backwards in DOM)
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

  findPrevH2Text(node) {
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

        // Use nextElementSibling to avoid hitting whitespace text nodes
        const spacer = table.nextElementSibling
        if (spacer && spacer.classList && spacer.classList.contains("mm-table-continued-spacer")) {
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
