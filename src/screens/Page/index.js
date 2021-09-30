import React, {useState} from 'react';
import styled from 'styled-components/native';
import {Keyboard} from 'react-native';
import MMKVStorage from 'react-native-mmkv-storage';
import {PopAction} from '../../components/common';
import {PageText, PageDate, PageTime} from '../../components/Page';
import {Page} from '../../models';
import {metadata} from '../..';

export default ({navigation, route}) => {
  const props = route.params;

  const MMKV = new MMKVStorage.Loader()
    .withInstanceID(metadata.mmkvInstance)
    .withEncryption()
    .encryptWithCustomKey((props.key || [...metadata.defaultKey]).join(''))
    .initialize();

  const journalData = MMKV.getMap(props.parent);
  let pageData = MMKV.getMap(props.page.id);
  if (!pageData) {
    MMKV.setMap(props.page.id, {
      content: new Page(props.Page),
      rand: (Math.random() + 1).toString(36).substring(7),
    });
  }
  pageData = MMKV.getMap(props.page.id);

  const [stored, setStored] = useState(!props.newPage);
  const [editMode, setEditMode] = useState(props.newPage);
  const [dateTime, setDateTime] = useState(new Date(props.page.date));
  const [text, setText] = useState(props.page.text);

  const saveJournalData = (page, update) => {
    let tmp = journalData;
    if (update) {
      for (let i = 0; i < tmp.content.pages.length; i++) {
        if (tmp.content.pages[i].id === page.id) {
          tmp.content.pages[i] = page;
          break;
        }
      }
    } else {
      tmp.content.pages.push(page);
    }
    MMKV.setMap(props.parent, tmp);
  };

  const savePageData = () => {
    let tmp = pageData;
    tmp.content.text = text;
    tmp.content.date = new Date(dateTime).toISOString();
    tmp.content = new Page(tmp.content);
    MMKV.setMap(pageData.content.id, tmp);
    saveJournalData(tmp.content.getPreview(), stored);
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
