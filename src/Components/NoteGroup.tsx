import React, { Fragment, ReactElement, ChangeEvent, useState } from 'react';
import { makeStyles, Theme, useTheme } from '@material-ui/core/styles';
import ButtonBase from '@material-ui/core/ButtonBase';
import Grid from '@material-ui/core/Grid';
import IconButton from '@material-ui/core/IconButton';
import InputBase from '@material-ui/core/InputBase';
import Typography from '@material-ui/core/Typography';
import MdiIcon from '@mdi/react';
import { mdiCheck, mdiDelete, mdiChevronUp, mdiChevronDown } from '@mdi/js';

import { deleteNoteGroup, moveNoteGroup, updateNoteGroup } from './Data/Notes';
import Icon from './Icon';
import NoteComponent from './Note';
import type { NoteGroup, Note, NoteGroupProps } from './Types';

const useStyles = makeStyles((theme: Theme) => ({
  title: {
    padding: theme.spacing(1),
  },
  titleEdit: {
    height: 41,
    fontSize: '2.125rem',
    fontWeight: 400,
    lineHeight: 1.235,
    letterSpacing: '0.00735em',
    '& input': {
      padding: 0,
    },
  },
  notes: {
    paddingBottom: theme.spacing(4),
  },
  note: {
    width: '100%',
  },
}));

export default function NoteGroupComponent(
  props: NoteGroupProps
): ReactElement {
  const { notesId, noteGroups } = props;
  const { client } = props.api;
  const { key, title, icon, notes } = props.noteGroup;

  const [editing, setEditing] = useState<boolean>(false);
  const [iconPicker, setIconPicker] = useState<string>();

  function handleToggleEditing(): void {
    setEditing(!editing);
  }

  function handleShowIconPicker(): void {
    setIconPicker(icon);
  }

  function handleIconPickerFinished(): void {
    setIconPicker(undefined);
  }

  async function handleNoteGroupDelete(): Promise<void> {
    deleteNoteGroup(client, notesId, noteGroups, key);
  }

  const handleNoteGroupMove = (position: number) => async (): Promise<void> => {
    moveNoteGroup(client, notesId, noteGroups, key, position);
  };

  const handleNoteGroupChange = (itemKey: keyof NoteGroup) => async (
    event: ChangeEvent<HTMLInputElement>
  ): Promise<void> => {
    updateNoteGroup(client, notesId, noteGroups, key, itemKey, event);
  };

  const classes = useStyles();
  const theme = useTheme();
  return (
    <Fragment>
      <Grid className={classes.title} container alignItems="center" spacing={1}>
        {editing ? (
          <Grid item>
            <IconButton onClick={handleShowIconPicker}>
              <Icon icon={icon || 'mdi:pencil-outline'} />
            </IconButton>
          </Grid>
        ) : (
          icon && (
            <Grid item>
              <Icon icon={icon} />
            </Grid>
          )
        )}
        <Grid item xs container direction="row">
          <Grid item xs>
            {editing ? (
              <InputBase
                className={classes.titleEdit}
                value={title}
                onChange={handleNoteGroupChange('title')}
                fullWidth
              />
            ) : (
              <ButtonBase onClick={handleToggleEditing}>
                <Typography component="h4" variant="h4">
                  {title}
                </Typography>
              </ButtonBase>
            )}
          </Grid>
          {editing && (
            <Fragment>
              <Grid item>
                <IconButton onClick={handleToggleEditing}>
                  <MdiIcon
                    color={theme.palette.primary.light}
                    size={1}
                    path={mdiCheck}
                  />
                </IconButton>
              </Grid>
              <Grid item>
                <IconButton onClick={handleNoteGroupMove(-1)}>
                  <MdiIcon
                    color={theme.palette.primary.light}
                    size={1}
                    path={mdiChevronUp}
                  />
                </IconButton>
              </Grid>
              <Grid item>
                <IconButton onClick={handleNoteGroupMove(+1)}>
                  <MdiIcon
                    color={theme.palette.primary.light}
                    size={1}
                    path={mdiChevronDown}
                  />
                </IconButton>
              </Grid>
              <Grid item>
                <IconButton onClick={handleNoteGroupDelete}>
                  <MdiIcon
                    color={theme.palette.primary.light}
                    size={1}
                    path={mdiDelete}
                  />
                </IconButton>
              </Grid>
            </Fragment>
          )}
        </Grid>
      </Grid>
      <Grid
        className={classes.notes}
        container
        direction="column"
        alignItems="center">
        {notes.map((note: Note, mapKey: number) => (
          <Grid key={mapKey} className={classes.note} item>
            <NoteComponent {...props} noteGroupKey={key} note={note} />
          </Grid>
        ))}
      </Grid>
    </Fragment>
  );
}
