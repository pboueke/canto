import React, {useState, useContext} from 'react';
import styled from 'styled-components/native';
import {ThemeContext} from 'styled-components';
import {Keyboard} from 'react-native';
import MMKVStorage from 'react-native-mmkv-storage';
import {PopAction} from '../../components/common';
import {
  FilterBar,
  PageList,
  JournalHeaderTitle,
  JournalHeaderRight,
} from '../../components/Journal';
import {Page, Filter, JournalContent} from '../../models';
import {metadata} from '../..';

export default ({navigation, route}) => {
  const props = route.params;
  const theme = useContext(ThemeContext);
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
  }, [navigation, props, MMKV, setJournalDataState, pageList]);

  React.useLayoutEffect(() => {
    navigation.setOptions({
      title: props.journal.title,
      headerStyle: {
        backgroundColor: theme.headerBg,
        color: theme.textColor,
      },
      headerTintColor: theme.textColor,
      headerTitle: () => (
        <JournalHeaderTitle
          title={props.journal.title}
          icon={props.journal.icon}
        />
      ),
      headerRight: () => <JournalHeaderRight />,
    });
  }, [navigation, props, theme]);

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
        action="new"
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

const Container = styled.Pressable`
  flex: 1;
  height: 100%;
  width: 100%;
  background-color: ${p => p.theme.tableBg};
`;
