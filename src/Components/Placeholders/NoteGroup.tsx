import makeKey from '../../utils/makeKey';
import placeholderNote from './Note';
import type { NoteGroup } from '../Types';

export default function placeholderNoteGroup(): NoteGroup {
  return {
    key: makeKey(16),
    title: 'Group',
    notes: [placeholderNote()],
  };
}
