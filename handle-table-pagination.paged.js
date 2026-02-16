/* handle-table-pagination.paged.js - inline dev version */
class RepeatTableHeadersHandler extends Paged.Handler {
  constructor(chunker, polisher, caller) {
    super(chunker, polisher, caller)
    this.splitTablesRefs = []
  }

  afterPageLayout(pageElement, page, breakToken, chunker) {
    this.chunker = chunker
    this.splitTablesRefs = []
    if (!breakToken) return

    const node = breakToken.node
    const tables = this.findAllAncestors(node, "table")
    if (node.tagName === "TABLE") tables.push(node)
    if (tables.length === 0) return

    this.splitTablesRefs = tables.map(t => t.dataset.ref)

    let thead = node.tagName === "THEAD" ? node : this.findFirstAncestor(node, "thead")
    if (thead) {
      const lastTheadNode = thead.hasChildNodes() ? thead.lastChild : thead
      breakToken.node = this.nodeAfter(lastTheadNode, chunker.source)
    }

    this.hideEmptyTables(pageElement, node)
  }

  layout(rendered, layout) {
    this.splitTablesRefs.forEach(ref => {
      const renderedTable = rendered.querySelector("[data-ref='" + ref + "']")
      if (!renderedTable) return
      if (renderedTable.hasAttribute("repeated-headers")) return

      const sourceTable = this.chunker.source.querySelector("[data-ref='" + ref + "']")
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

      /* DEV: uncomment to verify handler runs */
      // renderedTable.style.outline = "3px solid red"
    })
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

  // Basic HTML escaping for injected label text
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
    while (element.parentNode && element.parentNode.nodeType === 1) {
      if (element.parentNode.matches(selector)) return element.parentNode
      element = element.parentNode
    }
    return null
  }

  findAllAncestors(element, selector) {
    const ancestors = []
    while (element.parentNode && element.parentNode.nodeType === 1) {
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
