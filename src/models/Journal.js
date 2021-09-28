import bcrypt from 'react-native-bcrypt';
import isaac from 'isaac';
import {v5 as uuidv5} from 'uuid';
import {metadata} from '..';

bcrypt.setRandomFallback(len => {
  const buf = new Uint8Array(len);
  return buf.map(() => Math.floor(isaac.random() * 256));
});

export default class Journal {
  constructor({
    title = '',
    icon = 'book',
    date = new Date().toISOString(),
    id = uuidv5(title, metadata.uuid),
    secure = false,
    hash = null,
    key = '',
  }) {
    Object.assign(this, {title, icon, date, id, secure, hash});

    if (!secure) {
      this.secure = key !== '';
    }

    if (this.secure) {
      if (!this.hash) {
        this.hash = bcrypt.hashSync(key, 10);
      }
    }
  }

  unlock(key, callback) {
    if (!this.secure) {
      return callback(null, true);
    }
    bcrypt.compare(key, this.hash, (err, res) => {
      if (err) {
        console.log(err);
      }
      return callback(err, res);
    });
  }
}
