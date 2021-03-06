import React, {useState} from 'react';
import styled from 'styled-components/native';
import Icon from 'react-native-vector-icons/Feather';
import {AddAttachmentModal} from '.';

export default ({
  availableTags,
  page,
  dic,
  updatedPaths,
  onChange,
  onAddFile,
}) => {
  const [attachmentModalVisible, setAttachmentModalVisible] = useState(false);
  return (
    <AttachmentBar>
      <AddButton
        onPress={() => setAttachmentModalVisible(!attachmentModalVisible)}>
        <AddButtonText>{dic('Edit/add a')}</AddButtonText>
        <Bold>{dic('Tag')} </Bold>
        <AddButtonIcon name="tag" size={14} />
        <AddButtonText>,</AddButtonText>
        <Bold>{dic('Location')} </Bold>
        <AddButtonIcon name="map-pin" size={14} />
        <AddButtonText>,</AddButtonText>
        <Bold>{dic('Image')} </Bold>
        <AddButtonIcon name="image" size={14} />
        <AddButtonText> {dic('or')}</AddButtonText>
        <Bold>{dic('File')}</Bold>
        <AddButtonIcon name="paperclip" size={14} />
      </AddButton>
      <AddAttachmentModal
        dic={dic}
        updatedPaths={updatedPaths}
        availableTags={availableTags}
        page={page}
        show={attachmentModalVisible}
        onChange={onChange}
        onAddFile={onAddFile}
        unShow={() => setAttachmentModalVisible(!attachmentModalVisible)}
      />
    </AttachmentBar>
  );
};

const AddButton = styled.Pressable`
  flex-direction: row;
  background-color: ${p => p.theme.editBar.bg};
  justify-content: center;
  align-items: center;
  border-width: 2px;
  border-radius: 5px;
  border-style: solid;
  border-color: ${p => p.theme.editBar.borderColor};
  margin: 10px 5px 10px 5px;
  height: 30px;
`;

const AddButtonIcon = styled(Icon)`
  margin: 0 0 0 0px;
  color: ${p => p.theme.editBar.borderColor};
`;

const AddButtonText = styled.Text`
  font-family: ${p => p.theme.font.menu.bold};
  text-align: center;
  color: ${p => p.theme.editBar.borderColor};
`;

const Bold = styled(AddButtonText)`
  font-family: ${p => p.theme.font.menu.blk};
  margin: 0 3px 0 5px;
`;

const AttachmentBar = styled.View`
  flex: 1;
  flex-direction: column;
  height: 50px;
  width: 100%
  position: absolute;
  margin-top: 55px;
  elevation: 10;
`;
