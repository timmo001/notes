import React, { ReactElement } from 'react';
import { makeStyles, useTheme, Theme } from '@material-ui/core/styles';
import MdiIcon from '@mdi/react';

const useStyles = makeStyles((theme: Theme) => ({
  icon: {
    height: 48,
    marginBottom: theme.spacing(1),
    color: theme.palette.primary.main,
  },
}));

interface IconProps {
  icon: string;
  size?: number;
}
export default function Icon(props: IconProps): ReactElement | null {
  const { icon, size } = props;

  const classes = useStyles();
  const theme = useTheme();

  if (!icon) {
    return null;
  }
  if (icon.startsWith('mdi:')) {
    const iconImport = require('@mdi/js')[
      `mdi${icon
        .replace('mdi:', '')
        .replace(/(?:^|-)\S/g, (a) => a.replace('-', '').toUpperCase())}`
    ];
    return (
      <MdiIcon
        color={theme.palette.primary.light}
        size={size || 1}
        path={iconImport}
      />
    );
  }
  return <img className={classes.icon} alt="Icon" src={icon} />;
}
