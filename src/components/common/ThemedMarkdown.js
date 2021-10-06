import React from 'react';
import {withTheme} from 'styled-components';
import Markdown from 'react-native-markdown-display';

export default withTheme(props => {
  const t = props.theme.md;
  return (
    <Markdown
      {...props}
      style={{
        body: {
          fontSize: t.fontSize,
          backgroundColor: t.background,
          color: t.textColor,
        },
        heading1: {color: t.textColor},
        heading2: {color: t.textColor},
        heading3: {color: t.textColor},
        heading4: {color: t.textColor},
        heading5: {color: t.textColor},
        heading6: {color: t.textColor},
        hr: {color: t.textColor},
        strong: {color: t.textColor},
        em: {color: t.textColor},
        s: {color: t.textColor},
        blockquote: {color: t.textColor},
        bullet_list: {color: t.textColor},
        ordered_list: {color: t.textColor},
        list_item: {color: t.textColor},
        code_inline: {color: t.textColor},
        fence: {color: t.textColor},
        table: {color: t.textColor},
        thead: {color: t.textColor},
        tbody: {color: t.textColor},
        th: {color: t.textColor},
        tr: {color: t.textColor},
        td: {color: t.textColor},
        link: {color: t.textColor},
        blocklink: {color: t.textColor},
        image: {color: t.textColor},
        text: {color: t.textColor},
        textgroup: {color: t.textColor},
        paragraph: {color: t.textColor},
        hardbreak: {color: t.textColor},
        softbreak: {color: t.textColor},
        pre: {color: t.textColor},
        inline: {color: t.textColor},
        span: {color: t.textColor},
        code_block: {color: t.textColor, fontSize: 14},
      }}
    />
  );
});
