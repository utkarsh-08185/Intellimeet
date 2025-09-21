/*
********************************************
 Copyright © 2021 Agora Lab, Inc., all rights reserved.
 AppBuilder and all associated components, source code, APIs, services, and documentation 
 (the “Materials”) are owned by Agora Lab, Inc. and its licensors. The Materials may not be 
 accessed, used, modified, or distributed for any purpose without a license from Agora Lab, Inc.  
 Use without a license or in violation of any license terms and conditions (including use for 
 any purpose competitive to Agora Lab, Inc.’s business) is strictly prohibited. For more 
 information visit https://appbuilder.agora.io. 
*********************************************
*/
import React, {useContext, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextStyle,
  useWindowDimensions,
} from 'react-native';
import Settings, {
  SettingsWithViewWrapper,
  SettingsIconButtonProps,
} from './Settings';
import {SidePanelType} from '../subComponents/SidePanelEnum';
import ChatContext from '../components/ChatContext';
import isMobileOrTablet from '../utils/isMobileOrTablet';
import LiveStreamContext from './livestream';
import {filterObject, numFormatter} from '../utils/index';
import {useChatNotification} from '../components/chat-notification/useChatNotification';
import {
  BREAKPOINTS,
  CustomToolbarMerge,
  CustomToolbarSorting,
  isIOS,
  isWebInternal,
  trimText,
} from '../utils/common';
import {useRecording} from '../subComponents/recording/useRecording';
import {useString} from '../utils/useString';
import {useRoomInfo} from './room-info/useRoomInfo';
import {useSidePanel} from '../utils/useSidePanel';
import {ChatType, useChatUIControls} from './chat-ui/useChatUIControls';
import IconButton, {IconButtonProps} from '../atoms/IconButton';
import ThemeConfig from '../theme';
import ParticipantsCount from '../atoms/ParticipantsCount';
import RecordingInfo from '../atoms/RecordingInfo';
import Toolbar from '../atoms/Toolbar';
import ToolbarItem, {useToolbarProps} from '../atoms/ToolbarItem';
import {
  ToolbarItemHide,
  ToolbarItemLabel,
  TopToolbarItemsConfig,
  ToolbarPresetProps,
} from '../atoms/ToolbarPreset';
import {useToolbarMenu} from '../utils/useMenu';
import ToolbarMenuItem from '../atoms/ToolbarMenuItem';
import {useActionSheet} from '../utils/useActionSheet';
import {useWaitingRoomContext} from './contexts/WaitingRoomContext';
import {
  toolbarItemChatText,
  toolbarItemPeopleText,
  videoRoomRecordingText,
} from '../language/default-labels/videoCallScreenLabels';
import {useLanguage} from '../language/useLanguage';
import Toast from '../../react-native-toast-message';
import {logger, LogSource} from '../logger/AppBuilderLogger';
import {
  ChatToolbarItem,
  ParticipantToolbarItem,
  SettingsToolbarItem,
} from './controls/toolbar-items';
import {useControlPermissionMatrix} from './controls/useControlPermissionMatrix';

export const ParticipantsCountView = ({
  isMobileView = false,
}: {
  isMobileView?: boolean;
}) => {
  const {onlineUsersCount} = useContext(ChatContext);
  const peopleLabel = useString(toolbarItemPeopleText)();
  return isMobileView ? (
    <Text>
      {peopleLabel} {'\n'} ({numFormatter(onlineUsersCount)})
    </Text>
  ) : (
    <>
      {onlineUsersCount !== 0 && (
        <View style={[{justifyContent: 'center'}]}>
          <View style={style.chip}>
            {onlineUsersCount > 0 && (
              <Text style={style.chipText}>
                {numFormatter(onlineUsersCount)}
              </Text>
            )}
          </View>
        </View>
      )}
    </>
  );
};

