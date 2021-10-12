import React from 'react';
import styled from 'styled-components/native';
import Icon from 'react-native-vector-icons/Feather';

export default ({availableTags, page, dic, onPress}) => {
  return (
    <AttachmentBar>
      <AddButton onPress={onPress}>
        <AddButtonText>{dic('Add')}</AddButtonText>
        <Bold>{dic('a Comment')}</Bold>
        <AddButtonIcon name="message-circle" size={14} />
      </AddButton>
      <AttachmentBarBlock />
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
  height: 30px;
  width: 200px;
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
  flex-grow: 1;
  flex-direction: row-reverse;
  height: 50px;
  align-self: flex-end;
  margin: 0;
  margin: -15px 5px 0 5px;
`;

const AttachmentBarBlock = styled.View`
  flex-direction: row;
  background-color: ${p => p.theme.editBar.bg};
  justify-content: center;
  align-items: center;
  border-width: 2px;
  border-right-width: 0;
  border-radius: 5px;
  border-bottom-right-radius: 0;
  border-style: solid;
  border-color: ${p => p.theme.editBar.borderColor};
  margin: 0 -2px 0 5px;
  height: 15px;
  width: 203px;
`;
