import React, {useState} from 'react';
import styled from 'styled-components/native';
import Icon from 'react-native-vector-icons/Feather';
import DateTimePicker from '@react-native-community/datetimepicker';
import {getTime, getDate} from '../../lib';
import {BackButton} from '../common';

/*  Note: for unknown reasons, disabling the default back navigation
 *  using react-native-navigation did not work. Tried using the headerLeft
 *  property, tried assingning an event listener, and more. Creating a
 *  custom header has proven to be the easier work-around.
 */
export default props => (
  <HeaderContainer headerHeight={props.headerHeight}>
    <BackButton onPress={props.goBack} />
    <PageDate
      editMode={props.editMode}
      date={props.date}
      onChange={props.setDateTime}
    />
    <PageTime
      editMode={props.editMode}
      date={props.date}
      onChange={props.setDateTime}
    />
  </HeaderContainer>
);

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
    <DateTimeContainer
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
    </DateTimeContainer>
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
    <DateTimeContainer
      editable={props.editMode}
      onPress={() => {
        if (props.editMode) {
          setShow(true);
          props.onChange();
        }
      }}>
      <HeaderIcon name="clock" size={20} />
      <HeaderTitle size={20}>{getTime(time)}</HeaderTitle>
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
    </DateTimeContainer>
  );
};

const HeaderContainer = styled.View`
  height: ${props => props.headerHeight ?? 55}px;
  flex-direction: row;
  justify-content: space-between;
  background-color: ${p => p.theme.headerBg};
  align-items: center;
  elevation: 10;
  border-bottom-width: 1px;
`;

const DateTimeContainer = styled.Pressable`
  flex-direction: row;
  margin-right: 10px;
  border-color: ${p => p.theme.textColor};
  ${props =>
    props.editable
      ? `border-bottom-width: 1px;
  border-bottom-left-radius: 5px;
  border-bottom-right-radius: 5px;`
      : ''};
`;

const HeaderTitle = styled.Text`
  font-family: ${p => p.theme.font.menu.reg};
  font-size: ${props => props.size ?? 22}px;
  margin: 4px 5px 0 10px;
  color: ${p => p.theme.textColor};
`;

const HeaderIcon = styled(Icon)`
  font-size: ${props => props.size ?? 22}px;
  margin: 4px 0 0 0;
  color: ${p => p.theme.textColor};
`;
