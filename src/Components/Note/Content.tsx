import React, {
  Fragment,
  ReactElement,
  ChangeEvent,
  useState,
  useEffect,
} from 'react';
import clsx from 'clsx';
import { makeStyles, Theme } from '@material-ui/core/styles';
import Grid from '@material-ui/core/Grid';
import IconButton from '@material-ui/core/IconButton';
import InputBase from '@material-ui/core/InputBase';

import { updateNote } from '../Data/Notes';
import Icon from '../Common/Icon';
import IconPicker from '../Common/IconPicker';
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
  handleContentChange: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
}

export default function Content(props: ContentProps): ReactElement {
  const {
    mouseOver,
    noteGroupKey,
    noteGroups,
    notesId,
    handleContentChange,
  } = props;
  const { client } = props.api;
  const { key, icon, checked } = props.note;

  const [content, setContent] = useState<string>(props.note.content || '');
  const [iconPicker, setIconPicker] = useState<string | boolean>(false);

  function handleLocalContentChange(
    event: ChangeEvent<HTMLInputElement>
  ): void {
    setContent(event.target.value);
    handleContentChange(event);
  }

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

  useEffect(() => {
    if (props.note.content !== content) setContent(props.note.content || '');
  }, [props.note]);

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
          onChange={handleLocalContentChange}
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
