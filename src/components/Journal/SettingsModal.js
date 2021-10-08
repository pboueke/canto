import React, {useState} from 'react';
import {Switch} from 'react-native';
import styled from 'styled-components/native';
import {withTheme} from 'styled-components';
import Icon from 'react-native-vector-icons/Feather';
import {JournalSettings} from '../../models';

export default ({journal, show, unShow, onChange}) => {
  const [settings, setSettings] = useState(
    journal.settings ?? new JournalSettings(),
  );
  const settingLabels = JournalSettings.getKeys();

  const states = settingLabels.map(l => useState(settings[l]));

  const getSwitches = () =>
    settingLabels
      .filter(l => JournalSettings.getOptions(l).ui === 'switch')
      .map(s => (
        <ModalRow border>
          <SettingSwitch
            value={states[settingLabels.indexOf(s)][0]}
            onValueChange={val => {
              let newSettings = settings;
              states[settingLabels.indexOf(s)][1](val);
              newSettings[s] = val;
              setSettings(newSettings);
              onChange(newSettings);
            }}
          />
          <StaticText>{JournalSettings.getOptions(s).label}</StaticText>
        </ModalRow>
      ));

  return (
    <SettingsModal
      animationType="fade"
      transparent={false}
      visible={show}
      onRequestClose={unShow}>
      <Scroll>
        <ModalInterior>
          <ModalRow>
            <ModalTitle>
              {journal.content.title} <TextLight>Settings</TextLight>
            </ModalTitle>
            <IconBtn onPress={unShow} name="x" />
          </ModalRow>
          <ModalRow border>
            <StaticText size={20}>
              Since:{' '}
              <StaticText bold size={20}>
                {new Date(journal.content.date).toLocaleDateString()}
              </StaticText>
            </StaticText>
            <StaticText size={20}>
              Number of pages:{' '}
              <StaticText bold>{journal.content.pages.length}</StaticText>
            </StaticText>
          </ModalRow>
          {getSwitches()}
        </ModalInterior>
      </Scroll>
    </SettingsModal>
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

const IconBtn = ({onPress, name}) => {
  const Wrapper = styled.Pressable`
    height: 40px;
    width: 40px;
    margin: 10px 20px 10px 20px;
  `;
  const Btn = styled(Icon)`
    font-size: 40px;
  `;
  return (
    <Wrapper onPress={onPress}>
      <Btn name={name} />
    </Wrapper>
  );
};

const SettingsModal = styled.Modal`
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

const ModalRow = ({children, border}) => {
  const chld = children.length ? children : [children];
  const Row = styled.View`
    width: 100%;
    flex: 1;
    flex-direction: row;
    margin: 10px 0 10px 0;
    justify-content: space-between;
    padding: 0 10px 0 5px;
    border-bottom-width: ${p => (border ? 1 : 0)}px;
    border-color: ${p => p.theme.borderColor};
  `;
  const Item = styled.View`
    flex-shrink: 1;
    padding: 2px 0 2px 10px;
  `;
  return (
    <Row>
      {chld.map((c, i) => (
        <Item key={i}>{c}</Item>
      ))}
    </Row>
  );
};

const SettingSwitch = withTheme(({value, onValueChange, theme}) => (
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
      marginTop: -10,
    }}
  />
));

const StaticText = styled.Text`
  font-family: ${p =>
    p.bold ? p.theme.font.menu.bold : p.theme.font.menu.reg};
  font-size: ${p => p.size ?? 18};
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
