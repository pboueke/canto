import React from 'react';
import {Image, Dimensions} from 'react-native';
import styled from 'styled-components/native';
import {SliderBox} from 'react-native-image-slider-box';

export default ({images, action}) => {
  if (!images || images.length < 1) {
    return <Empty />;
  }
  return (
    <Container>
      <SliderBox
        images={images}
        sliderBoxHeight={Dimensions.get('window').width}
        circleLoop={true}
        ImageComponent={ImageComponent}
        dotColor="rgba(255, 255, 255, 0.9)"
        inactiveDotColor="rgba(255, 255, 255, 0.6)"
        onCurrentImagePressed={index => action(index)}
      />
    </Container>
  );
};

const ImageComponent = props => (
  <ImgContainer>
    <Image {...props} resizeMode="contain" />
  </ImgContainer>
);

const ImgContainer = styled.View`
  width: 100%;
`;

const Container = styled.View`
  width: 100%;
  background-color: rgb(200, 200, 200);
  border-bottom-width: 2px;
`;

const Empty = styled.View`
  height: 40px;
`;
