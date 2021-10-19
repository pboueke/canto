import React, {useState, useRef} from 'react';
import Icon from 'react-native-vector-icons/Feather';
import {Image, Dimensions, Modal} from 'react-native';
import styled from 'styled-components/native';
import {SliderBox} from 'react-native-image-slider-box';
import ImageViewer from 'react-native-image-zoom-viewer';
import {saveImage} from '../../lib';
import Toast from 'react-native-toast-message';
import {toastConfig} from './CustomToast';

export default ({images, action, dic}) => {
  if (!images || images.length < 1) {
    return <Empty />;
  }
  const urls = images.map(i => ({
    url: i.path,
  }));
  const modalToastRef = useRef({});
  const [galeryVisibility, setGaleryVisibility] = useState(false);
  const [index, setIndex] = useState(0);
  return (
    <Container>
      <SliderBox
        images={images.map(i => i.path)}
        sliderBoxHeight={Dimensions.get('window').width}
        circleLoop={true}
        ImageComponent={ImageComponent}
        dotColor="rgba(255, 255, 255, 0.9)"
        inactiveDotColor="rgba(255, 255, 255, 0.6)"
        onCurrentImagePressed={i => {
          setIndex(i);
          setGaleryVisibility(!galeryVisibility);
        }}
      />
      <Modal
        visible={galeryVisibility}
        transparent={true}
        onRequestClose={() => setGaleryVisibility(!galeryVisibility)}>
        <ImageViewer
          index={index}
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
                {
                  icon: 'save',
                  action: () => {
                    modalToastRef.current.show({
                      type: 'simpleInfo',
                      position: 'bottom',
                      text1: dic('saving image...'),
                      text2: dic("to 'Canto' image folder"),
                      visibilityTime: 800,
                      autoHide: true,
                      bottomOffset: 100,
                      onShow: () => {},
                      onHide: () => {},
                      onPress: () => {},
                    });
                    saveImage(images[i].path, msg =>
                      modalToastRef.current.show({
                        type: 'simpleInfo',
                        position: 'bottom',
                        text1: dic(msg),
                        visibilityTime: 1000,
                        autoHide: true,
                        bottomOffset: 100,
                        onShow: () => {},
                        onHide: () => {},
                        onPress: () => {},
                      }),
                    );
                  },
                },
              ]}
            />
          )}
        />
        <Toast config={toastConfig} ref={modalToastRef} />
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
