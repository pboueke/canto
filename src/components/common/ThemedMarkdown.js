import React from 'react';
import {withTheme} from 'styled-components';
import Markdown from 'react-native-markdown-display';

export default withTheme(props => {
  const t = props.theme.md;
  const p = props.theme;
  return (
    <Markdown
      {...props}
      style={{
        body: {
          fontSize: t.fontSize,
          backgroundColor: t.background,
        },
        heading1: {
          color: t.textColor,
          fontSize: t.fontSize + 12,
          marginBottom: 10,
          marginTop: 5,
        },
        heading2: {
          marginBottom: 10,
          marginTop: 5,
          color: t.textColor,
          fontSize: t.fontSize + 10,
        },
        heading3: {
          marginBottom: 10,
          marginTop: 5,
          color: t.textColor,
          fontSize: t.fontSize + 8,
        },
        heading4: {
          marginBottom: 10,
          marginTop: 5,
          color: t.textColor,
          fontSize: t.fontSize + 6,
        },
        heading5: {
          marginBottom: 10,
          marginTop: 5,
          color: t.textColor,
          fontSize: t.fontSize + 4,
        },
        heading6: {
          marginBottom: 10,
          marginTop: 5,
          color: t.textColor,
          fontSize: t.fontSize + 2,
        },
        hr: {color: t.textColor, backgroundColor: t.textColor},
        strong: {color: t.textColor},
        em: {color: t.textColor},
        s: {color: t.textColor},
        blockquote: {
          color: t.textColor,
          backgroundColor: t.quote,
          marginTop: 7,
          marginBottom: 7,
          marginLeft: 0,
          marginRight: 0,
          borderRadius: 5,
        },
        bullet_list: {
          color: t.textColor,
          marginBottom: 5,
          marginTop: 5,
        },
        ordered_list: {
          color: t.textColor,
          marginBottom: 5,
          marginTop: 5,
        },
        list_item: {
          color: t.textColor,
          marginBottom: 5,
          marginTop: 5,
        },
        code_inline: {
          color: t.textColor,
          backgroundColor: t.box,
          marginBottom: 5,
          marginTop: 5,
        },
        fence: {color: t.textColor, backgroundColor: t.box, margin: 5},
        table: {
          color: t.textColor,
          borderColor: t.textColor,
          backgroundColor: t.box,
        },
        thead: {color: t.textColor},
        tbody: {color: t.textColor},
        th: {color: t.textColor, borderColor: t.textColor},
        tr: {color: t.textColor, borderColor: t.textColor},
        td: {color: t.textColor, borderColor: t.textColor},
        link: {color: p.linkColor},
        blocklink: {color: p.link},
        image: {color: t.textColor, borderRadius: 5},
        text: {color: t.textColor},
        textgroup: {color: t.textColor},
        paragraph: {color: t.textColor},
        hardbreak: {color: t.textColor},
        softbreak: {color: t.textColor},
        pre: {color: t.textColor},
        inline: {color: t.textColor, marginBottom: 5, marginTop: 5},
        span: {color: t.textColor},
        code_block: {
          color: t.textColor,
          backgroundColor: t.box,
          fontSize: 14,
          marginBottom: 5,
          marginTop: 5,
          marginLeft: 0,
          marginRight: 0,
        },
      }}
    />
  );
});
