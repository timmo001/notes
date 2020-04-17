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
import type { BaseProps, NoteGroup } from './Types';

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

export default function Main(props: BaseProps): ReactElement {
  const { api } = props;
  const { client, userId } = api;

  const [editingConfiguration, setEditingConfiguration] = useState<boolean>(
    false
  );
  const [notesId, setNotesId] = useState<number>();
  const [notes, setNotes] = useState<NoteGroup[]>();

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
    const notesId: number = response.data[0]._id;
    setNotesId(notesId);
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
      <Header {...props} handleEditConfiguration={handleEditConfiguration} />
      <Grid className={classes.root} container direction="column">
        {notesId &&
          notes &&
          notes.map((noteGroup: NoteGroup, key: number) => (
            <Grid key={key} item>
              <NoteGroupComponent
                {...props}
                notes={notes}
                notesId={notesId}
                editingConfiguration={editingConfiguration}
                noteGroup={noteGroup}
              />
            </Grid>
          ))}
      </Grid>
    </Fragment>
  );
}