export interface ParticipantsIconButtonProps {
  liveStreamingRequestAlertIconPosition?: {
    top?: number;
    right?: number;
    left?: number;
    bottom?: number;
  };
  render?: (onPress: () => void, isPanelActive: boolean) => JSX.Element;
}
export const ParticipantsIconButton = (props: ParticipantsIconButtonProps) => {
  const {label = null, onPress: onPressCustom = null} = useToolbarProps();
  const {isToolbarMenuItem} = useToolbarMenu();
  const {
    liveStreamingRequestAlertIconPosition = {
      top: 0,
      right: 0,
      left: undefined,
      bottom: undefined,
    },
  } = props;
  const {isOnActionSheet, showLabel} = useActionSheet();
  const {sidePanel, setSidePanel} = useSidePanel();
  const {isPendingRequestToReview} = useContext(LiveStreamContext);

  const {waitingRoomUids} = useWaitingRoomContext();
  const participantsLabel = useString(toolbarItemPeopleText)();
  const isPanelActive = sidePanel === SidePanelType.Participants;
  const {
    data: {isHost},
  } = useRoomInfo();

  const isPendingWaitingRoomApproval = isHost && waitingRoomUids.length > 0;

  const onPress = () => {
    isPanelActive
      ? setSidePanel(SidePanelType.None)
      : setSidePanel(SidePanelType.Participants);
    // $config.EVENT_MODE && $config.RAISE_HAND;
    //setLastCheckedRequestTimestamp(new Date().getTime());
  };
  let iconButtonProps: IconButtonProps = {
    onPress: onPressCustom || onPress,
    iconProps: {
      name: 'participants',
      tintColor: isPanelActive
        ? $config.PRIMARY_ACTION_TEXT_COLOR
        : $config.SECONDARY_ACTION_COLOR,
      iconBackgroundColor: isPanelActive
        ? $config.PRIMARY_ACTION_BRAND_COLOR
        : '',
    },
    btnTextProps: {
      text: showLabel ? label || participantsLabel : '',
      textColor: $config.FONT_COLOR,
    },
  };
  if (isOnActionSheet) {
    // iconButtonProps.containerStyle = {
    //   backgroundColor: $config.CARD_LAYER_2_COLOR,
    //   width: 52,
    //   height: 52,
    //   borderRadius: 26,
    //   justifyContent: 'center',
    //   alignItems: 'center',
    // };
    iconButtonProps.btnTextProps.textStyle = {
      color: $config.FONT_COLOR,
      marginTop: 8,
      fontSize: 12,
      fontWeight: '400',
      fontFamily: 'Source Sans Pro',
      textAlign: 'center',
    };
  }
  iconButtonProps.isOnActionSheet = isOnActionSheet;

  return props?.render ? (
    props.render(onPress, isPanelActive)
  ) : (
    <>
      {isToolbarMenuItem ? (
        <ToolbarMenuItem {...iconButtonProps} />
      ) : (
        <>
          <View>
            <IconButton {...iconButtonProps} />
          </View>
          {isPendingWaitingRoomApproval ||
          ($config.EVENT_MODE &&
            $config.RAISE_HAND &&
            isPendingRequestToReview) ? (
            <View
              style={{
                position: 'absolute',
                top: liveStreamingRequestAlertIconPosition.top,
                bottom: liveStreamingRequestAlertIconPosition.bottom,
                right: liveStreamingRequestAlertIconPosition.right,
                left: liveStreamingRequestAlertIconPosition.left,
                backgroundColor: $config.SEMANTIC_ERROR,
                width: 12,
                height: 12,
                borderRadius: 10,
              }}></View>
          ) : (
            <></>
          )}
        </>
      )}
    </>
  );
};

export interface ChatIconButtonProps {
  badgeContainerPosition?: {
    top?: number;
    right?: number;
    left?: number;
    bottom?: number;
  };
  badgeTextStyle?: TextStyle;
  render?: (
    onPress: () => void,
    isPanelActive: boolean,
    totalUnreadCount: number,
  ) => JSX.Element;
  isMobileView?: boolean;
}

