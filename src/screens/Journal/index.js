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
  SettingsModal,
} from '../../components/Journal';
import {Page, Filter, JournalContent, JournalSettings} from '../../models';
import Dictionary from '../../Dictionary';
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
      settings: new JournalSettings(),
      rand: (Math.random() + 1).toString(36).substring(7),
    });
  }
  journalDataStorage = MMKV.getMap(props.journal.id);
  const [journalDataState, setJournalDataState] = useState(journalDataStorage);
  const [pageList, setPageList] = useState(journalDataState.content.pages);
  const [settingsVisibility, setSettingsVisibility] = useState(false);

  const dic = Dictionary(props.lang);

  React.useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      const data = MMKV.getMap(props.journal.id);
      setJournalDataState(data);
      if (data.settings.sort === 'ascending') {
        setPageList(Filter.sortAscending(data.content.pages));
      } else if (data.settings.sort === 'descending') {
        setPageList(Filter.sortDescending(data.content.pages));
      }
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
      headerRight: () => (
        <JournalHeaderRight
          showSettings={() => setSettingsVisibility(!settingsVisibility)}
        />
      ),
    });
  }, [navigation, props, theme, settingsVisibility]);

  return (
    <Container onPress={() => Keyboard.dismiss()}>
      {journalDataState.settings.filterBar && (
        <FilterBar
          dic={dic}
          data={journalDataState.content.pages}
          journal={props.journal}
          onChange={setPageList}
        />
      )}

      <PageList
        data={pageList}
        settings={journalDataState.settings}
        onClick={page => {
          navigation.navigate('Page', {
            page: page,
            newPage: false,
            key: props.key,
            parent: props.journal.id,
            lang: props.lang,
            settings: journalDataState.settings,
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
            lang: props.lang,
            settings: journalDataState.settings,
            tags: Filter.getAvailableProperties(journalDataState.content.pages)
              .tags,
          });
        }}
      />
      {settingsVisibility && (
        <SettingsModal
          dic={dic}
          journal={journalDataState}
          show={settingsVisibility}
          unShow={() => setSettingsVisibility(!settingsVisibility)}
          onChange={(val, sort) => {
            setJournalDataState({settings: val, ...journalDataState});
            MMKV.setMap(props.journal.id, {settings: val, ...journalDataState});
            if (sort) {
              if (val.sort === 'ascending') {
                setPageList(
                  Filter.sortAscending(journalDataState.content.pages),
                );
              } else if (val.sort === 'descending') {
                setPageList(
                  Filter.sortDescending(journalDataState.content.pages),
                );
              }
            }
          }}
        />
      )}
    </Container>
  );
};

const Container = styled.Pressable`
  flex: 1;
  height: 100%;
  width: 100%;
  background-color: ${p => p.theme.tableBg};
`;
