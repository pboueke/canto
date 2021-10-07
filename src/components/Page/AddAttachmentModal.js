import React, {useState} from 'react';
import useStateRef from 'react-usestateref';
import styled from 'styled-components/native';
import {withTheme} from 'styled-components';
import Icon from 'react-native-vector-icons/Feather';
import {Flex} from 'native-grid-styled';
import {addImage, addFile, addLocation} from '../../lib';
import {
  TagsTable,
  LocationTag,
  TextInputModal,
  ImageRow,
  FileRow,
} from '../common';

export default ({show, unShow, page, onChange, availableTags}) => {
  const [addTagModalVisibility, setAddTagModalVisibility] = useState(false);
  const [tags, setTags, tagsRef] = useStateRef(page.tags);
  const [images, setImages, imagesRef] = useStateRef(page.images);
  const [files, setFiles, filesRef] = useStateRef(page.files);
  const [location, setLocation, locationRef] = useStateRef(page.location);
  const createDataObject = () => {
    return {
      tags: tagsRef.current,
      images: imagesRef.current,
      files: filesRef.current,
      location: locationRef.current,
    };
  };

  return (
    <AttachmentModal
      animationType="slide"
      transparent={true}
      visible={show}
      onRequestClose={unShow}>
      <EmptyBlock />
      <Scroll>
        <CloseButton onPress={unShow}>
          <ModalTitle>Edit page attachments</ModalTitle>
          <CloseIcon name="x" size={30} />
        </CloseButton>
        <AttachmentModalInterior>
          <AttachmentRow
            name="Tags"
            icon="tag"
            addAction={() => setAddTagModalVisibility(!addTagModalVisibility)}
          />
          <TextInputModal
            submit="Add"
            placeholder="add a new tag"
            shadow={true}
            onSubmit={tag => {
              setTags(Array.from(new Set(tags).add(tag)));
              onChange(createDataObject());
            }}
            show={addTagModalVisibility}
            unShow={() => setAddTagModalVisibility(!addTagModalVisibility)}>
            <AddTagScroll>
              <AttachmentRow
                name="Or pick one of your tags:"
                icon="tag"
                mt="10px"
              />
              <TagsTable
                mode="add"
                tags={tags}
                allTags={availableTags.filter(t => !tags.includes(t))}
                onChange={t => {
                  setTags(t);
                  onChange(createDataObject());
                  setAddTagModalVisibility(!addTagModalVisibility);
                }}
              />
            </AddTagScroll>
          </TextInputModal>
          <TagsTable
            tags={tags}
            mode="in-use"
            onChange={t => {
              setTags(t);
              onChange(createDataObject());
            }}
          />
          <AttachmentRow
            name="Images"
            icon="image"
            addAction={() =>
              addImage(page.id, val => {
                setImages(imagesRef.current.concat(val));
                onChange(createDataObject());
              })
            }
          />
          <ImageRow
            images={images}
            action={i => {
              setImages(imagesRef.current.filter(img => i !== img));
              onChange(createDataObject());
            }}
          />
          <AttachmentRow
            name="Files"
            icon="paperclip"
            addAction={() =>
              addFile(
                page.id,
                (uri, name) => {
                  setFiles(
                    filesRef.current.concat({
                      path: uri,
                      name: name,
                    }),
                  );
                  onChange(createDataObject());
                },
                3,
              )
            }
          />
          <FileRow
            files={files}
            action={f => {
              setFiles(filesRef.current.filter(file => file.path !== f.path));
              onChange(createDataObject());
            }}
          />
          <AttachmentRow
            name="Location"
            icon="map-pin"
            actionEnabled={!location}
            addAction={() =>
              addLocation(setLocation, () => onChange(createDataObject()))
            }
          />
          <LocationTag
            loc={location}
            removable={true}
            action={() => {
              setLocation(null);
              onChange(createDataObject());
            }}
          />
        </AttachmentModalInterior>
      </Scroll>
    </AttachmentModal>
  );
};

