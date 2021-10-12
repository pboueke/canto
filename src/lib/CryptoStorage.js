import CryptoJS from 'react-native-crypto-js';

const enc = (value, key) =>
  CryptoJS.AES.encrypt(JSON.stringify(value), key).toString();

const dec = (value, key) =>
  JSON.parse(CryptoJS.AES.decrypt(value, key).toString(CryptoJS.enc.Utf8));

const encKv = (storage, key) => {
  const getter = id => dec(storage.getString(id), key);
  const setter = (id, value) => storage.setString(id, enc(value, key));
  return [getter, setter];
};

const cryptoState = (key, useState) => (identity, defaultValue) => {
  const _k = [...key];
  const _key = () => _k.join('');

  const _defaultValue = defaultValue === null ? null : enc(defaultValue);

  const [_value, _setValue] = useState(_defaultValue);

  const getValue = () => dec(_value, _key());
  const setValue = val => _setValue(enc(val, _key()));

  return [getValue(), setValue];
};

export {cryptoState, enc, dec, encKv};
