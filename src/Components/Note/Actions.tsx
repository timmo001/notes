import React, { Fragment, ReactElement, useMemo } from 'react';
import { useTheme } from '@material-ui/core/styles';
import Grid from '@material-ui/core/Grid';
import IconButton from '@material-ui/core/IconButton';
import MdiIcon from '@mdi/react';
import {
  mdiChevronDown,
  mdiChevronUp,
  mdiClose,
  mdiFormatListBulleted,
  mdiFormatListCheckbox,
} from '@mdi/js';

import type { NoteBaseProps } from '../Types';

export default function Actions(props: NoteBaseProps): ReactElement | null {
  const {
    mouseOver,
    noteGroupIndex,
    noteGroups,
    noteIndex,
    handleNoteDelete,
    handleNoteMove,
    handleNoteTypeNext,
  } = props;
  const { type } = props.note;

  const moveUpDisabled = useMemo(() => noteIndex < 1, [noteIndex]);
  const moveDownDisabled = useMemo(
    () => noteIndex >= noteGroups[noteGroupIndex].notes.length - 1,
    [noteIndex, noteGroupIndex, noteGroups]
  );

  const theme = useTheme();
  if (!mouseOver) return null;
  return (
    <Fragment>
      <Grid item>
        <IconButton onClick={handleNoteTypeNext}>
          <MdiIcon
            color={theme.palette.primary.contrastText}
            size={1}
            path={
              type === 'task' ? mdiFormatListBulleted : mdiFormatListCheckbox
            }
          />
        </IconButton>
      </Grid>
      <Grid item>
        <IconButton disabled={moveUpDisabled} onClick={handleNoteMove(-1)}>
          <MdiIcon size={1} path={mdiChevronUp} />
        </IconButton>
      </Grid>
      <Grid item>
        <IconButton disabled={moveDownDisabled} onClick={handleNoteMove(+1)}>
          <MdiIcon size={1} path={mdiChevronDown} />
        </IconButton>
      </Grid>
      <Grid item>
        <IconButton onClick={handleNoteDelete}>
          <MdiIcon size={1} path={mdiClose} />
        </IconButton>
      </Grid>
    </Fragment>
  );
}
