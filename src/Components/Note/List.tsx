import React, { Fragment, ReactElement } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import Grid from '@material-ui/core/Grid';
import IconButton from '@material-ui/core/IconButton';
import Paper from '@material-ui/core/Paper';
import Typography from '@material-ui/core/Typography';
import MdiIcon from '@mdi/react';

import Icon from '../Icon';
import type { NoteProps, NoteList } from '../Types';

const useStyles = makeStyles({});

interface NoteListProps extends NoteProps {
  note: NoteList;
}

export default function NoteListComponent(props: NoteListProps): ReactElement {
  const { handleNoteDelete, handleNoteMove } = props;
  const { content, icon } = props.note;

  const classes = useStyles();
  return (
    <Fragment>
      <Paper square variant="outlined">
        <Grid
          container
          direction="column"
          justify="flex-start"
          alignItems="flex-start">
          <Grid item></Grid>
          <Grid item>{icon && <Icon icon={icon} />}</Grid>
          <Grid item xs>
            <Typography component="span" variant="body1">
              {content}
            </Typography>
          </Grid>
          <Grid item></Grid>
        </Grid>
      </Paper>
    </Fragment>
  );
}
