import bcrypt from 'react-native-bcrypt';
import isaac from 'isaac';
import {v5 as uuidv5} from 'uuid';
import {metadata} from '..';

bcrypt.setRandomFallback(len => {
  const buf = new Uint8Array(len);

  return buf.map(() => Math.floor(isaac.random() * 256));
});

export default class Journal {
  constructor(title, icon, key = '') {
    this.title = title ?? '';
    this.icon = !icon || icon === '' ? 'book' : icon;
    this.date = new Date().getMilliseconds();
    this.id = uuidv5(title, metadata.uuid);
    this.secure = key !== '';
    this.hash = bcrypt.hashSync(key, 10);

    if (this.secure) {
      // in-memory store of private key as array
      var _secret = [...key];
      this.storeKey = k => {
        _secret = [...k];
      };
      this.getKey = () => _secret.join('');
    }
  }

  unlock(key) {
    if (!this.secure) {
      return true;
    }
    if (bcrypt.compareSync(key, this.hash)) {
      this.storeKey(key);
      return true;
    }
    return false;
  }
}
