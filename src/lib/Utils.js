import {useEffect, useRef, useState} from 'react';

export const useStateWithCallback = initialState => {
  const [state, setState] = useState(initialState);
  const callbackRef = useRef();

  const handleSetState = (updatedState, callback?) => {
    callbackRef.current = callback;
    setState(updatedState);
  };

  useEffect(() => {
    if (callbackRef.current) {
      callbackRef.current(state);
      callbackRef.current = undefined;
    }
  }, [state]);

  return [state, handleSetState];
};

export const getDate = date => new Date(date).toDateString();
export const getTime = date =>
  new Date(date).getHours() +
  ':' +
  ('0' + new Date(date).getMinutes()).slice(-2);
