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
import React, {
  useState,
  useContext,
  useEffect,
  useRef,
  useReducer,
} from 'react';
import {View, StyleSheet, useWindowDimensions} from 'react-native';
import {
  DispatchContext,
  PropsContext,
  ToggleState,
  useLocalUid,
} from '../../agora-rn-uikit';
import LocalAudioMute from '../subComponents/LocalAudioMute';
import LocalVideoMute from '../subComponents/LocalVideoMute';
import Recording from '../subComponents/Recording';
import LocalSwitchCamera from '../subComponents/LocalSwitchCamera';
import isMobileOrTablet from '../utils/isMobileOrTablet';
import {ClientRoleType} from '../../agora-rn-uikit';
import LiveStreamControls from './livestream/views/LiveStreamControls';
import {
  BREAKPOINTS,
  isWeb,
  isWebInternal,
  CustomToolbarMerge,
  CustomToolbarSorting,
  MergeMoreButtonFields,
  CustomToolbarSort,
} from '../utils/common';
import {RoomInfoContextInterface, useRoomInfo} from './room-info/useRoomInfo';
import LocalEndcall from '../subComponents/LocalEndCall';
import LayoutIconButton from '../subComponents/LayoutIconButton';
import IconButton from '../atoms/IconButton';
import ActionMenu, {ActionMenuItem} from '../atoms/ActionMenu';
import useLayoutsData from '../pages/video-call/useLayoutsData';
import {
  ChatType,
  SidePanelType,
  useChatUIControls,
  useContent,
  useLayout,
  useRecording,
  useSidePanel,
  useSpeechToText,
} from 'customization-api';
import {useVideoCall} from './useVideoCall';
import {useScreenshare} from '../subComponents/screenshare/useScreenshare';
import LayoutIconDropdown from '../subComponents/LayoutIconDropdown';
import {useCaption} from '../../src/subComponents/caption/useCaption';
import LanguageSelectorPopup from '../../src/subComponents/caption/LanguageSelectorPopup';
import useSTTAPI from '../../src/subComponents/caption/useSTTAPI';
import {EventNames} from '../rtm-events';
import events, {PersistanceLevel} from '../rtm-events-api';
import Toast from '../../react-native-toast-message';
import {getLanguageLabel} from '../../src/subComponents/caption/utils';
import Toolbar from '../atoms/Toolbar';
import ToolbarItem, {useToolbarProps} from '../atoms/ToolbarItem';
import {
  ToolbarPresetProps,
  ToolbarItemHide,
  ToolbarItemLabel,
  ToolbarMoreButtonDefaultFields,
  ToolbarMoreButtonCustomFields,
} from '../atoms/ToolbarPreset';

import {whiteboardContext} from './whiteboard/WhiteboardConfigure';
import {RoomPhase} from 'white-web-sdk';
import {useNoiseSupression} from '../app-state/useNoiseSupression';

import {useVB} from './virtual-background/useVB';
import WhiteboardWrapper from './whiteboard/WhiteboardWrapper';
import LocalEventEmitter, {
  LocalEventsEnum,
} from '../rtm-events-api/LocalEvents';
import {useSetRoomInfo} from './room-info/useSetRoomInfo';
import {useString} from '../utils/useString';
import {
  sttSpokenLanguageToastHeading,
  sttSpokenLanguageToastSubHeading,
  toolbarItemCaptionText,
  toolbarItemChatText,
  toolbarItemInviteText,
  toolbarItemLayoutText,
  toolbarItemMoreText,
  toolbarItemNoiseCancellationText,
  toolbarItemPeopleText,
  toolbarItemRecordingText,
  toolbarItemViewRecordingText,
  toolbarItemSettingText,
  toolbarItemShareText,
  toolbarItemTranscriptText,
  toolbarItemVirtualBackgroundText,
  toolbarItemWhiteboardText,
  toolbarItemManageTextTracksText,
} from '../language/default-labels/videoCallScreenLabels';
import {LogSource, logger} from '../logger/AppBuilderLogger';
import {useModal} from '../utils/useModal';
import ViewRecordingsModal from './recordings/ViewRecordingsModal';
import {filterObject} from '../utils/index';
import {useLanguage} from '../language/useLanguage';
import RecordingDeletePopup from './recordings/RecordingDeletePopup';
import {useControlPermissionMatrix} from './controls/useControlPermissionMatrix';
import {
  InviteToolbarItem,
  ScreenshareToolbarItem,
} from './controls/toolbar-items';
import ViewTextTracksModal from './text-tracks/ViewTextTracksModal';

export const useToggleWhiteboard = () => {
  const {
    whiteboardActive,
    joinWhiteboardRoom,
    leaveWhiteboardRoom,
    getWhiteboardUid,
  } = useContext(whiteboardContext);
  const {setCustomContent} = useContent();
  const {setLayout} = useLayout();
  const {dispatch} = useContext(DispatchContext);
  return () => {
    if ($config.ENABLE_WHITEBOARD) {
      if (whiteboardActive) {
        leaveWhiteboardRoom();
        setCustomContent(getWhiteboardUid(), false);
        setLayout('grid');
        events.send(
          EventNames.WHITEBOARD_ACTIVE,
          JSON.stringify({status: false}),
          PersistanceLevel.Session,
        );
      } else {
        joinWhiteboardRoom();
        setCustomContent(getWhiteboardUid(), WhiteboardWrapper, {}, true);
        dispatch({
          type: 'UserPin',
          value: [getWhiteboardUid()],
        });
        setLayout('pinned');
        events.send(
          EventNames.WHITEBOARD_ACTIVE,
          JSON.stringify({status: true}),
          PersistanceLevel.Session,
        );
      }
    }
  };
};

