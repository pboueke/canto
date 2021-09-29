import React, {useState} from 'react';
import styled from 'styled-components/native';
import Icon from 'react-native-vector-icons/Feather';
import {Keyboard, Text} from 'react-native';
import {Flex} from 'native-grid-styled';
import MMKVStorage, {useMMKVStorage} from 'react-native-mmkv-storage';
import {PopAction} from '../../components/common';
import {FilterBar} from '../../components/Journal';
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

  const [journalData, setJournalData] = useMMKVStorage(props.journal.id, MMKV, {
    content: new JournalContent({
      cover: props.journal,
      pages: [{t: (Math.random() + 1).toString(36).substring(7)}],
    }),
  });

  React.useLayoutEffect(() => {
    navigation.setOptions({
      title: journalData.content.title,
      headerTitle: () => (
        <Flex css={{flexDirection: 'row'}}>
          <HeaderIcon name={journalData.content.icon} />
          <HeaderTitle>{journalData.content.title}</HeaderTitle>
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
  }, [navigation, journalData]);

  console.log('JOURNAL');
  console.log(props.journal.id);
  console.log(journalData.content);

  return (
    <Container onPress={() => Keyboard.dismiss()}>
      <FilterBar
        journal={props.journal}
        onChange={() => console.log('filter change!')}
      />

      <Flex css={{marginTop: '100px'}}>
        <Text>PAGES #: {JSON.stringify(journalData.content.pages.length)}</Text>
        {journalData.content.pages.map(x => {
          return <Text key={x.id}>{JSON.stringify(x)}</Text>;
        })}
      </Flex>
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
