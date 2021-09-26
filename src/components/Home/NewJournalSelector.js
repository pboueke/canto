import React, {useState} from 'react';
import styled from 'styled-components/native';
import Icon from 'react-native-vector-icons/Feather';
import {Flex, Box} from 'native-grid-styled';
import {Pressable, TouchableNativeFeedback} from 'react-native';
import {IconListModal} from '../common';
import JournalSelector from './JournalSelector';
import {Journal} from '../../models';

export default props => {
  const [journalModalVisible, setJournalModalVisible] = useState(false);
  const [iconsModalVisible, setIconsModalVisiblel] = useState(false);
  const [title, setTitle] = useState('My Journal');
  const [password1, setPassword1] = useState('');
  const [password2, setPassword2] = useState('');
  const [icon, setIcon] = useState('book');
  const changeIcon = iconName => setIcon(iconName);
  const confirmPassword = (top, bottom) => {
    if (top === '') {
      return <Flex css={{height: '94px;'}} />;
    }
    const color = top === bottom ? 'green' : 'red';
    return (
      <Box>
        <TextFieldTitle color={color}>
          Confirm password (you can´t change it later)
        </TextFieldTitle>
        <TextField value={password2} onChangeText={setPassword2} />
      </Box>
    );
  };
  const saveAndClose = () => {
    if (password1 === '' || password1 === password2) {
      props.save(new Journal(title, icon, password1));
      setJournalModalVisible(false);
    }
  };
  return (
    <Selector width={3 / 4}>
      <TouchableNativeFeedback onPress={() => setJournalModalVisible(true)}>
        <SelectorSkeleton>
          <Invite>
            Add new Journal <Icon name="file-plus" size={25} />
          </Invite>

          <NewJournalModal
            animationType="fade"
            transparent={false}
            visible={journalModalVisible}
            onRequestClose={() => {
              setJournalModalVisible(!journalModalVisible);
            }}>
            <NewJournalModalInterior>
              <NewJournalModalTitle>Create a new Journal?</NewJournalModalTitle>

              <TextFieldTitle>Title</TextFieldTitle>
              <TextField value={title} onChangeText={setTitle} />

              <TextFieldTitle>Password (leave empty for none)</TextFieldTitle>
              <TextField value={password1} onChangeText={setPassword1} />

              {confirmPassword(password1, password2)}

              <Pressable
                onPress={() => {
                  setIconsModalVisiblel(!iconsModalVisible);
                }}>
                <Flex
                  css={{
                    flexDirection: 'row',
                    justifyContent: 'space-evenly',
                    marginBottom: '30px;',
                  }}>
                  <JournalSelector title={title} icon={icon} />
                </Flex>
              </Pressable>

              <IconIndicatorText>(click to change icon)</IconIndicatorText>
              <Flex
                css={{flexDirection: 'row', justifyContent: 'space-evenly'}}>
                <Box width={1 / 3}>
                  <CancelButton
                    onPress={() =>
                      setJournalModalVisible(!journalModalVisible)
                    }>
                    <ButtonText enabled={true}>Cancel</ButtonText>
                  </CancelButton>
                </Box>
                <Box width={1 / 3}>
                  <CreateButton
                    enabled={password1 === password2}
                    onPress={saveAndClose}>
                    <ButtonText enabled={password1 === password2}>
                      Create
                    </ButtonText>
                  </CreateButton>
                </Box>
              </Flex>
            </NewJournalModalInterior>

            <IconListModal
              handleClose={changeIcon}
              show={iconsModalVisible}
              unShow={() => setIconsModalVisiblel(false)}
              key={'icons-' + iconsModalVisible}
            />
          </NewJournalModal>
        </SelectorSkeleton>
      </TouchableNativeFeedback>
    </Selector>
  );
};

const Selector = styled(Box)`
  border-width: 2px;
  border-radius: 5px;
  border-style: solid;
  text-align: center;
  margin: 10px 0 10px 0;
  align-items: center;
`;

const SelectorSkeleton = styled.View`
  margin: 0;
  width: 100%;
  height: 100%;
  flex: 1;
  flex-grow: 1;
  padding: 15px 0 15px 0;
`;

const Invite = styled.Text`
  font-size: 20px;
  text-align: center;
  margin: auto auto 10px auto;
`;

const NewJournalModal = styled.Modal`
  text-align: center;
  margin: 10px 0 10px 0;
  align-items: center;
`;

const NewJournalModalInterior = styled.View`
  flex: 1;
  flex-direction: column;
`;

const NewJournalModalTitle = styled.Text`
  font-size: 30px;
  text-align: center;
  width: 100%;
  margin: 50px 0 50px 0;
`;

const TextFieldTitle = styled.Text`
  font-weight: 300;
  margin: 0 0 -5px 35px;
  color: ${props => props.color ?? 'black'};
`;

const TextField = styled.TextInput`
  height: 40px;
  margin: 10px 30px 30px 30px;
  border-width: 2px;
  border-radius: 5px;
  border-style: solid;
  padding-left: 20px;
`;

const IconIndicatorText = styled.Text`
  font-weight: 300;
  width: 100%;
  text-align: center;
  margin: -30px auto 30px auto;
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

const CreateButton = styled.Pressable`
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
