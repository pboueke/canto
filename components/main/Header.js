import React from 'react';
import Icon from 'react-native-vector-icons/Feather';
import styled from 'styled-components/native';

const Row = styled.View`
  flex: 1;
  flex-direction: row;
  height: 100px;
  background-color: rgb(224, 224, 224);
`;

const Burguer = styled(Icon.Button)`
  font-size: 200px;
`;

export default () => (
  <Row>
    <Burguer name="menu" size={30} />
  </Row>
);
