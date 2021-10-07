import React, {useContext} from 'react';
import styled from 'styled-components/native';
import {ThemeContext} from 'styled-components';
import {Modal} from 'react-native';

export default props => {
  const theme = useContext(ThemeContext);
  return (
    <Modal transparent={true} animationType={'fade'} visible={props.loading}>
      <ModalBackground>
        <Wrapper top={props.top}>
          <Indicator
            animating={props.loading}
            size="large"
            color={theme.textColor}
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
  height: 85px;
  width: 85px;
  margin-top: ${props => props.top ?? 200}px;
  border-width: 2px;
  border-color: ${p => p.theme.borderColor};
  border-radius: 42px;
  border-style: solid;
  display: flex;
  justify-content: space-around;
  background-color: ${p => p.theme.modalBg};
`;

const Indicator = styled.ActivityIndicator``;
