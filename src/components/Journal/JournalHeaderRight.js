import React from 'react';
import styled from 'styled-components/native';
import Icon from 'react-native-vector-icons/Feather';
import {Flex} from 'native-grid-styled';

export default ({showSettings, showData}) => (
  <Flex css={{flexDirection: 'row'}}>
    <HeaderButton onPress={showData}>
      <HeaderIcon name="hard-drive" size={22} />
    </HeaderButton>
    <HeaderButton onPress={showSettings}>
      <HeaderIcon name="settings" size={22} />
    </HeaderButton>
  </Flex>
);

const HeaderIcon = styled(Icon)`
  color: ${p => p.theme.textColor};
`;

const HeaderButton = styled.Pressable`
  color: ${p => p.theme.textColor};
  margin-left: 15px;
`;
