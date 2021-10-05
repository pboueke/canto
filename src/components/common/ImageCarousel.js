import React from 'react';
import styled from 'styled-components/native';
import {SliderBox} from 'react-native-image-slider-box';

export default ({images, imageHeight = 400, topDistance}) => {
  return (
    <Container topDistance={topDistance}>
      <SliderBox
        images={images}
        sliderBoxHeight={imageHeight}
        circleLoop={true}
      />
    </Container>
  );
};

const Container = styled.View`
  width: 100%;
  top: ${props => props.topDistance ?? 55}px;
  position: absolute;
`;
