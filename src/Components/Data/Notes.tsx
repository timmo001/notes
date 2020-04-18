import { ChangeEvent } from 'react';
import { Application } from '@feathersjs/feathers';
import arrayMove from 'array-move';

import placeholderNote from '../Placeholders/Note';
import placeholderNoteGroup from '../Placeholders/NoteGroup';
import type { NoteGroup, Note } from '../Types';

export async function updateNotes(
  client: Application,
  notesId: string,
  noteGroups: NoteGroup[]
): Promise<void> {
  const notesService = await client.service('notes');
  notesService.patch(notesId, { notes: noteGroups });
}

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

export async function addNoteGroup(
  client: Application,
  notesId: string,
  noteGroups: NoteGroup[]
): Promise<void> {
  noteGroups.push(placeholderNoteGroup());
  updateNotes(client, notesId, noteGroups);
}

export async function deleteNoteGroup(
  client: Application,
  notesId: string,
  noteGroups: NoteGroup[],
  noteGroupKey: string
): Promise<void> {
  const noteGroupIndex: number = getNoteGroupIndex(noteGroups, noteGroupKey);
  noteGroups.splice(noteGroupIndex, 1);
  updateNotes(client, notesId, noteGroups);
}

export async function moveNoteGroup(
  client: Application,
  notesId: string,
  noteGroups: NoteGroup[],
  noteGroupKey: string,
  position: number
): Promise<void> {
  const noteGroupIndex: number = getNoteGroupIndex(noteGroups, noteGroupKey);
  arrayMove.mutate(noteGroups, noteGroupIndex, noteGroupIndex + position);
  updateNotes(client, notesId, noteGroups);
}

export async function updateNoteGroup(
  client: Application,
  notesId: string,
  noteGroups: NoteGroup[],
  noteGroupKey: string,
  itemKey: keyof NoteGroup,
  event: string | ChangeEvent<HTMLInputElement>
): Promise<void> {
  process.env.NODE_ENV === 'development' &&
    console.log(
      'updateNote:',
      notesId,
      noteGroups,
      noteGroupKey,
      itemKey,
      event
    );
  const noteGroupIndex: number = noteGroups.findIndex(
    (noteGroup: NoteGroup) => noteGroup.key === noteGroupKey
  );
  const noteGroup: NoteGroup = noteGroups[noteGroupIndex];
  noteGroups[noteGroupIndex] = {
    ...noteGroup,
    [itemKey]: typeof event === 'string' ? event : event.target.value,
  };
  updateNotes(client, notesId, noteGroups);
}

export async function addNote(
  client: Application,
  notesId: string,
  noteGroups: NoteGroup[],
  noteGroupKey: string
): Promise<void> {
  const noteGroupIndex: number = getNoteGroupIndex(noteGroups, noteGroupKey);
  noteGroups[noteGroupIndex].notes.push(placeholderNote());
  updateNotes(client, notesId, noteGroups);
}

export async function deleteNote(
  client: Application,
  notesId: string,
  noteGroups: NoteGroup[],
  noteGroupKey: string,
  noteKey: string
): Promise<void> {
  const noteGroupIndex: number = getNoteGroupIndex(noteGroups, noteGroupKey);
  const noteIndex: number = getNoteIndex(
    noteGroups[noteGroupIndex].notes,
    noteKey
  );
  noteGroups[noteGroupIndex].notes.splice(noteIndex, 1);
  updateNotes(client, notesId, noteGroups);
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
  event: string | ChangeEvent<HTMLInputElement>
): Promise<void> {
  process.env.NODE_ENV === 'development' &&
    console.log(
      'updateNote:',
      notesId,
      noteGroups,
      noteGroupKey,
      noteKey,
      itemKey,
      event
    );
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
      typeof event === 'string'
        ? event
        : itemKey === 'checked'
        ? event.target.checked
        : event.target.value,
  };
  updateNotes(client, notesId, noteGroups);
}
