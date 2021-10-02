import React, {useState} from 'react';
import styled from 'styled-components/native';
import {Flex, Box} from 'native-grid-styled';

export default props => {
  const [value, setValue] = useState('');
  return (
    <TextInputModal
      animationType={props.animationType ?? 'fade'}
      transparent={props.transparent ?? true}
      visible={props.show}
      onRequestClose={() => props.unShow()}>
      {props.shadow && <ModalBackground />}
      <TextInputModalInterior>
        <TextField
          value={value}
          onChangeText={setValue}
          placeholder={props.placeholder ?? ''}
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
                props.unShow();
              }}>
              <ButtonText enabled={true}>Cancel</ButtonText>
            </CancelButton>
          </Box>
          <Box width={1 / 3}>
            <SubmitButton
              enabled={value !== ''}
              onPress={() => {
                if (value !== '') {
                  props.onSubmit(value);
                  props.unShow();
                  setValue('');
                }
              }}>
              <ButtonText enabled={value !== ''}>
                {props.submit ?? 'submit'}
              </ButtonText>
            </SubmitButton>
          </Box>
        </Flex>
      </TextInputModalInterior>
      {props.children}
    </TextInputModal>
  );
};

const TextInputModal = styled.Modal`
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
  background-color: rgba(0, 0, 0, 0.5);
`;

const TextInputModalInterior = styled.View`
  flex-direction: column;
  width: 300px;
  height: 150px;
  background-color: white;
  border-width: 2px;
  border-radius: 5px;
  border-style: solid;
  align-self: center;
  margin-top: ${props => props.marginTop ?? 220}px;
`;

const TextField = styled.TextInput`
  height: 40px;
  margin: 20px 30px 20px 30px;
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
  margin: 0px 0 20px 0;
  align-items: center;
  background-color: rgb(252, 212, 210);
`;

const SubmitButton = styled.Pressable`
  border-width: 2px;
  border-radius: 5px;
  border-style: solid;
  text-align: center;
  margin: 0px 0 20px 0;
  align-items: center;
  background-color: white;
  color: rgb(0, 0, 0);
  color: ${props => (props.enabled ? 'rgb(0, 0, 0)' : 'rgb(222, 222, 222)')};
  border-color: ${props =>
    props.enabled ? 'rgb(0, 0, 0)' : 'rgb(222, 222, 222)'};
`;

const ButtonText = styled.Text`
  padding: 10px;
  font-weight: bold;
  color: : ${props => (props.enabled ? 'rgb(0, 0, 0)' : 'rgb(222, 222, 222)')};
`;
