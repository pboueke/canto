import React from 'react';
import styled from 'styled-components/native';
import Icon from 'react-native-vector-icons/Feather';
import {Flex} from 'native-grid-styled';
import MMKVStorage, {useMMKVStorage} from 'react-native-mmkv-storage';

export default ({navigation, route}) => {
  React.useLayoutEffect(() => {
    navigation.setOptions({
      title: route.params.title,
      headerTitle: () => (
        <Flex css={{flexDirection: 'row'}}>
          <HeaderIcon name={route.params.icon} />
          <HeaderTitle>{route.params.title}</HeaderTitle>
        </Flex>
      ),
      headerRight: () => (
        <SettingsButton onPress={() => console.log('settings')}>
          <Icon name="settings" size={20} />
        </SettingsButton>
      ),
    });
  }, [navigation, route]);

  return <Icon name="book" />;
};

const HeaderTitle = styled.Text`
  font-size: 24px;
  margin: 0 10px 0 10px;
`;

const HeaderIcon = styled(Icon)`
  margin: 5px 0 0 0;
  font-size: 24px;
`;

const SettingsButton = styled.Pressable`
  background-color: white;
`;
