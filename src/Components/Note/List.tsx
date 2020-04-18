import React, { Fragment, ReactElement } from 'react';
import { makeStyles, Theme } from '@material-ui/core/styles';
import Grid from '@material-ui/core/Grid';
import Paper from '@material-ui/core/Paper';

import Actions from './Actions';
import Content from './Content';
import type { NoteBaseProps, NoteList } from '../Types';

const useStyles = makeStyles((theme: Theme) => ({
  root: {
    minHeight: 56,
    padding: theme.spacing(0.5, 1.5),
  },
}));

interface NoteListProps extends NoteBaseProps {
  note: NoteList;
}

export default function NoteListComponent(props: NoteListProps): ReactElement {
  const { handleNoteChange } = props;

  const classes = useStyles();
  return (
    <Fragment>
      <Paper square>
        <Grid
          className={classes.root}
          container
          direction="row"
          alignItems="center">
          <Content
            {...props}
            handleContentChange={handleNoteChange('content')}
          />
          <Actions {...props} />
        </Grid>
      </Paper>
    </Fragment>
  );
}
