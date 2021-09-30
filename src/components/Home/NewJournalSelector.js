import React, {useState} from 'react';
import styled from 'styled-components/native';
import Icon from 'react-native-vector-icons/Feather';
import {Flex, Box} from 'native-grid-styled';
import {TouchableNativeFeedback} from 'react-native';
import {useStateWithCallback} from '../../lib';
import useStateRef from 'react-usestateref';
import {IconListModal} from '../common';
import JournalSelector from './JournalSelector';
import {JournalCover} from '../../models';
import {Loader} from '../common';

export default props => {
  const [journalModalVisible, setJournalModalVisible] = useState(false);
  const [iconsModalVisible, setIconsModalVisible] = useState(false);
  const [isSaving, setIsSaving] = useStateWithCallback(false);
  const [loading, setLoading] = useStateRef(false);
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
            <Loader loading={isSaving || loading} />
            <Scroll>
              <NewJournalModalInterior>
                <NewJournalModalTitle>
                  Create a new Journal?
                </NewJournalModalTitle>

                <TextFieldTitle>Title</TextFieldTitle>
                <TextField value={title} onChangeText={setTitle} />

                <TextFieldTitle>Password (leave empty for none)</TextFieldTitle>
                <TextField value={password1} onChangeText={setPassword1} />

                {confirmPassword(password1, password2)}

                <Preview>
                  <JournalSelector
                    title={title}
                    icon={icon}
                    onPress={() => setIconsModalVisible(!iconsModalVisible)}
                  />
                </Preview>

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
                      enabled={password1 === password2 || password1 === ''}
                      onPressOut={() => {
                        /* TODO: clean up the loader state management.
                                 Only setting 'loading' inside 'setIsSaving'
                                 seems to work. Maybe put it inside a new useEffect.
                        */
                        setLoading(true);
                        setIsSaving(true, () => {
                          if (password1 === '' || password1 === password2) {
                            props.save(
                              new JournalCover({
                                title: title,
                                icon: icon,
                                key: password1,
                              }),
                            );
                            setJournalModalVisible(false);
                            setIsSaving(false);
                            setLoading(false);
                          }
                        });
                      }}>
                      <ButtonText
                        enabled={password1 === password2 || password1 === ''}>
                        Create
                      </ButtonText>
                    </CreateButton>
                  </Box>
                </Flex>
              </NewJournalModalInterior>
            </Scroll>

            <IconListModal
              handleClose={changeIcon}
              show={iconsModalVisible}
              unShow={() => setIconsModalVisible(false)}
              key={'icons-' + iconsModalVisible}
            />
          </NewJournalModal>
        </SelectorSkeleton>
      </TouchableNativeFeedback>
    </Selector>
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
  margin: 25px auto;
  background-color: white;
`;

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
  margin: 0px auto 30px auto;
`;

const Preview = styled.View`
  width: 100%;
  flex-direction: row;
  justify-content: space-evenly;
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
