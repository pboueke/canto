import React from 'react';
import styled from 'styled-components';
import Icon from 'react-native-vector-icons/Feather';

const BackButton = ({onPress}) => {
  const Wrapper = styled.Pressable`
    align-items: center;
    justify-content: center;
    height: 50px;
    width: 50px;
  `;
  return (
    <Wrapper onPressIn={onPress} activeOpacity={0}>
      <NavButton name="arrow-left" size={24} />
    </Wrapper>
  );
};

const NavButton = styled(Icon)`
  color: ${p => p.theme.textColor};
`;

export {BackButton};
