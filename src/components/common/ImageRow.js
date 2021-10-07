import React from 'react';
import styled from 'styled-components';
import Icon from 'react-native-vector-icons/Feather';
import {randomString} from '../../lib';

export default ({images, action, icon = 'x'}) => (
  <Row>
    {images.map(i => (
      <ImageItem onPress={() => action(i)} key={i + randomString()}>
        <Background source={{uri: i}}>
          <ActionIcon name={icon} />
        </Background>
      </ImageItem>
    ))}
  </Row>
);

const Row = styled.View`
  flex-flow: row wrap;
  width: 100%;
  background-color: ${p => p.theme.fileRowBg};
  justify-content: center;
`;

const ImageItem = styled.Pressable`
  align-items: center;
  height: 99px;
  width: 99px;
`;

const Background = styled.ImageBackground`
  flex: 1;
  height: 99px;
  width: 99px;
  align-items: flex-end;
  background-color: rgba(255, 255, 255, 0.1);
`;

const ActionIcon = styled(Icon)`
  color: white;
  font-size: 30px;
  background-color: rgba(0, 0, 0, 0.5);
  border-radius: 15px;
  margin: 5px;
`;
