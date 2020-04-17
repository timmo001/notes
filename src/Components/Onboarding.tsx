import React, {
  Fragment,
  ReactElement,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { AuthenticationResult } from '@feathersjs/authentication/lib';
import authentication from '@feathersjs/authentication-client';
import feathers, { Application } from '@feathersjs/feathers';
import io from 'socket.io-client';
import socketio from '@feathersjs/socketio-client';

import type { Configuration } from './Types';
import clone from '../utils/clone';
import Loading from './Loading';
import Login from './Login';
import Main from './Main';
import placeholderConfiguration from './Placeholders/Configuration';

let socket: SocketIOClient.Socket, client: Application;
function Onboarding(): ReactElement {
  const [loginAttempted, setLoginAttempted] = useState<boolean>(false);
  const [loginCredentials, setLoginCredentials] = useState<
    AuthenticationResult
  >();
  const [configuration, setConfig] = useState<Configuration>();
  const [configId, setConfigId] = useState<string>();
  const [url, setUrl] = useState<string>();
  const [userId, setUserId] = useState<string>();

  useEffect(() => {
    if (!client) {
      client = feathers();
      const path: string = clone(window.location.pathname);
      const url = `${
        process.env.REACT_APP_API_PROTOCOL || window.location.protocol
      }//${process.env.REACT_APP_API_HOSTNAME || window.location.hostname}:${
        process.env.REACT_APP_API_PORT || process.env.NODE_ENV === 'development'
          ? '8334'
          : window.location.port
      }`;
      socket = io(url, { path: `${path}/socket.io`.replace('//', '/') });
      client.configure(socketio(socket));
      client.configure(authentication());
      setUrl(url);
    }
  }, []);

  const getConfig = useCallback(
    (userId: string) => {
      (async (): Promise<void> => {
        const configService = await client.service('config');
        const getter = await configService.find({ userId });

        if (!getter.data[0]) {
          await configService.create({ config: placeholderConfiguration() });
          getConfig(userId);
          return;
        }

        process.env.NODE_ENV === 'development' &&
          console.log('Config:', getter.data[0]);

        const configLcl: Configuration = getter.data[0].config;
        setConfig(configLcl);
        setConfigId(getter.data[0]._id);

        configService.on(
          'patched',
          (message: { userId: string; config: Configuration }) => {
            if (
              message.userId === getter.data[0].userId &&
              configuration !== message.config
            ) {
              console.log('Update Config:', message.config);
              setConfig(message.config);
            }
          }
        );
      })();
    },
    [configuration]
  );

  const handleLogin = useCallback(
    (data?, callback?: (error?: string) => void) => {
      (async (): Promise<void> => {
        try {
          let clientData: AuthenticationResult;
          if (!client) {
            console.warn('Feathers app is undefined');
            return;
          } else if (!data) clientData = await client.reAuthenticate();
          else clientData = await client.authenticate(data, callback);
          console.log('User:', clientData.user);
          setLoginCredentials(clientData.user);
          setLoginAttempted(true);
          setUserId(clientData.user._id);
          getConfig(clientData.user._id);
        } catch (error) {
          console.error('Error in handleLogin:', error);
          setLoginAttempted(true);
          setLoginCredentials(undefined);
          if (callback) callback(`Login error: ${error.message}`);
        }
      })();
    },
    [getConfig]
  );

  useEffect(() => {
    if (!loginCredentials) handleLogin();
  }, [loginCredentials, handleLogin]);

  function handleCreateAccount(
    data: object,
    callback?: (error?: string) => void
  ): void {
    socket.emit('create', 'users', data, (error: { message: string }) => {
      if (error) {
        console.error('Error creating account:', error);
        if (callback) callback(`Error creating account: ${error.message}`);
      } else {
        handleLogin({ strategy: 'local', ...data }, callback);
      }
    });
  }

  async function handleLogout(): Promise<void> {
    localStorage.removeItem('hass_tokens');
    localStorage.removeItem('hass_url');
    await client.logout();
    window.location.replace(window.location.href);
  }

  function handleUpdateConfiguration(config: Configuration): void {
    socket.emit(
      'patch',
      'config',
      configId,
      { config },
      (error: { message: string }) => {
        if (error) console.error('Error updating', configId, ':', error);
        else {
          setConfig(config);
          process.env.NODE_ENV === 'development' &&
            console.log('Updated config:', configId, config);
        }
      }
    );
  }

  const loggedIn = loginCredentials ? true : false;

  return (
    <Fragment>
      {!loginAttempted ? (
        <Loading text="Attempting Login. Please Wait.." />
      ) : loginCredentials && configuration && url && userId ? (
        <Main
          api={{ client, url, userId }}
          configuration={configuration}
          editingConfiguration={false}
          loggedIn={loggedIn}
          handleUpdateConfiguration={handleUpdateConfiguration}
          handleLogin={handleLogin}
          handleLogout={handleLogout}
        />
      ) : (
        <Login
          handleCreateAccount={handleCreateAccount}
          handleLogin={handleLogin}
        />
      )}
    </Fragment>
  );
}

export default Onboarding;
