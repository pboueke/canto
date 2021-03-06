import React, {useState} from 'react';
import {Switch, Easing, Animated} from 'react-native';
import styled from 'styled-components/native';
import {withTheme} from 'styled-components';
import Icon from 'react-native-vector-icons/Feather';
import {ExternallyLoggedUser} from '../common';
import {useMMKVStorage} from 'react-native-mmkv-storage';
import {GDrive} from '../../lib';
import Toast from 'react-native-toast-message';
import {toastConfig} from '../common';

export default ({
  journal,
  show,
  unShow,
  onSettingsChange,
  storage,
  enc,
  dec,
  salt,
  album,
  updateAlbum,
  dic,
}) => {
  const [userState, setUserState] = useMMKVStorage('canto-user', storage, null);
  const [syncing, setSyncing] = useState(false);
  const modalToastRef = React.useRef({});

  const pushToast = (text1, text2) =>
    modalToastRef &&
    modalToastRef.current &&
    modalToastRef.current.show({
      type: 'simpleInfo',
      position: 'bottom',
      text1: text1,
      text2: text2,
      visibilityTime: 1000,
      autoHide: true,
    });

  const syncJournalPress = async () => {
    await GDrive.syncJournal(
      journal,
      storage,
      enc,
      dec,
      salt,
      album,
      updateAlbum,
      () => {
        setSyncing(true);
        pushToast('Syncing journal...', 'starting');
      },
      success => {
        setSyncing(false);
        success && pushToast('Journal synced!', 'success');
      },
      error => {
        setSyncing(true);
        pushToast('Syncing Failed', `ERROR: ${error}`);
      },
      setUserState,
    );
  };

  return (
    <DataModal
      animationType="fade"
      transparent={false}
      visible={show}
      onRequestClose={unShow}>
      <Scroll>
        <ModalInterior>
          <ModalRow>
            <ModalTitle>
              {journal.content.title}{' '}
              <TextLight>{dic('Data Management')}</TextLight>
            </ModalTitle>
            <IconBtn onPress={unShow} name="x" />
          </ModalRow>
          <ModalRow>
            <StaticText size={26}>{dic('Google Drive')}</StaticText>
          </ModalRow>
          <ModalRow border>
            <StaticText>
              {dic('Automated synchronization with Google Drive')}:
            </StaticText>
            {userState ? (
              <ExternallyLoggedUser light userInfo={userState} />
            ) : (
              <StaticText warn>
                {dic("Log-in with your account at Canto's home screen")}
              </StaticText>
            )}
          </ModalRow>
          {userState && (
            <ModalRow border>
              <StaticText>{dic('Keep this journal synced')}</StaticText>
              <DataSwitch
                value={journal.settings.gdriveSync}
                onValueChange={val => {
                  val && syncJournalPress();
                  onSettingsChange({...journal.settings, gdriveSync: val});
                }}
              />
            </ModalRow>
          )}
          <Toast config={toastConfig} ref={modalToastRef} />

          <ModalRow border>
            <SyncBtn
              title="Manual Synchronization"
              onPress={() => syncJournalPress()}
            />
            <SyncSpinner spin={syncing} />
          </ModalRow>
          <EmptyBlock height={20} />
          <ModalRow>
            <StaticText size={26}>{dic('Export your data')}</StaticText>
          </ModalRow>
          <ModalRow border>
            <StaticText>{'soon...'}</StaticText>
          </ModalRow>
        </ModalInterior>
      </Scroll>
    </DataModal>
  );
};

const Scroll = styled.ScrollView.attrs({
  contentContainerStyle: props => {
    return {
      justifyContent: 'center',
    };
  },
})`
  width: 100%;
  background-color: ${p => p.theme.modalBg};
`;

const SyncSpinner = ({spin}) => {
  const Btn = styled(Icon)`
    font-size: 40px;
    color: ${p => p.theme.textColor};
  `;
  const Wrapper = styled.View`
    width: 120px;
    align-items: center;
    margin-bottom: 10px;
  `;
  const animation = new Animated.Value(0);
  const config = Animated.loop(
    Animated.timing(animation, {
      toValue: 1,
      duration: 3000,
      useNativeDriver: false,
      easing: Easing.linear,
    }),
  );
  if (spin) {
    config.start();
  }
  const RotateData = animation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  return (
    <Wrapper>
      <Animated.View style={{transform: [{rotate: RotateData}]}}>
        <Btn name="refresh-cw" />
      </Animated.View>
    </Wrapper>
  );
};

