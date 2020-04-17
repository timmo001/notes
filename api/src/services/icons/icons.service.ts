// Initializes the `icons` service on path `/icons`
import { ServiceAddons } from '@feathersjs/feathers';
import { Application } from '../../declarations';
import { Icons } from './icons.class';
import hooks from './icons.hooks';

// Add this service to the service type index
declare module '../../declarations' {
  interface ServiceTypes {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    icons: Icons & ServiceAddons<any>;
  }
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export default function (app: Application) {
  const options = {
    paginate: app.get('paginate'),
  };

  // Initialize our service with any options it requires
  app.use('/icons', new Icons(options, app));

  // Get our initialized service so that we can register hooks
  const service = app.service('icons');

  service.hooks(hooks);
}
