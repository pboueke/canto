import React from 'react';
import styled from 'styled-components/native';
import {withTheme} from 'styled-components';
import DarkLogo from '../../assets/images/canto_bv1.svg';
import WhiteLogo from '../../assets/images/canto_wv1.svg';

const Container = styled.View`
  padding: 20px 0 20px 0;
`;

const Logo = props => {
  const size = props.size ?? 200;
  let Img;
  switch (props.theme.logo) {
    case 'dark':
      Img = () => <DarkLogo width={size} height={size} />;
      break;
    case 'white':
      Img = () => <WhiteLogo width={size} height={size} />;
      break;
  }
  return (
    <Container>
      <Img />
    </Container>
  );
};

export default withTheme(Logo);
