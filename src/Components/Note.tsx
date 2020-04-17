import React, { ReactElement, ChangeEvent } from 'react';

import { moveNote, updateNote } from './Data/Notes';
import NoteList from './Note/List';
import NoteTask from './Note/Task';
import type { NoteProps, Note } from './Types';

export default function NoteComponent(props: NoteProps): ReactElement | null {
  const { notesId, noteGroupKey, noteGroups } = props;
  const { client } = props.api;
  const { key, type, icon, content, checked } = props.note;

  const handleNoteChange = (itemKey: keyof Note) => async (
    event: ChangeEvent<HTMLInputElement>
  ): Promise<void> => {
    console.log('handleNoteChange:', itemKey, event.target.checked);
    console.log('note:', key, type);
    updateNote(client, notesId, noteGroups, noteGroupKey, key, itemKey, event);
  };

  async function handleNoteDelete(): Promise<void> {
    console.log('handleNoteDelete');
    console.log('note:', key, type);
  }

  const handleNoteMove = (position: number) => async (): Promise<void> => {
    console.log('handleNoteMove:', position);
    console.log('note:', key, type);
    moveNote(client, notesId, noteGroups, noteGroupKey, key, position);
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
