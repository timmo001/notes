import React, { ReactElement, ChangeEvent } from 'react';

import { deleteNote, moveNote, updateNote } from './Data/Notes';
import NoteList from './Note/List';
import NoteTask from './Note/Task';
import type { NoteProps, Note } from './Types';

export default function NoteComponent(props: NoteProps): ReactElement | null {
  const { notesId, noteGroupKey, noteGroups } = props;
  const { client } = props.api;
  const { key, type, icon, content, checked } = props.note;

  async function handleNoteDelete(): Promise<void> {
    deleteNote(client, notesId, noteGroups, noteGroupKey, key);
  }

  const handleNoteMove = (position: number) => async (): Promise<void> => {
    moveNote(client, notesId, noteGroups, noteGroupKey, key, position);
  };

  const handleNoteChange = (itemKey: keyof Note) => async (
    event: ChangeEvent<HTMLInputElement>
  ): Promise<void> => {
    updateNote(client, notesId, noteGroups, noteGroupKey, key, itemKey, event);
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
