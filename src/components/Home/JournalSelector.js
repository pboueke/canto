import React from 'react';
import styled from 'styled-components/native';
import Icon from 'react-native-vector-icons/Feather';
import {Box} from 'native-grid-styled';
import {TouchableNativeFeedback} from 'react-native';

const Selector = styled(Box)`
  border-width: ${p => p.theme.borderWidth};
  border-radius: 5px;
  border-style: solid;
  border-color: ${p => p.theme.borderColor};
  background-color: ${p => p.theme.journalPreviewBg};
  margin: 10px;
  align-items: center;
  align-self: center;
  elevation: 10;
`;

const InnerTouchable = styled.View`
  align-items: center;
  margin: 0;
  width: 100%;
  padding: 15px 0 15px 0;
`;

const Title = styled.Text`
  font-family: ${p => p.theme.font.menu.reg};
  font-size: 20px;
  text-align: center;
  margin: auto auto 10px auto;
  color: ${p => p.theme.textColor};
`;

const JournalIcon = styled(Icon)`
  color: ${p => p.theme.textColor};
`;

export default props => (
  <Selector width={3 / 11}>
    <TouchableNativeFeedback onPress={props.onPress}>
      <InnerTouchable>
        <Title>{props.title ?? 'Journal!'}</Title>
        <JournalIcon name={props.icon ?? 'book'} size={40} />
      </InnerTouchable>
    </TouchableNativeFeedback>
  </Selector>
);
