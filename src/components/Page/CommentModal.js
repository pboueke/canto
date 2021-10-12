import React, {useState, useEffect} from 'react';
import styled from 'styled-components/native';
import {Flex, Box} from 'native-grid-styled';
import Icon from 'react-native-vector-icons/Feather';
import {PopAction, ConfirmModal} from '../common';
import {PageText} from '.';

export default ({dic, show, unShow, value, onSubmit, onDelete, ...props}) => {
  const [{text, date}, index] = value;
  const [_text, setText] = useState(text);
  const [deleteModalVisibility, setDeleteModalVisibility] = useState(false);

  useEffect(() => {
    setText(text);
  }, [text, date]);

  return (
    <TextInputModal
      animationType="slide"
      transparent={false}
      visible={show}
      onRequestClose={() => unShow()}>
      <TextInputModalInterior>
        <ModaTitle>
          {dic('Write your Comment')}
          {'  '}
          <ModalIcon name="message-circle" />
        </ModaTitle>
        <PageText
          value={_text}
          onChange={setText}
          editMode={true}
          showPlaceholder={false}
          dic={dic}
        />
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
                if (props.onCancel) {
                  props.onCancel();
                }
                unShow();
              }}>
              <ButtonText enabled={true}>{dic('Cancel')}</ButtonText>
            </CancelButton>
          </Box>
          <Box width={1 / 3}>
            <SubmitButton
              enabled={_text !== ''}
              onPress={() => {
                if (_text !== '') {
                  onSubmit(_text, date, index);
                  unShow();
                }
              }}>
              <ButtonText enabled={_text !== ''}>{dic('Save')}</ButtonText>
            </SubmitButton>
          </Box>
        </Flex>
        <PopAction
          icon="trash-2"
          action="delete"
          position={'bottom left'}
          size={30}
          onPress={() => {
            setDeleteModalVisibility(!deleteModalVisibility);
          }}
        />
        <ConfirmModal
          dic={dic}
          marginTop={160}
          shadow={true}
          animationType="fade"
          show={deleteModalVisibility}
          unShow={() => setDeleteModalVisibility(!deleteModalVisibility)}
          onConfirm={() => {
            onDelete(index);
            unShow();
          }}
          message={dic('Are you sure to delete this comment?')}
        />
      </TextInputModalInterior>
      {props.children}
    </TextInputModal>
  );
};

const ModaTitle = styled.Text`
  font-size: 24px;
  font-family: ${p => p.theme.font.menu.reg};
  text-align: center;
  color: ${p => p.theme.textColor};
  margin: 20px 0 10px 0;
`;

const ModalIcon = styled(Icon)`
  font-size: 24px;
  color: ${p => p.theme.textColor};
`;

const TextInputModal = styled.Modal`
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
`;

const TextInputModalInterior = styled.View`
  flex-direction: column;
  width: 100%;
  height: 100%;
  background-color: ${p => p.theme.modalBg};
  border-width: ${p => p.theme.borderWidth};
  border-radius: 5px;
  border-style: solid;
  border-color: ${p => p.theme.borderColor};
`;

const CancelButton = styled.Pressable`
  border-width: ${p => p.theme.borderWidth};
  border-radius: 5px;
  border-style: solid;
  text-align: center;
  margin: 0px 0 20px 0;
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
  margin: 0px 0 20px 0;
  align-items: center;
  background-color: white;
  color: rgb(0, 0, 0);
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
  color: : ${p => (p.enabled ? p.theme.submitBtn : p.theme.disabledSubmitBtn)};
`;
