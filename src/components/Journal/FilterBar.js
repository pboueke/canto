import React, {useState, useMemo} from 'react';
import useStateRef from 'react-usestateref';
import styled from 'styled-components/native';
import {Flex} from 'native-grid-styled';
import Icon from 'react-native-vector-icons/Feather';
import DateTimePicker from '@react-native-community/datetimepicker';
import {FilterModal} from '.';
import {Filter} from '../../models';

export default props => {
  const availableTags = useMemo(
    () => Filter.getAvailableProperties(props.data),
    [props.data],
  );
  const [query, setQuery, queryRef] = useStateRef('');
  const [filterModalVisibility, setFilterModalVisibility] = useState(false);
  const [startDatePickerVisibility, setStartDatePickerVisibility] =
    useState(false);
  const [endDatePickerVisibility, setEndDatePickerVisibility] = useState(false);
  const [startDate, setStartDate, startDateRef] = useStateRef(
    Filter.getOldestDate(props.data, props.journal.date),
    [props],
  );
  const [endDate, setEndDate, endDateRef] = useStateRef(new Date());
  const [mustHaves, setMustHaves, mustHavesRef] = useStateRef(emptyMustHaves);

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
    const filter = new Filter(
      queryRef.current,
      mustHavesRef.current,
      startDateRef.current,
      endDateRef.current,
    );
    const filtered = filter.apply(props.data);
    props.onChange(filtered);
  };

  return (
    <FilterBar>
      <FilterModal
        show={filterModalVisibility}
        unShow={() => setFilterModalVisibility(!filterModalVisibility)}
        availableTags={availableTags.tags}
        data={mustHaves}
        onChange={value => {
          setMustHaves(value);
          changeCaller();
        }}
      />

      <FilterButtonWithClear
        empty={emptyMustHavesInit === JSON.stringify(mustHaves)}
        onPress={() => setFilterModalVisibility(!filterModalVisibility)}
        clear={() => {
          setMustHaves(emptyMustHaves);
          changeCaller();
        }}
      />

      <FilterIput
        autoCorrect={false}
        placeholder="search filter"
        value={query}
        onChange={event => {
          const {_eventCount, _target, text} = event.nativeEvent;
          setQuery(text);
          changeCaller();
        }}
      />

      <FilterInputIcon
        active={query !== ''}
        onPress={() => {
          setQuery('');
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

//  margin: 10px 0 10px 10px;

const FilterButtonWithClear = ({empty, onPress, clear}) => (
  <Flex
    css={{
      flexDirection: 'column',
      height: '50px',
      width: '50px',
      marginTop: '10px',
      marginBottom: '10px',
      marginLeft: '10px;',
    }}>
    {!empty && (
      <FilterButtonClear onPress={clear}>
        <FilterButtonClearText>CLEAR</FilterButtonClearText>
      </FilterButtonClear>
    )}
    <FilterButton empty={empty} onPress={onPress}>
      <FilterButtonIcon name="filter" empty={empty} />
      <FilterButtonSmallIcon name="plus" empty={empty} />
    </FilterButton>
  </Flex>
);

const FilterButtonClearText = styled.Text`
  font-size: 12px;
  letter-spacing: 1px;
  font-weight: 900;
`;

const FilterButtonClear = styled.Pressable`
  width: 50px;
  height: 20px;
  align-items: center;
  border-width: 2px;
  border-radius: 5px;
  border-style: solid;
  background-color: white;
`;

const FilterButton = styled.Pressable`
  width: 50px;
  height: ${props => (props.empty ? 50 : 29)}px;
  flex-grow: 1;
  margin: 1px 0 10px 0;
  align-items: center;
  border-width: 2px;
  border-radius: 5px;
  border-style: solid;
  background-color: ${props => (props.empty ? 'white' : 'rgb(235, 187, 129)')};
`;

const FilterInputIcon = props => {
  const IconWrapper = styled.Pressable`
    elevation: 10;
    height: 50px;
    width: 40px;
    position: absolute;
    margin: 10px 0 0 70px;
    align-items: center;
    justify-content: center;
  `;
  return (
    <IconWrapper
      onPress={() => {
        if (props.active) {
          props.onPress();
        }
      }}>
      <Icon name={props.active ? 'x' : 'search'} size={25} />
    </IconWrapper>
  );
};

const FilterButtonIcon = styled(Icon)`
  position: absolute;
  margin-left: 15px;
  margin-top: ${props => (props.empty ? 10 : 3)}px;
  elevation: 5;
  font-size: ${props => (props.empty ? 25 : 20)}px;
`;

const FilterButtonSmallIcon = styled(Icon)`
  position: absolute;
  top: ${props => (props.empty ? 25 : 10)}px;
  right: 0px;
  elevation: 6;
  font-size: ${props => (props.empty ? 20 : 15)}px;
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

const emptyMustHaves = {
  file: false,
  image: false,
  location: false,
  tags: [],
};
const emptyMustHavesInit = JSON.stringify(emptyMustHaves);
