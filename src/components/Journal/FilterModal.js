import React from 'react';
import useStateRef from 'react-usestateref';
import styled from 'styled-components/native';
import Icon from 'react-native-vector-icons/Feather';
import {Flex} from 'native-grid-styled';
import {TagsTable} from '../common';

export default ({show, unShow, data, availableTags, onChange}) => (
  <FilterModal
    animationType="slide"
    transparent={true}
    visible={show}
    onRequestClose={unShow}>
    <Scroll>
      <CloseButton onPress={unShow}>
        <ModalTitle>Change filters</ModalTitle>
        <Icon name="x" size={30} />
      </CloseButton>
      <FilterModalInterior>
        <Row name="Selected Tags" icon="tag" action="remove" />
        <TagsTable
          mode="remove"
          tags={data.tags}
          onChange={newTags => onChange({...data, tags: newTags})}
        />
        <Row name="Available Tags" icon="tag" action="add" />
        <TagsTable
          mode="add"
          tags={data.tags}
          allTags={availableTags}
          onChange={newTags => onChange({...data, tags: newTags})}
        />
      </FilterModalInterior>
    </Scroll>
  </FilterModal>
);

const Row = ({name, icon, action}) => {
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
          justifyContent: 'flex-start',
        }}>
        <RowIcon name={icon} />
        <RowTitle>{name}</RowTitle>
        <RowAction>({action})</RowAction>
      </Flex>
    </Flex>
  );
};

const RowTitle = styled.Text`
  font-size: 24px;
  margin-top: 10px;
`;

const RowAction = styled.Text`
  font-size: 16px;
  font-weight: 300;
  margin: 15px 0 0 15px;
`;

const RowIcon = styled(Icon)`
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
  width: 401px;
  margin: auto;
  margin-top: 60px;
  background-color: white;
  border-width: 2px;
  border-radius: 5px;
  border-style: solid;
  border-bottom-width: 0px
  border-bottom-left-radius: 0px;
  border-bottom-right-radius: 0px;
`;

const FilterModal = styled.Modal`
  text-align: center;
  margin: 10px 0 10px 0;
  align-items: center;
  flex-direction: row;
  background-color: white;
  justify-content: center;
  align-items: center;
`;

const FilterModalInterior = styled.View`
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
