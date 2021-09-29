import React from 'react';
import styled from 'styled-components/native';
import {Modal} from 'react-native';

export default props => {
  return (
    <Modal transparent={true} animationType={'fade'} visible={props.loading}>
      <ModalBackground>
        <Wrapper top={props.top}>
          <Indicator
            animating={props.loading}
            size="large"
            color="rgb(0,0,0)"
          />
        </Wrapper>
      </ModalBackground>
    </Modal>
  );
};

const ModalBackground = styled.View`
  flex: 1;
  align-items: center;
  flex-direction: column;
  background-color: rgba(0, 0, 0, 0.5);
`;

const Wrapper = styled.View`
  background-color: rgb(255, 255, 255);
  height: 85px;
  width: 85px;
  margin-top: ${props => props.top ?? 200}px;
  border-width: 2px;
  border-radius: 42px;
  border-style: solid;
  display: flex;
  justify-content: space-around;
`;

const Indicator = styled.ActivityIndicator``;
