import React from 'react';
import {Text, Platform} from 'react-native';
import styled from 'styled-components/native';
import Icon from 'react-native-vector-icons/Feather';

export default props => {
  const pos = props.position ?? '';
  const top = pos.includes('top');
  const left = pos.includes('left');
  const size = props.size ?? 50;
  const margin = props.margin ?? 20;
  return (
    <Container
      onPress={props.onPress}
      size={size}
      onTop={top}
      leftSide={left}
      borderMargin={margin}>
      <Text>
        <Icon name={props.icon ?? 'plus'} size={size * 0.5} />
      </Text>
    </Container>
  );
};

const Container = styled.Pressable`
  width: ${props => props.size}px;
  height: ${props => props.size}px;
  border-radius: ${props => props.size / 2}px;
  border-width: 2px;
  border-style: solid;
  background-color: white;
  align-items: center;
  justify-content: center;
  position: absolute;
  ${() => (Platform.OS === 'android' ? 'elevation: 20;' : '')}
  ${props => (props.onTop ? 'top' : 'bottom')}: ${props =>
    props.borderMargin}px;
  ${props => (props.leftSide ? 'left' : 'right')}: ${props =>
    props.borderMargin}px;
`;
