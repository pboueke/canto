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
    return (
      <Box>
        <TextFieldTitle ok={top === bottom} validate={true}>
          Confirm password (you can´t change it later)
        </TextFieldTitle>
        <TextField
          secureTextEntry={true}
          value={password2}
          onChangeText={setPassword2}
        />
      </Box>
    );
  };

  return (
    <Selector width={1}>
      <TouchableNativeFeedback onPress={() => setJournalModalVisible(true)}>
        <SelectorSkeleton>
          <Flex
            css={{
              flexDirection: 'row',
              justifyContent: 'space-evenly',
              width: '100%',
            }}>
            <Invite>Select a Journal or create a new one</Invite>
            <InviteIcon name="file-plus" />
          </Flex>
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
                <TextField
                  secureTextEntry={true}
                  value={password1}
                  onChangeText={setPassword1}
                />

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
                        if (password1 === '' || password1 === password2) {
                          setLoading(true);
                          setIsSaving(true, () => {
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
                          });
                        }
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
  background-color: ${p => p.theme.modalBg};
`;

const Selector = styled(Box)`
  border-width: ${p => p.theme.borderWidth};
  border-style: solid;
  border-right-width: 0;
  border-left-width: 0;
  text-align: center;
  align-items: center;
  justify-content: center;
  bottom: 0;
  height: 40px;
  border-color: ${p => p.theme.newJournalInvite.border};
  background-color: ${p => p.theme.newJournalInvite.bg};
  elevation: 10;
  margin-bottom: -25px;
`;

const SelectorSkeleton = styled.View`
  margin: 0;
  width: 100%;
  height: 100%;
  flex: 1;
  flex-grow: 1;
  justify-content: center;
  padding: 15px 0 15px 0;
`;

const Invite = styled.Text`
  font-size: 18px;
  height: 30px;
  text-align: center;
  color: ${p => p.theme.newJournalInvite.text};
  margin: 3px 0 0 0;
`;

const InviteIcon = styled(Icon)`
  font-size: 24px;
  margin: 2px 0 0 0;
  color: ${p => p.theme.newJournalInvite.icon};
`;

const NewJournalModal = styled.Modal`
  text-align: center;
  margin: 10px 0 10px 0;
  align-items: center;
  background-color: ${p => p.theme.modalBg};
`;

const NewJournalModalInterior = styled.View`
  flex: 1;
  flex-direction: column;
  background-color: ${p => p.theme.modalBg};
`;

const NewJournalModalTitle = styled.Text`
  font-size: 30px;
  text-align: center;
  width: 100%;
  margin: 50px 0 50px 0;
  color: ${p => p.theme.textColor};
`;

const TextFieldTitle = styled.Text`
  font-weight: 300;
  margin: 0 0 -5px 35px;
  color: ${p => {
    if (p.validate) {
      return p.ok ? p.theme.successTextColor : p.theme.failTextColor;
    } else {
      return p.theme.textColor;
    }
  }};
`;
const TextField = styled.TextInput`
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

const IconIndicatorText = styled.Text`
  font-weight: 300;
  width: 100%;
  text-align: center;
  margin: 0px auto 30px auto;
  color: ${p => p.theme.textColor};
`;

const Preview = styled.View`
  width: 100%;
  flex-direction: row;
  justify-content: space-evenly;
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

const CreateButton = styled.Pressable`
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
  padding: 10px;
  font-weight: bold;
  color: : ${p => (p.enabled ? p.theme.submitBtn : p.theme.disabledSubmitBtn)};;
`;
