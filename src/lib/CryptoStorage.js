import rnCryptoJS from 'react-native-crypto-js';
import CryptoJS from 'crypto-js';
import bcrypt from 'react-native-bcrypt';

const _enc = (value, key) =>
  rnCryptoJS.AES.encrypt(JSON.stringify(value), key).toString();

const _dec = (value, key) =>
  JSON.parse(rnCryptoJS.AES.decrypt(value, key).toString(rnCryptoJS.enc.Utf8));

const getStorageKey = (label, id) =>
  CryptoJS.SHA256(`${label}:${id}`).toString();

const setStoredSalt = (storage, pswd, salt, jId) => {
  const storageKey = getStorageKey('salt', jId);
  storage.setString(storageKey, _enc(salt, pswd));
};

const getStoredSalt = (storage, id, pswd) => {
  let salt;
  const saltStorageKey = getStorageKey('salt', id);
  const storedSalt = storage.getString(saltStorageKey);
  if (storedSalt) {
    salt = _dec(storedSalt, pswd);
  } else {
    const salt = bcrypt.genSaltSync(10000);
    setStoredSalt(storage, pswd, salt, id);
  }
  return salt;
};

const removeEncryptionData = (storage, id) => {
  storage.removeItem(getStorageKey('key', id));
  storage.removeItem(getStorageKey('salt', id));
};

const generateEncryptionKey = (pswd, salt) => {
  const parsedSalt = CryptoJS.enc.Utf8.parse(salt);
  return CryptoJS.enc.Utf8.parse(
    CryptoJS.PBKDF2(pswd, salt, {iterations: 10000}),
  ).toString();
};

const encKv = (storage, jId, pswd) => {
  const storedKeyStorageKey = getStorageKey('key', jId);
  const storedKey = storage.getString(storedKeyStorageKey);
  let key;
  if (storedKey) {
    key = _dec(storedKey, pswd);
  } else {
    const salt = getStoredSalt(storage, jId, pswd);
    key = generateEncryptionKey(pswd, salt);
    storage.setString(storedKeyStorageKey, _enc(key, pswd));
  }
  const enc = value => _enc(value, key);
  const dec = value => _dec(value, key);
  const getter = id => _dec(storage.getString(id), key);
  const setter = (id, value) => storage.setString(id, _enc(value, key));
  return [getter, setter, enc, dec];
};

const changeJournalEncryptionKey = (storage, journal, oldPswd, newPswd) => {
  const jId = journal.content.id;
  const oldGet = encKv(storage, jId, oldPswd)[0];
  const album = oldGet(`${jId}.album`);
  removeEncryptionData(storage, jId);
  const [_newGet, newSet, newEnc, newDec] = encKv(
    storage,
    jId,
    `${jId}${newPswd}`,
  );
  journal.content.pages.forEach(p => {
    console.log(p);
    const pData = oldGet(p.id);
    newSet(p.id, pData);
  });
  newSet(`${jId}.album`, album);
  newSet(jId, journal);
  return [newEnc, newDec];
};

export {
  encKv,
  changeJournalEncryptionKey,
  getStoredSalt,
  setStoredSalt,
  generateEncryptionKey,
  removeEncryptionData,
};
