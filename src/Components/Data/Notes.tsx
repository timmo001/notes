import { ChangeEvent } from 'react';
import { Application } from '@feathersjs/feathers';
import arrayMove from 'array-move';

import { NoteGroup, Note } from '../Types';

export function getNoteGroupIndex(
  noteGroups: NoteGroup[],
  noteGroupKey: string
): number {
  return noteGroups.findIndex(
    (noteGroup: NoteGroup) => noteGroup.key === noteGroupKey
  );
}

export function getNoteIndex(notes: Note[], noteKey: string): number {
  return notes.findIndex((note: Note) => note.key === noteKey);
}

export async function updateNotes(
  client: Application,
  notesId: string,
  noteGroups: NoteGroup[]
): Promise<void> {
  const notesService = await client.service('notes');
  notesService.patch(notesId, { notes: noteGroups });
}

export async function moveNote(
  client: Application,
  notesId: string,
  noteGroups: NoteGroup[],
  noteGroupKey: string,
  noteKey: string,
  position: number
): Promise<void> {
  const noteGroupIndex: number = getNoteGroupIndex(noteGroups, noteGroupKey);
  const noteIndex: number = getNoteIndex(
    noteGroups[noteGroupIndex].notes,
    noteKey
  );
  arrayMove.mutate(
    noteGroups[noteGroupIndex].notes,
    noteIndex,
    noteIndex + position
  );
  updateNotes(client, notesId, noteGroups);
}

export async function updateNote(
  client: Application,
  notesId: string,
  noteGroups: NoteGroup[],
  noteGroupKey: string,
  noteKey: string,
  itemKey: keyof Note,
  event: ChangeEvent<HTMLInputElement>
): Promise<void> {
  const noteGroupIndex: number = noteGroups.findIndex(
    (noteGroup: NoteGroup) => noteGroup.key === noteGroupKey
  );
  const noteIndex: number = noteGroups[noteGroupIndex].notes.findIndex(
    (note: Note) => note.key === noteKey
  );
  const note: Note = noteGroups[noteGroupIndex].notes[noteIndex];

  noteGroups[noteGroupIndex].notes[noteIndex] = {
    ...note,
    [itemKey]:
      itemKey === 'checked' ? event.target.checked : event.target.value,
  };

  updateNotes(client, notesId, noteGroups);
}
