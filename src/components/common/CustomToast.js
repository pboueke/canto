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
  color: white;
  font-size: 14px;
`;

const ToastText2 = styled.Text`
  color: white;
  margin-top: 5px;
  font-size: 10px;
`;

export const toastConfig = {
  simpleInfo: ({text1, text2}) => (
    <ToastBody>
      <ToastText1>{text1}</ToastText1>
      {text2 && <ToastText2>{text2}</ToastText2>}
    </ToastBody>
  ),
};
