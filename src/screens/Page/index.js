import React, {useState} from 'react';
import styled from 'styled-components/native';
import {Alert} from 'react-native';
import MMKVStorage, {useMMKVStorage} from 'react-native-mmkv-storage';
import {
  PopAction,
  TagsRow,
  LocationTag,
  ImageCarousel,
  FileRow,
  ConfirmModal,
} from '../../components/common';
import Dictionary from '../../Dictionary';
import {
  PageText,
  PageHeader,
  EditPageAttachments,
  CommentDisplay,
  AddComment,
  CommentModal,
} from '../../components/Page';
import {Page, Comment} from '../../models';
import {
  Album,
  openLocationExternally,
  getDate,
  encKv,
  useStateWithCallback,
} from '../../lib';
import {metadata} from '../..';
import {removeFile, shareFile, addLocation} from '../../lib';
import reactUsestateref from 'react-usestateref';

export default ({navigation, route}) => {
  const props = route.params;
  const getKey = () => `${props.parent}${(props.key || ['']).join('')}`;

  const MMKV = new MMKVStorage.Loader()
    .withInstanceID(`${metadata.mmkvInstance}`)
    .withEncryption()
    .initialize();
  const [get, set] = encKv(MMKV, props.parent, getKey());

  const dic = Dictionary(props.lang);

  const journalData = get(props.parent);
  const storedData = MMKV.getString(props.page.id);
  if (!storedData) {
    set(props.page.id, {
      content: new Page(props.Page),
      modified: new Date().toISOString(),
      rand: (Math.random() + 1).toString(36).substring(7),
    });
  }
  const pageData = get(props.page.id);
  const [orgValueString, setOrgValueString] = reactUsestateref(
    JSON.stringify(pageData),
  );
  const [getAlbum, updateAlbum] = Album(props.parent, get, set);

  const [deleteModalVisibility, setDeleteModalVisibility] = useState(false);
  const [stored, setStored] = useState(!props.newPage);
  const [editMode, setEditMode] = useState(props.newPage);
  const [focusMode, setFocusMode] = useState(false);
  const [dateTime, setDateTime] = useState(new Date(props.page.date));
  const [text, setText] = useState(pageData.content.text);
  const [comments, setComments] = useState(pageData.content.comments);
  const [attachments, setAttachments] = useState({
    tags: pageData.content.tags,
    images: pageData.content.images,
    files: pageData.content.files,
    location: pageData.content.location,
    thumbnail: pageData.content.thumbnail,
  });
  const [commentModalVisibility, setCommentModalVisibility] = useState(false);
  const [commentModalValue, setCommentModalValue] = useStateWithCallback([
    new Comment(),
    -1,
  ]);

  if (props.newPage && props.settings.autoLocation && !attachments.location) {
    addLocation(loc => setAttachments({...attachments, location: loc}));
  }

  const deletePageData = id => {
    let tmp = journalData;
    for (let i = 0; i < tmp.content.pages.length; i++) {
      if (tmp.content.pages[i].id === id) {
        tmp.content.pages[i] = {
          id: id,
          deleted: true,
        };
        break;
      }
    }
    set(props.parent, tmp);
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
    set(props.parent, tmp);
  };

  const createUpdatedPage = () => {
    let tmp = pageData;
    Object.assign(tmp.content, attachments);
    tmp.content.text = text;
    tmp.content.comments = comments;
    tmp.content.date = new Date(dateTime).toISOString();
    tmp.content = new Page(tmp.content);
    return tmp;
  };

  const deleteAllFiles = async () => {
    attachments.files.forEach(file => removeFile(file));
    attachments.images.forEach(img => removeFile(img));
    updateAlbum({toRemove: [...attachments.files, ...attachments.images]});
  };

  const deletePendingFiles = async discarding => {
    let curr = createUpdatedPage().content;
    let good = discarding ? JSON.parse(orgValueString).content : curr;
    let bad = discarding ? curr : JSON.parse(orgValueString).content;
    let goodFiles = good.files.map(f => f.path);
    let goodImages = good.images.map(i => i.path);
    let filesToDelete = bad.files.filter(f => !goodFiles.includes(f.path));
    let imagesToDelete = bad.images.filter(i => !goodImages.includes(i.path));
    filesToDelete.forEach(file => removeFile(file.path));
    imagesToDelete.forEach(img => removeFile(img.path));
    updateAlbum({toRemove: [...filesToDelete, ...imagesToDelete]});
  };

  const updateThumbnail = (id = 0) => {
    let newAttachments = attachments;
    if (attachments.images && attachments.images.length > 0) {
      newAttachments.thumbnail = attachments.images[id].path;
    } else {
      newAttachments.thumbnail = null;
    }
    setAttachments(newAttachments);
    return newAttachments.thumbnail;
  };

  const savePageData = () => {
    let curr = createUpdatedPage();
    if (JSON.stringify(curr) !== orgValueString) {
      curr.modified = new Date().toISOString();
      updateThumbnail();
      deletePendingFiles(false);
      set(pageData.content.id, curr);
      setOrgValueString(JSON.stringify(curr));
      saveJournalData(curr.content.getPreview(), stored);
      setStored(true);
    }
  };

  const cautiousGoBack = () => {
    if (!editMode || JSON.stringify(createUpdatedPage()) === orgValueString) {
      navigation.goBack();
      return;
    }

    Alert.alert(
      dic('Discard changes?'),
      dic('You have unsaved changes. Are you sure to discard them and leave?'),
      [
        {text: dic("Don't leave"), style: 'cancel', onPress: () => {}},
        {
          text: dic('Discard'),
          style: 'destructive',
          onPress: () => {
            deletePendingFiles(true);
            navigation.goBack();
          },
        },
      ],
    );
  };

  const showOverlay = () => editMode && !focusMode;

  return (
    <Container>
      <PageHeader
        goBack={cautiousGoBack}
        date={dateTime}
        setDateTime={setDateTime}
        editMode={editMode}
        use24h={props.settings.use24h}
      />
      <Scroll contentInsetAdjustmentBehavior="automatic">
        <ImageCarousel
          dic={dic}
          images={attachments.images}
          action={index =>
            !editMode &&
            shareFile(
              attachments.images[index].path,
              `Image #${index}`,
              dateTime,
            )
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

        <PageText
          value={text}
          onChange={setText}
          editMode={editMode}
          toggleFocus={() => setFocusMode(!focusMode)}
          showPlaceholder={props.settings.showMarkdownPlaceholder}
          dic={dic}
        />

        {showOverlay() && (
          <AddComment
            dic={dic}
            onPress={() => {
              setCommentModalValue([new Comment(), -1], () =>
                setCommentModalVisibility(!commentModalVisibility),
              );
            }}
          />
        )}

        {comments &&
          comments.length > 0 &&
          comments.map((c, i) => (
            <CommentDisplay
              editMode={editMode}
              key={`cmt${i}`}
              dic={dic}
              comment={c}
              onPress={() => {
                if (editMode) {
                  setCommentModalValue([c, i], () =>
                    setCommentModalVisibility(!commentModalVisibility),
                  );
                }
              }}
            />
          ))}

        {showOverlay() && (
          <CommentModal
            dic={dic}
            show={commentModalVisibility}
            unShow={() => setCommentModalVisibility(!commentModalVisibility)}
            value={commentModalValue}
            onSubmit={(comment, date, index) => {
              const com = new Comment(comment, date);
              if (index < 0) {
                setComments([...comments, com]);
              } else {
                let tmp = comments;
                tmp[index] = com;
                setComments(tmp);
              }
            }}
            onDelete={index => {
              let tmp = comments;
              tmp.splice(index, 1);
              setComments(tmp);
            }}
          />
        )}

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

        {!attachments.files || (attachments.files.length < 1 && <EmptyBlock />)}
      </Scroll>
      {showOverlay() && (
        <EditPageAttachments
          dic={dic}
          availableTags={props.tags}
          page={pageData.content}
          onChange={val => setAttachments(val)}
          onAddFile={f => updateAlbum({toAdd: [f]})}
        />
      )}
      {!focusMode && (
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
      )}
      {showOverlay() && (
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
        dic={dic}
        marginTop={60}
        shadow={true}
        animationType="slide"
        show={deleteModalVisibility}
        unShow={() => setDeleteModalVisibility(!deleteModalVisibility)}
        onConfirm={() => deletePageData(pageData.content.id)}
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

const EmptyBlock = styled.View`
  width: 100%;
  height: 100px;
  elevation: -1;
`;
