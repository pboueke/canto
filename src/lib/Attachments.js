import {PermissionsAndroid, Alert} from 'react-native';
import {launchImageLibrary} from 'react-native-image-picker';
import {hashCode} from '.';
import RNFS from 'react-native-fs';
import {Page} from '../models';

const addLocation = async (setLocation, callback) => {
  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    {
      title: "Canto's Location Permission",
      message:
        'Canto needs access to your location services ' +
        'to add location data to your journal page.',
      buttonNeutral: 'Ask Me Later',
      buttonNegative: 'Cancel',
      buttonPositive: 'OK',
    },
  );
  if (granted === PermissionsAndroid.RESULTS.GRANTED) {
    Page.setLocation(loc => {
      setLocation(loc);
      callback();
    });
  } else {
    Alert.alert('Permission Denied', 'Couldn´t get location permission.', [
      {
        text: 'Close',
        style: 'cancel',
      },
    ]);
  }
};

const addFile = async (
  pageId,
  fileSetter,
  fileRef,
  callback,
  fileType = 'image',
) => {
  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
    {
      title: "Canto's Write to Storage Permission",
      message: 'Canto needs access to save your files to your phone storage.',
      buttonNeutral: 'Ask Me Later',
      buttonNegative: 'Cancel',
      buttonPositive: 'OK',
    },
  );
  if (granted === PermissionsAndroid.RESULTS.GRANTED) {
    launchImageLibrary(
      {mediaType: fileType, includeBase64: false, selectionLimit: 0},
      res => {
        if (res.errorCode) {
          console.log(`ERROR: ${res.errorCode} \n ${res.errorMessage}}`);
        } else if (!res.didCancel) {
          res.assets.forEach(f => {
            const ext = f.fileName.split('.').pop();
            const dest =
              'file://' +
              RNFS.DocumentDirectoryPath +
              `/img-${pageId}-${hashCode(f.fileName)}.${ext}`;
            RNFS.copyFile(f.uri, dest).then(() => {
              fileSetter(fileRef.current.concat(dest));
              callback();
            });
          });
        }
      },
    );
  } else {
    Alert.alert('Permission Denied', 'Couldn´t get file storage permission.', [
      {
        text: 'Close',
        style: 'cancel',
      },
    ]);
  }
};

const removeFile = async (imagePath, imagesRef, setImages, callback) => {
  setImages(imagesRef.current.filter(img => img !== imagePath));
  RNFS.unlink(imagePath.substr(6))
    .then(() => {
      callback();
    })
    .catch(err => {
      console.log(err.message);
    });
};

export {removeFile, addFile, addLocation};
