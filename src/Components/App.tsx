import React, { ReactElement } from 'react';
import { createMuiTheme, ThemeProvider } from '@material-ui/core/styles';
import { pink, purple } from '@material-ui/core/colors';
import 'typeface-roboto';

import Onboarding from './Onboarding';

const theme = createMuiTheme({
  palette: {
    type: 'dark',
    primary: purple,
    secondary: pink,
    background: {
      default: '#303030',
      paper: '#383c45',
    },
  },
});

export default function App(): ReactElement {
  return (
    <ThemeProvider theme={theme}>
      <Onboarding />
    </ThemeProvider>
  );
}
