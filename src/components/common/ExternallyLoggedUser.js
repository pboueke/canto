import React from 'react';
import styled from 'styled-components';

export default ({userInfo, signOff, dic, light = false}) => {
  return (
    <Wrapper background={!light}>
      {!light && <DisplayText>{dic('Signed in as ')}</DisplayText>}
      <UserWrapper>
        <UserName>{userInfo.user.name} </UserName>
        <UserImage source={{uri: userInfo.user.photo}} />
      </UserWrapper>
      {!light && <LogOff text={dic('Sign Off')} onPress={signOff} />}
    </Wrapper>
  );
};

const Wrapper = styled.View`
  ${p => (p.background ? 'width: 100%' : '')};
  height: 48px;
  flex: 1;
  flex-direction: row;
  align-items: center;
  align-text: center;
  justify-content: space-evenly;
  ${p => (p.background ? `background-color: ${p.theme.background}` : '')};
`;

const LogOff = ({text, onPress}) => {
  const PressWrap = styled.Pressable``;
  const PressText = styled.Text`
    font-size: 14px;
    border-bottom-width: 1px;
    border-color: ${p => p.theme.borderColor};
    color: ${p => p.theme.textColor};
    font-family: ${p => p.theme.font.menu.reg};
  `;
  return (
    <PressWrap onPress={onPress}>
      <PressText>{text}</PressText>
    </PressWrap>
  );
};

const UserWrapper = styled.View`
  flex-direction: row;
  border-color: ${p => p.theme.borderColor};
  border-width: 1px;
  padding: 1px 1px 1px 5px;
  margin-top: 5px;
  border-radius: 15px;
  background-color: ${p => p.theme.foreground};
`;

const UserImage = styled.Image`
  width: 30px;
  height: 30px;
  border-radius: 15px;
  margin-left: 5px;
`;

const DisplayText = styled.Text`
  font-size: 14px;
  color: ${p => p.theme.textColor};
  font-family: ${p => p.theme.font.menu.reg};
`;

const UserName = styled.Text`
  font-size: 14px;
  margin-top: 5px;
  color: ${p => p.theme.textColor};
  font-family: ${p => p.theme.font.text.reg};
`;
