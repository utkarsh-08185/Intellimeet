import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Modal,
  TouchableWithoutFeedback,
} from 'react-native';
import React, {useCallback, useRef, useState} from 'react';
import BottomSheet, {
  BottomSheetModal,
  BottomSheetModalProvider,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import KeyboardManager from 'react-native-keyboard-manager';

import Chat from '../../components/Chat';
import ParticipantView from '../../components/ParticipantsView';
import SettingsView from '../../components/SettingsView';
import ActionSheetContent from './ActionSheetContent';
import {SidePanelType} from '../../subComponents/SidePanelEnum';
import {useSidePanel} from '../../utils/useSidePanel';
import {isAndroid, isIOS} from '../../utils/common';
import ActionSheetHandle from './ActionSheetHandle';
import Spacer from '../../atoms/Spacer';
import Transcript from '../../subComponents/caption/Transcript';
import {useCustomization} from 'customization-implementation';
import CustomSidePanelView from '../../components/CustomSidePanel';
import {useControlPermissionMatrix} from '../../components/controls/useControlPermissionMatrix';

//topbar btn template is used to show icons without label text (as in desktop : bottomBar)

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
  const {snapPointsMinMax = [100, 400]} = props;
  const [isExpanded, setIsExpanded] = React.useState(false);
  const {sidePanel, setSidePanel} = useSidePanel();
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const chatSheetRef = useRef<BottomSheetModal>(null);
  const participantsSheetRef = useRef<BottomSheetModal>(null);
  const settingsSheetRef = useRef<BottomSheetModal>(null);
  const transcriptSheetRef = useRef<BottomSheetModal>(null);
  const customActionSheetRef = useRef<BottomSheetModal>(null);

  // callbacks
  const handleSheetChanges = useCallback((index: number) => {
    bottomSheetRef.current?.snapToIndex(index);
    index === 0 ? setIsExpanded(false) : setIsExpanded(true);
  }, []);

  React.useEffect(() => {
    bottomSheetRef?.current.present();
  }, []);

  React.useEffect(() => {
    if (showCustomSidePanel) {
      customActionSheetRef?.current?.present();
    } else {
      customActionSheetRef?.current?.close();
    }
  }, [showCustomSidePanel]);

  // updating on sidepanel changes
  React.useEffect(() => {
    let timeout;

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
          participantsSheetRef?.current.present();
          break;
        }
        case SidePanelType.Chat: {
          chatSheetRef?.current.present();
          break;
        }
        case SidePanelType.Settings: {
          settingsSheetRef?.current.present();
          break;
        }
        case SidePanelType.Transcript: {
          transcriptSheetRef?.current.present();
          break;
        }
        case SidePanelType.None: {
          if (isAndroid()) {
            timeout = setTimeout(() => {
              // Code to be executed after the timeout until https://github.com/gorhom/react-native-bottom-sheet/pull/1164/files is merged
              chatSheetRef?.current?.close();
              participantsSheetRef?.current?.close();
              settingsSheetRef?.current?.close();
              transcriptSheetRef?.current?.close();
              customActionSheetRef?.current?.close();
              bottomSheetRef?.current?.present();
            }, 200);
          } else {
            // Code to be executed immediately without a timer
            chatSheetRef?.current?.dismiss();
            participantsSheetRef?.current?.close();
            settingsSheetRef?.current?.close();
            transcriptSheetRef?.current?.close();
            customActionSheetRef?.current?.close();
          }

          handleSheetChanges(0);
          break;
        }
        default:
          bottomSheetRef?.current.present();
      }
    } else {
      setShowCustomSidePanel(true);
      setCustomSidePanelIndex(selectedIndex);
    }
    return () => {
      clearTimeout(timeout);
    };
  }, [sidePanel]);

  React.useEffect(() => {
    if (isIOS()) {
      KeyboardManager.setEnable(false);
      return () => KeyboardManager.setEnable(true);
    }
  }, []);

  function onDismiss() {
    setSidePanel(SidePanelType.None);
  }

  const canAccessChat = useControlPermissionMatrix('chatControl');
  const canAccessParticipants =
    useControlPermissionMatrix('participantControl');
  const canAccessSettings = useControlPermissionMatrix('settingsControl');

  return (
    <BottomSheetModalProvider>
      {isExpanded && (
        <TouchableWithoutFeedback onPress={() => handleSheetChanges(0)}>
          <View style={[styles.backDrop]} />
        </TouchableWithoutFeedback>
      )}
      {/* Controls  Action Sheet*/}
      <BottomSheetModal
        snapPoints={snapPointsMinMax}
        ref={bottomSheetRef}
        onChange={handleSheetChanges}
        enablePanDownToClose={false}
        style={styles.container}
        backgroundStyle={styles.backgroundStyle}
        stackBehavior="push"
        handleComponent={() => (
          <>
            <ActionSheetHandle sidePanel={SidePanelType.None} />
            <Spacer size={12} />
          </>
        )}
        handleIndicatorStyle={styles.handleIndicatorStyle}>
        <BottomSheetView>
          <ActionSheetContent
            handleSheetChanges={handleSheetChanges}
            isExpanded={isExpanded}
            native={true}
            {...props}
          />
        </BottomSheetView>
      </BottomSheetModal>

      {/* Chat Action Sheet */}
      {canAccessChat && (
        <BottomSheetModal
          snapPoints={['100%']}
          name="ChatSheet"
          onDismiss={onDismiss}
          ref={chatSheetRef}
          style={styles.container}
          backgroundStyle={styles.backgroundStyle}
          handleIndicatorStyle={styles.handleIndicatorStyle}
          enableContentPanningGesture={false}
          handleComponent={() => (
            <ActionSheetHandle sidePanel={SidePanelType.Chat} />
          )}
          android_keyboardInputMode="adjustResize"
          keyboardBehavior="extend"
          stackBehavior="push">
          <BottomSheetView>
            <Chat showHeader={false} />
          </BottomSheetView>
        </BottomSheetModal>
      )}
      {/* Participants Action Sheet */}
      {canAccessParticipants && (
        <BottomSheetModal
          snapPoints={['100%']}
          ref={participantsSheetRef}
          onDismiss={onDismiss}
          name="ParticipantsSheet"
          style={styles.container}
          backgroundStyle={styles.backgroundStyle}
          handleIndicatorStyle={styles.handleIndicatorStyle}
          enableContentPanningGesture={false}
          handleComponent={() => (
            <ActionSheetHandle sidePanel={SidePanelType.Participants} />
          )}
          stackBehavior="push">
          <BottomSheetView>
            <ParticipantView showHeader={false} />
          </BottomSheetView>
        </BottomSheetModal>
      )}

      {/* Settings Action Sheet  */}
      {canAccessSettings && (
        <BottomSheetModal
          snapPoints={['100%']}
          ref={settingsSheetRef}
          name="SettingsSheet"
          onDismiss={onDismiss}
          style={styles.container}
          backgroundStyle={styles.backgroundStyle}
          handleIndicatorStyle={styles.handleIndicatorStyle}
          enableContentPanningGesture={false}
          handleComponent={() => (
            <ActionSheetHandle sidePanel={SidePanelType.Settings} />
          )}
          stackBehavior="push">
          <BottomSheetView>
            <SettingsView showHeader={false} />
          </BottomSheetView>
        </BottomSheetModal>
      )}

      {/* Transcript Action Sheet  */}
      <BottomSheetModal
        snapPoints={['100%']}
        ref={transcriptSheetRef}
        name="TranscriptSheet"
        onDismiss={onDismiss}
        style={styles.container}
        backgroundStyle={styles.backgroundStyle}
        handleIndicatorStyle={styles.handleIndicatorStyle}
        enableContentPanningGesture={false}
        handleComponent={() => (
          <ActionSheetHandle sidePanel={SidePanelType.Transcript} />
        )}
        stackBehavior="push">
        <BottomSheetView>
          <Transcript showHeader={false} />
        </BottomSheetView>
      </BottomSheetModal>

      {/* Custom Action Sheet  */}
      {sidePanelArray && sidePanelArray?.length ? (
        <BottomSheetModal
          snapPoints={['100%']}
          ref={customActionSheetRef}
          name="CustomSheet"
          onDismiss={onDismiss}
          style={styles.container}
          backgroundStyle={styles.backgroundStyle}
          handleIndicatorStyle={styles.handleIndicatorStyle}
          enableContentPanningGesture={false}
          handleComponent={() => (
            <ActionSheetHandle
              isCustomSidePanel={true}
              customSidePanelProps={{
                title: sidePanelArray[customSidePanelIndex]?.title,
                onClose: sidePanelArray[customSidePanelIndex]?.onClose,
                name: sidePanelArray[customSidePanelIndex]?.name,
              }}
            />
          )}
          stackBehavior="push">
          <BottomSheetView>
            <CustomSidePanelView
              showHeader={false}
              content={sidePanelArray[customSidePanelIndex]?.component}
              name={sidePanelArray[customSidePanelIndex]?.name}
            />
          </BottomSheetView>
        </BottomSheetModal>
      ) : (
        <></>
      )}
    </BottomSheetModalProvider>
  );
};

export default ActionSheet;

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 24,
    paddingHorizontal: 16,
    borderColor: '#EDF0F1',
    flexWrap: 'wrap',
  },

  container: {
    shadowColor: '#000000',
    shadowOffset: {width: 0, height: -4},
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  backgroundStyle: {
    backgroundColor: $config.CARD_LAYER_1_COLOR,
  },

  handleIndicatorStyle: {
    // backgroundColor: $config.SEMANTIC_NEUTRAL,
    // width: 40,
    // height: 4,
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
