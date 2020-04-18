import makeKey from '../../utils/makeKey';
import type { Note } from '../Types';

export default function placeholderNoteGroup(): Note {
  return {
    key: makeKey(32),
    type: 'list',
    content: '',
  };
}
