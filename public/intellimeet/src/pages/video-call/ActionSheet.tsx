import {StyleSheet, Text, View, TouchableWithoutFeedback} from 'react-native';
import React, {
  useRef,
  useCallback,
  useLayoutEffect,
  useEffect,
  useState,
} from 'react';
import {BottomSheet, BottomSheetRef} from 'react-spring-bottom-sheet';
import './ActionSheetStyles.css';
import ActionSheetContent from './ActionSheetContent';
import {SpringEvent} from 'react-spring-bottom-sheet/dist/types';
import Chat from '../../components/Chat';
import ParticipantView from '../../components/ParticipantsView';
import SettingsView from '../../components/SettingsView';

import {SidePanelType} from '../../subComponents/SidePanelEnum';
import {useSidePanel} from '../../utils/useSidePanel';
import ToastComponent from '../../components/ToastComponent';
import {isMobileUA} from '../../utils/common';
import {useToast} from '../../components/useToast';
import ActionSheetHandle from './ActionSheetHandle';
import Spacer from '../../atoms/Spacer';
import Transcript from '../../subComponents/caption/Transcript';
import {ToolbarProvider} from '../../utils/useToolbar';
import {ActionSheetProvider} from '../../utils/useActionSheet';
import {useOrientation} from '../../utils/useOrientation';
import {useCustomization} from 'customization-implementation';
import CustomSidePanelView from '../../components/CustomSidePanel';
import {useControlPermissionMatrix} from '../../components/controls/useControlPermissionMatrix';

