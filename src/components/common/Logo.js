import React from 'react';
import styled from 'styled-components/native';
import Logo from '../../assets/images/canto_bv1.svg';

const Container = styled.View`
  padding: 20px 0 20px 0;
`;

export default props => {
  const size = props.size ?? 200;
  return (
    <Container>
      <Logo width={size} height={size} />
    </Container>
  );
};
