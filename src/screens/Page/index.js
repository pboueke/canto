import React, {useState} from 'react';
import styled from 'styled-components/native';
import {Alert} from 'react-native';
import MMKVStorage from 'react-native-mmkv-storage';
import {
  PopAction,
  TagsRow,
  LocationTag,
  ImageCarousel,
  FileRow,
  ConfirmModal,
} from '../../components/common';
import {PageText, PageHeader, EditPageAttachments} from '../../components/Page';
import {Page} from '../../models';
import {openLocationExternally, getDate} from '../../lib';
import {metadata} from '../..';
import {removeFile, shareFile} from '../../lib';
import reactUsestateref from 'react-usestateref';

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
  const [orgValueString, setOrgValueString] = reactUsestateref(
    JSON.stringify(pageData),
  );

  const [deleteModalVisibility, setDeleteModalVisibility] = useState(false);
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

  const deletePageData = id => {
    let tmp = journalData;
    for (let i = 0; i < tmp.content.pages.length; i++) {
      if (tmp.content.pages[i].id === id) {
        tmp.content.pages.splice(i, 1);
        break;
      }
    }
    MMKV.setMap(props.parent, tmp);
    MMKV.removeItem(id);
    deleteAllFiles();
    navigation.goBack();
  };

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

  const deleteAllFiles = async () => {
    attachments.files.forEach(file => removeFile(file));
    attachments.images.forEach(file => removeFile(file));
  };

  const deletePendingFiles = async discarding => {
    let curr = createUpdatedPage().content;
    let good = discarding ? JSON.parse(orgValueString).content : curr;
    let bad = discarding ? curr : JSON.parse(orgValueString).content;
    let goodFiles = good.files.map(f => f.path);
    let filesToDelete = bad.files.filter(f => !goodFiles.includes(f.path));
    let imagesToDelete = bad.images.filter(i => !good.images.includes(i));
    filesToDelete.forEach(file => removeFile(file.path));
    imagesToDelete.forEach(file => removeFile(file));
  };

  const updateThumbnail = (id = 0) => {
    let newAttachments = attachments;
    if (attachments.images && attachments.images.length > 0) {
      newAttachments.thumbnail = attachments.images[id];
    } else {
      newAttachments.thumbnail = null;
    }
    setAttachments(newAttachments);
    return newAttachments.thumbnail;
  };

  const savePageData = () => {
    let curr = createUpdatedPage();
    curr.thumbnail = updateThumbnail();
    deletePendingFiles(false);
    MMKV.setMap(pageData.content.id, curr);
    setOrgValueString(JSON.stringify(curr));
    saveJournalData(curr.content.getPreview(), stored);
    setStored(true);
  };

  const cautiousGoBack = () => {
    if (!editMode || JSON.stringify(createUpdatedPage()) === orgValueString) {
      navigation.goBack();
      return;
    }

    Alert.alert(
      'Discard changes?',
      'You have unsaved changes. Are you sure to discard them and leave?',
      [
        {text: "Don't leave", style: 'cancel', onPress: () => {}},
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            deletePendingFiles(true);
            navigation.goBack();
          },
        },
      ],
    );
  };

  return (
    <Container>
      <PageHeader
        goBack={cautiousGoBack}
        date={dateTime}
        setDateTime={setDateTime}
        editMode={editMode}
      />
      <Scroll contentInsetAdjustmentBehavior="automatic">
        <ImageCarousel
          images={attachments.images}
          action={index =>
            !editMode &&
            shareFile(attachments.images[index], `Image #${index}`, dateTime)
          }
        />
        <TagsRow
          tags={attachments.tags}
          scale={1}
          justify="center"
          width="90%"
          color="rgb(200, 200, 200)"
          align="center"
        />

        <PageText value={text} onChange={setText} editMode={editMode} />

        <LocationTag
          loc={attachments.location}
          removable={false}
          action={() =>
            openLocationExternally(attachments.location, getDate(dateTime))
          }
        />
        <FileRow
          files={attachments.files}
          icon="share"
          padding={10}
          action={f => shareFile(f.path, f.name, dateTime)}
        />
      </Scroll>
      {editMode && (
        <EditPageAttachments
          availableTags={props.tags}
          page={pageData.content}
          onChange={val => setAttachments(val)}
        />
      )}
      <PopAction
        icon={editMode ? 'save' : 'edit-2'}
        action={editMode ? 'save' : 'edit'}
        onPress={() => {
          if (editMode) {
            savePageData();
            setEditMode(false);
          } else {
            setEditMode(true);
          }
        }}
      />
      {editMode && (
        <PopAction
          icon="trash-2"
          action="delete"
          position={'bottom left'}
          size={30}
          onPress={() => {
            setDeleteModalVisibility(!deleteModalVisibility);
          }}
        />
      )}
      <ConfirmModal
        marginTop={60}
        shadow={true}
        animationType="slide"
        show={deleteModalVisibility}
        unShow={() => setDeleteModalVisibility(!deleteModalVisibility)}
        onDelete={() => deletePageData(pageData.content.id)}
      />
    </Container>
  );
};

const Container = styled.View`
  flex: 1
  flex-direction: column
  background-color: ${p => p.theme.background};
`;

const Scroll = styled.ScrollView.attrs({
  contentContainerStyle: props => {
    return {
      backgroundColor: props.theme.tableBg,
      flexGrow: 1,
    };
  },
})``;
