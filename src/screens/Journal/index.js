import React from 'react';
import {Text, View} from 'react-native';
import styled from 'styled-components/native';
import Icon from 'react-native-vector-icons/Feather';
import {Flex} from 'native-grid-styled';
import MMKVStorage, {useMMKVStorage} from 'react-native-mmkv-storage';
import {PopAction} from '../../components/common';

export default ({navigation, route}) => {
  React.useLayoutEffect(() => {
    navigation.setOptions({
      title: route.params.title,
      headerTitle: () => (
        <Flex css={{flexDirection: 'row'}}>
          <HeaderIcon name={route.params.journal.icon} />
          <HeaderTitle>{route.params.journal.title}</HeaderTitle>
        </Flex>
      ),
      headerRight: () => (
        <SettingsButton onPress={() => console.log('settings')}>
          <Icon name="settings" size={20} />
        </SettingsButton>
      ),
    });
  }, [navigation, route]);

  return (
    <Container>
      <PopAction onPress={() => console.log('action!')} />
    </Container>
  );
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

const Container = styled.View`
  flex: 1;
  height: 100%;
  width: 100%;
`;
