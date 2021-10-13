import rnCryptoJS from 'react-native-crypto-js';
import CryptoJS from 'crypto-js';
import bcrypt from 'react-native-bcrypt';

const enc = (value, key) =>
  rnCryptoJS.AES.encrypt(JSON.stringify(value), key).toString();

const dec = (value, key) =>
  JSON.parse(rnCryptoJS.AES.decrypt(value, key).toString(rnCryptoJS.enc.Utf8));

const getStoredSalt = (storage, id, pswd) => {
  const storageKey = CryptoJS.SHA256(`salt:${id}`).toString();
  const storedHash = storage.getString(storageKey);
  if (storedHash) {
    return CryptoJS.enc.Utf8.parse(dec(storedHash, pswd));
  } else {
    const salt = CryptoJS.enc.Utf8.parse(bcrypt.genSaltSync(10000)).toString();
    storage.setString(storageKey, enc(salt, pswd));
    return CryptoJS.enc.Utf8.parse(salt);
  }
};

const encKv = (storage, jId, pswd) => {
  const salt = getStoredSalt(storage, jId, pswd);
  const storageKey = CryptoJS.SHA256(`key:${jId}`).toString();
  const storedKey = storage.getString(storageKey);
  let key;
  if (storedKey) {
    key = dec(storedKey, pswd);
  } else {
    key = CryptoJS.enc.Utf8.parse(
      CryptoJS.PBKDF2(pswd, salt, {iterations: 10000}),
    ).toString();
    storage.setString(storageKey, enc(key, pswd));
  }
  const getter = id => dec(storage.getString(id), key);
  const setter = (id, value) => storage.setString(id, enc(value, key));
  return [getter, setter];
};

export {enc, dec, encKv};
