import React from 'react';
import styled from 'styled-components/native';
import Icon from 'react-native-vector-icons/Feather';
import {Flex, Box} from 'native-grid-styled';
import {TagsTable} from '../common';

export default ({show, unShow, data, availableTags, onChange}) => (
  <FilterModal
    animationType="slide"
    transparent={true}
    visible={show}
    onRequestClose={unShow}>
    <EmptyBlock />
    <EmptyBlock right={0} width={100} />
    <Scroll>
      <CloseButton onPress={unShow}>
        <ModalTitle>Change filters</ModalTitle>
        <Icon name="x" size={30} />
      </CloseButton>
      <FilterModalInterior>
        <Flex css={binaryWrapperStyle.flex}>
          <Box width={1 / 3} css={binaryWrapperStyle.box}>
            <BinaryText size={10}>(must have)</BinaryText>
            <Flex css={binaryWrapperStyle.innerFlex}>
              <Bold>Image</Bold>
              <BinaryIcon name="image" />
            </Flex>
            <BinarySwitch
              value={data.image}
              onValueChange={val => onChange({...data, image: val})}
            />
          </Box>
          <Box width={1 / 3} css={binaryWrapperStyle.box}>
            <BinaryText size={10}>(must have)</BinaryText>
            <Flex css={binaryWrapperStyle.innerFlex}>
              <Bold>File</Bold>
              <BinaryIcon name="paperclip" />
            </Flex>
            <BinarySwitch
              value={data.file}
              onValueChange={val => onChange({...data, file: val})}
            />
          </Box>
          <Box width={1 / 3} css={binaryWrapperStyle.box}>
            <BinaryText size={10}>(must have)</BinaryText>
            <Flex css={binaryWrapperStyle.innerFlex}>
              <Bold>Location</Bold>
              <BinaryIcon name="map-pin" />
            </Flex>
            <BinarySwitch
              value={data.location}
              onValueChange={val => onChange({...data, location: val})}
            />
          </Box>
        </Flex>
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

const BinaryText = styled.Text`
  font-size: ${p => p.size ?? 14}px;
  color: ${p => p.color ?? 'rgb(111, 111, 111)'};
  font-weight: 400;
`;
const BinaryIcon = styled(Icon)`
  font-size: 16px;
  margin: 2px 0 0 5px;
`;
const BinarySwitch = styled.Switch``;
const binaryWrapperStyle = {
  box: {
    flexDirection: 'column',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    height: '100px',
    marginLeft: '10px',
    marginRight: '10px',
    flexShrink: 1,
    borderWidth: '2px',
    borderRadius: '5px',
    borderStyle: 'solid',
  },
  flex: {
    flexDirection: 'row',
    paddingLeft: '20px',
    paddingRight: '20px',
    marginTop: '20px',
  },
  innerFlex: {
    flexDirection: 'row',
  },
};

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

const Bold = styled.Text`
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 0 10px;
`;

const EmptyBlock = styled.View`
  background-color: white;
  width: ${p => p.width ?? 50}px;
  height: 50px;
  position: absolute;
  ${p => (p.mg ? 'margin: ' + p.mg + ';' : '')}
  ${p => (p.right ? 'left: ' + p.right + ';' : '')}
`;
