import React from 'react';
import styled from 'styled-components/native';
import {Box} from 'native-grid-styled';
import Icon from 'react-native-vector-icons/Feather';

const Selector = styled(Box)`
  border-width: 2px;
  border-radius: 5px;
  border-style: solid;
  text-align: center;
  padding: 15px 0 15px 0;
  margin: 10px 0 10px 0;
  align-items: center;
`;

const Message = styled.Text`
  font-size: 20px;
  text-align: center;
  margin: auto auto 10px auto;
`;

export default props => {
  return (
    <Selector width={3 / 4}>
      <Message>
        Add new Journal <Icon name="file-plus" size={25} />
      </Message>
    </Selector>
  );
};
