import React, {useState} from 'react';
import styled from 'styled-components/native';
import Icon from 'react-native-vector-icons/Feather';
import {Flex} from 'native-grid-styled';
import DateTimePicker from '@react-native-community/datetimepicker';
import MMKVStorage, {useMMKVStorage} from 'react-native-mmkv-storage';
import {PopAction} from '../../components/common';

export default ({navigation, route}) => {
  const props = route.params;
  React.useLayoutEffect(() => {
    navigation.setOptions({
      title: props.title,
      headerTitle: () => (
        <Flex css={{flexDirection: 'row'}}>
          <HeaderIcon name={props.journal.icon} />
          <HeaderTitle>{props.journal.title}</HeaderTitle>
        </Flex>
      ),
      headerRight: () => (
        <Flex css={{flexDirection: 'row'}}>
          <HeaderButton onPress={() => console.log('backup')}>
            <Icon name="hard-drive" size={22} />
          </HeaderButton>
          <HeaderButton onPress={() => console.log('settings')}>
            <Icon name="settings" size={22} />
          </HeaderButton>
        </Flex>
      ),
    });
  }, [navigation, props]);

  const [query, setQuery] = useState('');
  const [startDatePickerVisibility, setStartDatePickerVisibility] =
    useState(false);
  const [endDatePickerVisibility, setEndDatePickerVisibility] = useState(false);
  const [startDate, setStartDate] = useState(new Date(props.journal.date));
  const [endDate, setEndDate] = useState(new Date());

  const onStartDateChange = (event, selectedDate) => {
    const currentDate = selectedDate || startDate;
    setStartDate(currentDate);
    setStartDatePickerVisibility(false);
  };
  const onEndDateChange = (event, selectedDate) => {
    const currentDate = selectedDate || endDate;
    setEndDate(currentDate);
    setEndDatePickerVisibility(false);
  };

  return (
    <Container>
      <FilterBar>
        <FilterIput
          placeholder="search"
          value={query}
          onChange={event => {
            const {eventCount, target, text} = event.nativeEvent;
            setQuery(text);
          }}
        />
        <DatePickerButton
          title="FROM"
          date={startDate}
          onPress={() =>
            setStartDatePickerVisibility(!startDatePickerVisibility)
          }
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
      <PopAction onPress={() => console.log('action!')} />
    </Container>
  );
};

const FilterBar = styled.View`
  flex: 1;
  flex-direction: row;
  height: 70px;
  width: 100%
  position: absolute;
`;

const DatePickerButton = props => {
  const date = new Date(props.date);
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
  padding-left: 20px;
  flex-grow: 1;
  background-color: rgb(255, 255, 255);
  font-size: 16px;
`;

const HeaderTitle = styled.Text`
  font-size: 24px;
  margin: 0 10px 0 10px;
`;

const HeaderIcon = styled(Icon)`
  margin: 5px 0 0 0;
  font-size: 25px;
`;

const HeaderButton = styled.Pressable`
  background-color: white;
  margin-left: 15;
`;

const Container = styled.View`
  flex: 1;
  height: 100%;
  width: 100%;
`;

const Scroll = styled.ScrollView.attrs({
  contentContainerStyle: props => {
    return {
      justifyContent: 'center',
    };
  },
})`
  width: 100%;
  margin: 25px auto;
  background-color: white;
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
