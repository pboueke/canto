import React, {useState, useMemo} from 'react';
import styled from 'styled-components/native';
import Icon from 'react-native-vector-icons/Feather';
import {Flex, Box} from 'native-grid-styled';

export default props => {
  const [modalVisible, setModalVisible] = useState(props.show);
  const icons = useMemo(
    () => (
      <Icons
        doCLose={() => {
          setModalVisible(false);
          props.unShow();
        }}
        handleClose={props.handleClose}
      />
    ),
    [props],
  );
  return (
    <IconModal
      animationType="slide"
      transparent={false}
      visible={modalVisible}
      onRequestClose={() => {
        setModalVisible(!modalVisible);
        props.unShow();
      }}>
      <Scroll>
        <IconModalInterior>
          <IconModalTitle>Select an {'Icon'}</IconModalTitle>
        </IconModalInterior>
        <Flex
          css={{
            flexDirection: 'row',
            justifyContent: 'space-evenly',
            marginBottom: '30px;',
            flexWrap: 'wrap',
          }}>
          {icons}
        </Flex>
      </Scroll>
    </IconModal>
  );
};

const Icons = props => {
  return iconNames.map(name => (
    <IconDisplay key={name} width={1 / 7}>
      <IconDisplayButton
        onPress={() => {
          props.doCLose(false);
          props.handleClose(name);
        }}>
        <Icon name={name} size={20} />
      </IconDisplayButton>
    </IconDisplay>
  ));
};

const Scroll = styled.ScrollView.attrs({
  contentContainerStyle: props => {
    return {
      justifyContent: 'center',
    };
  },
})`
  width: 100%;
  margin: auto;
  background-color: white;
`;

const IconDisplay = styled(Box)`
  border-width: 1px;
  border-radius: 5px;
  border-style: solid;
  text-align: center;
  margin: 10px;
`;

const IconDisplayButton = styled.Pressable`
  margin: 10px 0 10px 0;
  align-items: center;
  background-color: white;
`;

const IconModalTitle = styled.Text`
  font-size: 30px;
  text-align: center;
  width: 100%;
  margin: 50px 0 50px 0;
`;

const IconModal = styled.Modal`
  text-align: center;
  margin: 10px 0 10px 0;
  align-items: center;
`;

const IconModalInterior = styled.View`
  flex: 1;
  flex-direction: column;
`;

