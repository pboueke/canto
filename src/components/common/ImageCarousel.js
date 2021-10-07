import React, {useState} from 'react';
import Icon from 'react-native-vector-icons/Feather';
import {Image, Dimensions, Modal} from 'react-native';
import styled from 'styled-components/native';
import {SliderBox} from 'react-native-image-slider-box';
import ImageViewer from 'react-native-image-zoom-viewer';

export default ({images, action}) => {
  if (!images || images.length < 1) {
    return <Empty />;
  }
  const urls = images.map(i => ({
    url: i,
  }));
  const [galeryVisibility, setGaleryVisibility] = useState(false);
  return (
    <Container>
      <SliderBox
        images={images}
        sliderBoxHeight={Dimensions.get('window').width}
        circleLoop={true}
        ImageComponent={ImageComponent}
        dotColor="rgba(255, 255, 255, 0.9)"
        inactiveDotColor="rgba(255, 255, 255, 0.6)"
        onCurrentImagePressed={i => setGaleryVisibility(!galeryVisibility)}
      />
      <Modal
        visible={galeryVisibility}
        transparent={true}
        onRequestClose={() => setGaleryVisibility(!galeryVisibility)}>
        <ImageViewer
          imageUrls={urls}
          enableSwipeDown={true}
          onSwipeDown={() => setGaleryVisibility(!galeryVisibility)}
          renderFooter={i => (
            <GaleryFooter
              actions={[
                {
                  icon: 'x',
                  action: () => setGaleryVisibility(!galeryVisibility),
                },
                {icon: 'share', action: () => action(i)},
                {icon: 'save', action: () => console.log(images[i])},
              ]}
            />
          )}
        />
      </Modal>
    </Container>
  );
};

const GaleryFooter = ({actions}) => {
  const FooterIcon = styled(Icon)`
    color: white;
    font-size: 30px;
  `;
  const FooterAction = styled.Pressable``;
  const Footer = styled.View`
    elevation: 10;
    flex: 1;
    flex-direction: row;
    justify-content: space-around
    width: 400px;
    height: 100%;
    margin-bottom: 10px;
  `;
  if (actions && actions.length > 0) {
    return (
      <Footer>
        {actions.map(a => (
          <FooterAction key={a.icon} onPress={a.action}>
            <FooterIcon name={a.icon} />
          </FooterAction>
        ))}
      </Footer>
    );
  }
  return null;
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
  background-color: ${p => p.theme.imgViewerBg};
  border-bottom-width: ${p => p.theme.borderWidth};
  border-top-width: ${p => p.theme.borderWidth};
  border-color: ${p => p.theme.borderColor};
`;

const Empty = styled.View`
  height: 40px;
`;
