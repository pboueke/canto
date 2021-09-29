import React, {useState} from 'react';
import styled from 'styled-components/native';
import {Keyboard} from 'react-native';
import MMKVStorage, {useMMKVStorage} from 'react-native-mmkv-storage';
import {PopAction} from '../../components/common';
import {PageText, PageDate, PageTime} from '../../components/Page';
import {Page} from '../../models';
import {JournalContent} from '../../models';
import {metadata} from '../..';


export default ({navigation, route}) => {
  const props = route.params;

  const MMKV = new MMKVStorage.Loader()
    .withInstanceID(metadata.mmkvInstance)
    .withEncryption()
    .encryptWithCustomKey((props.key || [...metadata.defaultKey]).join(''))
    .initialize();

  console.log('PAGE PARENT:');
  console.log(props.parent);
  const [journalData, setJournalData] = useMMKVStorage(props.parent, MMKV);
  const [pageData, setPageData] = useMMKVStorage(props.page.id, MMKV, {
    page: new Page(props.Page),
  });

  console.log(journalData);

  const [stored, setStored] = useState(props.newPage);
  const [editMode, setEditMode] = useState(props.newPage);
  const [dateTime, setDateTime] = useState(new Date(props.page.date));
  const [text, setText] = useState(props.page.text);

  const saveJournalData = (page, update) => {
    let tmp = journalData;
    if (update) {
      for (let i = 0; i < tmp.pages.length; i++) {
        if (tmp.pages[i].id === page.id) {
          tmp.pages[i] = page;
          break;
        }
      }
    } else {
      tmp.pages.push(page);
    }
    setJournalData(tmp);
  };

  const savePageData = () => {
    let tmp = pageData;
    tmp.text = text;
    tmp.date = new Date(dateTime).toISOString();
    setPageData(tmp);
    saveJournalData(tmp.getPreview(), stored);
    setStored(true);
  };

  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <PageDate editMode={editMode} date={dateTime} onChange={setDateTime} />
      ),
      headerRight: () => (
        <PageTime editMode={editMode} date={dateTime} onChange={setDateTime} />
      ),
    });
  }, [navigation, editMode, dateTime]);

  return (
    <Container onPress={() => Keyboard.dismiss()}>
      <Scroll>
        <PageText value={text} onChange={setText} editMode={editMode} />
      </Scroll>
      <PopAction
        icon={editMode ? 'save' : 'edit-2'}
        onPress={() => {
          if (editMode) {
            savePageData();
            setEditMode(false);
          } else {
            setEditMode(true);
          }
        }}
      />
    </Container>
  );
};

const Container = styled.Pressable`
  flex: 1
  flex-direction: column
  width: 100%;
  height: 100%;
`;

const Scroll = styled.ScrollView.attrs({
  contentContainerStyle: props => {
    return {
      justifyContent: 'center',
    };
  },
})`
  width: 100%;
`;
