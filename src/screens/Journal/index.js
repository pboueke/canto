import React, {useState} from 'react';
import styled from 'styled-components/native';
import Icon from 'react-native-vector-icons/Feather';
import {Flex} from 'native-grid-styled';
import MMKVStorage, {useMMKVStorage} from 'react-native-mmkv-storage';
import {PopAction} from '../../components/common';
import {FilterBar} from '../../components/Journal';
import {JournalContent} from '../../models';
import {Page} from '../../models';

var MMKV;

export default ({navigation, route}) => {
  const props = route.params;

  if (!MMKV) {
    if (props.key) {
      MMKV = new MMKVStorage.Loader()
        .withEncryption()
        .encryptWithCustomKey(props.key.join())
        .initialize();
    } else {
      MMKV = new MMKVStorage.Loader().withEncryption().initialize();
    }
  }

  const [journalData, setJournalData] = useMMKVStorage(
    props.journal.id,
    MMKV,
    new JournalContent(props.journal),
  );

  React.useLayoutEffect(() => {
    navigation.setOptions({
      title: props.title,
      headerTitle: () => (
        <Flex css={{flexDirection: 'row'}}>
          <HeaderIcon name={props.journal.icon} />
          <HeaderTitle>{props.journal.title}</HeaderTitle>
        </Flex>
      ),
      headerRight: () => (
        <Flex css={{flexDirection: 'row'}}>
          <HeaderButton onPress={() => console.log('backup')}>
            <Icon name="hard-drive" size={22} />
          </HeaderButton>
          <HeaderButton onPress={() => console.log('settings')}>
            <Icon name="settings" size={22} />
          </HeaderButton>
        </Flex>
      ),
    });
  }, [navigation, props]);

  return (
    <Container>
      <FilterBar
        journal={props.journal}
        onChange={() => console.log('filter change!')}
      />
      <PopAction
        onPress={() => navigation.push('Page', {page: new Page({})})}
      />
    </Container>
  );
};

const HeaderTitle = styled.Text`
  font-size: 24px;
  margin: 0 10px 0 10px;
`;

const HeaderIcon = styled(Icon)`
  margin: 5px 0 0 0;
  font-size: 25px;
`;

const HeaderButton = styled.Pressable`
  background-color: white;
  margin-left: 15px;
`;

const Container = styled.View`
  flex: 1;
  height: 100%;
  width: 100%;
`;
