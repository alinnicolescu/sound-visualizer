/**
 * Menu items and keyboard shortcuts both end up here, so every command has one
 * implementation however you trigger it.
 */
import { useStore } from './store'
import { useViewSettings } from './viewSettings'
import { useLibrary } from './library'
import { deleteFixtures, deleteStructures, duplicateFixtures, duplicateStructures } from './commands'
import { openDocument, saveDocument } from './document'
import { view } from './viewBus'
import { useWizards } from './wizards'
import { saveViewImage } from '../ui/ViewToolbar'
import { exportCsv, exportMvr, importShowInto, openMvr, startFromTemplate } from './shows'

export function runCommand(command: string): void {
  const { undo, redo, select, selection, project } = useStore.getState()
  const settings = useViewSettings.getState()
  if (command.startsWith('template:')) return void startFromTemplate(command.slice('template:'.length))
  switch (command) {
    case 'builder':
      settings.setFullView(false)
      return settings.setBuilder(!settings.builder)
    case 'importShow':
      return void importShowInto()
    case 'openMvr':
      return void openMvr()
    case 'exportMvr':
      return void exportMvr()
    case 'exportCsv':
      return void exportCsv()
    case 'new':
      return useWizards.getState().openNewShow()
    case 'welcome':
      return useWizards.getState().openWelcome()
    case 'open':
      return void openDocument()
    case 'save':
      return void saveDocument(false)
    case 'saveAs':
      return void saveDocument(true)
    case 'importFixtures':
      settings.setLeftTab('library')
      return void useLibrary.getState().importFiles()
    case 'saveImage':
      return void saveViewImage()
    case 'undo':
      return undo()
    case 'redo':
      return redo()
    case 'selectAll':
      return select(project.fixtures.map((f) => f.id))
    case 'duplicate': {
      const pieces = (useStore.getState().project.structures ?? []).filter((s) => selection.includes(s.id)).map((s) => s.id)
      if (pieces.length) duplicateStructures(pieces)
      else duplicateFixtures(selection)
      return
    }
    case 'delete': {
      const pieces = (useStore.getState().project.structures ?? []).filter((s) => selection.includes(s.id)).map((s) => s.id)
      const fixtures = selection.filter((id) => !pieces.includes(id))
      if (fixtures.length) deleteFixtures(fixtures)
      if (pieces.length) deleteStructures(pieces)
      return
    }
    case 'viewPerspective':
      return view.preset('perspective')
    case 'viewTop':
      return view.preset('top')
    case 'viewFront':
      return view.preset('front')
    case 'viewLeft':
      return view.preset('left')
    case 'viewRight':
      return view.preset('right')
    case 'viewUp':
      return view.preset('up')
    case 'toolSelect':
      return settings.setTool('select')
    case 'toolMove':
      return settings.setTool('move')
    case 'toolOrbit':
      return settings.setTool('orbit')
    case 'focusSelection':
      return view.focus(selection.length ? selection : 'all')
    case 'focusAll':
      return view.focus('all')
    case 'toggleFullView':
      return settings.setFullView(!settings.fullView)
    case 'showLibrary':
      settings.setFullView(false)
      return settings.setLeftTab('library')
    case 'showFixtures':
      settings.setFullView(false)
      return settings.setLeftTab('fixtures')
  }
}

/** Keyboard shortcuts for the page. Text fields keep their keys. */
export function commandForKey(e: KeyboardEvent): string | null {
  const mod = e.metaKey || e.ctrlKey
  const key = e.key.toLowerCase()
  if (mod && key === 'z') return e.shiftKey ? 'redo' : 'undo'
  if (mod && key === 'y') return 'redo'
  if (mod && key === 'a') return 'selectAll'
  if (mod && key === 'd') return 'duplicate'
  if (mod && key === 's') return e.shiftKey ? 'saveAs' : 'save'
  if (mod && key === 'o') return 'open'
  if (mod && key === 'l') return 'showLibrary'
  if (mod && key === 'k') return 'builder'
  if (mod && key === 'n') return 'new'
  if (mod && e.shiftKey && key === 'f') return 'toggleFullView'
  if (mod) return null
  if (e.key === 'Delete' || e.key === 'Backspace') return 'delete'
  if (key === 'f') return e.shiftKey ? 'focusAll' : 'focusSelection'
  if (key === 'v') return 'toolSelect'
  if (key === 'w') return 'toolMove'
  if (key === 'o') return 'toolOrbit'
  return { '1': 'viewPerspective', '2': 'viewTop', '3': 'viewFront', '4': 'viewLeft', '5': 'viewRight', '6': 'viewUp' }[e.key] ?? null
}
