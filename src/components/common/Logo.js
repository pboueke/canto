import React from 'react';
import styled from 'styled-components/native';
import {Image} from 'react-native';

const Container = styled.View`
  padding: 20px 0 20px 0;
`;

export default props => {
  const size = props.size ?? 200;
  return (
    <Container>
      <Image
        source={require('../../assets/images/logo_t_v1_256.png')}
        style={{width: size, height: size}}
      />
    </Container>
  );
};
