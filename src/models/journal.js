import _ from 'lodash/uniqueId';
import bcrypt from 'bcrypt';

export default class Journal {
  constructor(title, icon, key) {
    this.title = title;
    this.icon = icon;
    this.id = _.uniqueId('journal-');
    this.salt = bcrypt.genSaltSync(8);
    this.key = bcrypt.hashSync(key, this.salt);
  }
}
