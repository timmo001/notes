import React, { Fragment, ReactElement } from 'react';
import clsx from 'clsx';
import { makeStyles, Theme } from '@material-ui/core/styles';
import Grid from '@material-ui/core/Grid';
import InputBase from '@material-ui/core/InputBase';

import Icon from '../Icon';
import type { NoteBaseProps, Note } from '../Types';

const useStyles = makeStyles((theme: Theme) => ({
  icon: {
    margin: theme.spacing(0, 1, 0, 0.5),
  },
  text: {
    margin: theme.spacing(0, 1),
  },
  checkedText: {
    textDecoration: 'line-through',
  },
}));

interface ContentProps extends NoteBaseProps {
  note: Note;
}

export default function Content(props: ContentProps): ReactElement {
  const { handleNoteChange } = props;
  const { icon, content, checked } = props.note;

  const classes = useStyles();
  return (
    <Fragment>
      {icon && (
        <Grid item className={classes.icon}>
          <Icon icon={icon} />
        </Grid>
      )}
      <Grid item xs>
        <InputBase
          className={clsx(classes.text, checked && classes.checkedText)}
          disabled={checked}
          value={content}
          onChange={handleNoteChange('content')}
          fullWidth
          multiline
        />
      </Grid>
    </Fragment>
  );
}
