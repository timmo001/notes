import React, { Fragment, ReactElement } from 'react';
import { makeStyles, useTheme } from '@material-ui/core/styles';
import AppBar from '@material-ui/core/AppBar';
import IconButton from '@material-ui/core/IconButton';
import Slide from '@material-ui/core/Slide';
import Toolbar from '@material-ui/core/Toolbar';
import Typography from '@material-ui/core/Typography';
import useScrollTrigger from '@material-ui/core/useScrollTrigger';
import Icon from '@mdi/react';
import { mdiLogout, mdiPlus } from '@mdi/js';

import { addNoteGroup } from './Data/Notes';
import type { MainProps } from './Types';

const useStyles = makeStyles({
  list: {
    width: 280,
  },
  listItemsBottom: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
  },
  spacer: {
    flex: 1,
  },
});

interface HideOnScrollProps {
  children: React.ReactElement;
}

function HideOnScroll(props: HideOnScrollProps): ReactElement {
  const { children } = props;

  const trigger = useScrollTrigger();
  return (
    <Slide appear={false} direction="down" in={!trigger}>
      {children}
    </Slide>
  );
}

export default function Header(props: MainProps): ReactElement {
  const { noteGroups, notesId, handleLogout } = props;
  const { client } = props.api;

  async function handleAddNoteGroup(): Promise<void> {
    addNoteGroup(client, notesId, noteGroups);
  }

  const classes = useStyles();
  const theme = useTheme();
  return (
    <Fragment>
      <HideOnScroll {...props}>
        <AppBar position="fixed" color="primary">
          <Toolbar variant="dense">
            <Typography component="h2" variant="h6">
              Notes
            </Typography>
            <div className={classes.spacer} />
            <IconButton
              color="inherit"
              aria-label="Add Group"
              onClick={handleAddNoteGroup}>
              <Icon
                title="Add Group"
                path={mdiPlus}
                color={theme.palette.text.primary}
                size={1}
              />
            </IconButton>
            <IconButton color="inherit" title="Log Out" onClick={handleLogout}>
              <Icon
                title="Log Out"
                path={mdiLogout}
                color={theme.palette.text.primary}
                size={1}
              />
            </IconButton>
          </Toolbar>
        </AppBar>
      </HideOnScroll>
    </Fragment>
  );
}