const SyncBtn = ({onPress, title}) => {
  const Wrapper = styled.Pressable`
    height: 40px;
    margin: 0;
    border-color: ${p => p.theme.borderColor};
    background-color: ${p => p.theme.highlightBg}
    border-radius: 5px;
    border-width: 1px;
    padding: 5px;
  `;
  const Label = styled.Text`
    font-size: 20px;
    color: ${p => p.theme.textColor};
  `;

  return (
    <Wrapper onPress={onPress}>
      <Label>{title}</Label>
    </Wrapper>
  );
};

const IconBtn = ({onPress, name}) => {
  const Wrapper = styled.Pressable`
    height: 40px;
    width: 40px;
    margin: 10px 20px 10px 20px;
  `;
  const Btn = styled(Icon)`
    font-size: 40px;
    color: ${p => p.theme.textColor};
  `;
  return (
    <Wrapper onPress={onPress}>
      <Btn name={name} />
    </Wrapper>
  );
};

const DataModal = styled.Modal`
  text-align: center;
  margin: 10px 0 10px 0;
  align-items: center;
  background-color: ${p => p.theme.modalBg};
`;

const ModalInterior = styled.View`
  flex: 1;
  flex-direction: column;
  background-color: ${p => p.theme.modalBg};
`;

const ModalRow = ({children, border, wrap}) => {
  const Row = styled.View`
    ${p => (p.wrap ? 'flex-wrap: wrap;' : '')};
    width: 100%;
    flex: 1;
    flex-direction: row;
    margin: 10px 0 10px 0;
    justify-content: space-between;
    padding: 0 10px 0 5px;
    border-bottom-width: ${p => (border ? 1 : 0)}px;
    border-color: ${p => p.theme.borderColor};
    align-items: center;
  `;
  const Item = styled.View`
    flex-shrink: 1;
    padding: 2px 0 2px 10px;
  `;
  if (!children) {
    return <Row />;
  }
  const chld = children.length ? children : [children];
  return (
    <Row>
      {chld.map((c, i) => (
        <Item key={i}>{c}</Item>
      ))}
    </Row>
  );
};

const DataButton = ({text, onPress}) => {
  const Wrapper = styled.Pressable`
    background-color: ${p => p.theme.cancelBtnBg};
    border-width: ${p => p.theme.borderWidth};
    border-color: ${p => p.theme.borderColor};
    border-radius: 5px;
    border-style: solid;
    padding: 5px;
    margin-bottom: 5px;
    width: 250px;
  `;
  const Label = styled.Text`
    font-family: ${p => p.theme.font.menu.bold};
    color: ${p => p.theme.textColor};
    font-size: 20px;
    text-align: center;
  `;
  return (
    <Wrapper onPress={onPress}>
      <Label>{text}</Label>
    </Wrapper>
  );
};

const DataIcon = styled(Icon)`
  color: ${p => p.theme.textColor};
  font-size: 30px;
`;

const DataSwitch = withTheme(({value, onValueChange, theme}) => (
  <Switch
    value={value}
    onValueChange={val => onValueChange(val)}
    thumbColor={theme.switch.thumbColor}
    trackColor={{
      true: theme.switch.trackColorOff,
      false: theme.switch.trackColorOn,
    }}
    style={{
      transform: [{scaleX: 1.2}, {scaleY: 1.2}],
    }}
  />
));

const StaticText = styled.Text`
  font-family: ${p =>
    p.bold ? p.theme.font.menu.bold : p.theme.font.menu.reg};
  font-size: ${p => p.size ?? 18}px;
  color: ${p => (p.warn ? p.theme.failTextColor : p.theme.textColor)};
  max-width: ${p => (p.mw ? p.mw : 250)}px;
`;

const ModalTitle = styled.Text`
  font-family: ${p => p.theme.font.text.reg};
  font-size: 30px;
  text-align: center;
  margin: 10px 0 10px 10px;
  color: ${p => p.theme.textColor};
`;

const TextLight = styled.Text`
  font-family: ${p => p.theme.font.menu.lght};
`;

const EmptyBlock = styled.View`
  width: 100%;
  height: ${p => p.height ?? 100}px;
  elevation: -1;
`;
