import React, {useState} from 'react';
import styled from 'styled-components/native';
import Icon from 'react-native-vector-icons/Feather';
import {AddAttachmentModal} from '.';

export default ({availableTags, page, onChange}) => {
  const [attachmentModalVisible, setAttachmentModalVisible] = useState(false);
  return (
    <AttachmentBar>
      <AddButton
        onPress={() => setAttachmentModalVisible(!attachmentModalVisible)}>
        <AddButtonText>Edit/add a</AddButtonText>
        <Bold>Tag </Bold>
        <AddButtonIcon name="tag" size={14} />
        <AddButtonText>,</AddButtonText>
        <Bold>Location </Bold>
        <AddButtonIcon name="map-pin" size={14} />
        <AddButtonText>,</AddButtonText>
        <Bold>Image </Bold>
        <AddButtonIcon name="image" size={14} />
        <AddButtonText> or</AddButtonText>
        <Bold>File</Bold>
        <AddButtonIcon name="paperclip" size={14} />
      </AddButton>
      <AddAttachmentModal
        availableTags={availableTags}
        page={page}
        show={attachmentModalVisible}
        onChange={onChange}
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
  margin: 10px 25px 10px 25px;
  height: 30px;
`;

const AddButtonIcon = styled(Icon)`
  margin: 0 0 0 0px;
  color: ${p => p.theme.editBar.borderColor};
`;

const AddButtonText = styled.Text`
  font-weight: 400;
  text-align: center;
  color: ${p => p.theme.editBar.borderColor};
`;

const Bold = styled(AddButtonText)`
  font-weight: 700;
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
