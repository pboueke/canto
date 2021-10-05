import React, {useState} from 'react';
import styled from 'styled-components/native';
import Icon from 'react-native-vector-icons/Feather';
import {Keyboard} from 'react-native';
import {Flex} from 'native-grid-styled';
import MMKVStorage from 'react-native-mmkv-storage';
import {PopAction} from '../../components/common';
import {FilterBar, PageList} from '../../components/Journal';
import {Page, Filter, JournalContent} from '../../models';
import {metadata} from '../..';

export default ({navigation, route}) => {
  const props = route.params;

  const MMKV = new MMKVStorage.Loader()
    .withInstanceID(metadata.mmkvInstance)
    .withEncryption()
    .encryptWithCustomKey((props.key || [...metadata.defaultKey]).join(''))
    .initialize();

  let journalDataStorage = MMKV.getMap(props.journal.id);
  if (!journalDataStorage) {
    MMKV.setMap(props.journal.id, {
      content: new JournalContent({cover: props.journal}),
      rand: (Math.random() + 1).toString(36).substring(7),
    });
  }
  journalDataStorage = MMKV.getMap(props.journal.id);
  const [journalDataState, setJournalDataState] = useState(journalDataStorage);
  const [pageList, setPageList] = useState(journalDataState.content.pages);

  React.useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      const data = MMKV.getMap(props.journal.id);
      setJournalDataState(data);
      setPageList(Filter.sort(data.content.pages));
    });
    return unsubscribe;
  }, [navigation, props, MMKV, setJournalDataState]);

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
        data={journalDataState.content.pages}
        journal={props.journal}
        onChange={setPageList}
      />

      <PageList
        data={pageList}
        onClick={page => {
          navigation.navigate('Page', {
            page: page,
            newPage: false,
            key: props.key,
            parent: props.journal.id,
            tags: Filter.getAvailableProperties(journalDataState.content.pages)
              .tags,
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
            tags: Filter.getAvailableProperties(journalDataState.content.pages)
              .tags,
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