export const ChatIconButton = (props: ChatIconButtonProps) => {
  const {label = null, onPress: onPressCustom = null} = useToolbarProps();
  const {sidePanel, setSidePanel} = useSidePanel();
  const {isToolbarMenuItem} = useToolbarMenu();
  const {data} = useRoomInfo();
  //disable chat button when BE sends error on chat
  const ChatError =
    data?.chat?.error && (data?.chat?.error?.code || data?.chat?.error?.message)
      ? true
      : false;
  const {
    badgeContainerPosition = {
      top: 0,
      right: 0,
      left: undefined,
      bottom: undefined,
      zIndex: 999,
    },
  } = props;
  const {totalUnreadCount} = useChatNotification();
  const {setChatType, setPrivateChatUser} = useChatUIControls();

  const chatLabel = useString(toolbarItemChatText)();

  const isPanelActive = sidePanel === SidePanelType.Chat;

  //when chat panel is close then we need to show the toast notification. for that
  //we are resetting flag which used when chat panel is active
  useEffect(() => {
    if (sidePanel !== SidePanelType.Chat) {
      setChatType(ChatType.Group);
      setPrivateChatUser(0);
    }
  }, [sidePanel]);

  const onPress = () => {
    if (ChatError) {
      Toast.show({
        leadingIconName: 'alert',
        type: 'error',
        text1: 'Failed to enable Chat Service.',
        text2: data?.chat?.error?.message,
        visibilityTime: 1000 * 10,
        primaryBtn: null,
        secondaryBtn: null,
        leadingIcon: null,
      });
      logger.error(
        LogSource.Internals,
        'JOIN_MEETING',
        'Failed to enable Chat Service',
        {
          message: data?.chat?.error?.message,
          code: data?.chat?.error?.code,
        },
      );
    } else {
      if (isPanelActive) {
        setSidePanel(SidePanelType.None);
        setChatType(ChatType.Group);
        setPrivateChatUser(0);
      } else {
        //move this logic into ChatContainer
        //setUnreadGroupMessageCount(0);
        setChatType(ChatType.Group);
        setSidePanel(SidePanelType.Chat);
      }
    }
  };
  const {isOnActionSheet, showLabel} = useActionSheet();
  let iconButtonProps: IconButtonProps = {
    onPress: onPressCustom || onPress,
    iconProps: {
      name: 'chat-nav',
      tintColor: isPanelActive
        ? $config.PRIMARY_ACTION_TEXT_COLOR
        : $config.SECONDARY_ACTION_COLOR,
      iconBackgroundColor: isPanelActive
        ? $config.PRIMARY_ACTION_BRAND_COLOR
        : '',
    },
    btnTextProps: {
      text: showLabel ? label || chatLabel : '',
      textColor: $config.FONT_COLOR,
    },
  };

  if (isOnActionSheet) {
    iconButtonProps.btnTextProps.textStyle = {
      color: $config.FONT_COLOR,
      marginTop: 8,
      fontSize: 12,
      fontWeight: '400',
      fontFamily: 'Source Sans Pro',
      textAlign: 'center',
    };
  }
  iconButtonProps.isOnActionSheet = isOnActionSheet;

  const renderUnreadMessageIndicator = () => {
    return (
      <View
        style={{
          position: 'absolute',
          top: badgeContainerPosition?.top,
          bottom: badgeContainerPosition?.bottom,
          left: badgeContainerPosition?.left,
          right: badgeContainerPosition?.right,
          borderRadius: 10,
          width: 12,
          height: 12,
          backgroundColor: $config.SEMANTIC_ERROR,
        }}
      />
    );
  };
  return props?.render ? (
    props.render(onPress, isPanelActive, totalUnreadCount)
  ) : (
    <>
      <View>
        {isToolbarMenuItem ? (
          <ToolbarMenuItem {...iconButtonProps} />
        ) : (
          <>
            <IconButton {...iconButtonProps} />
            {totalUnreadCount !== 0 && renderUnreadMessageIndicator()}
          </>
        )}
      </View>
    </>
  );
};

