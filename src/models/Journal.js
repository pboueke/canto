import _ from 'lodash/uniqueId';
import bcrypt from 'bcryptjs';

export class Journal {
  constructor(title, icon, key) {
    this.title = title ?? '';
    this.icon = !icon || icon === '' ? 'book' : icon;
    this.id = _.uniqueId('journal-');
    this.salt = bcrypt.genSaltSync(8);
    this.key = bcrypt.hashSync(key, this.salt);
  }
}
