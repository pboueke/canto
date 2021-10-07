import React, {useState} from 'react';
import styled from 'styled-components/native';
import {ThemedMarkdown} from '../common';

export default props => (
  <TextWrapper>
    {props.editMode ? (
      <PageTextEditor value={props.value} onChange={props.onChange} />
    ) : (
      <PageTextPreview value={props.value} />
    )}
  </TextWrapper>
);

const PageTextEditor = props => {
  const [text, setText] = useState(props.value);
  const onChange = val => {
    setText(val);
    props.onChange(val);
  };
  return (
    <TextEditor
      value={text}
      multiline={true}
      placeholder={placeholder}
      onChangeText={onChange}
      numberOfLines={10}
    />
  );
};

const PageTextPreview = props => (
  <TextPreview>
    <ThemedMarkdown>{props.value}</ThemedMarkdown>
  </TextPreview>
);

const TextWrapper = styled.View`
  elevation: 5;
  margin-bottom: 5px;
`;

const TextPreview = styled.View`
  border-width: ${p => p.theme.borderWidth};
  border-radius: 5px;
  border-style: solid;
  border-color: ${p => p.theme.borderColor};
  margin: 5px;
  padding: 3px 12px 6px 13px;
  background-color: ${p => p.theme.foreground};
  min-height: 400px;
`;

const TextEditor = styled.TextInput.attrs(p => ({
  placeholderTextColor: p.theme.placeholderColor,
}))`
  font-family: ${p => p.theme.font.text.reg};
  border-width: ${p => p.theme.borderWidth};
  border-radius: 5px;
  border-style: solid;
  border-color: ${p => p.theme.borderColor};
  margin: 5px;
  padding: 15px;
  background-color: ${p => p.theme.foreground};
  color: ${p => p.theme.textColor};
  text-align-vertical: top;
  min-height: 400px;
`;

const placeholder = `Write your journal entry here...

Canto uses Markdown to format your text, it's a very practical way to format text. Here are some tips:

# Use hashtag at the start of the line to create a header.

Create lists by using lines started by * or numbers:

1. Add asteriscs for styling: **bold text**, *italic text*.
2. Use > for quotes
3. --- for linebreaks
4. And links: [markdown cheatsheet linlk](https://github.com/adam-p/markdown-here/wiki/Markdown-Cheatsheet)

Formatting will be applied once you save your changes. 
`;