export const SettingsIconButton = (props: SettingsIconButtonProps) => {
  return <Settings {...props} />;
};
export const SettingsIconButtonWithWrapper = (
  props: SettingsIconButtonProps,
) => {
  return <SettingsWithViewWrapper {...props} />;
};

export const MeetingTitleToolbarItem = () => {
  const {
    data: {meetingTitle},
  } = useRoomInfo();
  return (
    <ToolbarItem>
      <Text
        style={style.roomNameText}
        testID="videocall-meetingName"
        numberOfLines={1}
        ellipsizeMode="tail">
        {trimText(meetingTitle)}
      </Text>
    </ToolbarItem>
  );
};
export const ParticipantCountToolbarItem = () => {
  return (
    <ToolbarItem>
      <View>
        <View
          style={{
            width: 45,
            height: 35,
            justifyContent: 'center',
            alignItems: 'center',
            alignSelf: 'center',
            zIndex: isWebInternal() ? 3 : 0,
          }}>
          <ParticipantsCount />
        </View>
      </View>
    </ToolbarItem>
  );
};
export const RecordingStatusToolbarItem = () => {
  const recordingLabel = useString(videoRoomRecordingText)(
    $config.RECORDING_MODE,
  );
  const {isRecordingActive} = useRecording();
  return isRecordingActive ? (
    <ToolbarItem>
      <View
        style={{
          width: 45,
          height: 35,
          justifyContent: 'center',
          alignItems: 'center',
          alignSelf: 'center',
          zIndex: isWebInternal() ? 3 : 0,
        }}>
        <RecordingInfo recordingLabel={recordingLabel} />
      </View>
    </ToolbarItem>
  ) : (
    <></>
  );
};

export interface NavbarProps {
  items?: ToolbarPresetProps['items'];
  includeDefaultItems?: boolean;
}

const Navbar = (props: NavbarProps) => {
  const {includeDefaultItems = true, items = {}} = props;
  const {width, height} = useWindowDimensions();
  const {languageCode} = useLanguage();
  const canAccessParticipants =
    useControlPermissionMatrix('participantControl');
  const canAccessChat = useControlPermissionMatrix('chatControl');
  const canAccessSettings = useControlPermissionMatrix('settingsControl');

  const defaultItems: TopToolbarItemsConfig = React.useMemo(() => {
    return {
      'meeting-title': {
        align: 'start',
        component: MeetingTitleToolbarItem,
        order: 0,
      },
      'participant-count': {
        align: 'start',
        component: ParticipantCountToolbarItem,
        order: 1,
      },
      'recording-status': {
        align: 'start',
        component: RecordingStatusToolbarItem,
        order: 2,
      },
      participant: {
        align: 'end',
        component: canAccessParticipants ? ParticipantToolbarItem : null,
        order: 0,
        hide: w => {
          return w < BREAKPOINTS.lg ? true : false;
        },
      },
      chat: {
        align: 'end',
        component: canAccessChat ? ChatToolbarItem : null,
        order: 1,
        hide: w => {
          return w < BREAKPOINTS.lg ? true : false;
        },
      },
      settings: {
        align: 'end',
        component: canAccessSettings ? SettingsToolbarItem : null,
        order: 2,
        hide: w => {
          return w < BREAKPOINTS.lg ? true : false;
        },
      },
    };
  }, [canAccessParticipants, canAccessChat, canAccessSettings]);

  const isHidden = (hide: ToolbarItemHide = false) => {
    try {
      return typeof hide === 'boolean'
        ? hide
        : typeof hide === 'function'
        ? hide(width, height)
        : false;
    } catch (error) {
      console.log('debugging isHidden error', error);
      return false;
    }
  };

  const mergedItems = CustomToolbarMerge(
    includeDefaultItems ? defaultItems : {},
    items,
  );

  const startItems = filterObject(
    mergedItems,
    ([_, v]) => v?.align === 'start' && !isHidden(v?.hide),
  );
  const centerItems = filterObject(
    mergedItems,
    ([_, v]) => v?.align === 'center' && !isHidden(v?.hide),
  );
  const endItems = filterObject(
    mergedItems,
    ([_, v]) => v?.align === 'end' && !isHidden(v?.hide),
  );

  const startItemsOrdered = CustomToolbarSorting(startItems);
  const centerItemsOrdered = CustomToolbarSorting(centerItems);
  const endItemsOrdered = CustomToolbarSorting(endItems);

  const customLabel = (labelParam: ToolbarItemLabel) => {
    if (labelParam && typeof labelParam === 'string') {
      return labelParam;
    } else if (labelParam && typeof labelParam === 'function') {
      return labelParam(languageCode);
    } else {
      return null;
    }
  };

  const renderContent = (
    orderedKeys: string[],
    type: 'start' | 'center' | 'end',
  ) => {
    const renderContentItem = [];
    let index = 0;
    orderedKeys.forEach(keyName => {
      index = index + 1;
      let ToolbarComponent = null;
      let label = null;
      let onPress = null;
      if (type === 'start') {
        ToolbarComponent = startItems[keyName]?.component;
        label = startItems[keyName]?.label;
        onPress = startItems[keyName]?.onPress;
      } else if (type === 'center') {
        ToolbarComponent = centerItems[keyName]?.component;
        label = centerItems[keyName]?.label;
        onPress = centerItems[keyName]?.onPress;
      } else {
        ToolbarComponent = endItems[keyName]?.component;
        label = endItems[keyName]?.label;
        onPress = endItems[keyName]?.onPress;
      }
      if (ToolbarComponent) {
        renderContentItem.push(
          <ToolbarComponent
            key={`top-toolbar-${type}` + index}
            label={customLabel(label)}
            onPress={onPress}
          />,
        );
      }
    });

    return renderContentItem;
  };

  return (
    <Toolbar>
      <View style={style.startContent}>
        {renderContent(startItemsOrdered, 'start')}
      </View>
      <View style={style.centerContent}>
        {renderContent(centerItemsOrdered, 'center')}
      </View>
      <View style={style.endContent}>
        {renderContent(endItemsOrdered, 'end')}
      </View>
    </Toolbar>
  );
};

