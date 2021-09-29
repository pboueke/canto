import React from 'react';
import {View} from 'react-native';
import styled from 'styled-components/native';

export default props => (
  <View>
    {props.editMode ? (
      <PageTextEditor value={props.value} onChangeText={props.onChange} />
    ) : (
      <PageTextPreview value={props.value} />
    )}
  </View>
);

const PageTextEditor = props => (
  <TextEditor
    value={props.value}
    multiline={true}
    placeholder={placeholder}
    onChangeText={props.onChange}
    numberOfLines={10}
  />
);

const PageTextPreview = props => <TextPreview>{props.value}</TextPreview>;

const TextPreview = styled.Text`
  border-width: 2px;
  border-radius: 5px;
  border-style: solid;
  margin: 5px;
  padding: 5px;
  background-color: white;
`;

const TextEditor = styled.TextInput`
  border-width: 2px;
  border-radius: 5px;
  border-style: solid;
  margin: 5px;
  padding: 15px;
  background-color: white;
  text-align-vertical: top;
`;

const placeholder = `Write your journal entry here...

Canto uses Markdown to format your text, it's a very practical way to format text. Here are some tips:

# Use # at the start of the line to create a header.
Add asteriscs for styling: **bold text**, *italic text*.
Create lists by using lines started by * or numbers.
Markdown also allows for tables, lines, quotes and more.

Formatting will be applied once you save your changes. Also note: The first line of this page will be used for the Page preview. The text contained in it can also be used for search queries. 
`;
