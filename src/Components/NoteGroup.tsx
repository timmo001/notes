import React, {
  Fragment,
  ReactElement,
  ChangeEvent,
  useState,
  useEffect,
  useMemo,
} from 'react';
import { makeStyles, Theme, useTheme } from '@material-ui/core/styles';
import Grid from '@material-ui/core/Grid';
import IconButton from '@material-ui/core/IconButton';
import InputBase from '@material-ui/core/InputBase';
import MdiIcon from '@mdi/react';
import { mdiChevronDown, mdiChevronUp, mdiDelete, mdiPlus } from '@mdi/js';

import {
  addNote,
  deleteNoteGroup,
  moveNoteGroup,
  updateNoteGroup,
} from './Data/Notes';
import Icon from './Common/Icon';
import IconPicker from './Common/IconPicker';
import NoteComponent from './Note/Note';
import type { NoteGroup, Note, NoteGroupProps } from './Types';
import ConfirmDialog from './Common/ConfirmDialog';

const useStyles = makeStyles((theme: Theme) => ({
  root: {
    minHeight: 56,
    alignItems: 'center',
    padding: theme.spacing(1),
  },
  add: {
    marginTop: theme.spacing(1),
  },
  icon: {
    margin: theme.spacing(0, -1),
  },
  notes: {
    paddingBottom: theme.spacing(2),
  },
  note: {
    width: '100%',
  },
  titleEdit: {
    height: 41,
    margin: theme.spacing(0, 1),
    fontSize: '2.125rem',
    fontWeight: 400,
    lineHeight: 1.235,
    letterSpacing: '0.00735em',
    '& input': {
      padding: 0,
    },
  },
}));

export default function NoteGroupComponent(
  props: NoteGroupProps
): ReactElement {
  const { notesId, noteGroups, noteGroupIndex } = props;
  const { client } = props.api;
  const { icon, notes } = props.noteGroup;

  const [deleteConfirm, setDeleteConfirm] = useState<boolean>(false);
  const [iconPicker, setIconPicker] = useState<string | boolean>(false);
  const [mouseOver, setMouseOver] = useState<boolean>(false);
  const [title, setTitle] = useState<string>(props.noteGroup.title);

  function handleMouseEnter(): void {
    setMouseOver(true);
  }

  function handleMouseLeave(): void {
    setMouseOver(false);
  }

  function handleToggleDeleteConfirm(): void {
    setDeleteConfirm(!deleteConfirm);
  }

  function handleShowIconPicker(): void {
    setIconPicker(icon || true);
  }

  function handleIconPickerFinished(icon?: string): void {
    updateNoteGroup(
      client,
      notesId,
      noteGroups,
      noteGroupIndex,
      'icon',
      icon || ''
    );
    setIconPicker(false);
  }

  async function handleAddNote(): Promise<void> {
    addNote(client, notesId, noteGroups, noteGroupIndex);
  }

  async function handleNoteGroupDelete(): Promise<void> {
    deleteNoteGroup(client, notesId, noteGroups, noteGroupIndex);
  }

  const handleNoteGroupMove = (position: number) => async (): Promise<void> => {
    moveNoteGroup(client, notesId, noteGroups, noteGroupIndex, position);
  };

  const handleNoteGroupChange = (itemKey: keyof NoteGroup) => async (
    event: ChangeEvent<HTMLInputElement>
  ): Promise<void> => {
    if (itemKey === 'title') setTitle(event.target.value);
    updateNoteGroup(
      client,
      notesId,
      noteGroups,
      noteGroupIndex,
      itemKey,
      event
    );
  };

  useEffect(() => {
    if (props.noteGroup.title !== title) setTitle(props.noteGroup.title);
  }, [props.noteGroup, title]);

  const moveUpDisabled = useMemo(() => noteGroupIndex < 1, [noteGroupIndex]);
  const moveDownDisabled = useMemo(
    () => noteGroupIndex >= noteGroups.length - 1,
    [noteGroupIndex, noteGroups.length]
  );

  const classes = useStyles();
  const theme = useTheme();
  return (
    <Fragment>
      <Grid
        className={classes.root}
        container
        alignItems="center"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}>
        {(icon || mouseOver) && (
          <Grid className={classes.icon} item>
            <IconButton onClick={handleShowIconPicker}>
              <Icon icon={icon || 'mdi:pencil-outline'} />
            </IconButton>
          </Grid>
        )}
        <Grid item xs>
          <InputBase
            className={classes.titleEdit}
            value={title}
            onChange={handleNoteGroupChange('title')}
            fullWidth
          />
        </Grid>

        {mouseOver && (
          <Fragment>
            <Grid item>
              <IconButton
                disabled={moveUpDisabled}
                onClick={handleNoteGroupMove(-1)}>
                <MdiIcon
                  color={
                    !moveUpDisabled
                      ? theme.palette.primary.light
                      : 'currentColor'
                  }
                  size={1}
                  path={mdiChevronUp}
                />
              </IconButton>
            </Grid>
            <Grid item>
              <IconButton
                disabled={moveDownDisabled}
                onClick={handleNoteGroupMove(+1)}>
                <MdiIcon
                  color={
                    !moveDownDisabled
                      ? theme.palette.primary.light
                      : 'currentColor'
                  }
                  size={1}
                  path={mdiChevronDown}
                />
              </IconButton>
            </Grid>
            <Grid item>
              <IconButton onClick={handleToggleDeleteConfirm}>
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
      <Grid
        className={classes.notes}
        container
        direction="column"
        alignItems="center">
        {notes.map((note: Note, noteIndex: number) => (
          <Grid key={noteIndex} className={classes.note} item>
            <NoteComponent
              {...props}
              note={note}
              noteGroupIndex={noteGroupIndex}
              noteIndex={noteIndex}
            />
          </Grid>
        ))}
        <Grid item>
          <IconButton className={classes.add} onClick={handleAddNote}>
            <MdiIcon
              color={theme.palette.primary.light}
              size={1}
              path={mdiPlus}
            />
          </IconButton>
        </Grid>
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
      {deleteConfirm && (
        <ConfirmDialog
          text="Are you sure you want to delete this group?"
          handleClose={handleToggleDeleteConfirm}
          handleConfirm={handleNoteGroupDelete}
        />
      )}
    </Fragment>
  );
}
