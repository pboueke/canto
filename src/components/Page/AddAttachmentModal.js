import React, {useState} from 'react';
import styled from 'styled-components/native';
import Icon from 'react-native-vector-icons/Feather';
import {Flex} from 'native-grid-styled';
import {taggedTemplateExpression} from '@babel/types';
import {TextInputModal} from '../../components/common';

export default ({show, unShow, page, onChange}) => {
  const [addTagModalVisibility, setAddTagModalVisibility] = useState(false);
  const [tags, setTags] = useState(page.tags);
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
            placeholder="new tag"
            shadow={true}
            onSubmit={tag => setTags(Array.from(new Set(tags).add(tag)))}
            show={addTagModalVisibility}
            unShow={() => setAddTagModalVisibility(!addTagModalVisibility)}
          />
          <TagTable tags={tags} onChange={setTags} />
          <AttachmentRow name="Images" icon="image" />
          <AttachmentRow name="Files" icon="paperclip" />
          <AttachmentRow name="Location" icon="map-pin" />
        </AttachmentModalInterior>
      </Scroll>
    </AttachmentModal>
  );
};

const TagTable = ({tags, onChange}) => {
  const removeTag = tag => {
    tags.filter(t => t !== tag);
    onChange(taggedTemplateExpression);
  };
  return (
    <Flex css={{flexFlow: 'row wrap'}}>
      {tags.map(t => (
        <Tag key={t}>
          <TagText>{t}</TagText>
          <TagRemove tag={t} onPress={() => removeTag(t)} />
        </Tag>
      ))}
    </Flex>
  );
};

const Tag = styled.View`
  background-color: pink;
  margin: 5px;
  flex: 1;
  flex-direction: row;
  justify-content: center;
  align-items: center;
`;

const TagRemove = styled.Pressable``;

const TagText = styled.Text`
  background-color: pink;
  margin: 5px;
`;

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
  font-size: 30px;
`;

const AttachmentBarIcon = styled(Icon)`
  font-size: 30px;
  margin: 5px 20px 0 0;
`;

const Scroll = styled.ScrollView.attrs({
  contentContainerStyle: props => {
    return {
      justifyContent: 'center',
    };
  },
})`
  width: 360px;
  margin: auto;
  margin-top: 100px;
  background-color: white;
  border-width: 2px;
  border-radius: 5px;
  border-style: solid;
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
