import QtQuick
import QtQuick.Controls
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui

Panel {
  id: root
  moduleName: "timmo.notes"

  property var anchorItem: null
  property var hostWidget: null
  property var service: null
  readonly property var barIdentity: hostWidget || root
  readonly property color foreground: bar ? bar.foreground : Color.foreground
  readonly property string fontFamily: bar ? bar.fontFamily : Style.font.family
  property string view: "overview"
  property string previousView: "overview"
  property var selectedNote: null
  property string selectedListView: "notes"
  property string repositoryFilter: "all"
  property string tagFilter: "all"
  property string priorityFilter: "all"
  property string sortField: "modified"
  property bool sortAscending: false
  property string groupMode: "repo"
  property string pendingMutation: ""
  property string pendingCreateView: "notes"
  property string createKind: "note"
  property string createRepositorySearch: ""
  property string selectedCreateRepository: ""
  property bool awaitingEditRead: false
  property var repositories: []
  property string captureRepositorySearch: ""
  property string selectedCaptureRepository: ""
  property bool captureAvailable: false
  property bool submitting: false
  property string statusText: ""
  property var activeSubmission: null
  property var pendingSubmissions: []
  property int resetGeneration: 0
  readonly property string cacheRoot: Quickshell.env("XDG_CACHE_HOME") || (Quickshell.env("HOME") + "/.cache")
  readonly property string draftPath: cacheRoot + "/dot/notes-capture-draft.txt"
  readonly property string failedDraftPath: cacheRoot + "/dot/notes-capture-failed-draft.txt"
  readonly property var captureRepositories: {
    var query = captureRepositorySearch.trim().toLowerCase()
    if (!query) return repositories
    return repositories.filter(function(option) {
      return (String(option.label) + " " + String(option.repository)).toLowerCase().indexOf(query) !== -1
    })
  }
  readonly property var createRepositories: {
    var query = createRepositorySearch.trim().toLowerCase()
    var targets = service ? service.targets : []
    if (!query) return targets
    return targets.filter(function(target) {
      return String(target).toLowerCase().indexOf(query) !== -1
    })
  }
  readonly property bool canCapture: captureAvailable && captureInput.text.trim().length > 0
    && captureInput.text.trim().length <= 12000
  readonly property var panelRows: buildRows()
  readonly property var visibleRows: filterController.filteredModel
  readonly property var navigationRows: visibleRows.filter(function(row) { return row.kind !== "heading" })
  readonly property bool rankedSearchActive: (view === "overview" || view === "notes" || view === "handoffs")
    && filterController.filterText.trim() !== ""

  function open(payloadJson) {
    var initialView = "overview"
    try {
      var payload = JSON.parse(String(payloadJson || "{}"))
      if (payload.view === "capture") initialView = "capture"
    } catch (error) {}
    showView(initialView)
    if (service) service.refresh()
    controller.show()
  }
  function close() { controller.hide() }
  function toggle() { if (opened) close(); else open() }
  function switchPanel(direction) {
    if (bar && typeof bar.switchPanelFrom === "function") return bar.switchPanelFrom(barIdentity, direction)
    return false
  }
  function showView(nextView) {
    if (view !== nextView) previousView = view
    view = nextView
    filterController.reset()
    panelFlick.contentY = 0
    Qt.callLater(function() {
      if (nextView === "edit") editInput.forceActiveFocus()
      else if (nextView === "create") createName.forceActiveFocus()
      else if (nextView === "capture") { refreshCaptureStatus(); captureInput.forceActiveFocus() }
      else filterController.forceActiveFocus()
    })
  }
  function back() {
    if (pendingMutation && (view === "edit" || view === "create" || view === "priority"
        || view === "move" || view === "delete")) return
    if (view === "overview") { close(); return }
    if (view === "detail") { showView(selectedListView); return }
    if (view === "notes" || view === "handoffs" || view === "create" || view === "capture") { showView("overview"); return }
    if (view === "edit") { showView("detail"); return }
    if (view === "agent" || view === "priority" || view === "move" || view === "delete") { showView("detail"); return }
    showView("overview")
  }
  function actionRow(action, label, detail, icon) {
    return { key: "action:" + action, kind: "action", action: action, primaryText: label,
      secondaryText: detail || "", icon: icon || "" }
  }
  function headingRow(value, count) {
    return { key: "heading:" + groupMode + ":" + value, kind: "heading",
      primaryText: String(value).toUpperCase() + " · " + count + (count === 1 ? " NOTE" : " NOTES") }
  }
  function noteRow(note, index) {
    return { key: "note:" + String(note.filePath || index), kind: "note", value: note,
      primaryText: String(note.name || note.filename || "Untitled"),
      secondaryText: String(note.description || "") }
  }
  function noteGroup(note) {
    if (groupMode === "repo") return String(note.repoSlug || "Unknown repository")
    if (groupMode === "priority") return String(note.priority || "medium")
    return ""
  }
  function uniqueValues(field, nested) {
    var values = []
    var source = service ? service.entries : []
    for (var i = 0; i < source.length; i++) {
      var candidates = nested ? (source[i][field] || []) : [source[i][field]]
      for (var j = 0; j < candidates.length; j++) {
        var value = String(candidates[j] || "")
        if (value && values.indexOf(value) < 0) values.push(value)
      }
    }
    return values.sort()
  }
  function cycle(current, values) {
    var index = values.indexOf(current)
    return values[(index + 1) % values.length]
  }
  function noteBody(content) {
    return String(content || "").replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "").replace(/^\r?\n/, "")
  }
  function filteredNotes() {
    var source = service && rankedSearchActive ? service.searchResults : (service ? service.entries : [])
    var handoffs = view === "handoffs"
    var result = source.filter(function(note) {
      var tags = (note.tags || []).map(function(tag) { return String(tag).toLowerCase() })
      var isHandoff = tags.indexOf("handoff") >= 0
      return (!handoffs || isHandoff)
        && (repositoryFilter === "all" || note.repoSlug === repositoryFilter)
        && (tagFilter === "all" || tags.indexOf(tagFilter.toLowerCase()) >= 0)
        && (priorityFilter === "all" || String(note.priority || "medium") === priorityFilter)
    })
    if (rankedSearchActive) return result
    return result.sort(function(a, b) {
      var leftGroup = groupMode === "repo" ? String(a.repoSlug || "")
        : (groupMode === "priority" ? ["critical", "high", "medium", "low"].indexOf(String(a.priority || "medium")) : 0)
      var rightGroup = groupMode === "repo" ? String(b.repoSlug || "")
        : (groupMode === "priority" ? ["critical", "high", "medium", "low"].indexOf(String(b.priority || "medium")) : 0)
      if (leftGroup < rightGroup) return -1
      if (leftGroup > rightGroup) return 1
      var left = sortField === "name" ? String(a.name || a.filename || "").toLowerCase() : Number(a.mtime || 0)
      var right = sortField === "name" ? String(b.name || b.filename || "").toLowerCase() : Number(b.mtime || 0)
      if (left < right) return sortAscending ? -1 : 1
      if (left > right) return sortAscending ? 1 : -1
      return 0
    })
  }
  function buildRows() {
    var rows = []
    if (view === "overview") {
      if (rankedSearchActive) {
        var overviewNotes = filteredNotes()
        for (var o = 0; o < overviewNotes.length; o++) rows.push(noteRow(overviewNotes[o], o))
      } else {
        rows.push(actionRow("notes", "Notes", "Browse all notes", "󰠮"))
        rows.push(actionRow("handoffs", "Handoffs", "Browse handoff notes", "󰊢"))
        rows.push(actionRow("new-note", "New note", "Create a repository note", "+"))
        rows.push(actionRow("new-handoff", "New handoff", "Create a handoff note", "+"))
        rows.push(actionRow("capture", "Capture note", "Send to the local capture processor", "󰠮"))
      }
    } else if (view === "notes" || view === "handoffs") {
      rows.push(actionRow("back", "Back to Notes overview", "", ""))
      rows.push(actionRow("filter-repo", "Repository: " + repositoryFilter, "Enter to cycle", "󰏗"))
      rows.push(actionRow("filter-tag", "Tag: " + tagFilter, "Enter to cycle", ""))
      rows.push(actionRow("filter-priority", "Priority: " + priorityFilter, "Enter to cycle", "!"))
      rows.push(actionRow("sort", "Sort: " + sortField + " " + (sortAscending ? "ascending" : "descending"), "Enter to change", "󰒺"))
      rows.push(actionRow("group", "Group: " + groupMode, "repo, priority, or none", "󰙅"))
      var notes = filteredNotes()
      for (var i = 0; i < notes.length; i++) {
        var group = noteGroup(notes[i])
        if (!rankedSearchActive && group && (i === 0 || group !== noteGroup(notes[i - 1]))) {
          var count = 0
          for (var g = i; g < notes.length && noteGroup(notes[g]) === group; g++) count++
          rows.push(headingRow(group, count))
        }
        rows.push(noteRow(notes[i], i))
      }
    } else if (view === "detail") {
      rows.push(actionRow("back", "Back to " + (selectedListView === "overview" ? "Notes overview" : (selectedListView === "handoffs" ? "Handoffs" : "Notes")), "", ""))
      rows.push(actionRow("edit", "Edit", "Edit in this panel", ""))
      rows.push(actionRow("external", "Open external editor", "Open with nvim", ""))
      rows.push(actionRow("agent", "Open in agent", "Choose an installed agent", "󱚣"))
      rows.push(actionRow("priority", "Priority", String(selectedNote && selectedNote.priority || "medium"), "!"))
      rows.push(actionRow("move", "Move", "Choose a repository", "󰁔"))
      rows.push(actionRow("delete", "Delete", "Confirmation required", "󰆴"))
    } else if (view === "agent") {
      rows.push(actionRow("back", "Back to note", "", ""))
      var agents = service ? service.agents : []
      for (var a = 0; a < agents.length; a++) rows.push(actionRow("agent:" + agents[a].command, agents[a].label, agents[a].command, "󱚣"))
    } else if (view === "priority") {
      rows.push(actionRow("back", "Back to note", "", ""))
      var priorities = ["critical", "high", "medium", "low"]
      for (var p = 0; p < priorities.length; p++) rows.push(actionRow("priority:" + priorities[p], priorities[p], "", "!"))
    } else if (view === "move") {
      rows.push(actionRow("back", "Back to note", "", ""))
      var targets = service ? service.targets : []
      for (var t = 0; t < targets.length; t++) rows.push(actionRow("move:" + targets[t], String(targets[t]), "", "󰁔"))
    } else if (view === "delete") {
      rows.push(actionRow("back", "Cancel", "", ""))
      rows.push(actionRow("confirm-delete", "Delete this note", "This cannot be undone", "󰆴"))
    }
    return rows
  }
  function activate(entry) {
    if (entry.kind === "note") {
      selectedNote = entry.value
      selectedListView = view
      previousView = view
      if (service) service.readNote(selectedNote)
      showView("detail")
      return
    }
    var action = entry.action
    if (action === "notes" || action === "handoffs" || action === "capture") showView(action)
    else if (action === "new-note" || action === "new-handoff") {
      createKind = action === "new-handoff" ? "handoff" : "note"
      pendingCreateView = createKind === "handoff" ? "handoffs" : "notes"
      clearCreateForm(); showView("create")
    } else if (action === "back") back()
    else if (action === "filter-repo") repositoryFilter = cycle(repositoryFilter, ["all"].concat(uniqueValues("repoSlug", false)))
    else if (action === "filter-tag") tagFilter = cycle(tagFilter, ["all"].concat(uniqueValues("tags", true)))
    else if (action === "filter-priority") priorityFilter = cycle(priorityFilter, ["all", "critical", "high", "medium", "low"])
    else if (action === "sort") {
      if (sortField === "modified" && !sortAscending) sortAscending = true
      else if (sortField === "modified") { sortField = "name"; sortAscending = true }
      else if (sortAscending) sortAscending = false
      else { sortField = "modified"; sortAscending = false }
    }
    else if (action === "group") groupMode = cycle(groupMode, ["repo", "priority", "none"])
    else if (action === "edit" && service && !service.reading && service.selectedHash) { editInput.text = service.selectedContent; showView("edit") }
    else if (action === "external" && selectedNote) { service.openExternal(selectedNote.filePath); close() }
    else if (action === "agent" || action === "priority" || action === "move" || action === "delete") showView(action)
    else if (action.indexOf("agent:") === 0) { service.openAgent(selectedNote.filePath, action.slice(6)); close() }
    else if (action.indexOf("priority:") === 0 && !pendingMutation) {
      pendingMutation = "priority"; service.setPriority(selectedNote.filePath, action.slice(9))
    } else if (action.indexOf("move:") === 0 && !pendingMutation) {
      pendingMutation = "move"; service.moveNote(selectedNote.filePath, action.slice(5))
    } else if (action === "confirm-delete" && !pendingMutation) {
      pendingMutation = "delete"; service.deleteNote(selectedNote.filePath)
    }
  }
  function cursorItem() {
    var selected = filterController.selectedEntry()
    return selected ? rowRepeater.itemAt(visibleRows.indexOf(selected)) : null
  }
  function revealCursor() {
    var item = cursorItem()
    if (!item) return
    var point = item.mapToItem(contentColumn, 0, 0)
    if (point.y < panelFlick.contentY) panelFlick.contentY = point.y
    else if (point.y + item.height > panelFlick.contentY + panelFlick.height) panelFlick.contentY = point.y + item.height - panelFlick.height
  }
  function clearCreateForm() {
    createName.text = ""; createDescription.text = ""; createBody.text = ""
    createRepositorySearch = ""; selectedCreateRepository = ""
  }
  function submitCreate() {
    if (!service || pendingMutation || !selectedCreateRepository || !createName.text.trim()) return
    pendingMutation = "create"
    service.createNote(selectedCreateRepository, createKind,
      createName.text.trim(), createDescription.text.trim(), createBody.text)
  }
  function submitEdit() {
    if (!service || pendingMutation || !selectedNote || !service.selectedHash) return
    pendingMutation = "edit"
    service.writeNote(selectedNote.filePath, editInput.text, service.selectedHash)
  }
  function rebindSelectedNote() {
    if (!selectedNote || !service) return
    for (var i = 0; i < service.entries.length; i++) {
      if (service.entries[i].filePath === selectedNote.filePath) {
        selectedNote = service.entries[i]
        return
      }
    }
  }

  Timer { id: revealTimer; interval: 0; onTriggered: root.revealCursor() }
  Shortcut {
    sequence: "Escape"
    context: Qt.ApplicationShortcut
    enabled: root.opened && root.view === "create"
    onActivated: root.back()
  }
  Shortcut {
    sequence: "Ctrl+Return"
    context: Qt.ApplicationShortcut
    enabled: root.opened && (root.view === "create" || root.view === "edit")
    onActivated: if (root.view === "create") root.submitCreate(); else root.submitEdit()
  }
  Shortcut {
    sequence: "Ctrl+Enter"
    context: Qt.ApplicationShortcut
    enabled: root.opened && (root.view === "create" || root.view === "edit")
    onActivated: if (root.view === "create") root.submitCreate(); else root.submitEdit()
  }
  Timer {
    id: searchTimer; interval: 220
    onTriggered: if (root.service && (root.view === "overview" || root.view === "notes" || root.view === "handoffs"))
      root.service.search(filterController.filterText, root.view === "handoffs" ? "handoff" : "")
  }

  Connections {
    target: root.service
    function onEntriesChanged() { root.rebindSelectedNote() }
    function onMutationCompleted(kind, success, result, error) {
      if (kind !== root.pendingMutation) return
      root.pendingMutation = ""
      if (!success) return
      if (kind === "edit") {
        root.awaitingEditRead = true
        root.service.readNote(root.selectedNote)
      } else if (kind === "create") root.showView(root.pendingCreateView)
      else if (kind === "priority") root.showView("detail")
      else if (kind === "move" || kind === "delete") {
        root.selectedNote = null
        root.showView(root.selectedListView)
      }
    }
    function onReadCompleted(success) {
      if (!root.awaitingEditRead) return
      root.awaitingEditRead = false
      if (success) root.showView("detail")
    }
  }

  FileView {
    path: root.cacheRoot + "/dot/notes-capture-repositories.json"
    watchChanges: true; printErrors: false
    onLoaded: {
      try { var value = JSON.parse(text()); root.repositories = Array.isArray(value) ? value : [] }
      catch (error) { root.repositories = [] }
    }
    onFileChanged: reload()
  }
  FileView { id: draftFile; path: root.draftPath; printErrors: false; onLoaded: if (!captureInput.text) captureInput.text = text() }
  FileView { id: failedDraftFile; path: root.failedDraftPath; printErrors: false }
  Timer { id: draftSaveTimer; interval: 250; onTriggered: draftFile.setText(captureInput.text) }
  function refreshCaptureStatus() { if (!statusProcess.running) statusProcess.running = true }
  function resetCapture() {
    resetGeneration++; draftSaveTimer.stop(); captureInput.text = ""; draftFile.setText(""); failedDraftFile.setText("")
    pendingSubmissions = []; captureRepositorySearch = ""; selectedCaptureRepository = ""; statusText = ""
  }
  function submitCapture() {
    if (!canCapture) return
    draftSaveTimer.stop()
    pendingSubmissions = pendingSubmissions.concat([{ text: captureInput.text, repository: selectedCaptureRepository, generation: resetGeneration }])
    captureInput.text = ""; draftFile.setText(""); startNextCapture(); updateCaptureStatus(); captureInput.forceActiveFocus()
  }
  function updateCaptureStatus() {
    if (submitting) statusText = pendingSubmissions.length ? "Capturing 1 note, " + pendingSubmissions.length + " queued" : "Capturing 1 note in background"
    else if (pendingSubmissions.length) statusText = pendingSubmissions.length + " queued"
  }
  function startNextCapture() {
    if (submitting || !pendingSubmissions.length) return
    activeSubmission = pendingSubmissions[0]; pendingSubmissions = pendingSubmissions.slice(1)
    var command = ["notes-capture-local", "--stdin", "--json"]
    if (activeSubmission.repository) command.push("--repository", activeSubmission.repository)
    submitting = true; captureProcess.stdinEnabled = true; captureProcess.command = command; captureProcess.running = true
    updateCaptureStatus()
  }
  function finishCapture(exitCode, raw) {
    submitting = false
    var current = activeSubmission && activeSubmission.generation === resetGeneration
    try {
      var result = JSON.parse(String(raw || "").trim())
      if (exitCode !== 0 || result.status !== "success") throw new Error("capture failed")
      if (current) statusText = String(result.summary || "Note captured")
    } catch (error) {
      if (current) { failedDraftFile.setText(activeSubmission.text); statusText = "Capture failed, draft saved"; failureNotification.running = true }
    }
    activeSubmission = null; startNextCapture(); updateCaptureStatus()
  }
  Process {
    id: statusProcess; command: ["notes-capture-local", "--status", "--json"]
    onExited: function(exitCode) {
      root.captureAvailable = exitCode === 0
      if (!root.captureAvailable) root.statusText = "Local processor unavailable. Start notes-capture-opencode.service to send."
      else if (root.statusText === "Local processor unavailable. Start notes-capture-opencode.service to send.") root.statusText = ""
    }
  }
  Process {
    id: captureProcess
    property bool startedSuccessfully: false
    stdinEnabled: true
    stdout: StdioCollector { id: captureOutput; waitForEnd: true }
    onStarted: { startedSuccessfully = true; write(root.activeSubmission.text); stdinEnabled = false }
    onExited: function(exitCode) { startedSuccessfully = false; root.finishCapture(exitCode, captureOutput.text) }
    onRunningChanged: {
      if (!running && root.submitting && !startedSuccessfully) {
        root.submitting = false
        if (root.activeSubmission && root.activeSubmission.generation === root.resetGeneration) {
          failedDraftFile.setText(root.activeSubmission.text)
          root.statusText = "Capture failed, draft saved"
          failureNotification.running = true
        }
        root.activeSubmission = null
        root.startNextCapture()
        root.updateCaptureStatus()
      }
    }
  }
  Process {
    id: failureNotification
    command: ["omarchy", "notification", "send", "-g", "󰠮", "-u", "critical", "--app-name", "Notes", "Note capture failed", "Draft saved to ~/.cache/dot/notes-capture-failed-draft.txt"]
  }
  Timer { interval: 15000; running: root.opened && root.view === "capture"; repeat: true; triggeredOnStart: true; onTriggered: root.refreshCaptureStatus() }

  KeyboardPanel {
    id: panel
    anchorItem: root.anchorItem; owner: root.barIdentity; bar: root.bar; open: root.opened
    focusTarget: root.view === "edit" ? editInput : (root.view === "create" ? createName : (root.view === "capture" ? captureInput : filterController))
    contentWidth: panel.fittedContentWidth(Style.space(560))
    contentHeight: panel.fittedContentHeight(contentColumn.implicitHeight, Style.space(700))

    FilterablePanel {
      id: filterController
      anchors.fill: parent
      model: root.panelRows
      navigationModel: root.navigationRows
      bypassFilter: root.rankedSearchActive
      backOnEmptyFilter: true
      keyboardEnabled: root.view !== "edit" && root.view !== "create" && root.view !== "capture"
      onFilterTextChanged: {
        if (root.service) root.service.invalidateSearch(filterText)
        searchTimer.restart()
      }
      onRevealRequested: revealTimer.restart()
      onActivateRequested: function(entry) { root.activate(entry) }
      onBackRequested: root.back()
      onCloseRequested: root.close()
      onRefreshRequested: if (root.service) root.service.refresh()
      onTabRequested: function(direction) { root.switchPanel(direction) }

      Flickable {
        id: panelFlick
        anchors.fill: parent; contentWidth: width; contentHeight: contentColumn.implicitHeight
        clip: true; boundsBehavior: Flickable.StopAtBounds
        ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }

        Column {
          id: contentColumn
          width: panelFlick.width; spacing: Style.space(12)
          PanelHero {
            width: parent.width
            title: root.view === "overview" ? "Notes" : (root.view === "handoffs" ? "Handoffs" : (root.view === "notes" ? "Notes" : (root.view === "create" ? (root.createKind === "handoff" ? "New handoff" : "New note") : (root.view === "capture" ? "Capture note" : (root.view === "edit" ? "Edit note" : (root.view === "delete" ? "Confirm delete" : (root.selectedNote ? String(root.selectedNote.name || root.selectedNote.filename) : "Notes")))))))
            meta: root.service && root.service.mutating ? "Saving changes" : (root.service ? root.service.mutationMessage : "")
            foreground: root.foreground; fontFamily: root.fontFamily
            iconComponent: Component { Text { text: "󰠮"; color: root.foreground; font.family: root.fontFamily; font.pixelSize: Style.font.display } }
          }

          Text {
            visible: root.view === "overview" || root.view === "notes" || root.view === "handoffs"
            width: parent.width
            text: filterController.filterText
              ? (root.service && root.service.searching ? "SEARCHING · " : "SEARCH · ") + filterController.filterText
              : "TYPE TO SEARCH"
            color: Qt.darker(root.foreground, 1.4)
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
            font.bold: true
            font.letterSpacing: 1.2
          }

          Column {
            visible: root.view !== "edit" && root.view !== "create" && root.view !== "capture"
            width: parent.width; spacing: Style.space(2)
            Repeater {
              id: rowRepeater; model: root.visibleRows
              Item {
                required property int index
                required property var modelData
                width: contentColumn.width
                implicitHeight: modelData.kind === "heading" ? heading.implicitHeight + Style.space(8) : rowSurface.implicitHeight
                Text {
                  id: heading
                  visible: modelData.kind === "heading"
                  width: parent.width
                  text: modelData.primaryText
                  color: Qt.darker(root.foreground, 1.4)
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.caption
                  font.bold: true
                  font.letterSpacing: 1.2
                }
                CursorSurface {
                  id: rowSurface
                  visible: modelData.kind !== "heading"
                  x: Style.space(8); width: Math.max(0, parent.width - Style.space(16))
                  implicitHeight: rowColumn.implicitHeight + Style.space(12)
                  hasCursor: filterController.cursorIndex === filterController.indexForKey(modelData.key)
                  foreground: root.foreground; accent: root.foreground
                  Column {
                    id: rowColumn
                    anchors.left: parent.left; anchors.right: parent.right; anchors.verticalCenter: parent.verticalCenter
                    anchors.leftMargin: Style.space(8); anchors.rightMargin: Style.space(8); spacing: Style.space(2)
                    Text { width: parent.width; text: (modelData.icon ? modelData.icon + "  " : "") + modelData.primaryText; color: root.foreground; font.family: root.fontFamily; font.pixelSize: Style.font.body; elide: Text.ElideRight }
                    Text { visible: modelData.secondaryText !== ""; width: parent.width; text: modelData.secondaryText; color: Qt.darker(root.foreground, 1.4); font.family: root.fontFamily; font.pixelSize: Style.font.caption; elide: Text.ElideRight }
                  }
                  MouseArea { anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onEntered: filterController.cursorIndex = filterController.indexForKey(modelData.key); onClicked: root.activate(modelData) }
                }
              }
            }
            Text { visible: root.visibleRows.length === 0; width: parent.width; text: root.service && root.service.error ? root.service.error : "No matching notes"; color: Qt.darker(root.foreground, 1.4); font.family: root.fontFamily; horizontalAlignment: Text.AlignHCenter }
          }

          Column {
            visible: root.view === "detail" && root.selectedNote !== null
            width: parent.width; spacing: Style.space(6)
            PanelSeparator { foreground: root.foreground }
            Text { width: parent.width; text: "Repository: " + String(root.selectedNote && root.selectedNote.repoSlug || "") + "\nTags: " + String(root.selectedNote && (root.selectedNote.tags || []).join(", ") || "none") + "\nPriority: " + String(root.selectedNote && root.selectedNote.priority || "medium") + "\nModified: " + new Date(Number(root.selectedNote && root.selectedNote.mtime || 0) * 1000).toLocaleString(); color: Qt.darker(root.foreground, 1.3); font.family: root.fontFamily; font.pixelSize: Style.font.caption; wrapMode: Text.Wrap }
            Text { width: parent.width; text: root.noteBody(root.service ? root.service.selectedContent : ""); textFormat: Text.MarkdownText; color: root.foreground; linkColor: Color.accent; font.family: root.fontFamily; font.pixelSize: Style.font.body; wrapMode: Text.Wrap; onLinkActivated: function(link) { Qt.openUrlExternally(link) } }
          }

          Column {
            visible: root.view === "edit"; width: parent.width; spacing: Style.space(8)
            Button { width: parent.width; text: "Back to note"; foreground: root.foreground; fontFamily: root.fontFamily; focusable: true; onClicked: root.back() }
            ScrollView { width: parent.width; height: Style.space(390); TextArea { id: editInput; color: root.foreground; font.family: root.fontFamily; wrapMode: TextEdit.Wrap; selectByMouse: true; Keys.onEscapePressed: root.back() } }
            Button { width: parent.width; text: root.pendingMutation === "edit" ? "Saving" : "Save (Ctrl+Enter)"; enabled: !root.pendingMutation; foreground: root.foreground; fontFamily: root.fontFamily; bordered: true; focusable: true; onClicked: root.submitEdit() }
          }

          Column {
            visible: root.view === "create"; width: parent.width; spacing: Style.space(8)
            Button { width: parent.width; text: "Back to Notes overview"; foreground: root.foreground; fontFamily: root.fontFamily; focusable: true; onClicked: root.back() }
            TextField { id: createName; width: parent.width; placeholderText: "Name"; color: root.foreground; font.family: root.fontFamily }
            TextField { id: createDescription; width: parent.width; placeholderText: "Description"; color: root.foreground; font.family: root.fontFamily }
            ScrollView { width: parent.width; height: Style.space(260); TextArea { id: createBody; placeholderText: "Markdown content"; color: root.foreground; font.family: root.fontFamily; wrapMode: TextEdit.Wrap; Keys.onPressed: function(event) { if ((event.modifiers & Qt.ControlModifier) && (event.key === Qt.Key_Return || event.key === Qt.Key_Enter)) { root.submitCreate(); event.accepted = true } else if (event.key === Qt.Key_Escape) { root.back(); event.accepted = true } } } }
            Button { width: parent.width; text: root.pendingMutation === "create" ? "Creating" : "Create " + (root.createKind === "handoff" ? "handoff" : "note") + " (Ctrl+Enter)"; enabled: !root.pendingMutation && root.selectedCreateRepository !== "" && createName.text.trim() !== ""; foreground: root.foreground; fontFamily: root.fontFamily; bordered: true; focusable: true; onClicked: root.submitCreate() }
            PanelSeparator { foreground: root.foreground }
            TextField { id: createRepositoryFilter; width: parent.width; placeholderText: "Search target repositories"; color: root.foreground; font.family: root.fontFamily; text: root.createRepositorySearch; onTextChanged: root.createRepositorySearch = text }
            Repeater { model: root.createRepositories; Button { required property var modelData; width: contentColumn.width; text: (root.selectedCreateRepository === String(modelData) ? "[x] " : "") + String(modelData); foreground: root.foreground; fontFamily: root.fontFamily; focusable: true; onClicked: root.selectedCreateRepository = String(modelData) } }
          }

          Column {
            visible: root.view === "capture"; width: parent.width; spacing: Style.space(8)
            Button { width: parent.width; text: "Back to Notes overview"; foreground: root.foreground; fontFamily: root.fontFamily; focusable: true; onClicked: root.back() }
            ScrollView { width: parent.width; height: Style.space(180); TextArea { id: captureInput; placeholderText: "What should be investigated or remembered?"; color: root.foreground; font.family: root.fontFamily; wrapMode: TextEdit.Wrap; selectByMouse: true; onTextChanged: draftSaveTimer.restart(); Keys.onPressed: function(event) { if ((event.modifiers & Qt.ControlModifier) && (event.key === Qt.Key_Return || event.key === Qt.Key_Enter)) { root.submitCapture(); event.accepted = true } else if (event.key === Qt.Key_Escape) { root.back(); event.accepted = true } else if (event.key === Qt.Key_Tab || event.key === Qt.Key_Backtab) { captureSend.forceActiveFocus(); event.accepted = true } } } }
            Button { id: captureSend; width: parent.width; text: "Send (Ctrl+Enter)"; enabled: root.canCapture; foreground: root.foreground; fontFamily: root.fontFamily; bordered: true; focusable: true; onClicked: root.submitCapture() }
            Button { width: parent.width; text: "Clear"; foreground: root.foreground; fontFamily: root.fontFamily; focusable: true; onClicked: root.resetCapture() }
            Text { visible: root.statusText !== ""; width: parent.width; text: root.statusText; color: root.captureAvailable ? root.foreground : Color.urgent; font.family: root.fontFamily; font.pixelSize: Style.font.caption; wrapMode: Text.Wrap }
            PanelSeparator { foreground: root.foreground }
            TextField { id: captureRepositoryFilter; width: parent.width; placeholderText: "Search target repositories"; color: root.foreground; font.family: root.fontFamily; text: root.captureRepositorySearch; onTextChanged: root.captureRepositorySearch = text }
            Button { width: parent.width; text: root.selectedCaptureRepository === "" ? "Automatic" : "Automatic (clear selection)"; foreground: root.foreground; fontFamily: root.fontFamily; focusable: true; onClicked: root.selectedCaptureRepository = "" }
            Repeater { model: root.captureRepositories; Button { required property var modelData; width: contentColumn.width; text: (root.selectedCaptureRepository === modelData.repository ? "[x] " : "") + modelData.label + " | " + modelData.repository; foreground: root.foreground; fontFamily: root.fontFamily; focusable: true; onClicked: root.selectedCaptureRepository = String(modelData.repository) } }
          }
        }
      }
    }
  }
}
