import React, {useState} from 'react';
import styled from 'styled-components/native';
import Icon from 'react-native-vector-icons/Feather';
import Clipboard from '@react-native-clipboard/clipboard';
import Toast from 'react-native-toast-message';
import {toastConfig} from './CustomToast';

const LocationTag = ({loc, removable, action}) => {
  // note: toast inside modals function weirdly.
  // toastVisibility added as a woraround
  const modalToastRef = React.useRef({});
  const [toastVisibility, setToastVisibility] = useState(false);
  const icon = removable ? 'x' : 'external-link';
  if (!loc) {
    return null;
  }
  return (
    <Wrapper
      onPress={action}
      onLongPress={() => {
        Clipboard.setString(`${loc.coords.latitude},${loc.coords.longitude}`);
        setToastVisibility(true);
        modalToastRef.current.show({
          type: 'simpleInfo',
          position: 'bottom',
          text1: 'copied lat,lng',
          text2: `${loc.coords.latitude},${loc.coords.longitude}`,
          visibilityTime: 1000,
          autoHide: true,
          bottomOffset: 0,
          onShow: () => {},
          onHide: () => setToastVisibility(false),
          onPress: () => {},
        });
      }}>
      <Icon name={'map-pin'} size={20} />
      <LocationText>
        {`${loc.coords.latitude} , ${loc.coords.longitude}`}
      </LocationText>
      <Icon name={icon} size={20} />
      {toastVisibility && <Toast config={toastConfig} ref={modalToastRef} />}
    </Wrapper>
  );
};

const LocationText = styled.Text`
  margin: 0 20px 0 20px;
`;

const Wrapper = styled.Pressable`
  background-color: rgb(200, 200, 200);
  flex-direction: row;
  justify-content: space-between;
  flex-grow: 1;
  align-self: center;
  padding: 10px;
  border-radius: 20px;
  margin: 10px 0 10px 0;
`;

export {LocationTag};
