import {PermissionsAndroid, Alert} from 'react-native';
import {launchImageLibrary} from 'react-native-image-picker';
import DocumentPicker from 'react-native-document-picker';
import CameraRoll from '@react-native-community/cameraroll';
import Share from 'react-native-share';
import {hashCode} from '.';
import RNFS from 'react-native-fs';
import {Page} from '../models';
import {getDate} from '../lib';

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
    Alert.alert(
      'Permission Denied',
      'Couldn´t get permission to use location services.',
      [
        {
          text: 'Close',
          style: 'cancel',
        },
      ],
    );
  }
};

const saveImage = async (imagePath, callback) => {
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
    try {
      CameraRoll.save(imagePath, {type: 'photo', album: 'Canto'});
      callback && callback('Image saved!');
    } catch (err) {
      console.log(err);
      callback && callback('Could not save image :s');
      throw err;
    }
  } else {
    Alert.alert(
      'Permission Denied',
      "Couldn´t get permission to use the device's file storage.",
      [
        {
          text: 'Close',
          style: 'cancel',
        },
      ],
    );
  }
};

const addFile = async (pageId, callback) => {
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
    try {
      const res = await DocumentPicker.pick({
        type: [DocumentPicker.types.allFiles],
      });
      res.forEach(r => {
        const ext = r.name.split('.').pop();
        const dest =
          'file://' +
          RNFS.DocumentDirectoryPath +
          `/fl-${pageId}-${hashCode(r.name)}.${ext}`;
        RNFS.copyFile(r.uri, dest).then(() => {
          callback(dest, r.name);
        });
      });
    } catch (err) {
      if (DocumentPicker.isCancel(err)) {
        // User cancelled the picker, exit any dialogs or menus and move on
      } else {
        console.log(err);
        throw err;
      }
    }
  } else {
    Alert.alert(
      'Permission Denied',
      "Couldn´t get permission to use the device's file storage.",
      [
        {
          text: 'Close',
          style: 'cancel',
        },
      ],
    );
  }
};

const addImage = async (pageId, callback, mode = 0) => {
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
    launchImageLibrary(RNFSConfig(mode), res => {
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
            callback(dest);
          });
        });
      }
    });
  } else {
    Alert.alert(
      'Permission Denied',
      "Couldn´t get permission to use the device's file storage.",
      [
        {
          text: 'Close',
          style: 'cancel',
        },
      ],
    );
  }
};

const removeFile = async (filePath, callback) => {
  const path = filePath.path ?? filePath;
  RNFS.unlink(path.substr(6))
    .then(() => {
      if (callback) {
        callback();
      }
    })
    .catch(err => {
      console.log(err.message);
      if (callback) {
        callback();
      }
    });
};

/* RNFS does not like dynamic configs for some reason
 */
const RNFSConfig = mode => {
  switch (mode) {
    case 0:
      return {
        mediaType: 'image',
        includeBase64: false,
        selectionLimit: 0,
      };
    case 1:
      return {
        mediaType: 'image',
        includeBase64: false,
        selectionLimit: 1,
      };
    case 2:
      return {
        mediaType: 'mixed',
        includeBase64: false,
        selectionLimit: 0,
      };
    case 4:
      return {
        mediaType: 'mixed',
        includeBase64: false,
        selectionLimit: 1,
      };
  }
};

const shareFile = async (path, name, date) => {
  Share.open({
    message: getDate(date),
    title: name,
    url: path,
    failOnCancel: false,
  })
    .then(res => {
      //console.log(res);
    })
    .catch(err => {
      console.log(err);
    });
};

export {removeFile, addImage, addFile, addLocation, shareFile, saveImage};
