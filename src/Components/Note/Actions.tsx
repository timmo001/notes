import React, { Fragment, ReactElement } from 'react';
import { useTheme } from '@material-ui/core/styles';
import Grid from '@material-ui/core/Grid';
import IconButton from '@material-ui/core/IconButton';
import MdiIcon from '@mdi/react';
import { mdiChevronDown, mdiChevronUp, mdiClose } from '@mdi/js';

import type { NoteBaseProps } from '../Types';

export default function Actions(props: NoteBaseProps): ReactElement | null {
  const { mouseOver, handleNoteDelete, handleNoteMove } = props;

  const theme = useTheme();
  if (!mouseOver) return null;
  return (
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
        <IconButton onClick={handleNoteDelete}>
          <MdiIcon
            color={theme.palette.primary.contrastText}
            size={1}
            path={mdiClose}
          />
        </IconButton>
      </Grid>
    </Fragment>
  );
}
