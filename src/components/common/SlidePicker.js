import React from 'react';
import styled from 'styled-components';
import Icon from 'react-native-vector-icons/Feather';

export default ({onChangeValue, values, value, width}) => {
  const currentIndex = values.indexOf(value) === -1 ? 0 : values.indexOf(value);
  const getValueToTheLeft = () => {
    const id = currentIndex === 0 ? values.length - 1 : currentIndex - 1;
    return values[id];
  };
  const getValueToTheRight = () => {
    const id = currentIndex === values.length - 1 ? 0 : currentIndex + 1;
    return values[id];
  };
  return (
    <Wrapper width={width}>
      <Btn onPress={() => onChangeValue(getValueToTheLeft())}>
        <IconBtn name="chevron-left" />
      </Btn>
      <TextValue>{values[currentIndex]}</TextValue>
      <Btn onPress={() => onChangeValue(getValueToTheRight())}>
        <IconBtn name="chevron-right" />
      </Btn>
    </Wrapper>
  );
};

const Wrapper = styled.View`
  flex-direction: row;
  width: ${p => p.width ?? 150}px;
  justify-content: space-between;
`;

const Btn = styled.Pressable`
  width: 30px;
  height: 30px;
`;

const IconBtn = styled(Icon)`
  font-size: 24px;
  text-align: center;
  bottom: 2px;
  color: ${p => p.theme.textColor};
`;

const TextValue = styled.Text`
  font-family: ${p => p.theme.font.text.reg};
  font-size: 15px;
  text-align: center;
  color: ${p => p.theme.textColor};
`;