export const WhiteboardListener = () => {
  const {dispatch} = useContext(DispatchContext);
  const {setCustomContent} = useContent();
  const {currentLayout, setLayout} = useLayout();
  const {
    data: {isHost},
    isWhiteBoardOn,
  } = useRoomInfo();

  React.useEffect(() => {
    if (($config.ENABLE_WAITING_ROOM && !isHost) || $config.AUTO_CONNECT_RTM) {
      if (isWhiteBoardOn) {
        WhiteboardStartedCallBack();
      } else {
        WhiteboardStoppedCallBack();
      }
    }
  }, [isWhiteBoardOn, isHost]);

  const WhiteboardCallBack = ({status}) => {
    if (status) {
      WhiteboardStartedCallBack();
    } else {
      WhiteboardStoppedCallBack();
    }
  };

  useEffect(() => {
    if (
      !$config.ENABLE_WAITING_ROOM ||
      ($config.ENABLE_WAITING_ROOM && isHost)
    ) {
      LocalEventEmitter.on(
        LocalEventsEnum.WHITEBOARD_ACTIVE_LOCAL,
        WhiteboardCallBack,
      );

      return () => {
        LocalEventEmitter.on(
          LocalEventsEnum.WHITEBOARD_ACTIVE_LOCAL,
          WhiteboardCallBack,
        );
      };
    }
  }, [isHost]);

  //whiteboard start

  const {
    whiteboardActive,
    joinWhiteboardRoom,
    leaveWhiteboardRoom,
    getWhiteboardUid,
  } = useContext(whiteboardContext);

  const WhiteboardStoppedCallBack = () => {
    toggleWhiteboard(true, false);
  };

  const WhiteboardStartedCallBack = () => {
    toggleWhiteboard(false, false);
  };

  useEffect(() => {
    whiteboardActive && currentLayout !== 'pinned' && setLayout('pinned');
  }, []);

  const toggleWhiteboard = (
    whiteboardActive: boolean,
    triggerEvent: boolean,
  ) => {
    if ($config.ENABLE_WHITEBOARD) {
      if (whiteboardActive) {
        leaveWhiteboardRoom();
        setCustomContent(getWhiteboardUid(), false);
        setLayout('grid');
        triggerEvent &&
          events.send(
            EventNames.WHITEBOARD_ACTIVE,
            JSON.stringify({status: false}),
            PersistanceLevel.Session,
          );
      } else {
        joinWhiteboardRoom();
        setCustomContent(getWhiteboardUid(), WhiteboardWrapper, {}, true);
        dispatch({
          type: 'UserPin',
          value: [getWhiteboardUid()],
        });
        setLayout('pinned');
        triggerEvent &&
          events.send(
            EventNames.WHITEBOARD_ACTIVE,
            JSON.stringify({status: true}),
            PersistanceLevel.Session,
          );
      }
    }
  };
  return null;
};

