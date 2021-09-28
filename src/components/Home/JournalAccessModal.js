import React, {useState, useEffect} from 'react';
import styled from 'styled-components/native';
import Icon from 'react-native-vector-icons/Feather';
import {Flex, Box} from 'native-grid-styled';
import {JournalSelector} from '.';
import {Journal} from '../../models';
import {Loader} from '../common';

export default props => {
  const [modalVisible, setModalVisible] = useState(props.show);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(true);
  const [statusText, setStatusText] = useState('Password');
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
            <TextField value={journalKey} onChangeText={setJournalKey} />
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
                <ButtonText enabled={true}>Cancel</ButtonText>
              </CancelButton>
            </Box>
            <Box width={1 / 3}>
              <SubmitButton
                enabled={true}
                onPress={() => {
                  setLoading(true);
                  let temp = props.journal;
                  temp.key = journalKey;
                  const journal = new Journal({...temp});
                  journal.unlock(journalKey, (err, res) => {
                    if (err) {
                      console.log(err);
                    }
                    if (res) {
                      setModalVisible(false);
                      props.unShow();
                      setStatus(true);
                      setStatusText('Password');
                      setLoading(false);
                      setModalVisible(false);
                      props.navigate(journal, [...journalKey]);
                    } else {
                      setStatus(false);
                      setLoading(false);
                      setStatusText('Wrong Password');
                      setJournalKey('');
                    }
                  });
                }}>
                <ButtonText enabled={true}>Open</ButtonText>
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
    border-width: 2px;
    border-radius: 25px;
    border-style: solid;
    text-align: center;
    justify-content: space-around;
    align-items: center;
    background-color: white;
    height: 40px;
    width: 40px;
    margin: -80px 0 0 100px;
  `;

  return (
    <DisplayWrapper>
      <JournalSelector
        onPress={() => null}
        icon={props.journal.icon}
        title={props.journal.title}
      />
      <LockWrapper>
        <Icon name="lock" size={24} />
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
  border-width: 2px;
  border-radius: 5px;
  border-style: solid;
  align-self: center;
  text-align: center;
  align-items: center;
  background-color: white;
  flex-direction: column;
  height: 400px;
  width: 80%;
`;

const TextFieldTitle = styled.Text`
  font-weight: 300;
  margin: 0 0 -5px 35px;
  color: : ${props => (props.status ? 'rgb(0, 0, 0)' : 'rgb(255, 0, 0)')};
  `;

const TextField = styled.TextInput`
  height: 40px;
  margin: 10px 30px 30px 30px;
  border-width: 2px;
  border-radius: 5px;
  border-style: solid;
  padding-left: 20px;
`;

const CancelButton = styled.Pressable`
  border-width: 2px;
  border-radius: 5px;
  border-style: solid;
  text-align: center;
  margin: 10px 0 10px 0;
  align-items: center;
  background-color: rgb(252, 212, 210);
`;

const SubmitButton = styled.Pressable`
  border-width: 2px;
  border-radius: 5px;
  border-style: solid;
  text-align: center;
  margin: 10px 0 10px 0;
  align-items: center;
  background-color: white;
  color: ${props => (props.enabled ? 'rgb(0, 0, 0)' : 'rgb(222, 222, 222)')};
  border-color: ${props =>
    props.enabled ? 'rgb(0, 0, 0)' : 'rgb(222, 222, 222)'};
`;

const ButtonText = styled.Text`
  padding: 10px;
  font-weight: bold;
  color: : ${props => (props.enabled ? 'rgb(0, 0, 0)' : 'rgb(222, 222, 222)')};
`;
