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
      console.log(state);
      callbackRef.current(state);
      callbackRef.current = undefined;
    }
  }, [state]);

  return [state, handleSetState];
};
