import React from 'react';
import styled from 'styled-components/native';
import Icon from 'react-native-vector-icons/Feather';
import {PageText} from '.';
import {getTime, getDate} from '../../lib';

export default ({comment, editMode, dic, onPress}) => {
  const dt = getDate(comment.date);
  const tm = getTime(comment.date);
  return (
    <Wrapper onPress={onPress}>
      <ButtonTitle>
        <CommentIcon name="message-circle" />
        {'     '}
        {dt}
        {'     '}
        {tm}
        {editMode && `        (${dic('click to edit')})`}
      </ButtonTitle>
      <PageText value={comment.text} editMode={false} dic={dic} minHeight={0} />
    </Wrapper>
  );
};

const Wrapper = styled.Pressable`
  margin-top: 10px;
`;

const ButtonTitle = styled.Text`
  margin: 0 10px 0 10px;
  font-family: ${p => p.theme.font.menu.reg};
  color: ${p => p.theme.textColor};
`;

const CommentIcon = styled(Icon)`
  color: ${p => p.theme.textColor};
`;
