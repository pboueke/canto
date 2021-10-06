import React from 'react';
import styled from 'styled-components/native';
import Icon from 'react-native-vector-icons/Feather';
import {Flex} from 'native-grid-styled';

export default ({title, icon}) => (
  <Flex css={{flexDirection: 'row'}}>
    <HeaderIcon name={icon} />
    <HeaderTitle>{title}</HeaderTitle>
  </Flex>
);

const HeaderTitle = styled.Text`
  font-size: 24px;
  margin: 0 10px 0 10px;
  color: ${p => p.theme.textColor};
`;

const HeaderIcon = styled(Icon)`
  margin: 5px 0 0 0;
  font-size: 25px;
  color: ${p => p.theme.textColor};
`;
