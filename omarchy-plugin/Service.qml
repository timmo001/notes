import QtQuick
import Quickshell
import Quickshell.Io

Item {
  id: root

  property var shell: null
  property var entries: []
  property var searchResults: []
  property var agents: []
  property var targets: []
  property var selectedNote: null
  property string selectedContent: ""
  property string selectedHash: ""
  property bool loaded: false
  property bool searching: false
  property bool reading: false
  property bool mutating: mutationProcess.running || mutationQueue.length > 0
  property string error: ""
  property string mutationMessage: ""
  property int listGeneration: 0
  property int searchGeneration: 0
  property int readGeneration: 0
  property var pendingReadNote: null
  property string pendingSearchQuery: ""
  property string pendingSearchTag: ""
  property var mutationQueue: []
  property var activeMutation: null
  property var activeNotes: null
  property string workspaceContextCommand: ""
  property var workspaceContext: null
  property int contextGeneration: 0
  property int providerGeneration: 0
  property bool activeListPending: false

  onWorkspaceContextCommandChanged: {
    providerGeneration++
    contextGeneration++
    workspaceContext = null
    activeNotes = null
    activeListPending = false
    refreshActiveCount()
  }

  signal mutationCompleted(string kind, bool success, var result, string error)
  signal readCompleted(bool success)

  function flattenSections(value) {
    if (!Array.isArray(value)) return []
    var flattened = []
    for (var i = 0; i < value.length; i++) {
      var section = value[i]
      var sectionEntries = Array.isArray(section.entries) ? section.entries : []
      for (var j = 0; j < sectionEntries.length; j++) {
        var entry = sectionEntries[j]
        if (!entry.repoSlug) entry.repoSlug = String(section.repoSlug || "")
        flattened.push(entry)
      }
    }
    return flattened
  }

  function refresh() {
    refreshActiveCount()
    listGeneration++
    if (!listProcess.running) startList(listGeneration)
    if (!agentsProcess.running) agentsProcess.running = true
    if (!targetsProcess.running) targetsProcess.running = true
  }
  function refreshActiveCount() {
    if (!workspaceContextCommand.trim() || contextProcess.running) return
    contextProcess.generation = providerGeneration
    contextProcess.command = ["bash", "-lc", workspaceContextCommand]
    contextProcess.startedSuccessfully = false
    contextProcess.running = true
  }
  function applyWorkspaceContext(value) {
    if (!value || value.attached !== true || typeof value.cwd !== "string"
        || value.cwd.charAt(0) !== "/" || value.cwd.indexOf("\u0000") >= 0) value = null
    var key = value ? JSON.stringify([value.session ? value.session.socketPath : null, value.pane ? value.pane.id : null, value.cwd]) : ""
    if (key !== (workspaceContext ? workspaceContext.key : "")) {
      contextGeneration++
      activeNotes = null
    }
    workspaceContext = value ? { key: key, cwd: value.cwd } : null
    activeListPending = workspaceContext !== null
    if (!workspaceContext) activeNotes = null
    startActiveList()
  }
  function startActiveList() {
    if (!activeListPending || !workspaceContext || activeCountProcess.running) return
    activeListPending = false
    activeCountProcess.generation = contextGeneration
    activeCountProcess.workingDirectory = workspaceContext.cwd
    activeCountProcess.startedSuccessfully = false
    activeCountProcess.running = true
  }
  function startList(generation) {
    listProcess.generation = generation
    listProcess.running = true
  }
  function search(query, tag) {
    searchGeneration++
    pendingSearchQuery = String(query || "").trim()
    pendingSearchTag = String(tag || "")
    if (!pendingSearchQuery) { searchResults = []; searching = false; return }
    searching = true
    if (!searchProcess.running) startSearch(searchGeneration, pendingSearchQuery, pendingSearchTag)
  }
  function invalidateSearch(query) {
    searchGeneration++
    pendingSearchQuery = ""
    searchResults = []
    searching = String(query || "").trim() !== ""
  }
  function startSearch(generation, query, tag) {
    searchProcess.generation = generation
    var command = ["notes", "search", "--query", query, "--all", "--format", "json"]
    if (tag) command.push("--tag", tag)
    searchProcess.command = command
    searchProcess.running = true
  }
  function readNote(note) {
    if (!note || !note.filePath) return
    readGeneration++
    selectedNote = note
    pendingReadNote = note
    selectedContent = ""
    selectedHash = ""
    reading = true
    if (!readProcess.running) startRead(readGeneration, note)
  }
  function startRead(generation, note) {
    readProcess.generation = generation
    readProcess.command = ["notes", "read", "--path", String(note.filePath), "--json"]
    readProcess.running = true
  }
  function enqueueMutation(kind, command, input, useStdin, message) {
    mutationQueue = mutationQueue.concat([{ kind: kind, command: command, input: String(input || ""), useStdin: useStdin, message: message }])
    startMutation()
  }
  function startMutation() {
    if (mutationProcess.running || activeMutation || !mutationQueue.length) return
    activeMutation = mutationQueue[0]
    mutationQueue = mutationQueue.slice(1)
    mutationProcess.stdinEnabled = activeMutation.useStdin
    mutationProcess.command = activeMutation.command
    mutationProcess.running = true
  }
  function writeNote(path, content, hash) {
    enqueueMutation("edit", ["notes", "write", "--path", path, "--stdin", "--expected-hash", hash, "--json"], content, true, "Note saved")
  }
  function createNote(repository, kind, name, description, content) {
    enqueueMutation("create", ["notes", "create", "--repository", repository, "--kind", kind, "--name", name,
      "--description", description, "--stdin", "--json"], content, true, kind === "handoff" ? "Handoff created" : "Note created")
  }
  function setPriority(path, priority) {
    enqueueMutation("priority", ["notes", "priority", "--path", path, "--value", priority, "--json"], "", false, "Priority updated")
  }
  function moveNote(path, target) {
    enqueueMutation("move", ["notes", "move", "--path", path, "--to", target, "--json"], "", false, "Note moved")
  }
  function deleteNote(path) {
    enqueueMutation("delete", ["notes", "delete", "--path", path, "--json"], "", false, "Note deleted")
  }
  function openAgent(path, command, mode) {
    enqueueMutation("agent", ["notes", "open-agent", "--path", path, "--agent", command, "--mode", mode, "--json"], "", false, "Opened in " + command)
  }
  function openExternal(path) {
    Quickshell.execDetached(["uwsm", "app", "--", "xdg-terminal-exec", "nvim", path])
  }

  Timer {
    interval: 3000
    running: true
    repeat: true
    onTriggered: root.refreshActiveCount()
  }
  Process {
    id: contextProcess
    property bool startedSuccessfully: false
    property int generation: 0
    stdout: StdioCollector { id: contextOutput; waitForEnd: true }
    onStarted: startedSuccessfully = true
    onExited: function(exitCode) {
      if (generation !== root.providerGeneration) { root.refreshActiveCount(); return }
      var value = null
      if (exitCode === 0) {
        try { value = JSON.parse(String(contextOutput.text || "null")) }
        catch (error) {}
      }
      root.applyWorkspaceContext(value)
    }
    onRunningChanged: if (!running && !startedSuccessfully) root.applyWorkspaceContext(null)
  }
  Process {
    id: activeCountProcess
    property bool startedSuccessfully: false
    property int generation: 0
    command: ["notes", "list", "--format", "json"]
    stdout: StdioCollector { id: activeCountOutput; waitForEnd: true }
    onStarted: startedSuccessfully = true
    onExited: function(exitCode) {
      if (generation === root.contextGeneration && root.workspaceContext) {
        root.activeNotes = null
        if (exitCode === 0) {
          try {
            var entries = JSON.parse(String(activeCountOutput.text || "null"))
            if (Array.isArray(entries) && entries.every(function(entry) { return entry && typeof entry.filePath === "string" }))
              root.activeNotes = { attached: true, cwd: root.workspaceContext.cwd, count: entries.length,
                notePaths: entries.map(function(entry) { return entry.filePath }) }
          } catch (error) {}
        }
      }
      root.startActiveList()
    }
    onRunningChanged: if (!running && !startedSuccessfully) root.activeNotes = null
  }
  Process {
    id: listProcess
    property int generation: 0
    command: ["notes", "list", "--all", "--format", "json"]
    stdout: StdioCollector { id: listOutput; waitForEnd: true }
    onExited: function(exitCode) {
      if (generation === root.listGeneration) {
        if (exitCode === 0) {
          try { root.entries = root.flattenSections(JSON.parse(String(listOutput.text || "[]"))); root.error = "" }
          catch (error) { root.error = "Invalid notes response" }
        } else root.error = "Notes are unavailable"
        root.loaded = true
      }
      if (generation !== root.listGeneration) root.startList(root.listGeneration)
    }
  }
  Process {
    id: searchProcess
    property int generation: 0
    stdout: StdioCollector { id: searchOutput; waitForEnd: true }
    onExited: function(exitCode) {
      if (generation === root.searchGeneration) {
        if (exitCode === 0) {
          try { root.searchResults = JSON.parse(String(searchOutput.text || "[]")); root.error = "" }
          catch (error) { root.searchResults = []; root.error = "Invalid search response" }
        } else { root.searchResults = []; root.error = "Search failed" }
        root.searching = false
      }
      if (generation !== root.searchGeneration && root.pendingSearchQuery)
        root.startSearch(root.searchGeneration, root.pendingSearchQuery, root.pendingSearchTag)
    }
  }
  Process {
    id: readProcess
    property int generation: 0
    stdout: StdioCollector { id: readOutput; waitForEnd: true }
    onExited: function(exitCode) {
      if (generation !== root.readGeneration) {
        root.startRead(root.readGeneration, root.pendingReadNote)
        return
      }
      root.reading = false
      if (exitCode !== 0) { root.error = "Unable to read note"; root.readCompleted(false); return }
      try {
        var value = JSON.parse(String(readOutput.text || "{}"))
        root.selectedContent = String(value.content || "")
        root.selectedHash = String(value.hash || "")
        root.error = ""
        root.readCompleted(true)
      } catch (error) { root.error = "Invalid note response"; root.readCompleted(false) }
    }
  }
  Process {
    id: agentsProcess
    command: ["notes", "agents", "--format", "json"]
    stdout: StdioCollector { id: agentsOutput; waitForEnd: true }
    onExited: function(exitCode) {
      if (exitCode === 0) try { root.agents = JSON.parse(String(agentsOutput.text || "[]")) } catch (error) { root.agents = [] }
    }
  }
  Process {
    id: targetsProcess
    command: ["notes", "targets", "--format", "json"]
    stdout: StdioCollector { id: targetsOutput; waitForEnd: true }
    onExited: function(exitCode) {
      if (exitCode === 0) try { root.targets = JSON.parse(String(targetsOutput.text || "[]")) } catch (error) { root.targets = [] }
    }
  }
  Process {
    id: mutationProcess
    property bool startedSuccessfully: false
    stdout: StdioCollector { id: mutationOutput; waitForEnd: true }
    onStarted: {
      startedSuccessfully = true
      if (root.activeMutation && root.activeMutation.useStdin) write(root.activeMutation.input)
      stdinEnabled = false
    }
    onExited: function(exitCode) {
      startedSuccessfully = false
      var mutation = root.activeMutation
      var success = exitCode === 0 && mutation !== null
      var result = null
      if (success) {
        try { result = JSON.parse(String(mutationOutput.text || "{}")) }
        catch (error) { success = false }
      }
      var failure = success ? "" : "Notes command failed"
      root.mutationMessage = success ? mutation.message : failure
      root.activeMutation = null
      if (success) root.refresh()
      root.mutationCompleted(mutation ? mutation.kind : "", success, result, failure)
      root.startMutation()
    }
    onRunningChanged: {
      if (!running && root.activeMutation && !startedSuccessfully) {
        var mutation = root.activeMutation
        root.mutationMessage = "Unable to start Notes command"
        root.activeMutation = null
        root.mutationCompleted(mutation.kind, false, null, root.mutationMessage)
        root.startMutation()
      }
    }
  }
  Component.onCompleted: refresh()
}
