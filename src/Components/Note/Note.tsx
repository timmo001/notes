import React, { ReactElement, ChangeEvent, useState } from 'react';

import { deleteNote, moveNote, updateNote } from '../Data/Notes';
import NoteList from './List';
import NoteTask from './Task';
import { noteTypes } from '../Types';
import type { NoteProps, Note } from '../Types';

export default function NoteComponent(props: NoteProps): ReactElement {
  const { notesId, noteGroupIndex, noteGroups, noteIndex } = props;
  const { client } = props.api;
  const { key, type, icon, content, checked } = props.note;

  const [mouseOver, setMouseOver] = useState<boolean>(false);

  function handleMouseEnter(): void {
    setMouseOver(true);
  }

  function handleMouseLeave(): void {
    setMouseOver(false);
  }

  async function handleNoteDelete(): Promise<void> {
    deleteNote(client, notesId, noteGroups, noteGroupIndex, noteIndex);
  }

  const handleNoteMove = (position: number) => async (): Promise<void> => {
    moveNote(client, notesId, noteGroups, noteGroupIndex, noteIndex, position);
  };

  const handleNoteChange = (itemKey: keyof Note) => async (
    event: ChangeEvent<HTMLInputElement>
  ): Promise<void> => {
    updateNote(
      client,
      notesId,
      noteGroups,
      noteGroupIndex,
      noteIndex,
      itemKey,
      event
    );
  };

  async function handleNoteTypeNext(): Promise<void> {
    updateNote(
      client,
      notesId,
      noteGroups,
      noteGroupIndex,
      noteIndex,
      'type',
      noteTypes[(noteTypes.indexOf(type) + 1) % noteTypes.length]
    );
  }

  return (
    <div onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      {type === 'list' ? (
        <NoteList
          {...props}
          mouseOver={mouseOver}
          note={{ key, type, icon, content: content || '' }}
          handleNoteChange={handleNoteChange}
          handleNoteDelete={handleNoteDelete}
          handleNoteMove={handleNoteMove}
          handleNoteTypeNext={handleNoteTypeNext}
        />
      ) : (
        type === 'task' && (
          <NoteTask
            {...props}
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
            handleNoteTypeNext={handleNoteTypeNext}
          />
        )
      )}
    </div>
  );
}
