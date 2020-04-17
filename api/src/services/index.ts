import { Application } from '../declarations';
import users from './users/users.service';
import config from './config/config.service';
import notes from './notes/notes.service';
import icons from './icons/icons.service';
// Don't remove this comment. It's needed to format import lines nicely.

export default function (app: Application): void {
  app.configure(users);
  app.configure(config);
  app.configure(notes);
  app.configure(icons);
}
