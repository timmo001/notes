import React, {
  ReactElement,
  Fragment,
  useEffect,
  useState,
  useCallback,
  ChangeEvent,
} from 'react';
import Autocomplete, { RenderInputParams } from '@material-ui/lab/Autocomplete';
import Button from '@material-ui/core/Button';
import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogTitle from '@material-ui/core/DialogTitle';
import Grid from '@material-ui/core/Grid';
import TextField from '@material-ui/core/TextField';

import Icon from './Icon';
import Loading from './Loading';
import type { BaseProps } from './Types';

interface Icon {
  key: string;
  name: string;
}

interface IconPickerProps extends BaseProps {
  currentIcon?: string;
  handleIconPickerFinished: (icon?: string) => void;
}

export default function IconPicker(props: IconPickerProps): ReactElement {
  const { currentIcon, handleIconPickerFinished } = props;
  const { client } = props.api;

  const [icons, setIcons] = useState<Icon[]>();
  const [icon, setIcon] = useState<Icon>();

  const getIcons = useCallback(async (): Promise<void> => {
    const iconsService = await client.service('icons');
    const response: Icon[] = await iconsService.find();

    process.env.NODE_ENV === 'development' && console.log('Icons:', response);

    if (currentIcon) {
      setIcon(response.find((icon: Icon) => icon.key === currentIcon));
    }
    setIcons(response);
  }, [client, currentIcon]);

  useEffect(() => {
    getIcons();
  }, [getIcons]);

  function handleChange(_event: ChangeEvent<{}>, value: Icon | null): void {
    setIcon(value || undefined);
  }

  function handleClose(): void {
    handleIconPickerFinished();
  }

  function handleSave(): void {
    if (!icon) {
      handleClose();
      return;
    }
    handleIconPickerFinished(icon.key);
  }

  return (
    <Fragment>
      <Dialog open fullWidth maxWidth="sm" aria-labelledby="dialog-title">
        <DialogTitle id="dialog-title">Icon</DialogTitle>
        <DialogContent>
          {icons ? (
            <Grid container direction="column" alignItems="center" spacing={1}>
              <Grid item style={{ width: '100%' }}>
                <Autocomplete
                  id="icon"
                  options={icons}
                  value={icon}
                  onChange={handleChange}
                  getOptionLabel={(icon: Icon): string => icon.name}
                  renderInput={(params: RenderInputParams): ReactElement => (
                    <TextField {...params} label="Icon" />
                  )}
                />
              </Grid>
              {icon && (
                <Grid item>
                  <Icon icon={icon.key} size={4} />
                </Grid>
              )}
            </Grid>
          ) : (
            <Loading text="Loading Icons" />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} color="primary">
            Cancel
          </Button>
          <Button onClick={handleSave} color="primary">
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Fragment>
  );
}
