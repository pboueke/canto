import React, {useState} from 'react';
import styled from 'styled-components/native';
import {Flex, Box} from 'native-grid-styled';

export default props => {
  const [value, setValue] = useState('');
  const confirmationSting = props.confirmationSting;
  const requireValidation = confirmationSting || confirmationSting === '';
  const ready = !requireValidation || value === confirmationSting;
  const close = () => {
    props.unShow();
    setValue('');
  };
  return (
    <ConfirmModal
      animationType={props.animationType ?? 'fade'}
      transparent={props.transparent ?? true}
      visible={props.show}
      onRequestClose={close}>
      {props.shadow && <ModalBackground />}
      <ModalInterior marginTop={props.marginTop} large={requireValidation}>
        <ModalTitle>Are you sure to delete this page?</ModalTitle>
        {requireValidation && (
          <TextFieldConfirmation>
            Please write the text below to confirm deletion
          </TextFieldConfirmation>
        )}
        {requireValidation && (
          <ConfirmationDisplay>{confirmationSting}</ConfirmationDisplay>
        )}
        {requireValidation && (
          <TextField
            value={value}
            onChangeText={setValue}
            placeholder={props.placeholder ?? ''}
          />
        )}
        <Flex
          css={{
            flexGrow: 1,
            width: '100%',
            flexDirection: 'row',
            justifyContent: 'space-evenly',
          }}>
          <Box width={1 / 3}>
            <CancelButton onPress={close}>
              <ButtonText enabled={true}>Cancel</ButtonText>
            </CancelButton>
          </Box>
          <Box width={1 / 3}>
            <SubmitButton
              enabled={ready}
              onPress={() => {
                if (ready) {
                  props.onDelete();
                  close();
                }
              }}>
              <ButtonText enabled={ready}>
                {props.submit ?? 'Delete'}
              </ButtonText>
            </SubmitButton>
          </Box>
        </Flex>
      </ModalInterior>
      {props.children}
    </ConfirmModal>
  );
};

const ConfirmModal = styled.Modal`
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
`;

const ModalBackground = styled.View`
  position: absolute;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.7);
`;

const ModalTitle = styled.Text`
  font-family: ${p => p.theme.font.menu.reg};
  color: ${p => p.theme.textColor};
  font-size: 30px;
  text-align: center;
  margin: 10px 10px 30px 10px;
`;

const ModalInterior = styled.View`
  flex-direction: column;
  align-items: center;
  width: 350px;
  height: ${p => (p.large ? 335 : 180)}px;
  background-color: ${p => p.theme.modalBg};
  border-width: ${p => p.theme.borderWidth};
  border-radius: 5px;
  border-style: solid;
  border-color: ${p => p.theme.borderColor};
  align-self: center;
  margin-top: ${props => props.marginTop ?? 220}px;
`;

const TextFieldConfirmation = styled.Text`
  font-family: ${p => p.theme.font.menu.reg};
  color: ${p => p.theme.textColor};
  font-size: 14px;
  text-align: center;
  margin: 5px;
`;

const ConfirmationDisplay = styled(TextFieldConfirmation)`
  color: ${p => p.theme.failTextColor};
  font-size: 20px;
  margin: 10px 0 5px 0;
  padding: 10px;
  background-color: ${p => p.theme.background};
  border-radius: 5px;
`;

const TextField = styled.TextInput.attrs(p => ({
  placeholderTextColor: p.theme.placeholderColor,
}))`
  font-family: ${p => p.theme.font.menu.reg};
  height: 40px;
  margin: 20px 30px 20px 30px;
  border-width: ${p => p.theme.borderWidth};
  border-radius: 5px;
  border-style: solid;
  border-color: ${p => p.theme.borderColor};
  padding-left: 20px;
  background-color: ${p => p.theme.textInputBg};
  color: ${p => p.theme.textColor};
  width: 90%;
`;

const CancelButton = styled.Pressable`
  border-width: ${p => p.theme.borderWidth};
  border-radius: 5px;
  border-style: solid;
  text-align: center;
  margin: 0px 0 20px 0;
  align-items: center;
  background-color: ${p => p.theme.submitBtnBg};
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
    p.enabled ? p.theme.cancelBtnBg : p.theme.disabledCancelBtn};
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
