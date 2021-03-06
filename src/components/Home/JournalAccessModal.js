import React, {useState} from 'react';
import styled from 'styled-components/native';
import Icon from 'react-native-vector-icons/Feather';
import {Flex, Box} from 'native-grid-styled';
import {JournalSelector} from '.';
import {JournalCover} from '../../models';
import {Loader} from '../common';

export default props => {
  const dic = props.dic;
  const [modalVisible, setModalVisible] = useState(props.show);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(true);
  const [statusText, setStatusText] = useState(dic('Password'));
  const [journalKey, setJournalKey] = useState('');
  return (
    <AccessModal
      animationType="fade"
      transparent={true}
      visible={modalVisible}
      onRequestClose={() => setModalVisible(!modalVisible)}>
      <AccessModalBackground>
        <AccessModalInterior>
          <Flex
            css={{
              height: '300px',
              width: '100%',
              flexDirection: 'column',
            }}>
            <JournalDisplay journal={props.journal} />

            <TextFieldTitle status={status}>{statusText}</TextFieldTitle>
            <TextField
              secureTextEntry={true}
              value={journalKey}
              onChangeText={setJournalKey}
            />
          </Flex>

          <Flex
            css={{
              flexGrow: 1,
              width: '100%',
              flexDirection: 'row',
              justifyContent: 'space-evenly',
            }}>
            <Box width={1 / 3}>
              <CancelButton
                onPress={() => {
                  props.unShow();
                  setModalVisible(!modalVisible);
                }}>
                <ButtonText enabled={true}>{dic('Cancel')}</ButtonText>
              </CancelButton>
            </Box>
            <Box width={1 / 3}>
              <SubmitButton
                enabled={true}
                onPress={() => {
                  setLoading(true);
                  let temp = props.journal;
                  temp.key = journalKey;
                  const journal = new JournalCover({...temp});
                  journal.unlock(journalKey, (err, res) => {
                    if (err) {
                      console.log(err);
                    }
                    if (res) {
                      setModalVisible(false);
                      props.unShow();
                      setStatus(true);
                      setStatusText(dic('Password'));
                      setLoading(false);
                      setModalVisible(false);
                      props.navigate(journal, [...journalKey]);
                    } else {
                      setStatus(false);
                      setLoading(false);
                      setStatusText(dic('Wrong Password'));
                      setJournalKey('');
                    }
                  });
                }}>
                <ButtonText enabled={true}>{dic('Open')}</ButtonText>
              </SubmitButton>
            </Box>
          </Flex>
          <Loader loading={loading} top={37} />
        </AccessModalInterior>
      </AccessModalBackground>
    </AccessModal>
  );
};

const JournalDisplay = props => {
  const DisplayWrapper = styled.View`
    align-self: center;
    width: 400px;
    height: 400px;
    flex: 1;
    flex-direction: column;
    justify-content: space-evenly;
    align-items: center;
  `;
  const LockWrapper = styled.View`
    border-width: ${p => p.theme.borderWidth};
    border-radius: 25px;
    border-style: solid;
    text-align: center;
    justify-content: space-around;
    align-items: center;
    background-color: ${p => p.theme.foreground};
    border-color: ${p => p.theme.borderColor};
    height: 40px;
    width: 40px;
    margin: -80px 0 0 100px;
    elevation: 10;
  `;
  const Lock = styled(Icon)`
    color: ${p => p.theme.textColor};
  `;

  return (
    <DisplayWrapper>
      <JournalSelector
        onPress={() => null}
        icon={props.journal.icon}
        title={props.journal.title}
      />
      <LockWrapper>
        <Lock name="lock" size={24} />
      </LockWrapper>
    </DisplayWrapper>
  );
};

const AccessModalBackground = styled.View`
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
`;

const AccessModal = styled.Modal`
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
`;

const AccessModalInterior = styled.View`
  margin: 10px 0 0 0;
  border-width: ${p => p.theme.borderWidth};
  border-radius: 5px;
  border-style: solid;
  align-self: center;
  text-align: center;
  align-items: center;
  background-color: white;
  flex-direction: column;
  height: 400px;
  width: 80%;
  border-color: ${p => p.theme.borderColor};
  background-color: ${p => p.theme.modalBg};
`;

const TextFieldTitle = styled.Text`
  font-family: ${p => p.theme.font.menu.reg};
  margin: 0 0 -5px 35px;
  color: : ${p => (p.status ? p.theme.textColor : p.theme.failTextColor)};
  `;

const TextField = styled.TextInput`
  font-family: ${p => p.theme.font.text.reg};
  height: 40px;
  margin: 10px 30px 30px 30px;
  border-width: ${p => p.theme.borderWidth};
  border-radius: 5px;
  border-style: solid;
  border-color: ${p => p.theme.borderColor};
  padding-left: 20px;
  background-color: ${p => p.theme.textInputBg};
  color: ${p => p.theme.textColor};
`;

const CancelButton = styled.Pressable`
  border-width: ${p => p.theme.borderWidth};
  border-radius: 5px;
  border-style: solid;
  text-align: center;
  margin: 10px 0 10px 0;
  align-items: center;
  background-color: ${p => p.theme.cancelBtnBg};
  color: ${p => p.theme.textColor};
  border-color: ${p => p.theme.borderColor};
`;

const SubmitButton = styled.Pressable`
  border-width: ${p => p.theme.borderWidth};
  border-radius: 5px;
  border-style: solid;
  text-align: center;
  margin: 10px 0 10px 0;
  align-items: center;
  background-color: ${p =>
    p.enabled ? p.theme.submitBtnBg : p.theme.disabledSubmitBtnBg};
  color: ${p => (p.enabled ? p.theme.submitBtn : p.theme.disabledSubmitBtn)};
  border-color: ${p =>
    p.enabled ? p.theme.submitBtn : p.theme.disabledSubmitBtn};
`;

const ButtonText = styled.Text`
  font-family: ${p => p.theme.font.menu.reg};
  padding: 10px;
  font-weight: bold;
  color: : ${p => p.theme.submitBtn};
`;
