import React, {
  Fragment,
  ReactElement,
  useState,
  useEffect,
  useCallback,
} from 'react';
import { makeStyles } from '@material-ui/core/styles';
import CssBaseline from '@material-ui/core/CssBaseline';
import Grid from '@material-ui/core/Grid';

import Header from './Header';
import NoteGroupComponent from './NoteGroup';
import placeholderNoteGroups from './Placeholders/Notes';
import type { Api, Configuration, NoteGroup } from './Types';

const useStyles = makeStyles(() => ({
  root: {
    position: 'absolute',
    height: `calc(100% - 48px)`,
    top: 48,
  },
  degree: {
    verticalAlign: 'top',
  },
}));

interface MainProps {
  api: Api;
  configuration: Configuration;
  loggedIn: boolean;
  handleLogin: () => void;
  handleLogout: () => void;
  handleUpdateConfiguration: (config: Configuration) => void;
}

export default function Main(props: MainProps): ReactElement {
  const { api, loggedIn, handleLogin, handleLogout } = props;
  const { client, userId } = api;

  const [editingConfiguration, setEditingConfiguration] = useState<boolean>(
    false
  );
  const [noteGroups, setNotes] = useState<NoteGroup[]>();

  function handleEditConfiguration(): void {
    setEditingConfiguration(!editingConfiguration);
  }

  const getNotes = useCallback(async (): Promise<void> => {
    const notesService = await client.service('notes');
    const response = await notesService.find({ userId });

    if (!response.data[0]) {
      await notesService.create({ notes: placeholderNoteGroups() });
      getNotes();
      return;
    }

    process.env.NODE_ENV === 'development' &&
      console.log('Notes:', response.data[0]);

    const notes: NoteGroup[] = response.data[0].notes;
    setNotes(notes);

    notesService.on(
      'patched',
      (message: { userId: string; notes: NoteGroup[] }) => {
        if (message.userId === userId && notes !== message.notes) {
          console.log('Update Config:', message.notes);
          setNotes(message.notes);
        }
      }
    );
  }, [client, userId]);

  useEffect(() => {
    getNotes();
  }, [getNotes]);

  const classes = useStyles();
  return (
    <Fragment>
      <CssBaseline />
      <Header
        editingConfiguration={editingConfiguration}
        loggedIn={loggedIn}
        handleEditConfiguration={handleEditConfiguration}
        handleLogin={handleLogin}
        handleLogout={handleLogout}
      />
      <Grid className={classes.root} container direction="column">
        {noteGroups &&
          noteGroups.map((noteGroup: NoteGroup, key: number) => (
            <Grid key={key} item>
              <NoteGroupComponent
                {...props}
                editingConfiguration={editingConfiguration}
                noteGroup={noteGroup}
              />
            </Grid>
          ))}
      </Grid>
    </Fragment>
  );
}
