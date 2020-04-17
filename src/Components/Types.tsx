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
  configuration: Configuration;
  editingConfiguration: boolean;
  handleUpdateConfiguration: (config: Configuration) => void;
}

export interface MainProps extends BaseProps {
  api: Api;
}

export interface NoteProps {
  handleNoteDelete: () => Promise<void>;
  handleNoteMove: (position: number) => Promise<void>;
}