const AttachmentRow = withTheme(
  ({name, icon, addAction, actionEnabled = true, mt = '20px', theme}) => {
    return (
      <Flex
        css={{
          flexDirection: 'column',
          margin: '20px 20px 20px 20px',
          marginTop: mt,
          width: '90%',
          borderBottomWidth: '2px',
          borderColor: theme.borderColor,
        }}>
        <Flex
          css={{
            flexDirection: 'row',
            width: '100%',
            justifyContent: 'space-between',
          }}>
          <AttachmentRowTitle name={name} icon={icon} />
          {actionEnabled && addAction && (
            <AddAttachmentButton action={addAction} />
          )}
        </Flex>
      </Flex>
    );
  },
);

const AddAttachmentButton = ({action}) => {
  const Wrapper = styled.Pressable`
    font-size: 20px;
    flex-direction: row;
    margin: 10px 0 5px 0;
    padding: 1px 0 2px 7px;
    border-width: 1px;
    border-radius: 10px;
    border-style: solid;
    justify-content: center
    align-items: center;
    width: 70px;
    background-color: rgb(48, 48, 48);
  `;
  const Label = styled.Text`
    font-size: 16px;
    font-weight: 600;
    color: white;
  `;
  const AddIcon = styled(Icon)`
    font-size: 16px;
    margin: 3px 0 0 5px;
    color: white;
  `;
  return (
    <Wrapper onPress={action}>
      <Label>Add</Label>
      <AddIcon name="plus" />
    </Wrapper>
  );
};

const AttachmentRowTitle = ({name, icon}) => (
  <Flex css={{flexDirection: 'row'}}>
    <AttachmentBarIcon name={icon} />
    <AttachmentBarTitle>{name}</AttachmentBarTitle>
  </Flex>
);

const AttachmentBarTitle = styled.Text`
  font-size: 24px;
  margin-top: 10px;
  color: ${p => p.theme.textColor};
`;

const AttachmentBarIcon = styled(Icon)`
  font-size: 24px;
  margin: 15px 20px 0 0;
  color: ${p => p.theme.textColor};
`;

const Scroll = styled.ScrollView.attrs({
  contentContainerStyle: props => {
    return {
      justifyContent: 'center',
    };
  },
})`
  width: 401px;
  margin: auto;
  margin-top: 100px;
  background-color: ${p => p.theme.background};
  border-width: 2px;
  border-radius: 5px;
  border-style: solid;
  border-bottom-width: 0px
  border-bottom-left-radius: 0px;
  border-bottom-right-radius: 0px;
  border-color: ${p => p.theme.borderColor};
`;

const AddTagScroll = styled.ScrollView.attrs({
  contentContainerStyle: props => {
    return {
      justifyContent: 'center',
    };
  },
})`
  flex-grow: 1;
  margin-top: 20px;
  padding-top: -10px;
  background-color: ${p => p.theme.background};
  border-width: 2px;
  border-radius: 5px;
  border-style: solid;
  border-bottom-width: 0px
  border-bottom-left-radius: 0px;
  border-bottom-right-radius: 0px;
  border-color: ${p => p.theme.borderColor};
`;

const AttachmentModal = styled.Modal`
  text-align: center;
  margin: 10px 0 10px 0;
  align-items: center;
  flex-direction: row;
  background-color: white;
  justify-content: center;
  align-items: center;
`;

const AttachmentModalInterior = styled.View`
  flex: 1;
  flex-direction: column;
`;

const ModalTitle = styled.Text`
  font-size: 20px;
  margin: 2px 0 0 5px;
  color: ${p => p.theme.textColor};
`;

const CloseIcon = styled(Icon)`
  color: ${p => p.theme.textColor};
`;

const CloseButton = styled.Pressable`
  margin: 10px;
  flex-direction: row;
  justify-content: space-between;
`;

const EmptyBlock = styled.View`
  background-color: ${p => p.theme.headerBg}
  width: ${p => p.width ?? 50}px;
  height: 50px;
  position: absolute;
`;
