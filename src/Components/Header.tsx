import React, { Fragment, ReactElement } from 'react';
import { makeStyles, useTheme } from '@material-ui/core/styles';
import AppBar from '@material-ui/core/AppBar';
import IconButton from '@material-ui/core/IconButton';
import Slide from '@material-ui/core/Slide';
import Toolbar from '@material-ui/core/Toolbar';
import Typography from '@material-ui/core/Typography';
import useScrollTrigger from '@material-ui/core/useScrollTrigger';
import Icon from '@mdi/react';
import { mdiAccountCircle, mdiCheck, mdiPencil } from '@mdi/js';

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

interface HeaderProps {
  editingConfiguration: boolean;
  loggedIn: boolean;
  handleEditConfiguration: () => void;
  handleLogin: () => void;
  handleLogout: () => void;
}

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

export default function Header(props: HeaderProps): ReactElement {
  const {
    editingConfiguration,
    loggedIn,
    handleEditConfiguration,
    handleLogin,
    handleLogout,
  } = props;

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
              aria-label="Edit"
              onClick={handleEditConfiguration}>
              <Icon
                title="Edit"
                path={editingConfiguration ? mdiCheck : mdiPencil}
                color={theme.palette.text.primary}
                size={1}
              />
            </IconButton>
            <IconButton
              color="inherit"
              aria-label={loggedIn ? 'Log Out' : 'Login'}
              onClick={loggedIn ? handleLogout : handleLogin}>
              <Icon
                title={loggedIn ? 'Log Out' : 'Login'}
                path={mdiAccountCircle}
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