// List with all the available feather icons:
// https://github.com/feathericons/feather/tree/master/icons
const iconNames = [
  'book-open',
  'book',
  'bookmark',
  'box',
  'briefcase',
  'calendar',
  'smile',
  'speaker',
  'square',
  'star',
  'stop-circle',
  'sun',
  'sunrise',
  'sunset',
  'tablet',
  'tag',
  'target',
  'terminal',
  'thermometer',
  'thumbs-down',
  'thumbs-up',
  'activity',
  'airplay',
  'alert-circle',
  'alert-octagon',
  'alert-triangle',
  'align-center',
  'align-justify',
  'align-left',
  'align-right',
  'anchor',
  'aperture',
  'archive',
  'arrow-down-circle',
  'arrow-down-left',
  'arrow-down-right',
  'arrow-down',
  'arrow-left-circle',
  'arrow-left',
  'arrow-right-circle',
  'arrow-right',
  'arrow-up-circle',
  'arrow-up-left',
  'arrow-up-right',
  'arrow-up',
  'at-sign',
  'award',
  'bar-chart-2',
  'bar-chart',
  'battery-charging',
  'battery',
  'bell-off',
  'bell',
  'bluetooth',
  'bold',
  'camera-off',
  'camera',
  'cast',
  'check-circle',
  'check-square',
  'check',
  'chevron-down',
  'chevron-left',
  'chevron-right',
  'chevron-up',
  'chevrons-down',
  'chevrons-left',
  'chevrons-right',
  'chevrons-up',
  'chrome',
  'circle',
  'clipboard',
  'clock',
  'cloud-drizzle',
  'cloud-lightning',
  'cloud-off',
  'cloud-rain',
  'cloud-snow',
  'cloud',
  'code',
  'codepen',
  'codesandbox',
  'coffee',
  'columns',
  'command',
  'compass',
  'copy',
  'corner-down-left',
  'corner-down-right',
  'corner-left-down',
  'corner-left-up',
  'corner-right-down',
  'corner-right-up',
  'corner-up-left',
  'corner-up-right',
  'cpu',
  'credit-card',
  'crop',
  'crosshair',
  'database',
  'delete',
  'disc',
  'divide-circle',
  'divide-square',
  'divide',
  'dollar-sign',
  'download-cloud',
  'download',
  'dribbble',
  'droplet',
  'edit-3',
  'edit-2',
  'edit',
  'external-link',
  'eye-off',
  'eye',
  'facebook',
  'fast-forward',
  'feather',
  'figma',
  'file-minus',
  'file-plus',
  'file-text',
  'file',
  'film',
  'filter',
  'flag',
  'folder-minus',
  'folder-plus',
  'folder',
  'framer',
  'frown',
  'gift',
  'git-branch',
  'git-commit',
  'git-merge',
  'git-pull-request',
  'github',
  'gitlab',
  'globe',
  'grid',
  'hard-drive',
  'hash',
  'headphones',
  'heart',
  'help-circle',
  'hexagon',
  'home',
  'image',
  'inbox',
  'info',
  'instagram',
  'italic',
  'key',
  'layers',
  'layout',
  'life-buoy',
  'link-2',
  'link',
  'linkedin',
  'list',
  'loader',
  'lock',
  'log-in',
  'log-out',
  'mail',
  'map-pin',
  'map',
  'maximize-2',
  'maximize',
  'meh',
  'menu',
  'message-circle',
  'message-square',
  'mic-off',
  'mic',
  'minimize-2',
  'minimize',
  'minus-circle',
  'minus-square',
  'minus',
  'monitor',
  'moon',
  'more-horizontal',
  'more-vertical',
  'mouse-pointer',
  'move',
  'music',
  'navigation-2',
  'navigation',
  'octagon',
  'package',
  'paperclip',
  'pause-circle',
  'pause',
  'pen-tool',
  'percent',
  'phone-call',
  'phone-forwarded',
  'phone-incoming',
  'phone-missed',
  'phone-off',
  'phone-outgoing',
  'phone',
  'pie-chart',
  'play-circle',
  'play',
  'plus-circle',
  'plus-square',
  'plus',
  'pocket',
  'power',
  'printer',
  'radio',
  'refresh-ccw',
  'refresh-cw',
  'repeat',
  'rewind',
  'rotate-ccw',
  'rotate-cw',
  'rss',
  'save',
  'scissors',
  'search',
  'send',
  'server',
  'settings',
  'share-2',
  'share',
  'shield-off',
  'shield',
  'shopping-bag',
  'shopping-cart',
  'shuffle',
  'sidebar',
  'skip-back',
  'skip-forward',
  'slack',
  'slash',
  'sliders',
  'smartphone',
  'toggle-left',
  'toggle-right',
  'tool',
  'trash-2',
  'trash',
  'trello',
  'trending-down',
  'trending-up',
  'triangle',
  'truck',
  'tv',
  'twitch',
  'twitter',
  'type',
  'umbrella',
  'underline',
  'unlock',
  'upload-cloud',
  'upload',
  'user-check',
  'user-minus',
  'user-plus',
  'user-x',
  'user',
  'users',
  'video-off',
  'video',
  'voicemail',
  'volume-1',
  'volume-2',
  'volume-x',
  'volume',
  'watch',
  'wifi-off',
  'wifi',
  'wind',
  'x-circle',
  'x-octagon',
  'x-square',
  'x',
  'youtube',
  'zap-off',
  'zap',
  'zoom-in',
  'zoom-out',
];
