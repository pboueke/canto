import React, {useState} from 'react';
import styled from 'styled-components/native';
import Icon from 'react-native-vector-icons/Feather';
import DateTimePicker from '@react-native-community/datetimepicker';
import {getTime, getDate} from '../../lib';

const PageDate = props => {
  const [date, setDate] = useState(new Date(props.date));
  const [show, setShow] = useState(false);
  const onChange = (event, selectedDate) => {
    const currentDate = new Date(selectedDate || date);
    setDate(currentDate);
    props.onChange(currentDate);
    setShow(false);
  };
  return (
    <Container
      editable={props.editMode}
      onPress={() => {
        if (props.editMode) {
          setShow(true);
        }
      }}>
      <HeaderIcon name="calendar" />
      <HeaderTitle>{getDate(date)}</HeaderTitle>
      {show && (
        <DateTimePicker
          testID="dateTimePicker"
          value={date}
          mode={'date'}
          is24Hour={true}
          display="default"
          onChange={onChange}
        />
      )}
    </Container>
  );
};

const PageTime = props => {
  const [time, setTime] = useState(new Date(props.date));
  const [show, setShow] = useState(false);
  const onChange = (event, selectedDate) => {
    const currentDate = new Date(selectedDate || time);
    setTime(currentDate);
    props.onChange(currentDate);
    setShow(false);
  };
  return (
    <Container
      editable={props.editMode}
      onPress={() => {
        if (props.editMode) {
          setShow(true);
          props.onChange();
        }
      }}>
      <HeaderIcon name="clock" size={18} />
      <HeaderTitle size={18}>{getTime(time)}</HeaderTitle>
      {show && (
        <DateTimePicker
          testID="dateTimePicker"
          value={time}
          mode={'time'}
          is24Hour={true}
          display="default"
          onChange={onChange}
        />
      )}
    </Container>
  );
};

const Container = styled.Pressable`
  flex-direction: row;
  ${props =>
    props.editable
      ? `border-bottom-width: 1px;
  border-bottom-left-radius: 5px;
  border-bottom-right-radius: 5px;`
      : ''};
`;

const HeaderTitle = styled.Text`
  font-size: ${props => props.size ?? 20}px;
  margin: 0 5px 0 10px;
`;

const HeaderIcon = styled(Icon)`
  font-size: ${props => props.size ?? 20}px;
  margin: 4px 0 0 0;
`;

export {PageDate, PageTime};
