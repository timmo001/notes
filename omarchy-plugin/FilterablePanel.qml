import QtQuick
import qs.Commons

Item {
  id: root

  property var model: []
  property var navigationModel: null
  property string filterText: ""
  property int cursorIndex: 0
  property bool cursorActive: true
  property bool keyboardEnabled: true
  property bool bypassFilter: false
  property bool backOnEmptyFilter: false
  readonly property var filteredModel: bypassFilter ? (model || []) : filterModel(model, filterText)
  readonly property var navigationEntries: navigationModel === null ? filteredModel : navigationModel
  readonly property int count: filteredModel.length

  signal activateRequested(var entry, int modifiers)
  signal closeRequested()
  signal backRequested()
  signal refreshRequested()
  signal tabRequested(int direction)
  signal revealRequested()

  focus: true
  Keys.priority: Keys.BeforeItem
  Keys.enabled: keyboardEnabled
  onFilteredModelChanged: { clampCursor(); revealRequested() }
  onNavigationEntriesChanged: { clampCursor(); revealRequested() }

  function filterModel(entries, query) {
    var term = String(query || "").trim().toLowerCase()
    if (!term) return entries || []
    return (entries || []).filter(function(entry) {
      return [entry.primaryText, entry.secondaryText].join(" ").toLowerCase().indexOf(term) >= 0
    })
  }
  function reset() { filterText = ""; cursorIndex = 0; cursorActive = true }
  function setFilter(value) { filterText = value; cursorIndex = 0; cursorActive = true }
  function clampCursor() { cursorIndex = Math.max(0, Math.min(cursorIndex, Math.max(0, navigationEntries.length - 1))) }
  function moveCursor(delta) {
    if (!navigationEntries.length) return
    cursorIndex = Math.max(0, Math.min(cursorIndex + delta, navigationEntries.length - 1))
    cursorActive = true
    revealRequested()
  }
  function selectedEntry() {
    return cursorActive && cursorIndex >= 0 && cursorIndex < navigationEntries.length
      ? navigationEntries[cursorIndex] : null
  }
  function indexForKey(key) {
    for (var i = 0; i < navigationEntries.length; i++) if (navigationEntries[i].key === key) return i
    return -1
  }
  function deletesLastCharacter(text) {
    var end = text.length - 1
    if (end > 0) {
      var trailing = text.charCodeAt(end)
      var preceding = text.charCodeAt(end - 1)
      if (trailing >= 0xDC00 && trailing <= 0xDFFF && preceding >= 0xD800 && preceding <= 0xDBFF) end--
    }
    return text.slice(0, Math.max(0, end))
  }

  Keys.onPressed: function(event) {
    if (event.key === Qt.Key_Escape) {
      if (root.filterText) root.setFilter("")
      else root.closeRequested()
      event.accepted = true
    } else if (event.key === Qt.Key_Tab || event.key === Qt.Key_Backtab) {
      root.tabRequested((event.modifiers & Qt.ShiftModifier) || event.key === Qt.Key_Backtab ? -1 : 1)
      event.accepted = true
    } else if (event.key === Qt.Key_Backspace && !root.filterText && root.backOnEmptyFilter) {
      root.backRequested()
      event.accepted = true
    } else if (Util.editsFilter(event, root.filterText)) {
      root.setFilter(event.key === Qt.Key_Backspace && !(event.modifiers & Qt.ControlModifier)
        ? root.deletesLastCharacter(root.filterText) : Util.editedFilter(event, root.filterText))
      event.accepted = true
    } else if (event.key === Qt.Key_Up) {
      root.moveCursor(-1); event.accepted = true
    } else if (event.key === Qt.Key_Down) {
      root.moveCursor(1); event.accepted = true
    } else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
      var entry = root.selectedEntry()
      if (entry) root.activateRequested(entry, event.modifiers)
      event.accepted = true
    } else if (event.key === Qt.Key_R && event.modifiers === Qt.ControlModifier) {
      root.refreshRequested(); event.accepted = true
    } else if (event.text && !/[\u0000-\u001f\u007f]/.test(event.text)
        && (event.modifiers === Qt.NoModifier || event.modifiers === Qt.ShiftModifier)) {
      root.setFilter(root.filterText + event.text); event.accepted = true
    }
  }
}
