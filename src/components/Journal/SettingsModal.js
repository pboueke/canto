import React, {useState} from 'react';
import {Switch} from 'react-native';
import styled from 'styled-components/native';
import {withTheme} from 'styled-components';
import Icon from 'react-native-vector-icons/Feather';
import {JournalCover, JournalSettings} from '../../models';
import {SlidePicker, ConfirmModal, TextInputModal} from '../common';

export default ({journal, show, unShow, dic, danger, onChange}) => {
  const [confirmVisibility, setConfirmVisibility] = useState(false);
  const [inputVisibility, setInputVisibility] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [inputSubmit, setInputSubmit] = useState();
  const [confirmSubmit, setConfirmSubmit] = useState();
  const [settings, setSettings] = useState(
    journal.settings ?? new JournalSettings(),
  );
  const settingLabels = JournalSettings.getKeys();

  const states = settingLabels.map(l => useState(settings[l]));

  const getPickers = () =>
    settingLabels
      .filter(l => JournalSettings.getOptions(l).ui === 'picker')
      .map(p => {
        return (
          <ModalRow border key={p}>
            <StaticText>{dic(JournalSettings.getOptions(p).label)}</StaticText>
            <SlidePicker
              value={states[settingLabels.indexOf(p)][0]}
              values={JournalSettings.getOptions(p).values.map(v => ({
                value: v,
                label: dic(v),
              }))}
              onChangeValue={val => {
                states[settingLabels.indexOf(p)][1](val);
                let newSettings = settings;
                newSettings[p] = val;
                setSettings(newSettings);
                onChange(newSettings, p === 'sort');
              }}
            />
          </ModalRow>
        );
      });

  const getSwitches = () =>
    settingLabels
      .filter(l => JournalSettings.getOptions(l).ui === 'switch')
      .map(s => (
        <ModalRow border key={s}>
          <StaticText>{dic(JournalSettings.getOptions(s).label)}</StaticText>
          <SettingSwitch
            value={states[settingLabels.indexOf(s)][0]}
            onValueChange={val => {
              let newSettings = settings;
              states[settingLabels.indexOf(s)][1](val);
              newSettings[s] = val;
              setSettings(newSettings);
              onChange(newSettings, false);
            }}
          />
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
              {journal.content.title} <TextLight>{dic('Settings')}</TextLight>
            </ModalTitle>
            <IconBtn onPress={unShow} name="x" />
          </ModalRow>
          <ModalRow border wrap>
            <StaticText size={20} mw={400}>
              <StaticText bold>{journal.content.pages.length}</StaticText>{' '}
              {dic('page')}
              {journal.content.pages.length === 1 ? '' : 's'} {dic('created')}{' '}
              {dic('since')}:
            </StaticText>
            <StaticText size={20} mw={400}>
              {'  '}
              <StaticText bold size={20}>
                {new Date(journal.content.date).toDateString()}
              </StaticText>
            </StaticText>
          </ModalRow>
          <EmptyBlock height={20} />
          <ModalRow>
            <StaticText size={26}>{dic('Toggles and Options')}</StaticText>
          </ModalRow>
          {getSwitches()}
          {getPickers()}
          <EmptyBlock height={20} />
          <ModalRow>
            <StaticText size={26}>{dic('Danger Zone')}</StaticText>
          </ModalRow>
          <ModalRow border>
            <SettingsIcon name="type" />
            <SettingsButton
              text={dic('Change Journal Name')}
              onPress={() => {
                setInputValue('');
                setInputSubmit(() => val => {
                  if (journal.content.secure) {
                    setConfirmSubmit(() => name => danger.setName(name));
                    setConfirmVisibility(!confirmVisibility);
                  } else {
                    danger.setName(val);
                  }
                });
                setInputVisibility(!inputVisibility);
              }}
            />
            <SettingsIcon name="alert-triangle" />
          </ModalRow>
          {false /*&& notYetFUnctional*/ && (
            <ModalRow border>
              <SettingsIcon name="key" />
              <SettingsButton
                text={dic('Change Journal Password')}
                onPress={() => {
                  setInputValue('');
                  setInputSubmit(() => val => {
                    if (journal.content.secure) {
                      setConfirmSubmit(() => pswd => danger.setPassword(pswd));
                      setConfirmVisibility(!confirmVisibility);
                    } else {
                      danger.setPassword(val);
                    }
                  });
                  setInputVisibility(!inputVisibility);
                }}
              />
              <SettingsIcon name="alert-triangle" />
            </ModalRow>
          )}
          {false /*&& notYetFUnctional*/ && (
            <ModalRow border>
              <SettingsIcon name="trash-2" />
              <SettingsButton
                text={dic('Delete Journal')}
                onPress={() => {
                  setConfirmSubmit(() => () => danger.doDelete());
                  setConfirmVisibility(!confirmVisibility);
                }}
              />
              <SettingsIcon name="alert-triangle" />
            </ModalRow>
          )}
          <EmptyBlock />
        </ModalInterior>
      </Scroll>
      <TextInputModal
        dic={dic}
        submit={dic('Ok')}
        placeholder={dic('new value')}
        shadow={true}
        onSubmit={val => {
          setInputValue(val);
          inputSubmit(val);
        }}
        show={inputVisibility}
        unShow={() => setInputVisibility(!inputVisibility)}
      />
      <ConfirmModal
        dic={dic}
        message={dic('Confirm password')}
        submit={dic('Change')}
        show={confirmVisibility}
        unShow={() => setConfirmVisibility(!confirmVisibility)}
        passwordCheck={(key, callback) =>
          JournalCover.unlock(key, journal.content.hash, callback)
        }
        onConfirm={() => {
          confirmSubmit(inputValue);
        }}
      />
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
    color: ${p => p.theme.textColor};
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
    }}
  />
));

const SettingsButton = ({text, onPress}) => {
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

const SettingsIcon = styled(Icon)`
  color: ${p => p.theme.textColor};
  font-size: 30px;
`;

const StaticText = styled.Text`
  font-family: ${p =>
    p.bold ? p.theme.font.menu.bold : p.theme.font.menu.reg};
  font-size: ${p => p.size ?? 18}px;
  color: ${p => p.theme.textColor};
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
