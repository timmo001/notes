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
  editingConfiguration: boolean;
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
}

export interface NoteProps extends NoteGroupProps {
  note: Note;
  noteGroupKey: string;
}

export interface NoteGroupBaseProps {
  handleNoteGroupChange: (
    key: keyof NoteGroup
  ) => (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleNoteGroupDelete: () => Promise<void>;
  handleNoteGroupMove: (position: number) => () => Promise<void>;
}

export interface NoteBaseProps {
  handleNoteChange: (
    key: keyof Note
  ) => (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleNoteDelete: () => Promise<void>;
  handleNoteMove: (position: number) => () => Promise<void>;
}
