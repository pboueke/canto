import rnCryptoJS from 'react-native-crypto-js';
import CryptoJS from 'crypto-js';
import bcrypt from 'react-native-bcrypt';

const enc = (value, key) =>
  rnCryptoJS.AES.encrypt(JSON.stringify(value), key).toString();

const dec = (value, key) =>
  JSON.parse(rnCryptoJS.AES.decrypt(value, key).toString(rnCryptoJS.enc.Utf8));

const getStorageKey = (label, id) =>
  CryptoJS.SHA256(`${label}:${id}`).toString();

const getStoredSalt = (storage, id, pswd) => {
  const storageKey = getStorageKey('salt', id);
  const storedHash = storage.getString(storageKey);
  if (storedHash) {
    return CryptoJS.enc.Utf8.parse(dec(storedHash, pswd));
  } else {
    const salt = CryptoJS.enc.Utf8.parse(bcrypt.genSaltSync(10000)).toString();
    storage.setString(storageKey, enc(salt, pswd));
    return CryptoJS.enc.Utf8.parse(salt);
  }
};

const removeEncryptionData = (storage, id) => {
  storage.removeItem(getStorageKey('key', id));
  storage.removeItem(getStorageKey('salt', id));
};

const encKv = (storage, jId, pswd) => {
  const storageKey = getStorageKey('key', jId);
  const storedKey = storage.getString(storageKey);
  let key;
  if (storedKey) {
    key = dec(storedKey, pswd);
  } else {
    const salt = getStoredSalt(storage, jId, pswd);
    key = CryptoJS.enc.Utf8.parse(
      CryptoJS.PBKDF2(pswd, salt, {iterations: 10000}),
    ).toString();
    storage.setString(storageKey, enc(key, pswd));
  }
  const getter = id => dec(storage.getString(id), key);
  const setter = (id, value) => storage.setString(id, enc(value, key));
  return [getter, setter];
};

const changeJournalEncryptionKey = (storage, jId, oldPswd, newPswd) => {
  const oldGet = encKv(storage, jId, oldPswd)[0];
  const jData = oldGet(jId);
  removeEncryptionData(storage, jId);
  const newSet = encKv(storage, jId, `${jId}${newPswd}`)[1];
  jData.content.pages.forEach(p => {
    console.log(p);
    const pData = oldGet(p.id);
    newSet(p.id, pData);
  });
  newSet(jId, jData);
};

export {enc, dec, encKv, changeJournalEncryptionKey};