const ActionSheet = props => {
  const [showCustomSidePanel, setShowCustomSidePanel] = useState(false);
  const [customSidePanelIndex, setCustomSidePanelIndex] = useState<
    undefined | number
  >(undefined);
  const sidePanelArray = useCustomization(data => {
    if (
      data?.components &&
      data?.components?.videoCall &&
      typeof data?.components?.videoCall === 'object'
    ) {
      if (
        data?.components?.videoCall?.customSidePanel &&
        typeof data?.components?.videoCall?.customSidePanel === 'function'
      ) {
        return data?.components?.videoCall?.customSidePanel();
      }
    }
  });
  const {snapPointsMinMax = [100, 400], hideDefaultActionSheet = false} = props;
  const {setActionSheetVisible} = useToast();
  const [isExpanded, setIsExpanded] = React.useState(false);
  const [isChatOpen, setIsChatOpen] = React.useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);
  const [isParticipantsOpen, setIsParticipantsOpen] = React.useState(false);
  const [isTranscriptOpen, setIsTranscriptOpen] = React.useState(false);
  const bottomSheetRef = useRef<BottomSheetRef>(null);
  const chatSheetRef = useRef<BottomSheetRef>(null);
  const participantsSheetRef = useRef<BottomSheetRef>(null);
  const settingsSheetRef = useRef<BottomSheetRef>(null);
  const customActionSheetRef = useRef<BottomSheetRef>(null);
  const transcriptSheetRef = useRef<BottomSheetRef>(null);
  const ToastComponentRender =
    isMobileUA() &&
    (isChatOpen ||
      isSettingsOpen ||
      isParticipantsOpen ||
      isTranscriptOpen ||
      showCustomSidePanel) ? (
      <ToastComponent />
    ) : (
      <></>
    );
  const {sidePanel, setSidePanel} = useSidePanel();
  const [showOverlay, setShowOverlay] = React.useState(false);
  const handleSheetChanges = useCallback((index: number) => {
    bottomSheetRef?.current?.snapTo(({snapPoints}) => snapPoints[index]);
    index === 0 ? setIsExpanded(false) : setIsExpanded(true);
  }, []);

  const root = document.documentElement;

  useEffect(() => {
    root.style.setProperty('--sheet-background', $config.CARD_LAYER_1_COLOR);
    root.style.setProperty('--handle-background', $config.SEMANTIC_NEUTRAL);
  }, []);

  useEffect(() => {
    if (
      isChatOpen ||
      isSettingsOpen ||
      isParticipantsOpen ||
      isTranscriptOpen ||
      showCustomSidePanel
    ) {
      setActionSheetVisible(true);
    } else {
      setActionSheetVisible(false);
    }
  }, [
    isChatOpen,
    isSettingsOpen,
    isParticipantsOpen,
    isTranscriptOpen,
    showCustomSidePanel,
    setActionSheetVisible,
  ]);

  // updating on sidepanel changes
  useEffect(() => {
    const selectedIndex = sidePanelArray?.findIndex(item => {
      if (item?.name === sidePanel && item?.component) {
        return true;
      } else {
        return false;
      }
    });
    if (selectedIndex < 0 || selectedIndex === undefined) {
      setShowCustomSidePanel(false);
      setCustomSidePanelIndex(undefined);
      switch (sidePanel) {
        case SidePanelType.Participants: {
          setIsParticipantsOpen(true);
          break;
        }
        case SidePanelType.Chat: {
          setIsChatOpen(true);
          break;
        }
        case SidePanelType.Settings: {
          setIsSettingsOpen(true);
          break;
        }
        case SidePanelType.Transcript: {
          setIsTranscriptOpen(true);
          break;
        }
        case SidePanelType.None: {
          setIsChatOpen(false);
          setIsParticipantsOpen(false);
          setIsSettingsOpen(false);
          setIsTranscriptOpen(false);
          handleSheetChanges(0);
        }
        default:
      }
    } else {
      setShowCustomSidePanel(true);
      setCustomSidePanelIndex(selectedIndex);
    }
  }, [sidePanel]);

  function onDismiss() {
    setSidePanel(SidePanelType.None);
  }

  const handleSpringStart = (event: SpringEvent) => {
    if (event.type == 'SNAP') {
      setShowOverlay(true); // as soon drag start show overlay
    }
  };
  const handleSpringEnd = (event: SpringEvent) => {
    if (event.type == 'SNAP') {
      const isMinmized =
        bottomSheetRef?.current?.height === 100 ||
        ($config.ENABLE_CONVERSATIONAL_AI &&
          bottomSheetRef?.current?.height === 0);
      isMinmized && setShowOverlay(false);
      if (event.source === 'dragging') {
        if (isMinmized) {
          setIsExpanded(false);
        } else {
          setIsExpanded(true);
        }
      }
    }
  };

  const updateActionSheet = (
    screenName: 'chat' | 'participants' | 'settings',
  ) => {
    switch (screenName) {
      case 'chat':
        setIsChatOpen(true);
        break;
      case 'participants':
        setIsParticipantsOpen(true);
        break;
      case 'settings':
        console.warn('settings selected');
        setIsSettingsOpen(true);
        break;
      default:
    }
  };

  const canAccessChat = useControlPermissionMatrix('chatControl');
  const canAccessParticipants =
    useControlPermissionMatrix('participantControl');
  const canAccessSettings = useControlPermissionMatrix('settingsControl');

  return (
    <>
      {showOverlay && (
        <TouchableWithoutFeedback
          onPress={() => {
            handleSheetChanges(0);
          }}>
          <View style={[styles.backDrop]} />
        </TouchableWithoutFeedback>
      )}
      <View>
        {/* Controls Action Sheet */}

        {!hideDefaultActionSheet ? (
          <BottomSheet
            scrollLocking={false}
            ref={bottomSheetRef}
            open={true}
            onSpringStart={handleSpringStart}
            onSpringEnd={handleSpringEnd}
            // skipInitialTransition={true}
            expandOnContentDrag={true}
            snapPoints={({maxHeight}) => snapPointsMinMax}
            defaultSnap={({lastSnap, snapPoints}) =>
              lastSnap ?? Math.min(...snapPoints)
            }
            header={
              <>
                <ActionSheetHandle sidePanel={SidePanelType.None} />
                <Spacer size={12} />
              </>
            }
            blocking={false}>
            <ActionSheetContent
              handleSheetChanges={handleSheetChanges}
              isExpanded={isExpanded}
              native={false}
              {...props}
            />
          </BottomSheet>
        ) : (
          <></>
        )}
        {/* Chat  Action Sheet */}
        {canAccessChat && (
          <BottomSheet
            sibling={ToastComponentRender}
            ref={chatSheetRef}
            onDismiss={onDismiss}
            scrollLocking={false}
            open={isChatOpen}
            blocking={false}
            expandOnContentDrag={false}
            snapPoints={({maxHeight}) => [1 * maxHeight]}
            header={<ActionSheetHandle sidePanel={SidePanelType.Chat} />}
            defaultSnap={({lastSnap, snapPoints}) => snapPoints[0]}>
            <Chat showHeader={false} />
          </BottomSheet>
        )}

        {/* Participants Action Sheet */}
        {/** Toolbar and actionsheet wrapper added to hide the local mute button label*/}
        {canAccessParticipants && (
          <ToolbarProvider value={{position: undefined}}>
            <ActionSheetProvider>
              <BottomSheet
                sibling={ToastComponentRender}
                ref={participantsSheetRef}
                onDismiss={onDismiss}
                open={isParticipantsOpen}
                expandOnContentDrag={false}
                snapPoints={({maxHeight}) => [1 * maxHeight]}
                defaultSnap={({lastSnap, snapPoints}) => snapPoints[0]}
                scrollLocking={false}
                header={
                  <ActionSheetHandle sidePanel={SidePanelType.Participants} />
                }
                blocking={false}>
                <ParticipantView showHeader={false} />
              </BottomSheet>
            </ActionSheetProvider>
          </ToolbarProvider>
        )}
        {/* Settings  Action Sheet */}
        {canAccessSettings && (
          <BottomSheet
            sibling={ToastComponentRender}
            ref={settingsSheetRef}
            onDismiss={onDismiss}
            open={isSettingsOpen}
            expandOnContentDrag={false}
            snapPoints={({maxHeight}) => [1 * maxHeight]}
            defaultSnap={({lastSnap, snapPoints}) => snapPoints[0]}
            header={<ActionSheetHandle sidePanel={SidePanelType.Settings} />}
            blocking={false}>
            <SettingsView showHeader={false} />
          </BottomSheet>
        )}
        {/* Transcript  Action Sheet */}
        <BottomSheet
          sibling={ToastComponentRender}
          ref={transcriptSheetRef}
          onDismiss={onDismiss}
          open={isTranscriptOpen}
          expandOnContentDrag={false}
          snapPoints={({maxHeight}) => [1 * maxHeight]}
          defaultSnap={({lastSnap, snapPoints}) => snapPoints[0]}
          header={<ActionSheetHandle sidePanel={SidePanelType.Transcript} />}
          scrollLocking={false}
          blocking={false}>
          <Transcript showHeader={false} />
        </BottomSheet>
        {showCustomSidePanel && customSidePanelIndex !== undefined ? (
          <BottomSheet
            sibling={ToastComponentRender}
            ref={customActionSheetRef}
            onDismiss={onDismiss}
            open={showCustomSidePanel}
            expandOnContentDrag={false}
            snapPoints={({maxHeight}) => [1 * maxHeight]}
            defaultSnap={({lastSnap, snapPoints}) => snapPoints[0]}
            header={
              <ActionSheetHandle
                isCustomSidePanel={true}
                customSidePanelProps={{
                  title: sidePanelArray[customSidePanelIndex]?.title,
                  onClose: sidePanelArray[customSidePanelIndex]?.onClose,
                  name: sidePanelArray[customSidePanelIndex]?.name,
                }}
              />
            }
            blocking={false}
            scrollLocking={false}>
            <CustomSidePanelView
              showHeader={false}
              content={sidePanelArray[customSidePanelIndex]?.component}
              name={sidePanelArray[customSidePanelIndex]?.name}
            />
          </BottomSheet>
        ) : (
          <></>
        )}
      </View>
    </>
  );
};

export default ActionSheet;

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderColor: 'red',
  },
  content: {
    borderWidth: 1,
    borderColor: 'yellow',
    flex: 1,
  },
  backDrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: $config.CARD_LAYER_1_COLOR,
    opacity: 0.5,
  },
});
