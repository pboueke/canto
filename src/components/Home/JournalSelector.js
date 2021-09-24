import React from 'react';
import styled from 'styled-components/native';
import {Box} from 'native-grid-styled';
import Icon from 'react-native-vector-icons/Feather';

const Selector = styled(Box)`
  border-width: 2px;
  border-radius: 5px;
  border-style: solid;
  padding: 15px 0 15px 0;
  margin: 10px;
  align-items: center;
`;

const Title = styled.Text`
  font-size: 20px;
  text-align: center;
  margin: auto auto 10px auto;
`;

export default props => {
  return (
    <Selector width={1 / 4}>
      <Title>{props.title ?? 'Journal!'}</Title>
      <Icon name={props.icon ?? 'book'} size={40} />
    </Selector>
  );
};
