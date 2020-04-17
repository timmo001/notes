import React, { Fragment, ReactElement } from 'react';
import { makeStyles, Theme } from '@material-ui/core/styles';
import Grid from '@material-ui/core/Grid';
import Typography from '@material-ui/core/Typography';

import Icon from './Icon';
import NoteComponent from './Note';
import type { MainProps, NoteGroup, Note } from './Types';

const useStyles = makeStyles((theme: Theme) => ({
  title: {
    margin: theme.spacing(1, 2),
  },
  notes: {
    padding: theme.spacing(0, 4, 4),
  },
}));

interface NoteGroupProps extends MainProps {
  noteGroup: NoteGroup;
}

export default function NoteGroupComponent(
  props: NoteGroupProps
): ReactElement {
  const { client, userId } = props.api;
  const { key, title, icon, notes } = props.noteGroup;

  async function handleNoteGroupDelete(noteGroup: NoteGroup) {}

  async function handleNoteGroupMove(noteGroup: NoteGroup, position: number) {}

  const classes = useStyles();
  return (
    <Fragment>
      <Grid className={classes.title} container alignItems="center">
        {icon && (
          <Grid item>
            <Icon icon={icon} />
          </Grid>
        )}
        <Grid item xs>
          <Typography component="h4" variant="h4">
            {title}
          </Typography>
        </Grid>
      </Grid>
      <Grid
        className={classes.notes}
        container
        direction="column"
        alignItems="center">
        {notes.map((note: Note, key: number) => (
          <Grid key={key} item>
            <NoteComponent {...props} note={note} />
          </Grid>
        ))}
      </Grid>
    </Fragment>
  );
}
