import {Platform, Linking} from 'react-native';

const openLocationExternally = (location, label) => {
  const lat = location.coords.latitude;
  const lng = location.coords.longitude;
  const scheme = Platform.select({ios: 'maps:0,0?q=', android: 'geo:0,0?q='});
  const latLng = `${lat},${lng}`;
  const url = Platform.select({
    ios: `${scheme}${label}@${latLng}`,
    android: `${scheme}${latLng}(${label})`,
  });

  Linking.openURL(url);
};

export {openLocationExternally};
