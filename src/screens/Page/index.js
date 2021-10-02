import React, {useState, useMemo} from 'react';
import styled from 'styled-components/native';
import {Keyboard, Alert} from 'react-native';
import MMKVStorage from 'react-native-mmkv-storage';
import {PopAction, TagsRow} from '../../components/common';
import {PageText, PageHeader} from '../../components/Page';
import {EditPageAttachments} from '../../components/Page';
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
  const orgValueString = useMemo(
    () => JSON.stringify(pageData.content),
    [pageData],
  );

  const [stored, setStored] = useState(!props.newPage);
  const [editMode, setEditMode] = useState(props.newPage);
  const [dateTime, setDateTime] = useState(new Date(props.page.date));
  const [text, setText] = useState(pageData.content.text);
  const [attachments, setAttachments] = useState({
    tags: pageData.content.tags,
    images: pageData.content.images,
    files: pageData.content.files,
    location: pageData.content.location,
    thumbnail: pageData.content.thumbnail,
  });

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

  const createUpdatedPage = () => {
    let tmp = pageData;
    Object.assign(tmp.content, attachments);
    tmp.content.text = text;
    tmp.content.date = new Date(dateTime).toISOString();
    tmp.content = new Page(tmp.content);
    return tmp;
  };

  const savePageData = () => {
    let tmp = createUpdatedPage();
    MMKV.setMap(pageData.content.id, tmp);
    saveJournalData(tmp.content.getPreview(), stored);
    setStored(true);
  };

  const cautiousGoBack = () => {
    if (
      !editMode ||
      JSON.stringify(createUpdatedPage().content) === orgValueString
    ) {
      navigation.goBack();
      return;
    }

    Alert.alert(
      'Discard changes?',
      'You have unsaved changes. Are you sure to discard them and leave the screen?',
      [
        {text: "Don't leave", style: 'cancel', onPress: () => {}},
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => navigation.goBack(),
        },
      ],
    );
  };

  return (
    <Container onPress={() => Keyboard.dismiss()}>
      <PageHeader
        goBack={cautiousGoBack}
        date={dateTime}
        setDateTime={setDateTime}
        editMode={editMode}
      />
      <Scroll>
        <PageText value={text} onChange={setText} editMode={editMode} />
        <TagsRow
          tags={attachments.tags}
          scale={1}
          justify="center"
          width="90%"
          color="rgb(200, 200, 200)"
          align="center"
        />
      </Scroll>
      {editMode && (
        <EditPageAttachments
          availableTags={props.tags}
          page={pageData.content}
          onChange={({tags, images, files, thumbnail, location}) => {
            setAttachments({
              tags: tags ?? pageData.content.tags,
              images: images ?? pageData.content.images,
              files: files ?? pageData.content.files,
              location: location ?? pageData.content.location,
              thumbnail: thumbnail ?? pageData.content.thumbnail,
            });
          }}
        />
      )}
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
