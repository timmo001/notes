import React, { ReactElement, ChangeEvent } from 'react';

import NoteList from './Note/List';
import NoteTask from './Note/Task';
import type { BaseProps, NoteGroup, Note } from './Types';
import clone from 'utils/clone';

interface NoteProps extends BaseProps {
  noteGroupKey: string;
  note: Note;
}

export default function NoteComponent(props: NoteProps): ReactElement | null {
  const { notesId, noteGroupKey } = props;
  const { client } = props.api;
  const { key, type, icon, content, checked } = props.note;

  const handleNoteChange = (itemKey: string) => async (
    event: ChangeEvent<HTMLInputElement>
  ): Promise<void> => {
    console.log('handleNoteChange:', itemKey, event.target.checked);
    console.log('note:', key, type);

    const noteGroups = clone(props.notes);
    const noteGroup =
      noteGroups[
        noteGroups.findIndex(
          (noteGroup: NoteGroup) => noteGroup.key === noteGroupKey
        )
      ];
    const item =
      noteGroup.notes[
        noteGroup.notes.findIndex((note: Note) => note.key === key)
      ];
    item[itemKey] =
      itemKey === 'checked' ? event.target.checked : String(event.target.value);

    const notesService = await client.service('notes');
    notesService.patch(notesId, { notes: noteGroups });
  };

  async function handleNoteDelete(): Promise<void> {
    console.log('handleNoteDelete');
    console.log('note:', key, type);
  }

  const handleNoteMove = (position: number) => async (): Promise<void> => {
    console.log('handleNoteMove:', position);
    console.log('note:', key, type);
  };

  switch (type) {
    default:
      return null;
    case 'list':
      return (
        <NoteList
          note={{ key, type, icon, content: content || '' }}
          handleNoteChange={handleNoteChange}
          handleNoteDelete={handleNoteDelete}
          handleNoteMove={handleNoteMove}
        />
      );
    case 'task':
      return (
        <NoteTask
          note={{
            key,
            type,
            icon,
            content: content || '',
            checked: checked || false,
          }}
          handleNoteChange={handleNoteChange}
          handleNoteDelete={handleNoteDelete}
          handleNoteMove={handleNoteMove}
        />
      );
  }
}