const style = StyleSheet.create({
  startContent: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  centerContent: {
    zIndex: 2,
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  endContent: {
    flex: 1,
    zIndex: 9,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  participantCountView: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: $config.ICON_BG_COLOR,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: $config.CARD_LAYER_3_COLOR,
    shadowColor: $config.HARD_CODED_BLACK_COLOR,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.1,
    shadowRadius: 20,
  },
  btnHolder: {
    marginHorizontal: isMobileOrTablet() ? 2 : 0,
    width: '100%',
    height: '100%',
    resizeMode: 'contain',
  },
  btnHolderCustom: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain',
  },
  roomNameContainer: {
    zIndex: 10,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },

  roomNameText: {
    alignSelf: 'center',
    fontSize: ThemeConfig.FontSize.normal,
    color: $config.FONT_COLOR,
    fontWeight: '600',
    fontFamily: ThemeConfig.FontFamily.sansPro,
  },
  chip: {
    backgroundColor: $config.PRIMARY_ACTION_BRAND_COLOR,
    borderRadius: 2.5,
    paddingHorizontal: 5,
    marginLeft: 5,
    marginRight: 0,
    paddingVertical: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontFamily: isIOS() ? 'Helvetica' : 'sans-serif',
    fontSize: 12,
    color: $config.SECONDARY_ACTION_COLOR,
  },
  navSmItem: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: '15%',
  },
  dropdownIconContainer: {
    flex: 1,
    paddingHorizontal: 5,
  },
  separaterContainer: {
    flex: 0.5,
    paddingHorizontal: 5,
  },
  dropdownContainer: {
    position: 'absolute',
    marginTop: 5,
    width: 40,
    height: 90,
    backgroundColor: 'white',
    borderRadius: 10,
    paddingVertical: 10,
  },
});

export default Navbar;
