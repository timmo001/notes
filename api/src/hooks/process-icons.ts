// Use this hook to manipulate incoming or outgoing data.
// For more information on hooks see: http://docs.feathersjs.com/api/hooks.html
import { Hook, HookContext } from '@feathersjs/feathers';
import mdiUtil from '@mdi/util';

interface Icon {
  key: string;
  name: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default (_options = {}): Hook => {
  return async (context: HookContext): Promise<HookContext> => {
    context.result = mdiUtil.getMeta(true).map(
      (icon: Icon): Icon => ({
        key: `mdi:${icon.name}`,
        name: icon.name
          .split('-')
          .map((w: string) => `${w.charAt(0).toUpperCase()}${w.substr(1)}`)
          .join(' '),
      })
    );
    return context;
  };
};
