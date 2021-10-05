import React from 'react';
import styled from 'styled-components';
import Icon from 'react-native-vector-icons/Feather';
import {randomString} from '../../lib';

export default ({files, action, icon = 'x', padding}) => {
  if (!files || files.length < 1) {
    return null;
  }
  return (
    <Row padding={padding}>
      {files.map(f => (
        <FileItem onPress={() => action(f)} key={f.path + randomString()}>
          <ActionIcon name={icon} />
          <FileExt>.{f.path.split('.').pop()}</FileExt>
          <FileName numberOfLines={7}>{f.name}</FileName>
          <BackIcon name="paperclip" />
        </FileItem>
      ))}
    </Row>
  );
};

const Row = styled.View`
  flex-flow: row wrap;
  width: 100%;
  background-color: rgb(200, 200, 200);
  justify-content: space-evenly;
  ${p => (p.padding ? 'padding-top: ' + p.padding + 'px;' : '')}
  ${p => (p.padding ? 'padding-bottom: ' + (p.padding + 60) + 'px;' : '60px')}
`;

const FileName = styled.Text`
  text-align: center;
  font-size: 12px;
`;

const FileExt = styled.Text`
  position: absolute;
  bottom: 3px;
  right: 3px;
  background-color: rgba(0, 0, 0, 0.1);
  border-radius: 10px;
  font-weight: 700;
  font-size: 10px;
  padding: 4px;
`;

const FileItem = styled.Pressable`
  align-items: center;
  height: 100px;
  width: 100px;
  background-color: rgb(240, 240, 240);
  border-radius: 5px;
  border-width: 1px;
  margin: 5px;
  padding: 5px;
  justify-content: space-around;
`;

const ActionIcon = styled(Icon)`
  font-size: 30px;
  border-radius: 15px;
  right: 1px;
  top: 1px;
  position: absolute;
  color: rgba(0, 0, 0, 0.5);
`;

const BackIcon = styled(Icon)`
  font-size: 90px;
  elevation: -1;
  border-radius: 15px;
  left: 1px;
  bottom: 1px;
  position: absolute;
  color: rgb(220, 220, 220);
`;
