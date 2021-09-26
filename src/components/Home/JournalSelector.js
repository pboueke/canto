import React from 'react';
import styled from 'styled-components/native';
import Icon from 'react-native-vector-icons/Feather';
import {Box} from 'native-grid-styled';
import {TouchableNativeFeedback} from 'react-native';

const Selector = styled(Box)`
  border-width: 2px;
  border-radius: 5px;
  border-style: solid;
  margin: 10px;
  align-items: center;
  align-self: center;
`;

const InnerTouchable = styled.View`
  align-items: center;
  margin: 0;
  padding: 15px 0 15px 0;
`;

const Title = styled.Text`
  font-size: 20px;
  text-align: center;
  margin: auto auto 10px auto;
`;

export default props => (
  <Selector width={3 / 11}>
    <TouchableNativeFeedback onPress={props.onPress}>
      <InnerTouchable>
        <Title>{props.title ?? 'Journal!'}</Title>
        <Icon name={props.icon ?? 'book'} size={40} />
      </InnerTouchable>
    </TouchableNativeFeedback>
  </Selector>
);
