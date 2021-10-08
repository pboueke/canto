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
export const hashCode = s =>
  s.split('').reduce((a, b) => {
    a = (a << 5) - a + b.charCodeAt(0);
    return a & a;
  }, 0);

export const randomString = () => (Math.random() + 1).toString(36).substring(7);

export const getDate = date => new Date(date).toDateString();

export const getTime = (date, is24 = true) => {
  const dt = new Date(date);
  if (is24) {
    return dt.getHours() + ':' + ('0' + dt.getMinutes()).slice(-2);
  } else {
    const hrs = dt.getHours();
    const amPm = hrs > 12 ? ' PM' : ' AM';
    return (hrs % 12) + ':' + ('0' + dt.getMinutes()).slice(-2) + amPm;
  }
};
