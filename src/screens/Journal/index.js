import React, {useState} from 'react';
import styled from 'styled-components/native';
import Icon from 'react-native-vector-icons/Feather';
import {Keyboard, Text} from 'react-native';
import {Flex} from 'native-grid-styled';
import MMKVStorage from 'react-native-mmkv-storage';
import {PopAction} from '../../components/common';
import {FilterBar, PageList} from '../../components/Journal';
import {JournalContent} from '../../models';
import {Page} from '../../models';
import {metadata} from '../..';

export default ({navigation, route}) => {
  const props = route.params;

  const MMKV = new MMKVStorage.Loader()
    .withInstanceID(metadata.mmkvInstance)
    .withEncryption()
    .encryptWithCustomKey((props.key || [...metadata.defaultKey]).join(''))
    .initialize();

  let journalData = MMKV.getMap(props.journal.id);
  if (!journalData) {
    MMKV.setMap(props.journal.id, {
      content: new JournalContent({cover: props.journal}),
      rand: (Math.random() + 1).toString(36).substring(7),
    });
  }
  journalData = MMKV.getMap(props.journal.id);

  React.useLayoutEffect(() => {
    navigation.setOptions({
      title: props.journal.title,
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
    <Container onPress={() => Keyboard.dismiss()}>
      <FilterBar
        journal={props.journal}
        onChange={() => console.log('filter change!')}
      />

      <PageList
        data={journalData.content.pages}
        onClick={page => {
          navigation.navigate('Page', {
            page: page,
            newPage: false,
            key: props.key,
            parent: props.journal.id,
          });
        }}
      />
      <PopAction
        onPress={() => {
          navigation.navigate('Page', {
            page: new Page({}),
            newPage: true,
            key: props.key,
            parent: props.journal.id,
          });
        }}
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

const Container = styled.Pressable`
  flex: 1;
  height: 100%;
  width: 100%;
`;
