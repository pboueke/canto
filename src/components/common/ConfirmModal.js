import React, {useState} from 'react';
import styled from 'styled-components/native';
import {Flex, Box} from 'native-grid-styled';
import {Loader} from '.';

export default props => {
  const dic = props.dic;
  const [confirmValue, setConfirmValue] = useState('');
  const [password, setPassword] = useState('');
  const [passwordFailed, setPasswordFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const passwordCheck = props.passwordCheck;
  const confirmationSting = props.confirmationSting;
  const requireValidation = confirmationSting || confirmationSting === '';
  const ready = !requireValidation || confirmValue === confirmationSting;
  const close = () => {
    props.unShow();
    setConfirmValue('');
    setLoading(false);
  };
  const getHeight = () => {
    let h = 180;
    h += requireValidation ? 150 : 0;
    h += passwordCheck ? 60 : 0;
    h += requireValidation && passwordCheck ? 20 : 0;
    return h;
  };
  return (
    <ConfirmModal
      animationType={props.animationType ?? 'fade'}
      transparent={props.transparent ?? true}
      visible={props.show}
      onRequestClose={close}>
      {props.shadow && <ModalBackground />}
      <ModalInterior marginTop={props.marginTop} size={getHeight()}>
        <ModalTitle>
          {props.message ?? dic('Are you sure to delete this page?')}
        </ModalTitle>
        {requireValidation && (
          <TextFieldConfirmation>
            {dic('Please write the text below to confirm deletion')}
          </TextFieldConfirmation>
        )}
        {requireValidation && (
          <ConfirmationDisplay>{confirmationSting}</ConfirmationDisplay>
        )}
        {requireValidation && (
          <TextField
            value={confirmValue}
            onChangeText={setConfirmValue}
            placeholder={props.placeholder ?? ''}
          />
        )}
        {passwordCheck && (
          <TextFieldConfirmation bad={passwordFailed}>
            {dic(passwordFailed ? 'Wrong Password' : 'Confirm password')}
          </TextFieldConfirmation>
        )}
        {passwordCheck && (
          <TextField
            value={password}
            onChangeText={setPassword}
            placeholder={dic('Password').toLowerCase()}
            secureTextEntry={true}
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
              <ButtonText enabled={true}>{dic('Cancel')}</ButtonText>
            </CancelButton>
          </Box>
          <Box width={1 / 3}>
            <SubmitButton
              enabled={ready}
              onPress={() => {
                if (passwordCheck) {
                  if (ready) {
                    setLoading(true);
                    passwordCheck(password, (err, res) => {
                      setLoading(false);
                      if (err) {
                        console.log(err);
                        setPasswordFailed(true);
                      }
                      if (res) {
                        props.onConfirm();
                        close();
                      } else {
                        setPasswordFailed(true);
                      }
                    });
                  }
                } else if (ready) {
                  props.onConfirm();
                  close();
                }
              }}>
              <ButtonText enabled={ready}>
                {props.submit ?? dic('Delete')}
              </ButtonText>
            </SubmitButton>
          </Box>
        </Flex>
      </ModalInterior>
      {props.children}
      <Loader loading={loading} top={37} />
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
  height: ${p => p.size ?? 180}px;
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
  color: ${p => (p.bad ? p.theme.failTextColor : p.theme.textColor)};
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
