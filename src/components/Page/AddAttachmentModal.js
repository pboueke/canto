import React, {useState} from 'react';
import useStateRef from 'react-usestateref';
import styled from 'styled-components/native';
import Icon from 'react-native-vector-icons/Feather';
import {Flex} from 'native-grid-styled';
import {TextInputModal} from '../../components/common';

export default ({show, unShow, page, onChange}) => {
  const [addTagModalVisibility, setAddTagModalVisibility] = useState(false);
  const [tags, setTags, tagsRef] = useStateRef(page.tags);
  const [images, setImages, ImagesRef] = useStateRef(page.images);
  const [files, setFiles, filesRef] = useStateRef(page.files);
  const [location, setLocation, locationRef] = useStateRef(page.location);
  const [thumbnail, setThumbnail, thumbnailRef] = useStateRef(page.thumbnail);
  const createDataObject = () => {
    return {
      tags: tagsRef.current,
      images: ImagesRef.current,
      files: filesRef.current,
      location: locationRef.current,
      thumbnail: thumbnailRef.current,
    };
  };

  return (
    <AttachmentModal
      animationType="slide"
      transparent={true}
      visible={show}
      onRequestClose={unShow}>
      <Scroll>
        <CloseButton onPress={unShow}>
          <ModalTitle>Edit page attachments</ModalTitle>
          <Icon name="x" size={30} />
        </CloseButton>
        <AttachmentModalInterior>
          <AttachmentRow
            name="Tags"
            icon="tag"
            addAction={() => setAddTagModalVisibility(!addTagModalVisibility)}
          />
          <TextInputModal
            submit="Add"
            placeholder="new tag"
            shadow={true}
            onSubmit={tag => {
              setTags(Array.from(new Set(tags).add(tag)));
              onChange(createDataObject());
            }}
            show={addTagModalVisibility}
            unShow={() => setAddTagModalVisibility(!addTagModalVisibility)}
          />
          <TagTable
            tags={tags}
            onChange={t => {
              setTags(t);
              onChange(createDataObject());
            }}
          />
          <AttachmentRow name="Images" icon="image" />
          <AttachmentRow name="Files" icon="paperclip" />
          <AttachmentRow name="Location" icon="map-pin" />
        </AttachmentModalInterior>
      </Scroll>
    </AttachmentModal>
  );
};

const TagTable = ({tags, onChange}) => {
  const DelButton = styled.Pressable``;
  const DelIcon = styled(Icon)``;
  const Tag = styled.View`
    background-color: rgb(200, 200, 200);
    margin: 5px;
    flex-grow: 1;
    flex-shrink: 1;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    border-radius: 20px;
    padding: 2px 5px 2px 5px;
  `;
  const TagRemove = ({onPress}) => (
    <DelButton onPress={onPress}>
      <DelIcon name="x" size={20} />
    </DelButton>
  );
  const TagText = styled.Text`
    margin: 5px;
    font-weight: 500;
    max-width: 90%;
  `;
  const removeTag = tag => onChange(tags.filter(t => t !== tag));
  return (
    <Flex
      css={{
        flexFlow: 'row wrap',
        flexGrow: 1,
        justifyContent: 'flex-start',
        alignItems: 'flex-start',
      }}>
      {tags.map(t => (
        <Tag key={t}>
          <TagText>{t}</TagText>
          <TagRemove tag={t} onPress={() => removeTag(t)} />
        </Tag>
      ))}
    </Flex>
  );
};

const AttachmentRow = ({name, icon, addAction}) => {
  return (
    <Flex
      css={{
        flexDirection: 'column',
        margin: '20px 20px 20px 20px',
        width: '90%',
        borderBottomWidth: '2px',
      }}>
      <Flex
        css={{
          flexDirection: 'row',
          width: '100%',
          justifyContent: 'space-between',
        }}>
        <AttachmentRowTitle name={name} icon={icon} />
        <AddAttachmentButton action={addAction} />
      </Flex>
    </Flex>
  );
};

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
`;

const AttachmentBarIcon = styled(Icon)`
  font-size: 24px;
  margin: 15px 20px 0 0;
`;

const Scroll = styled.ScrollView.attrs({
  contentContainerStyle: props => {
    return {
      justifyContent: 'center',
    };
  },
})`
  width: 400px;
  margin: auto;
  margin-top: 100px;
  background-color: white;
  border-width: 2px;
  border-radius: 5px;
  border-style: solid;
  border-bottom-width: 0px
  border-bottom-left-radius: 0px;
  border-bottom-right-radius: 0px;
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
`;

const CloseButton = styled.Pressable`
  margin: 10px;
  flex-direction: row;
  justify-content: space-between;
`;
