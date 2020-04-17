import React, { Fragment, ReactElement } from 'react';
import { makeStyles, Theme, useTheme } from '@material-ui/core/styles';
import Checkbox from '@material-ui/core/Checkbox';
import Grid from '@material-ui/core/Grid';
import IconButton from '@material-ui/core/IconButton';
import Paper from '@material-ui/core/Paper';
import Typography from '@material-ui/core/Typography';
import MdiIcon from '@mdi/react';
import { mdiChevronUp, mdiChevronDown, mdiClose } from '@mdi/js';

import Icon from '../Icon';
import type { NoteProps, NoteTask } from '../Types';

const useStyles = makeStyles((theme: Theme) => ({
  root: {
    minHeight: 42,
    padding: theme.spacing(0.5, 2),
  },
}));

interface NoteTaskProps extends NoteProps {
  note: NoteTask;
}

export default function NoteTaskComponent(props: NoteTaskProps): ReactElement {
  const { handleNoteChange, handleNoteDelete, handleNoteMove } = props;
  const { icon, content, checked } = props.note;

  const classes = useStyles();
  const theme = useTheme();
  return (
    <Fragment>
      <Paper className={classes.root} square variant="outlined">
        <Grid container direction="row" alignItems="center" spacing={1}>
          <Grid item>
            <Checkbox
              checked={checked}
              onChange={handleNoteChange('checked')}
              inputProps={{ 'aria-label': 'primary checkbox' }}
            />
          </Grid>
          <Grid item>{icon && <Icon icon={icon} />}</Grid>
          <Grid item xs>
            <Typography component="span" variant="body1">
              {content}
            </Typography>
          </Grid>
          <Grid item>
            <IconButton onClick={handleNoteMove(-1)}>
              <MdiIcon
                color={theme.palette.primary.contrastText}
                size={1}
                path={mdiChevronUp}
              />
            </IconButton>
          </Grid>
          <Grid item>
            <IconButton onClick={handleNoteMove(+1)}>
              <MdiIcon
                color={theme.palette.primary.contrastText}
                size={1}
                path={mdiChevronDown}
              />
            </IconButton>
          </Grid>
          <Grid item>
            <IconButton onClick={handleNoteDelete}>
              <MdiIcon
                color={theme.palette.primary.contrastText}
                size={1}
                path={mdiClose}
              />
            </IconButton>
          </Grid>
        </Grid>
      </Paper>
    </Fragment>
  );
}