const MoreButton = (props: {fields: ToolbarMoreButtonDefaultFields}): JSX.Element => {
  //recording delete
  const [isRecordingDeletePopupVisible, setRecordingDeletePopupVisible] =
    React.useState<boolean>(false);
  const [recordingIdToDelete, setRecordingIdToDelete] = useState(0);
  //recording delete

  const {label} = useToolbarProps();
  const {data} = useRoomInfo();
  const noiseCancellationLabel = useString(toolbarItemNoiseCancellationText)();
  const whiteboardLabel = useString<boolean>(toolbarItemWhiteboardText);
  const captionLabel = useString<boolean>(toolbarItemCaptionText);
  const transcriptLabel = useString<boolean>(toolbarItemTranscriptText);
  const settingsLabel = useString(toolbarItemSettingText)();
  const screenShareButton = useString<boolean>(toolbarItemShareText);
  const recordingButton = useString<boolean>(toolbarItemRecordingText);
  const viewRecordingsLabel = useString<boolean>(
    toolbarItemViewRecordingText,
  )();
  const viewTextTracksLabel = useString<boolean>(
    toolbarItemManageTextTracksText,
  )();
  const moreButtonLabel = useString(toolbarItemMoreText)();
  const virtualBackgroundLabel = useString(toolbarItemVirtualBackgroundText)();
  const chatLabel = useString(toolbarItemChatText)();
  const inviteLabel = useString(toolbarItemInviteText)();
  const peopleLabel = useString(toolbarItemPeopleText)();
  const layoutLabel = useString(toolbarItemLayoutText)();
  const {dispatch} = useContext(DispatchContext);
  const {rtcProps} = useContext(PropsContext);
  const {setCustomContent} = useContent();
  const [_, setActionMenuVisible] = React.useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isHoveredOnModal, setIsHoveredOnModal] = useState(false);
  const {
    modalOpen: isVRModalOpen,
    setModalOpen: setVRModalOpen,
    toggle: toggleVRModal,
  } = useModal();
  const {
    modalOpen: isTextTrackModalOpen,
    setModalOpen: setTextTrackModalOpen,
    toggle: toggleTextTrackModal,
  } = useModal();
  const moreBtnRef = useRef(null);
  const {width: globalWidth, height: globalHeight} = useWindowDimensions();
  const layouts = useLayoutsData();
  const {currentLayout, setLayout} = useLayout();
  const layout = layouts.findIndex(item => item.name === currentLayout);
  const {setSidePanel, sidePanel} = useSidePanel();
  const {
    isCaptionON,
    setIsCaptionON,
    language: prevLang,
    isSTTActive,
    setIsSTTActive,
    isSTTError,
  } = useCaption();

  const isTranscriptON = sidePanel === SidePanelType.Transcript;

  const [isLanguagePopupOpen, setLanguagePopup] =
    React.useState<boolean>(false);
  const isFirstTimePopupOpen = React.useRef(false);
  const STT_clicked = React.useRef(null);

  const {start, restart} = useSTTAPI();
  const {
    data: {isHost},
  } = useRoomInfo();
  const {setShowInvitePopup, setShowStopRecordingPopup, setShowLayoutOption} =
    useVideoCall();
  const {isScreenshareActive, startScreenshare, stopScreenshare} =
    useScreenshare();
  const {isRecordingActive, startRecording, inProgress, deleteRecording} =
    useRecording();
  const {setChatType} = useChatUIControls();
  const actionMenuitems: ActionMenuItem[] = [];

  const {isNoiseSupressionEnabled, setNoiseSupression} = useNoiseSupression();

  //0. AINS
  if ($config.ENABLE_NOISE_CANCELLATION) {
    actionMenuitems.push({
      componentName: 'noise-cancellation',
      order: 0,
      toggleStatus: isNoiseSupressionEnabled === ToggleState.enabled,
      disabled:
        isNoiseSupressionEnabled === ToggleState.disabling ||
        isNoiseSupressionEnabled === ToggleState.enabling,
      isBase64Icon: true,
      //@ts-ignore
      icon: 'noise-cancellation',
      iconColor: $config.SECONDARY_ACTION_COLOR,
      textColor: $config.FONT_COLOR,
      title: noiseCancellationLabel,
      //isNoiseSupressionEnabled === ToggleState.enabled
      onPress: () => {
        setActionMenuVisible(false);
        setNoiseSupression(p => !p);
      },
    });
  }
  //AINS

  //1. virtual background
  const {isVBActive, setIsVBActive} = useVB();

  const toggleVB = () => {
    if (isVBActive) {
      setSidePanel(SidePanelType.None);
    } else {
      setSidePanel(SidePanelType.VirtualBackground);
    }
    setIsVBActive(prev => !prev);
  };
  if ($config.ENABLE_VIRTUAL_BACKGROUND && !$config.AUDIO_ROOM) {
    actionMenuitems.push({
      componentName: 'virtual-background',
      order: 1,
      isBase64Icon: true,
      //@ts-ignore
      icon: 'vb',
      iconColor: $config.SECONDARY_ACTION_COLOR,
      textColor: $config.FONT_COLOR,
      //title: `${isVBActive ? 'Hide' : 'Show'} Virtual Background`,
      title: virtualBackgroundLabel,
      onPress: () => {
        setActionMenuVisible(false);
        toggleVB();
      },
    });
  }
  //virtual background

  //whiteboard start
  const {
    whiteboardRoomState,
    whiteboardActive,
    joinWhiteboardRoom,
    leaveWhiteboardRoom,
    getWhiteboardUid,
    whiteboardStartedFirst,
  } = useContext(whiteboardContext);

  const WhiteboardStoppedCallBack = () => {
    toggleWhiteboard(true, false);
  };

  const WhiteboardStartedCallBack = () => {
    toggleWhiteboard(false, false);
  };

  useEffect(() => {
    whiteboardActive && currentLayout !== 'pinned' && setLayout('pinned');
  }, []);

  const WhiteboardCallBack = ({status}) => {
    if (status) {
      WhiteboardStartedCallBack();
    } else {
      WhiteboardStoppedCallBack();
    }
  };

  useEffect(() => {
    LocalEventEmitter.on(
      LocalEventsEnum.WHITEBOARD_ACTIVE_LOCAL,
      WhiteboardCallBack,
    );
    return () => {
      LocalEventEmitter.off(
        LocalEventsEnum.WHITEBOARD_ACTIVE_LOCAL,
        WhiteboardCallBack,
      );
    };
  }, []);

  const toggleWhiteboard = (
    whiteboardActive: boolean,
    triggerEvent: boolean,
  ) => {
    if ($config.ENABLE_WHITEBOARD) {
      if (whiteboardActive) {
        leaveWhiteboardRoom();
        setCustomContent(getWhiteboardUid(), false);
        setLayout('grid');
        triggerEvent &&
          events.send(
            EventNames.WHITEBOARD_ACTIVE,
            JSON.stringify({status: false}),
            PersistanceLevel.Session,
          );
      } else {
        joinWhiteboardRoom();
        setCustomContent(getWhiteboardUid(), WhiteboardWrapper, {}, true);
        dispatch({
          type: 'UserPin',
          value: [getWhiteboardUid()],
        });
        setLayout('pinned');
        triggerEvent &&
          events.send(
            EventNames.WHITEBOARD_ACTIVE,
            JSON.stringify({status: true}),
            PersistanceLevel.Session,
          );
      }
    }
  };
  const WhiteboardDisabled =
    !isHost ||
    whiteboardRoomState === RoomPhase.Connecting ||
    whiteboardRoomState === RoomPhase.Disconnecting;

  //Disable whiteboard button when backend sends error
  const WhiteboardError =
    data?.whiteboard?.error &&
    (data?.whiteboard?.error?.code || data?.whiteboard?.error?.message)
      ? true
      : false;

  // 2. whiteboard ends
  if (isHost && $config.ENABLE_WHITEBOARD && isWebInternal()) {
    actionMenuitems.push({
      componentName: 'whiteboard',
      order: 2,
      disabled: WhiteboardDisabled,
      isBase64Icon: true,
      //@ts-ignore
      icon: 'whiteboard-new',
      iconColor: $config.SECONDARY_ACTION_COLOR,
      textColor: $config.FONT_COLOR,
      title: whiteboardLabel(whiteboardActive),
      onPress: () => {
        if (WhiteboardError) {
          setActionMenuVisible(false);
          Toast.show({
            type: 'error',
            text1: 'Failed to enable Whiteboard Service.',
            text2: data?.whiteboard?.error?.message,
            visibilityTime: 10000,
          });
          logger.error(
            LogSource.Internals,
            'JOIN_MEETING',
            'Failed to enable Whiteboard Service',
            {
              message: data?.whiteboard?.error?.message,
              code: data?.whiteboard?.error?.code,
            },
          );
        } else {
          setActionMenuVisible(false);
          toggleWhiteboard(whiteboardActive, true);
        }
      },
    });
  }

  // 3. host can see stt options and attendee can view only when stt is enabled by a host in the channel
  if ($config.ENABLE_STT && $config.ENABLE_CAPTION) {
    actionMenuitems.push({
      componentName: 'caption',
      order: 3,
      icon: `${isCaptionON ? 'captions-off' : 'captions'}`,
      iconColor: $config.SECONDARY_ACTION_COLOR,
      textColor: $config.FONT_COLOR,
      disabled: !(
        $config.ENABLE_STT &&
        $config.ENABLE_CAPTION &&
        (isHost || (!isHost && isSTTActive))
      ),
      title: captionLabel(isCaptionON),
      onPress: () => {
        setActionMenuVisible(false);
        STT_clicked.current = !isCaptionON ? 'caption' : null;
        if (isSTTError) {
          setIsCaptionON(prev => !prev);
          return;
        }
        if (isSTTActive) {
          setIsCaptionON(prev => !prev);
          // is lang popup has been shown once for any user in meeting
        } else {
          isFirstTimePopupOpen.current = true;
          setLanguagePopup(true);
        }
      },
    });
    // 4. Meeting transcript
    if ($config.ENABLE_MEETING_TRANSCRIPT) {
      actionMenuitems.push({
        componentName: 'transcript',
        order: 4,
        icon: 'transcript',
        iconColor: $config.SECONDARY_ACTION_COLOR,
        textColor: $config.FONT_COLOR,
        disabled: !(
          $config.ENABLE_STT &&
          $config.ENABLE_CAPTION &&
          $config.ENABLE_MEETING_TRANSCRIPT &&
          (isHost || (!isHost && isSTTActive))
        ),
        title: transcriptLabel(isTranscriptON),
        onPress: () => {
          setActionMenuVisible(false);
          STT_clicked.current = !isTranscriptON ? 'transcript' : null;
          if (isSTTError) {
            !isTranscriptON
              ? setSidePanel(SidePanelType.Transcript)
              : setSidePanel(SidePanelType.None);
            return;
          }
          if (isSTTActive) {
            !isTranscriptON
              ? setSidePanel(SidePanelType.Transcript)
              : setSidePanel(SidePanelType.None);
          } else {
            isFirstTimePopupOpen.current = true;
            setLanguagePopup(true);
          }
        },
      });
    }
  }

  // 5. view recordings
  if (isHost && $config.CLOUD_RECORDING && isWeb()) {
    actionMenuitems.push({
      componentName: 'view-recordings',
      order: 5,
      icon: 'play-circle',
      iconColor: $config.SECONDARY_ACTION_COLOR,
      textColor: $config.FONT_COLOR,
      title: viewRecordingsLabel,
      onPress: () => {
        toggleVRModal();
      },
    });
  }

  // 5.5. download logs
  // Allow all users (host or attendee) to download logs
  actionMenuitems.push({
    componentName: 'download-logs',
    order: 6,
    icon: 'download',
    iconColor: $config.SECONDARY_ACTION_COLOR,
    textColor: $config.FONT_COLOR,
    title: 'Download Logs',
  onPress: async () => {
      const meetingId = data?.channel; // Use channel name as meetingId to match log sending
      // Use proxy to log server
      const downloadUrl = `/download-logs-excel${meetingId ? `?meetingId=${meetingId}` : ''}`;

      try {
        const response = await fetch(downloadUrl);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = meetingId ? `meeting-logs-${meetingId}.csv` : 'meeting-logs.csv';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      } catch (error) {
        console.error('Failed to download logs:', error);
        const errorMessage = error.message.includes('Failed to fetch') || error.message.includes('NetworkError')
          ? 'Network error - please check if the log server is running on port 5000'
          : 'Failed to download logs - please try again later';

        Toast.show({
          type: 'error',
          text1: 'Download Failed',
          text2: errorMessage,
          visibilityTime: 5000,
        });
      }
    },
  });

  // 7. Particpants
  const canAccessParticipants =
    useControlPermissionMatrix('participantControl');
  if (canAccessParticipants) {
    actionMenuitems.push({
      hide: w => {
        return w >= BREAKPOINTS.lg ? true : false;
      },
      componentName: 'participant',
      order: 7,
      icon: 'participants',
      iconColor: $config.SECONDARY_ACTION_COLOR,
      textColor: $config.FONT_COLOR,
      title: peopleLabel,
      onPress: () => {
        setActionMenuVisible(false);
        setSidePanel(SidePanelType.Participants);
      },
    });
  }

  // 8. Chat
  const canAccessChat = useControlPermissionMatrix('chatControl');
  if (canAccessChat) {
    //disable chat button when BE sends error on chat
    const ChatError =
      data?.chat?.error &&
      (data?.chat?.error?.code || data?.chat?.error?.message)
        ? true
        : false;
    actionMenuitems.push({
      hide: w => {
        return w >= BREAKPOINTS.lg ? true : false;
      },
      componentName: 'chat',
      order: 8,
      icon: 'chat-nav',
      iconColor: $config.SECONDARY_ACTION_COLOR,
      textColor: $config.FONT_COLOR,
      title: chatLabel,
      onPress: () => {
        if (ChatError) {
          setActionMenuVisible(false);
          Toast.show({
            type: 'error',
            text1: 'Failed to enable Chat Service.',
            text2: data?.chat?.error?.message,
            visibilityTime: 10000,
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
          setActionMenuVisible(false);
          setChatType(ChatType.Group);
          setSidePanel(SidePanelType.Chat);
        }
      },
    });
  }

  // 9. Screenshare
  const canAccessScreenshare = useControlPermissionMatrix('screenshareControl');
  if (canAccessScreenshare) {
    if (
      !(
        rtcProps.role == ClientRoleType.ClientRoleAudience &&
        $config.EVENT_MODE &&
        !$config.RAISE_HAND
      )
    ) {
      actionMenuitems.push({
        hide: w => {
          return w >= BREAKPOINTS.sm ? true : false;
        },
        componentName: 'screenshare',
        order: 9,
        disabled:
          rtcProps.role == ClientRoleType.ClientRoleAudience &&
          $config.EVENT_MODE &&
          $config.RAISE_HAND &&
          !isHost,
        icon: isScreenshareActive ? 'stop-screen-share' : 'screen-share',
        iconColor: isScreenshareActive
          ? $config.SEMANTIC_ERROR
          : $config.SECONDARY_ACTION_COLOR,
        textColor: isScreenshareActive
          ? $config.SEMANTIC_ERROR
          : $config.FONT_COLOR,
        title: screenShareButton(isScreenshareActive),
        onPress: () => {
          setActionMenuVisible(false);
          isScreenshareActive ? stopScreenshare() : startScreenshare();
        },
      });
    }
  }

  // 10. Recording
  if (isHost && $config.CLOUD_RECORDING) {
    actionMenuitems.push({
      hide: w => {
        return w >= BREAKPOINTS.sm ? true : false;
      },
      componentName: 'recording',
      order: 10,
      disabled: inProgress,
      icon: isRecordingActive ? 'stop-recording' : 'recording',
      iconColor: isRecordingActive
        ? $config.SEMANTIC_ERROR
        : $config.SECONDARY_ACTION_COLOR,
      textColor: isRecordingActive
        ? $config.SEMANTIC_ERROR
        : $config.FONT_COLOR,
      title: recordingButton(isRecordingActive),
      onPress: () => {
        setActionMenuVisible(false);
        if (!isRecordingActive) {
          startRecording();
        } else {
          setShowStopRecordingPopup(true);
        }
      },
    });
  }

  // 10. layout
  actionMenuitems.push({
    hide: w => {
      return w >= BREAKPOINTS.lg ? true : false;
    },
    componentName: 'layout',
    order: 10,
    //below icon key is dummy value
    icon: 'grid',
    externalIconString: layouts[layout]?.icon,
    isExternalIcon: true,
    iconColor: $config.SECONDARY_ACTION_COLOR,
    textColor: $config.FONT_COLOR,
    title: layoutLabel,
    onPress: () => {
      //setShowLayoutOption(true);
    },
    onHoverCallback: isHovered => {
      setShowLayoutOption(isHovered);
    },
    onHoverContent: (
      <LayoutIconDropdown
        onHoverPlaceHolder="vertical"
        setShowDropdown={() => {}}
        showDropdown={true}
        modalPosition={
          globalWidth <= BREAKPOINTS.lg
            ? {bottom: 65, left: -150}
            : {bottom: 20, left: -150}
        }
        caretPosition={{bottom: 45, right: -10}}
      />
    ),
  });

  // 11. Invite
  const canAccessInvite = useControlPermissionMatrix('inviteControl');
  if (canAccessInvite) {
    actionMenuitems.push({
      hide: w => {
        return w >= BREAKPOINTS.lg ? true : false;
      },
      componentName: 'invite',
      order: 11,
      icon: 'share',
      iconColor: $config.SECONDARY_ACTION_COLOR,
      textColor: $config.FONT_COLOR,
      title: inviteLabel,
      onPress: () => {
        setActionMenuVisible(false);
        setShowInvitePopup(true);
      },
    });
  }

  // 12.Settings
  const canAccessSettings = useControlPermissionMatrix('settingsControl');
  if (canAccessSettings) {
    actionMenuitems.push({
      hide: w => {
        return w >= BREAKPOINTS.lg ? true : false;
      },
      componentName: 'settings',
      order: 12,
      icon: 'settings',
      iconColor: $config.SECONDARY_ACTION_COLOR,
      textColor: $config.FONT_COLOR,
      title: settingsLabel,
      onPress: () => {
        setActionMenuVisible(false);
        setSidePanel(SidePanelType.Settings);
      },
    });
  }

  // 13. Text-tracks to download
  const canAccessAllTextTracks =
    useControlPermissionMatrix('viewAllTextTracks');

  if (canAccessAllTextTracks) {
    actionMenuitems.push({
      componentName: 'view-all-text-tracks',
      order: 13,
      icon: 'transcript',
      iconColor: $config.SECONDARY_ACTION_COLOR,
      textColor: $config.FONT_COLOR,
      title: viewTextTracksLabel,
      onPress: () => {
        toggleTextTrackModal();
      },
    });
  }

  useEffect(() => {
    if (isHovered) {
      setActionMenuVisible(true);
    } else setActionMenuVisible(false);
  }, [isHovered]);

  useEffect(() => {
    //hide action menu when user change layout
    setActionMenuVisible(false);
  }, [currentLayout]);

  const onConfirm = async (langChanged, language) => {
    const isCaptionClicked = STT_clicked.current === 'caption';
    const isTranscriptClicked = STT_clicked.current === 'transcript';
    setLanguagePopup(false);
    isFirstTimePopupOpen.current = false;
    const method = isCaptionClicked
      ? isCaptionON
      : isTranscriptON
      ? 'stop'
      : 'start';
    if (isTranscriptClicked) {
      if (!isTranscriptON) {
        setSidePanel(SidePanelType.Transcript);
      } else {
        setSidePanel(SidePanelType.None);
      }
    }
    if (method === 'stop') return; // not closing the stt service as it will stop for whole channel
    if (method === 'start' && isSTTActive === true) return; // not triggering the start service if STT Service already started by anyone else in the channel

    if (isCaptionClicked) {
      setIsCaptionON(prev => !prev);
    } else {
    }

    try {
      const res = await start(language);
      if (res?.message.includes('STARTED')) {
        // channel is already started now restart
        await restart(language);
      }
    } catch (error) {
      logger.error(LogSource.Internals, 'STT', 'error in starting stt', error);
    }
  };

  const {width, height} = useWindowDimensions();

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

  const moreButtonFields = props?.fields || {};

  const ActionMenuItems = MergeMoreButtonFields(
    actionMenuitems,
    moreButtonFields,
  )
    ?.filter(i => !isHidden(i))
    ?.sort(CustomToolbarSort);

  const onRecordingDeleteConfirmation = () => {
    setRecordingDeletePopupVisible(false);
    deleteRecording(recordingIdToDelete)
      .then(() => {
        //To inform other user -> refresh the recording list
        //in case recording list opened
        events.send(
          EventNames.RECORDING_DELETED,
          JSON.stringify({recordingId: recordingIdToDelete}),
          PersistanceLevel.None,
        );
        Toast.show({
          type: 'success',
          text1: 'Recording has been deleted successfully.',
          visibilityTime: 3000,
        });
        setRecordingIdToDelete(0);
        //to reopen recording list again
        setTimeout(() => {
          setVRModalOpen(true);
        }, 3000);
      })
      .catch(() => {
        Toast.show({
          leadingIconName: 'alert',
          type: 'error',
          text1: 'Failed to delete the recording. Please try again later',
          visibilityTime: 1000 * 10,
          primaryBtn: null,
          secondaryBtn: null,
          leadingIcon: null,
        });
        setRecordingIdToDelete(0);
      });
  };

  const onRecordingDeleteCancel = () => {
    setRecordingIdToDelete(0);
    toggleVRModal();
  };

  return (
    <>
      <LanguageSelectorPopup
        modalVisible={isLanguagePopupOpen}
        setModalVisible={setLanguagePopup}
        onConfirm={onConfirm}
        isFirstTimePopupOpen={isFirstTimePopupOpen.current}
      />
      {$config.CLOUD_RECORDING && isHost && isWeb() && (
        <>
          <RecordingDeletePopup
            modalVisible={isRecordingDeletePopupVisible}
            setModalVisible={setRecordingDeletePopupVisible}
            onConfirm={onRecordingDeleteConfirmation}
            onCancel={onRecordingDeleteCancel}
          />
          {isVRModalOpen ? (
            <ViewRecordingsModal
              setModalOpen={setVRModalOpen}
              onDeleteAction={id => {
                setRecordingIdToDelete(id);
                toggleVRModal();
                setRecordingDeletePopupVisible(true);
              }}
            />
          ) : (
            <></>
          )}
        </>
      )}
      {canAccessAllTextTracks && isTextTrackModalOpen ? (
        <ViewTextTracksModal setModalOpen={setTextTrackModalOpen} />
      ) : (
        <></>
      )}
      <ActionMenu
        containerStyle={globalWidth < 720 ? {width: 180} : {width: 260}}
        hoverMode={true}
        onHover={isVisible => setIsHoveredOnModal(isVisible)}
        from={'control-bar'}
        actionMenuVisible={isHovered || isHoveredOnModal}
        setActionMenuVisible={setActionMenuVisible}
        modalPosition={{
          bottom: 8,
          left: 0,
        }}
        items={ActionMenuItems}
      />
      <div
        onMouseEnter={() => {
          setIsHovered(true);
        }}
        onMouseLeave={() => {
          setIsHovered(false);
        }}>
        {/** placeholder to hovering */}
        <View
          style={{
            position: 'absolute',
            top: -20,
            zIndex: -1,
            height: '50%',
            width: '100%',
            backgroundColor: 'transparent',
          }}
        />
        <IconButton
          setRef={ref => {
            moreBtnRef.current = ref;
          }}
          onPress={() => {
            //setActionMenuVisible(true);
          }}
          iconProps={{
            name: 'more-menu',
            tintColor: $config.SECONDARY_ACTION_COLOR,
          }}
          btnTextProps={{
            text: $config.ICON_TEXT ? label || moreButtonLabel : '',
            textColor: $config.FONT_COLOR,
          }}
        />
      </div>
    </>
  );
};
export const LayoutToolbarItem = props => (
  <ToolbarItem testID="layout-btn" collapsable={false} toolbarProps={props}>
    {/**
     * .measure returns undefined on Android unless collapsable=false or onLayout are specified
     * so added collapsable property
     * https://github.com/facebook/react-native/issues/29712
     * */}
    <LayoutIconButton />
  </ToolbarItem>
);

export const RaiseHandToolbarItem = props => {
  const {rtcProps} = useContext(PropsContext);
  // attendee can view option if any host has started STT
  const {
    data: {isHost},
  } = useRoomInfo();
  return $config.EVENT_MODE ? (
    rtcProps.role == ClientRoleType.ClientRoleAudience ? (
      <LiveStreamControls showControls={true} customProps={props} />
    ) : rtcProps?.role == ClientRoleType.ClientRoleBroadcaster ? (
      /**
       * In event mode when raise hand feature is active
       * and audience is promoted to host, the audience can also
       * demote himself
       */
      <LiveStreamControls showControls={!isHost} customProps={props} />
    ) : (
      <></>
    )
  ) : (
    <></>
  );
};

export const LocalAudioToolbarItem = props => {
  return (
    <ToolbarItem testID="localAudio-btn" toolbarProps={props}>
      <LocalAudioMute
        showToolTip={true}
        iconBGColor={props?.iconBGColor}
        iconSize={props?.iconSize}
        containerStyle={props?.containerStyle}
      />
    </ToolbarItem>
  );
};

export const LocalVideoToolbarItem = props => {
  return (
    !$config.AUDIO_ROOM && (
      <ToolbarItem testID="localVideo-btn" toolbarProps={props}>
        <LocalVideoMute showToolTip={true} />
      </ToolbarItem>
    )
  );
};

export const SwitchCameraToolbarItem = props => {
  return (
    !$config.AUDIO_ROOM &&
    isMobileOrTablet() && (
      <ToolbarItem testID="switchCamera-btn" toolbarProps={props}>
        <LocalSwitchCamera />
      </ToolbarItem>
    )
  );
};

export const RecordingToolbarItem = props => {
  const {
    data: {isHost},
  } = useRoomInfo();
  return (
    isHost &&
    $config.CLOUD_RECORDING && (
      <ToolbarItem testID="recording-btn" toolbarProps={props}>
        <Recording />
      </ToolbarItem>
    )
  );
};

export const MoreButtonToolbarItem = (props?: {
  fields?: ToolbarMoreButtonCustomFields;
}) => {
  const {width} = useWindowDimensions();
  const {
    data: {isHost},
  } = useRoomInfo();
  const {isSTTActive} = useCaption();
  const [_, forceUpdate] = useReducer(x => x + 1, 0);

  useEffect(() => {
    forceUpdate();
  }, [isHost]);

  return width < BREAKPOINTS.lg ||
    ($config.ENABLE_STT &&
      $config.ENABLE_CAPTION &&
      (isHost || (!isHost && isSTTActive))) ||
    $config.ENABLE_NOISE_CANCELLATION ||
    (isHost && $config.CLOUD_RECORDING && isWeb()) ||
    ($config.ENABLE_VIRTUAL_BACKGROUND && !$config.AUDIO_ROOM) ||
    (isHost && $config.ENABLE_WHITEBOARD && isWebInternal()) ? (
    <ToolbarItem testID="more-btn" toolbarProps={props}>
      {((!$config.AUTO_CONNECT_RTM && !isHost) || $config.AUTO_CONNECT_RTM) &&
      $config.ENABLE_WHITEBOARD &&
      isWebInternal() ? (
        <WhiteboardListener />
      ) : (
        <></>
      )}
      <MoreButton fields={props?.fields} />
    </ToolbarItem>
  ) : (
    <WhiteboardListener />
  );
};
export interface LocalEndcallToolbarItemProps {
  customExit?: () => void;
}
export const LocalEndcallToolbarItem = (
  props?: LocalEndcallToolbarItemProps,
) => {
  return (
    <ToolbarItem
      testID={props?.customExit ? 'endCall-btn-custom' : 'endCall-btn'}
      toolbarProps={props}>
      <LocalEndcall {...props} />
    </ToolbarItem>
  );
};

export interface ControlsProps {
  items?: ToolbarPresetProps['items'];
  includeDefaultItems?: boolean;
}
const Controls = (props: ControlsProps) => {
  const {languageCode} = useLanguage();
  const {items = {}, includeDefaultItems = true} = props;
  const {width, height} = useWindowDimensions();
  const {defaultContent} = useContent();
  const {setLanguage, setMeetingTranscript, setIsSTTActive} = useCaption();
  const defaultContentRef = React.useRef(defaultContent);
  const {setRoomInfo} = useSetRoomInfo();
  const heading = useString<'Set' | 'Changed'>(sttSpokenLanguageToastHeading);
  const subheading = useString<{
    action: 'Set' | 'Changed';
    newLanguage: string;
    oldLanguage: string;
    username: string;
  }>(sttSpokenLanguageToastSubHeading);

  const {sttLanguage, isSTTActive} = useRoomInfo();
  const {addStreamMessageListener} = useSpeechToText();

  React.useEffect(() => {
    defaultContentRef.current = defaultContent;
  }, [defaultContent]);

  React.useEffect(() => {
    // for mobile events are set in ActionSheetContent
    if (!sttLanguage) return;
    const {
      username,
      prevLang,
      newLang,
      uid,
      langChanged,
    }: RoomInfoContextInterface['sttLanguage'] = sttLanguage;
    if (!langChanged) return;
    const actionText =
      prevLang.indexOf('') !== -1
        ? `has set the spoken language to  "${getLanguageLabel(newLang)}" `
        : `changed the spoken language from "${getLanguageLabel(
            prevLang,
          )}" to "${getLanguageLabel(newLang)}" `;
    // const msg = `${
    //   //@ts-ignore
    //   defaultContentRef.current[uid]?.name || username
    // } ${actionText} `;
    let subheadingObj: any = {};
    if (prevLang.indexOf('') !== -1) {
      subheadingObj = {
        username: defaultContentRef.current[uid]?.name || username,
        action: prevLang.indexOf('') !== -1 ? 'Set' : 'Changed',
        newLanguage: getLanguageLabel(newLang),
      };
    } else {
      subheadingObj = {
        username: defaultContentRef.current[uid]?.name || username,
        action: prevLang.indexOf('') !== -1 ? 'Set' : 'Changed',
        newLanguage: getLanguageLabel(newLang),
        oldLanguage: getLanguageLabel(prevLang),
      };
    }

    Toast.show({
      leadingIconName: 'lang-select',
      type: 'info',
      text1: heading(prevLang.indexOf('') !== -1 ? 'Set' : 'Changed'),
      visibilityTime: 3000,
      primaryBtn: null,
      secondaryBtn: null,
      text2: subheading(subheadingObj),
    });
    setRoomInfo(prev => {
      return {
        ...prev,
        sttLanguage: {...sttLanguage, langChanged: false},
      };
    });
    // syncing local set language
    newLang && setLanguage(newLang);
    // add spoken lang msg to transcript
    setMeetingTranscript(prev => {
      return [
        ...prev,
        {
          name: 'langUpdate',
          time: new Date().getTime(),
          uid: `langUpdate-${uid}`,
          text: actionText,
        },
      ];
    });
    // start listening to stream Message callback
    addStreamMessageListener();
  }, [sttLanguage]);

  React.useEffect(() => {
    setIsSTTActive(isSTTActive);
  }, [isSTTActive]);

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

  const canAccessInvite = useControlPermissionMatrix('inviteControl');
  const canAccessScreenshare = useControlPermissionMatrix('screenshareControl');

  const defaultItems: ToolbarPresetProps['items'] = React.useMemo(() => {
    return {
      layout: {
        align: 'start',
        component: LayoutToolbarItem,
        order: 0,
        hide: w => {
          return w < BREAKPOINTS.lg ? true : false;
        },
      },
      invite: {
        align: 'start',
        component: canAccessInvite ? InviteToolbarItem : null,
        order: 1,
        hide: w => {
          return w < BREAKPOINTS.lg ? true : false;
        },
      },
      'raise-hand': {
        align: 'center',
        component: RaiseHandToolbarItem,
        order: 0,
      },
      'local-audio': {
        align: 'center',
        component: LocalAudioToolbarItem,
        order: 1,
      },
      'local-video': {
        align: 'center',
        component: LocalVideoToolbarItem,
        order: 2,
      },
      'switch-camera': {
        align: 'center',
        component: SwitchCameraToolbarItem,
        order: 3,
      },
      screenshare: {
        align: 'center',
        component: canAccessScreenshare ? ScreenshareToolbarItem : null,
        order: 4,
        hide: w => {
          return w < BREAKPOINTS.sm ? true : false;
        },
      },
      recording: {
        align: 'center',
        component: RecordingToolbarItem,
        order: 5,
        hide: w => {
          return w < BREAKPOINTS.sm ? true : false;
        },
      },
      more: {
        align: 'center',
        component: MoreButtonToolbarItem,
        order: 6,
      },
      'end-call': {
        align: 'center',
        component: LocalEndcallToolbarItem,
        order: 7,
      },
    };
  }, [canAccessInvite, canAccessScreenshare]);

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
      let fieldsProps = null;
      if (type === 'start') {
        ToolbarComponent = startItems[keyName]?.component;
        label = startItems[keyName]?.label;
        onPress = startItems[keyName]?.onPress;
        if (keyName === 'more') {
          fieldsProps = startItems[keyName]?.fields;
        }
      } else if (type === 'center') {
        ToolbarComponent = centerItems[keyName]?.component;
        label = centerItems[keyName]?.label;
        onPress = centerItems[keyName]?.onPress;
        if (keyName === 'more') {
          fieldsProps = centerItems[keyName]?.fields;
        }
      } else {
        ToolbarComponent = endItems[keyName]?.component;
        label = endItems[keyName]?.label;
        onPress = endItems[keyName]?.onPress;
        if (keyName === 'more') {
          fieldsProps = endItems[keyName]?.fields;
        }
      }
      if (ToolbarComponent) {
        renderContentItem.push(
          <ToolbarComponent
            key={`top-toolbar-${type}` + index}
            fields={fieldsProps}
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
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  secondaryBtn: {marginLeft: 16, height: 40, paddingVertical: 5},
  primaryBtn: {
    maxWidth: 109,
    minWidth: 109,
    height: 40,
    borderRadius: 4,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  primaryBtnText: {
    fontWeight: '600',
    fontSize: 16,
    paddingLeft: 0,
  },
});

export default Controls;
