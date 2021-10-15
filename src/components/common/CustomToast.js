import React from 'react';
import styled from 'styled-components';

const ToastBody = styled.View`
  flex: 1;
  flex-direction: column;
  elevation: 10;
  justify-content: space-evenly;
  align-items: center;
  background-color: rgba(0, 0, 0, 0.6);
  border-radius: 20px;
  padding: 10px 20px 10px 20px;
  margin: 5px;
`;

const ToastText1 = styled.Text`
  font-family: ${p => p.theme.font.menu.reg};
  color: white;
  font-size: 14px;
`;

const ToastText2 = styled.Text`
  font-family: ${p => p.theme.font.menu.reg};
  color: white;
  margin-top: 5px;
  font-size: 10px;
`;

const QuickSmallToastBody = styled.View`
  flex: 1;
  flex-direction: column;
  elevation: 10;
  justify-content: space-evenly;
  align-items: center;
  background-color: rgba(0, 0, 0, 0.4);
  border-radius: 20px;
  padding: 7px 14px 7px 14px;
  margin: 5px;
`;

const QuickSmallToastText1 = styled.Text`
  font-family: ${p => p.theme.font.menu.reg};
  color: white;
  font-size: 10px;
`;

const QuickSmallToastText2 = styled.Text`
  font-family: ${p => p.theme.font.menu.reg};
  color: white;
  margin-top: 2px;
  font-size: 6px;
`;

export const toastConfig = {
  simpleInfo: ({text1, text2}) => (
    <ToastBody>
      <ToastText1>{text1}</ToastText1>
      {text2 && <ToastText2>{text2}</ToastText2>}
    </ToastBody>
  ),
  quickSmall: ({text1, text2}) => (
    <QuickSmallToastBody>
      <QuickSmallToastText1>{text1}</QuickSmallToastText1>
      {text2 && <QuickSmallToastText2>{text2}</QuickSmallToastText2>}
    </QuickSmallToastBody>
  ),
};
