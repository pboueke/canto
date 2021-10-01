import React from 'react';
import styled from 'styled-components/native';
import Icon from 'react-native-vector-icons/Feather';
import {Flex} from 'native-grid-styled';

export default props => {
  return (
    <AttachmentModal
      animationType="slide"
      transparent={true}
      visible={props.show}
      onRequestClose={props.unShow}>
      <Scroll>
        <CloseButton onPress={props.unShow}>
          <ModalTitle>Page attachments</ModalTitle>
          <Icon name="x" size={30} />
        </CloseButton>
        <AttachmentModalInterior>
          <AttachmentRow name="Tags" icon="tag" />
          <AttachmentRow name="Images" icon="image" />
          <AttachmentRow name="Files" icon="paperclip" />
          <AttachmentRow name="Location" icon="map-pin" />
        </AttachmentModalInterior>
      </Scroll>
    </AttachmentModal>
  );
};

const AttachmentRow = ({name, icon, addAction, removeAction}) => {
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
        <AddAttachmentButton />
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
