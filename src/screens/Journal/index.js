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
  DataModal,
} from '../../components/Journal';
import {
  Page,
  Filter,
  JournalCover,
  JournalContent,
  JournalSettings,
} from '../../models';
import {
  removeFile,
  encKv,
  changeJournalEncryptionKey,
  getStoredSalt,
} from '../../lib';
import Dictionary from '../../Dictionary';
import {metadata} from '../..';

export default ({navigation, route}) => {
  const props = route.params;
  const getKey = () => `${props.journal.id}${(props.key || ['']).join('')}`;
  const theme = useContext(ThemeContext);
  const MMKV = new MMKVStorage.Loader()
    .withInstanceID(`${metadata.mmkvInstance}`)
    .withEncryption()
    .initialize();
  const [get, set] = encKv(MMKV, props.journal.id, getKey());

  const storedData = MMKV.getString(props.journal.id);
  if (!storedData) {
    set(props.journal.id, {
      content: new JournalContent({cover: props.journal}),
      settings: new JournalSettings(),
      rand: (Math.random() + 1).toString(36).substring(7),
    });
  }

  const getValidPages = pages => pages.filter(p => !p.deleted);

  const journalDataStorage = get(props.journal.id);
  const [journalDataState, setJournalDataState] = useState(journalDataStorage);
  const [pageList, setPageList] = useState(
    getValidPages(journalDataState.content.pages),
  );
  const [settingsVisibility, setSettingsVisibility] = useState(false);
  const [dataModalVisibility, setDataModalVisibility] = useState(false);

  const dic = Dictionary(props.lang);

  React.useEffect(() => {
    const unsubscribe = [
      navigation.addListener('focus', () => {
        const data = get(props.journal.id);
        setJournalDataState(data);
        if (data.settings.sort === 'ascending') {
          setPageList(Filter.sortAscending(getValidPages(data.content.pages)));
        } else if (data.settings.sort === 'descending') {
          setPageList(Filter.sortDescending(getValidPages(data.content.pages)));
        }
      }),
    ];
    return () => unsubscribe.forEach(u => u());
  }, [navigation, props, MMKV, setJournalDataState, pageList, get]);

  React.useLayoutEffect(() => {
    navigation.setOptions({
      title: journalDataState.content.title,
      headerStyle: {
        backgroundColor: theme.headerBg,
        color: theme.textColor,
      },
      headerTintColor: theme.textColor,
      headerTitle: () => (
        <JournalHeaderTitle
          title={journalDataState.content.title}
          icon={journalDataState.content.icon}
        />
      ),
      headerRight: () => (
        <JournalHeaderRight
          showSettings={() => setSettingsVisibility(!settingsVisibility)}
          showData={() => setDataModalVisibility(!dataModalVisibility)}
        />
      ),
    });
  }, [
    navigation,
    props,
    theme,
    settingsVisibility,
    dataModalVisibility,
    journalDataState,
  ]);

  const updateCover = (changes, del = false) => {
    const homeMMKV = new MMKVStorage.Loader()
      .withInstanceID(metadata.mmkvInstance)
      .withEncryption()
      .initialize();
    let data = homeMMKV.getMap('canto');
    for (let i = 0; i < data.journals.length; i++) {
      if (data.journals[i].id === props.journal.id) {
        if (del) {
          data.journals.splice(i, 1);
        } else {
          data.journals[i] = {...data.journals[i], ...changes};
        }
      }
    }
    homeMMKV.setMap('canto', data);
  };

  const changeName = name => {
    let newData = journalDataState;
    newData.content.title = name;
    updateCover({title: name});
    set(props.journal.id, newData);
    setJournalDataState(newData);
  };

  const changeIcon = icon => {
    let newData = journalDataState;
    newData.content.icon = icon;
    updateCover({icon: icon});
    set(props.journal.id, newData);
    setJournalDataState(newData);
  };

  const changePassword = pswd => {
    const newCover = new JournalCover();
    newCover.updatePassword(pswd);
    updateCover({hash: newCover.hash, secure: true});
    const newData = journalDataState;
    newData.content.hash = newCover.hash;
    newData.content.secure = true;
    set(props.journal.id, newData);
    changeJournalEncryptionKey(MMKV, props.journal.id, getKey(), pswd);
    navigation.goBack();
  };

  const deleteJournal = () => {
    journalDataState.content.pages
      .map(p => p.id)
      .forEach(id => {
        const page = get(id);
        page.content.images.forEach(i => removeFile(i));
        page.content.files.forEach(f => removeFile(f.path));
        MMKV.removeItem(id);
      });
    MMKV.removeItem(props.journal.id);
    updateCover({}, true);
    navigation.goBack();
  };

  return (
    <Container onPress={() => Keyboard.dismiss()}>
      {journalDataState.settings.filterBar && (
        <FilterBar
          dic={dic}
          data={journalDataState.content.pages}
          journal={props.journal}
          onChange={pages => setPageList(getValidPages(pages))}
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
      <DataModal
        dic={dic}
        journal={journalDataState}
        storage={MMKV}
        salt={getStoredSalt(MMKV, props.journal.id, getKey())}
        show={dataModalVisibility}
        unShow={() => setDataModalVisibility(!dataModalVisibility)}
        onSettingsChange={(val, sort) => {
          setJournalDataState({settings: val, ...journalDataState});
          set(props.journal.id, {settings: val, ...journalDataState});
        }}
      />

      {settingsVisibility && (
        <SettingsModal
          dic={dic}
          danger={{
            setIcon: changeIcon,
            setName: changeName,
            setPassword: changePassword,
            doDelete: deleteJournal,
          }}
          journal={journalDataState}
          show={settingsVisibility}
          unShow={() => setSettingsVisibility(!settingsVisibility)}
          onChange={(val, sort) => {
            setJournalDataState({settings: val, ...journalDataState});
            set(props.journal.id, {settings: val, ...journalDataState});
            if (sort) {
              if (val.sort === 'ascending') {
                setPageList(
                  Filter.sortAscending(
                    getValidPages(journalDataState.content.pages),
                  ),
                );
              } else if (val.sort === 'descending') {
                setPageList(
                  Filter.sortDescending(
                    getValidPages(journalDataState.content.pages),
                  ),
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
