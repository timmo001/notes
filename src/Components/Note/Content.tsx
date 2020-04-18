import React, { Fragment, ReactElement, useState } from 'react';
import clsx from 'clsx';
import { makeStyles, Theme } from '@material-ui/core/styles';
import Grid from '@material-ui/core/Grid';
import IconButton from '@material-ui/core/IconButton';
import InputBase from '@material-ui/core/InputBase';
import Typography from '@material-ui/core/Typography';

import { updateNote } from '../Data/Notes';
import Icon from '../Icon';
import IconPicker from '../IconPicker';
import type { NoteBaseProps, Note } from '../Types';

const useStyles = makeStyles((theme: Theme) => ({
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
  const {
    mouseOver,
    noteGroupKey,
    noteGroups,
    notesId,
    handleNoteChange,
  } = props;
  const { client } = props.api;
  const { key, icon, content, checked } = props.note;

  const [iconPicker, setIconPicker] = useState<string | boolean>(false);

  function handleShowIconPicker(): void {
    setIconPicker(icon || true);
  }

  function handleIconPickerFinished(icon?: string): void {
    updateNote(
      client,
      notesId,
      noteGroups,
      noteGroupKey,
      key,
      'icon',
      icon || ''
    );
    setIconPicker(false);
  }

  const classes = useStyles();
  return (
    <Fragment>
      {(icon || mouseOver) && (
        <Grid item>
          <IconButton onClick={handleShowIconPicker}>
            <Icon icon={icon || 'mdi:pencil-outline'} />
          </IconButton>
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
      {iconPicker && (
        <IconPicker
          {...props}
          currentIcon={
            (typeof iconPicker === 'string' && iconPicker) || undefined
          }
          handleIconPickerFinished={handleIconPickerFinished}
        />
      )}
    </Fragment>
  );
}
