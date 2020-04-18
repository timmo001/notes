import React, { ReactElement, ChangeEvent, useState } from 'react';

import { deleteNote, moveNote, updateNote } from './Data/Notes';
import NoteList from './Note/List';
import NoteTask from './Note/Task';
import type { NoteProps, Note } from './Types';

export default function NoteComponent(props: NoteProps): ReactElement {
  const { notesId, noteGroupKey, noteGroups } = props;
  const { client } = props.api;
  const { key, type, icon, content, checked } = props.note;

  const [editing, setEditing] = useState<boolean>(false);
  const [mouseOver, setMouseOver] = useState<boolean>(false);

  function handleMouseEnter(): void {
    setMouseOver(true);
  }

  function handleMouseLeave(): void {
    setMouseOver(false);
  }

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

  function handleToggleEditing(): void {
    setEditing(!editing);
  }

  return (
    <div onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      {type === 'list' ? (
        <NoteList
          editing={editing}
          mouseOver={mouseOver}
          note={{ key, type, icon, content: content || '' }}
          handleNoteChange={handleNoteChange}
          handleNoteDelete={handleNoteDelete}
          handleNoteMove={handleNoteMove}
          handleToggleEditing={handleToggleEditing}
        />
      ) : (
        type === 'task' && (
          <NoteTask
            editing={editing}
            mouseOver={mouseOver}
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
            handleToggleEditing={handleToggleEditing}
          />
        )
      )}
    </div>
  );
}
