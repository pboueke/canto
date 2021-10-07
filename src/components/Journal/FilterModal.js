import React from 'react';
import {Switch} from 'react-native';
import styled from 'styled-components/native';
import {withTheme} from 'styled-components';
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
        <CloseIcon name="x" size={30} />
      </CloseButton>
      <FilterModalInterior>
        <Flex css={binaryWrapperStyle.flex}>
          <BinaryBox width={1 / 3}>
            <BinaryText size={10}>(must have)</BinaryText>
            <Flex css={binaryWrapperStyle.innerFlex}>
              <Bold>Image</Bold>
              <BinaryIcon name="image" />
            </Flex>
            <BinarySwitch
              value={data.image}
              onValueChange={val => onChange({...data, image: val})}
            />
          </BinaryBox>
          <BinaryBox width={1 / 3}>
            <BinaryText size={10}>(must have)</BinaryText>
            <Flex css={binaryWrapperStyle.innerFlex}>
              <Bold>File</Bold>
              <BinaryIcon name="paperclip" />
            </Flex>
            <BinarySwitch
              value={data.file}
              onValueChange={val => onChange({...data, file: val})}
            />
          </BinaryBox>
          <BinaryBox width={1 / 3}>
            <BinaryText size={10}>(must have)</BinaryText>
            <Flex css={binaryWrapperStyle.innerFlex}>
              <Bold>Location</Bold>
              <BinaryIcon name="map-pin" />
            </Flex>
            <BinarySwitch
              value={data.location}
              onValueChange={val => onChange({...data, location: val})}
            />
          </BinaryBox>
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
  font-family: ${p => p.theme.font.menu.reg};
  font-size: ${p => p.size ?? 14}px;
  color: ${p => p.color ?? 'rgb(111, 111, 111)'};
`;

const BinaryIcon = styled(Icon)`
  font-size: 16px;
  margin: 2px 0 0 5px;
  color: ${p => p.theme.textColor};
`;

const BinarySwitch = withTheme(({value, onValueChange, theme}) => (
  <Switch
    value={value}
    onValueChange={val => onValueChange(val)}
    thumbColor={theme.switch.thumbColor}
    trackColor={{
      true: theme.switch.trackColorOn,
      false: theme.switch.trackColorOff,
    }}
    style={{
      transform: [{scaleX: 1.2}, {scaleY: 1.2}],
    }}
  />
));

const BinaryBox = styled(Box)`
  flex-direction: column;
  justify-content: space-evenly;
  align-items: center;
  height: 100px;
  margin-left: 10px;
  margin-right: 10px;
  flex-shrink: 1;
  border-width: ${p => p.theme.borderWidth};
  border-radius: 5px;
  border-style: solid;
  border-color: ${p => p.theme.textColor};
  background-color: ${p => p.theme.journalPreviewBg};
`;

const binaryWrapperStyle = {
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

const Row = withTheme(({name, icon, action, theme}) => {
  return (
    <Flex
      css={{
        flexDirection: 'column',
        margin: '20px 20px 20px 20px',
        width: '90%',
        borderBottomWidth: '2px',
        borderColor: theme.borderColor,
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
});

const RowTitle = styled.Text`
  font-family: ${p => p.theme.font.menu.reg};
  font-size: 24px;
  margin-top: 10px;
  color: ${p => p.theme.textColor};
`;

const RowAction = styled.Text`
  font-family: ${p => p.theme.font.menu.reg};
  font-size: 16px;
  margin: 15px 0 0 15px;
  color: ${p => p.theme.textColor};
`;

const RowIcon = styled(Icon)`
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
  margin-top: 60px;
  background-color: ${p => p.theme.modalBg};
  border-width: ${p => p.theme.borderWidth};
  border-radius: 5px;
  border-style: solid;
  border-color: ${p => p.theme.borderColor};
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
  font-family: ${p => p.theme.font.menu.reg};
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

const Bold = styled.Text`
  font-family: ${p => p.theme.font.menu.bold};
  font-size: 14px;
  margin: 0 0 0 10px;
  color: ${p => p.theme.textColor};
`;

const EmptyBlock = styled.View`
  background-color: ${p => p.theme.headerBg};
  width: ${p => p.width ?? 50}px;
  height: 50px;
  position: absolute;
  ${p => (p.mg ? 'margin: ' + p.mg + ';' : '')}
  ${p => (p.right ? 'left: ' + p.right + ';' : '')}
`;
