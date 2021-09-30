import React, {useState, useEffect} from 'react';
import useStateRef from 'react-usestateref';
import styled from 'styled-components/native';
import {Flex} from 'native-grid-styled';
import Icon from 'react-native-vector-icons/Feather';
import DateTimePicker from '@react-native-community/datetimepicker';
import {Filter} from '../../models';

export default props => {
  const [query, setQuery, queryRef] = useStateRef('');
  const [startDatePickerVisibility, setStartDatePickerVisibility] =
    useState(false);
  const [endDatePickerVisibility, setEndDatePickerVisibility] = useState(false);
  const [startDate, setStartDate, startDateRef] = useStateRef(
    new Date(props.journal.date),
  );
  const [endDate, setEndDate, endDateRef] = useStateRef(new Date());
  const [properties, setProperties] = useState({});

  const onStartDateChange = (event, selectedDate) => {
    const currentDate = selectedDate || startDate;
    setStartDate(currentDate);
    setStartDatePickerVisibility(false);
    changeCaller();
  };
  const onEndDateChange = (event, selectedDate) => {
    const currentDate = selectedDate || endDate;
    setEndDate(currentDate);
    setEndDatePickerVisibility(false);
    changeCaller();
  };

  const changeCaller = () => {
    console.log(props.data);
    const filter = new Filter(
      queryRef.current,
      Filter.getAvailableProperties(props.data),
      startDateRef.current,
      endDateRef.current,
    );
    const filtered = filter.apply(props.data);
    console.log(filtered);
    props.onChange(filtered);
  };

  return (
    <FilterBar>
      <FilterButton>
        <FilterButtonIcon name="filter" size={25} />
        <FilterButtonSmallIcon name="plus" size={20} />
      </FilterButton>
      <FilterInputIcon name="search" size={25} />

      <FilterIput
        placeholder="search filter"
        value={query}
        onChange={event => {
          const {eventCount, target, text} = event.nativeEvent;
          setQuery(text);
          changeCaller();
        }}
      />
      <DatePickerButton
        title="FROM"
        date={startDate}
        onPress={() => setStartDatePickerVisibility(!startDatePickerVisibility)}
      />
      <DatePickerButton
        title="TO"
        date={endDate}
        onPress={() => setEndDatePickerVisibility(!endDatePickerVisibility)}
      />
      {startDatePickerVisibility && (
        <DateTimePicker
          testID="startDatePicker"
          value={startDate}
          is24Hour={true}
          display="calendar"
          onChange={onStartDateChange}
        />
      )}
      {endDatePickerVisibility && (
        <DateTimePicker
          testID="endDatePicker"
          value={endDate}
          is24Hour={true}
          display="calendar"
          onChange={onEndDateChange}
        />
      )}
    </FilterBar>
  );
};

const FilterBar = styled.View`
  flex: 1;
  flex-direction: row;
  height: 70px;
  width: 100%
  position: absolute;
  elevation: 15;
  background-color: rgb(209, 209, 209);
  border-bottom-width: 1px;
  border-top-width: 1px;
`;

const Wrapper = styled.Pressable`
  border-width: 2px;
  border-radius: 5px;
  border-style: solid;
  background-color: rgb(255, 255, 255);
  width: 60px;
  height: 50px;
  align-items: center;
  margin: 10px 10px 0 0;
`;
const Title = styled.Text`
  color: rgb(255, 255, 255);
  background-color: rgb(0, 0, 0);
  border-top-left-radius: 5px;
  border-top-right-radius: 5px;
  letter-spacing: 8px;
  font-size: 8px;
  margin: 0;
  width: 60px;
  text-align: center;
`;

const DayPreview = styled.Text`
  color: rgb(105, 105, 105);
  font-weight: 900;
  font-size: 18px;
  margin-right: 2px;
`;
const MonthPreview = styled.Text`
  color: rgb(0, 0, 0);
  font-weight: 300;
  font-size: 18px;
`;
const YearPreview = styled.Text`
  color: rgb(105, 105, 105);
  letter-spacing: 6px;
  font-size: 10px;
  margin-top: -2px;
`;

const DatePickerButton = props => {
  const date = new Date(props.date);
  return (
    <Wrapper onPress={props.onPress}>
      <Title>{props.title}</Title>
      <Flex css={{flexDirection: 'row', marginTop: '-2px'}}>
        <DayPreview>{date.getDate()}</DayPreview>
        <MonthPreview>{monthNames[date.getMonth()]}</MonthPreview>
      </Flex>
      <YearPreview>{date.getFullYear()}</YearPreview>
    </Wrapper>
  );
};

const FilterIput = styled.TextInput`
  height: 50px;
  margin: 10px 10px 0 10px;
  border-width: 2px;
  border-radius: 5px;
  border-style: solid;
  padding-left: 40px;
  flex-grow: 1;
  background-color: rgb(255, 255, 255);
  font-size: 16px;
`;

const FilterButton = styled.Pressable`
  width: 50px;
  height: 50px;
  align-items: center;
  margin: 10px 0 10px 10px;
  border-width: 2px;
  border-radius: 5px;
  border-style: solid;
  background-color: ${props =>
    props.empty ? 'rgb(233, 255, 224)' : 'rgb(255, 234, 224)'};
`;

const FilterInputIcon = styled(Icon)`
  position: absolute;
  margin: 20px 0 0 75px;
  elevation: 5;
`;

const FilterButtonIcon = styled(Icon)`
  position: absolute;
  margin: 10px 0 0 15px;
  elevation: 5;
`;

const FilterButtonSmallIcon = styled(Icon)`
  position: absolute;
  top: 25px;
  right: 0px;
  elevation: 6;
`;

const monthNames = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
