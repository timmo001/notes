import React, { Fragment, ReactElement } from 'react';
import { makeStyles, Theme } from '@material-ui/core/styles';
import Checkbox from '@material-ui/core/Checkbox';
import Grid from '@material-ui/core/Grid';
import Paper from '@material-ui/core/Paper';

import Actions from './Actions';
import Content from './Content';
import type { NoteBaseProps, NoteTask } from '../Types';

const useStyles = makeStyles((theme: Theme) => ({
  root: {
    minHeight: 42,
    padding: theme.spacing(0.5, 1.5),
  },
  checkbox: {},
}));

interface NoteTaskProps extends NoteBaseProps {
  note: NoteTask;
}

export default function NoteTaskComponent(props: NoteTaskProps): ReactElement {
  const { handleNoteChange } = props;
  const { checked } = props.note;

  const classes = useStyles();
  return (
    <Fragment>
      <Paper className={classes.root} square>
        <Grid container direction="row" alignItems="center">
          <Grid item>
            <Checkbox
              className={classes.checkbox}
              checked={checked}
              onChange={handleNoteChange('checked')}
              inputProps={{ 'aria-label': 'primary checkbox' }}
            />
          </Grid>
          <Content {...props} />
          <Actions {...props} />
        </Grid>
      </Paper>
    </Fragment>
  );
}
