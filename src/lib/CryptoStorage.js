import CryptoJS from 'react-native-crypto-js';

const enc = (value, key) =>
  CryptoJS.AES.encrypt(JSON.stringify(value), key).toString();

const kEnc = key => value => enc(value, key);

const dec = (value, key) =>
  JSON.parse(CryptoJS.AES.decrypt(value, key).toString(CryptoJS.enc.Utf8));

const kDec = key => value => dec(value, key);

const cryptoStorage = (key, useState) => (identity, defaultValue) => {
  const _k = [...key];
  const _key = () => _k.join('');

  const _defaultValue = defaultValue === null ? null : enc(defaultValue);

  const [_value, _setValue] = useState(_defaultValue);

  const getValue = () => dec(_value, _key());
  const setValue = val => _setValue(enc(val, _key()));

  return [getValue(), setValue];
};

export {cryptoStorage, enc, dec, kEnc, kDec};
