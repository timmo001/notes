import React, { ReactElement } from 'react';

import NoteList from './Note/List';
import NoteTask from './Note/Task';
import type { MainProps, Note } from './Types';

interface NoteProps extends MainProps {
  note: Note;
}

export default function NoteComponent(props: NoteProps): ReactElement | null {
  const { client, userId } = props.api;
  const { key, type, icon, content, checked } = props.note;

  async function handleNoteDelete(): Promise<void> {
    console.log('handleNoteDelete');
    console.log('note:', key, type);
  }

  async function handleNoteMove(position: number): Promise<void> {
    console.log('handleNoteMove:', position);
    console.log('note:', key, type);
  }

  switch (type) {
    default:
      return null;
    case 'list':
      return (
        <NoteList
          note={{ key, type, icon, content: content || '' }}
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
          handleNoteDelete={handleNoteDelete}
          handleNoteMove={handleNoteMove}
        />
      );
  }
}
