import React, { Fragment, ReactElement } from 'react';
import { makeStyles, Theme } from '@material-ui/core/styles';
import Grid from '@material-ui/core/Grid';
import Paper from '@material-ui/core/Paper';

import Actions from './Actions';
import Content from './Content';
import type { NoteBaseProps, NoteList } from '../Types';

const useStyles = makeStyles((theme: Theme) => ({
  root: {
    minHeight: 42,
    padding: theme.spacing(0.5, 1.5),
  },
}));

interface NoteListProps extends NoteBaseProps {
  note: NoteList;
}

export default function NoteListComponent(props: NoteListProps): ReactElement {
  const classes = useStyles();
  return (
    <Fragment>
      <Paper className={classes.root} square>
        <Grid container direction="row" alignItems="center">
          <Content {...props} />
          <Actions {...props} />
        </Grid>
      </Paper>
    </Fragment>
  );
}
