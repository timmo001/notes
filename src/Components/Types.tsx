import { ChangeEvent } from 'react';
import { Application } from '@feathersjs/feathers';

export interface Api {
  client: Application;
  url: string;
  userId: string;
}

export interface NoteGroup {
  key: string;
  title: string;
  icon?: string;
  notes: Note[];
}

export const noteTypes = ['list', 'task'];

interface NoteBase {
  key: string;
  type: 'list' | 'task';
  icon?: string;
}

export interface NoteList extends NoteBase {
  content: string;
}

export interface NoteTask extends NoteBase {
  content: string;
  checked: boolean;
}

export interface Note extends NoteBase {
  content?: string;
  checked?: boolean;
}

export interface Configuration {
  general: ConfigurationGeneral;
}

export interface ConfigurationGeneral {
  theme: 'light' | 'dark';
}

export interface BaseProps {
  api: Api;
  configuration: Configuration;
  loggedIn: boolean;
  handleLogin: () => void;
  handleLogout: () => void;
  handleUpdateConfiguration: (config: Configuration) => void;
}

export interface MainProps extends BaseProps {
  noteGroups: NoteGroup[];
  notesId: string;
}

export interface NoteGroupProps extends MainProps {
  noteGroup: NoteGroup;
  noteGroupIndex: number;
}

export interface NoteProps extends NoteGroupProps {
  note: Note;
  noteIndex: number;
}

export interface NoteGroupBaseProps extends NoteProps {
  handleNoteGroupChange: (
    key: keyof NoteGroup
  ) => (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleNoteGroupDelete: () => Promise<void>;
  handleNoteGroupMove: (position: number) => () => Promise<void>;
}

export interface NoteBaseProps extends NoteProps {
  mouseOver: boolean;
  handleNoteChange: (
    key: keyof Note
  ) => (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleNoteDelete: () => Promise<void>;
  handleNoteMove: (position: number) => () => Promise<void>;
  handleNoteTypeNext: () => Promise<void>;
}
