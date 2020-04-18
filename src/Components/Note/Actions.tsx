import React, { Fragment, ReactElement, useState } from 'react';
import { useTheme } from '@material-ui/core/styles';
import Grid from '@material-ui/core/Grid';
import IconButton from '@material-ui/core/IconButton';
import MdiIcon from '@mdi/react';
import {
  mdiCheck,
  mdiChevronDown,
  mdiChevronUp,
  mdiClose,
  mdiPencil,
} from '@mdi/js';

import { NoteBaseProps } from 'Components/Types';
import ConfirmDialog from 'Components/ConfirmDialog';

export default function Actions(props: NoteBaseProps): ReactElement | null {
  const {
    editing,
    mouseOver,
    handleNoteDelete,
    handleNoteMove,
    handleToggleEditing,
  } = props;

  const [deleteConfirm, setDeleteConfirm] = useState<boolean>(false);

  function handleToggleDeleteConfirm(): void {
    setDeleteConfirm(!deleteConfirm);
  }

  const theme = useTheme();
  if (!editing && !mouseOver) return null;
  return (
    <Fragment>
      <Grid item>
        <IconButton onClick={handleToggleEditing}>
          <MdiIcon
            color={theme.palette.primary.contrastText}
            size={1}
            path={editing ? mdiCheck : mdiPencil}
          />
        </IconButton>
      </Grid>

      {editing && (
        <Fragment>
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
            <IconButton onClick={handleToggleDeleteConfirm}>
              <MdiIcon
                color={theme.palette.primary.contrastText}
                size={1}
                path={mdiClose}
              />
            </IconButton>
          </Grid>
        </Fragment>
      )}
      {deleteConfirm && (
        <ConfirmDialog
          text="Are you sure you want to delete this note?"
          handleClose={handleToggleDeleteConfirm}
          handleConfirm={handleNoteDelete}
        />
      )}
    </Fragment>
  );
}
