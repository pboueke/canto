import React, {useRef, useState} from 'react';
import styled from 'styled-components/native';
import {Dimensions, View} from 'react-native';
import Carousel, {Pagination} from 'react-native-snap-carousel';

export default ({images, topDistance = 55}) => {
  const width = Dimensions.get('window').width;
  const ref = useRef(null);
  const [id, setId] = useState(0);
  return (
    <View>
      <Container topDistance={topDistance} imgSize={width}>
        <SnapCarousel
          ref={ref}
          data={images}
          renderItem={({item, index}) => (
            <CarouselItem source={{uri: item}} resizeMode="contain" />
          )}
          sliderWidth={400}
          sliderHeight={width}
          itemWidth={width}
          onBeforeSnapToItem={i => setId(i)}
          removeClippedSubviews={false}
        />
        <Pagination
          dotsLength={images.length}
          activeDotIndex={id}
          containerStyle={{
            backgroundColor: 'rgba(0, 0, 0, 0)',
            position: 'absolute',
            marginTop: width - 60,
            padding: 0,
          }}
          renderDots={(activeIndex, total, context) => {
            if (total > 1) {
              return (
                <DotRow>
                  {[...Array(total).keys()].map(i => (
                    <Dot
                      key={i}
                      active={i === activeIndex}
                      onPress={() => {
                        setId(i);
                        ref.current.snapToItem(i);
                      }}
                    />
                  ))}
                </DotRow>
              );
            }
          }}
        />
      </Container>
    </View>
  );
};

const DotRow = styled.View`
  flex-flow: row;
  height: 20px;
  flex: 1;
  align-items: center;
  justify-content: center;
  background-color: rgba(0, 0, 0, 0.2);
  padding: 3px;
  border-radius: 100px;
`;

const Dot = styled.Pressable`
  background-color: ${p =>
    p.active ? 'rgba(255, 255, 255, 0.8)' : 'rgba(255, 255, 255, 0.4)'};
  width: ${p => (p.active ? 15 : 10)}px;
  height: ${p => (p.active ? 15 : 10)}px;
  border-radius: 10px;
  margin: 0 5px 0 5px;
  elevation: 5;
`;

const SnapCarousel = styled(Carousel)``;

const CarouselItem = styled.Image`
  width: 100%
  height: 100%;
  align-items: flex-end;
  margin: 0;
  margin-left: 12px;
`;

const Container = styled.View`
  height: ${p => p.imgSize + 3}px;
  width: 100%;
  background-color: rgb(150, 150, 150);
  padding-bottom: 1px;
  border-bottom-width: 2px;
`;
