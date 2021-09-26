import bcrypt from 'react-native-bcrypt';
import isaac from 'isaac';

export default class Journal {
  constructor(title, icon, key) {
    bcrypt.setRandomFallback(len => {
      const buf = new Uint8Array(len);

      return buf.map(() => Math.floor(isaac.random() * 256));
    });

    this.title = title ?? '';
    this.icon = !icon || icon === '' ? 'book' : icon;
    this.id = 'journal_' + new Date().getMilliseconds();
    this.key = bcrypt.hashSync(key, 8);
  }
}
