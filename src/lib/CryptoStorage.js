import rnCryptoJS from 'react-native-crypto-js';
import CryptoJS from 'crypto-js';
import bcrypt from 'react-native-bcrypt';

const _enc = (value, key) =>
  rnCryptoJS.AES.encrypt(JSON.stringify(value), key).toString();

const _dec = (value, key) =>
  JSON.parse(rnCryptoJS.AES.decrypt(value, key).toString(rnCryptoJS.enc.Utf8));

const getStorageKey = (label, id) =>
  CryptoJS.SHA256(`${label}:${id}`).toString();

const getStoredSalt = (storage, id, pswd) => {
  const storageKey = getStorageKey('salt', id);
  const storedSalt = storage.getString(storageKey);
  if (storedSalt) {
    return CryptoJS.enc.Utf8.parse(_dec(storedSalt, pswd));
  } else {
    const salt = CryptoJS.enc.Utf8.parse(bcrypt.genSaltSync(10000)).toString();
    storage.setString(storageKey, _enc(salt, pswd));
    return CryptoJS.enc.Utf8.parse(salt);
  }
};

const removeEncryptionData = (storage, id) => {
  storage.removeItem(getStorageKey('key', id));
  storage.removeItem(getStorageKey('salt', id));
};

const generateEncryptionKey = (pswd, salt) =>
  CryptoJS.enc.Utf8.parse(
    CryptoJS.PBKDF2(pswd, salt, {iterations: 10000}),
  ).toString();

const encKv = (storage, jId, pswd) => {
  const storageKey = getStorageKey('key', jId);
  const storedKey = storage.getString(storageKey);
  let key;
  if (storedKey) {
    key = _dec(storedKey, pswd);
  } else {
    const salt = getStoredSalt(storage, jId, pswd);
    key = generateEncryptionKey(pswd, salt);
    storage.setString(storageKey, _enc(key, pswd));
  }
  const enc = value => _enc(value, key);
  const dec = value => _dec(value, key);
  const getter = id => _dec(storage.getString(id), key);
  const setter = (id, value) => storage.setString(id, _enc(value, key));
  return [getter, setter, enc, dec];
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

export {
  encKv,
  changeJournalEncryptionKey,
  getStoredSalt,
  generateEncryptionKey,
};
