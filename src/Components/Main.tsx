import React, {
  Fragment,
  ReactElement,
  useState,
  useEffect,
  useCallback,
} from 'react';
import { makeStyles, Theme } from '@material-ui/core/styles';
import CssBaseline from '@material-ui/core/CssBaseline';
import Grid from '@material-ui/core/Grid';

import Header from './Header';
import Loading from './Common/Loading';
import NoteGroupComponent from './NoteGroup';
import placeholderNoteGroups from './Placeholders/Notes';
import type { BaseProps, NoteGroup } from './Types';

const useStyles = makeStyles((theme: Theme) => ({
  root: {
    position: 'absolute',
    height: 'calc(100% - 48px)',
    top: 48,
    padding: theme.spacing(1, 2),
  },
  degree: {
    verticalAlign: 'top',
  },
}));

export default function Main(props: BaseProps): ReactElement {
  const { api } = props;
  const { client, userId } = api;

  const [notesId, setNotesId] = useState<string>();
  const [noteGroups, setNotes] = useState<NoteGroup[]>();

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
    const notesId: string = response.data[0]._id;
    setNotesId(notesId);
    setNotes(notes);

    notesService.on(
      'patched',
      (message: { userId: string; notes: NoteGroup[] }) => {
        if (message.userId === userId && notes !== message.notes) {
          console.log('Update Notes:', message.notes);
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
      {notesId && noteGroups ? (
        <Fragment>
          <Header {...props} noteGroups={noteGroups} notesId={notesId} />
          <Grid className={classes.root} container direction="column">
            {noteGroups.map((noteGroup: NoteGroup, noteGroupIndex: number) => (
              <Grid key={noteGroupIndex} item>
                <NoteGroupComponent
                  {...props}
                  noteGroup={noteGroup}
                  noteGroupIndex={noteGroupIndex}
                  noteGroups={noteGroups}
                  notesId={notesId}
                />
              </Grid>
            ))}
          </Grid>
        </Fragment>
      ) : (
        <Loading text="Loading data" />
      )}
    </Fragment>
  );
}
