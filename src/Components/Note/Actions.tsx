import React, { Fragment, ReactElement } from 'react';
import { useTheme } from '@material-ui/core/styles';
import Grid from '@material-ui/core/Grid';
import IconButton from '@material-ui/core/IconButton';
import MdiIcon from '@mdi/react';
import { mdiChevronUp, mdiChevronDown, mdiClose } from '@mdi/js';

import { NoteBaseProps } from 'Components/Types';

export default function Actions(props: NoteBaseProps): ReactElement {
  const { handleNoteDelete, handleNoteMove } = props;

  const theme = useTheme();
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
