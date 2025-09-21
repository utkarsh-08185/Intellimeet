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
import React, {useEffect, useRef} from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Text,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import TextInput from '../atoms/TextInput';
import {useString} from '../utils/useString';
import {isWeb, isWebInternal} from '../utils/common';
import {
  ChatType,
  UploadStatus,
  useChatUIControls,
  MIN_HEIGHT,
  MAX_HEIGHT,
  LINE_HEIGHT,
  INITIAL_LINE_HEIGHT,
  MAX_TEXT_MESSAGE_SIZE,
  MAX_FILES_UPLOAD,
} from '../components/chat-ui/useChatUIControls';
import {useContent, useRoomInfo, useUserName} from 'customization-api';
import ImageIcon from '../atoms/ImageIcon';
import ThemeConfig from '../theme';
import {ChatEmojiPicker, ChatEmojiButton} from './chat/ChatEmoji';
import {useChatConfigure} from '../components/chat/chatConfigure';
import hexadecimalTransparency from '../utils/hexadecimalTransparency';
import {ChatAttachmentButton} from './chat/ChatAttachment';
import ChatSendButton, {handleChatSend} from './chat/ChatSendButton';
import {
  ChatMessageType,
  SDKChatType,
  useChatMessages,
} from '../components/chat-messages/useChatMessages';
import {
  groupChatLiveInputPlaceHolderText,
  groupChatMeetingInputPlaceHolderText,
  privateChatInputPlaceHolderText,
  chatSendErrorTextSizeToastHeading,
  chatSendErrorTextSizeToastSubHeading,
} from '../language/default-labels/videoCallScreenLabels';
import ChatUploadStatus from './chat/ChatUploadStatus';
import {AttachmentBubble, ReplyMessageBubble} from './ChatBubble';
import IconButton from '../atoms/IconButton';
import Toast from '../../react-native-toast-message';

const ChatPanel = () => {
  return (
    <View style={style.chatPanelContainer}>
      <View style={style.chatPanel}>
        <ChatAttachmentButton />
        <ChatEmojiButton />
      </View>
      <ChatSendButton />
    </View>
  );
};
export interface ChatTextInputProps {
  render?: (
    message: string,
    onChangeText: (text: string) => void,
    onSubmitEditing: () => void,
    chatMessageInputPlaceholder: string,
  ) => JSX.Element;
}
export const ChatTextInput = (props: ChatTextInputProps) => {
  const {
    privateChatUser: selectedUserId,
    message,
    setMessage,
    inputActive,
    setInputActive,
    chatType,
    uploadStatus,
    uploadedFiles,
    setUploadedFiles,
    inputHeight,
    setInputHeight,
    setShowEmojiPicker,
    _resetTextareaHeight,
    _handleHeightChange,
    chatInputRef,
    showEmojiPicker,
    replyToMsgId,
    setReplyToMsgId,
  } = useChatUIControls();

  // Track IME composition state
  const [isComposing, setIsComposing] = React.useState(false);

  const {defaultContent} = useContent();
  const {sendChatSDKMessage, uploadAttachment} = useChatConfigure();
  const {addMessageToPrivateStore, addMessageToStore} = useChatMessages();

  React.useEffect(() => {
    if (message.length === 0) {
      setInputHeight(MIN_HEIGHT);
    }
  }, [message]);

  useEffect(() => {
    setTimeout(() => {
      if (isWebInternal()) {
        chatInputRef?.current?.focus();
      }
    });
  }, []);

  // Set up direct DOM event listeners for IME composition
  useEffect(() => {
    if (!isWeb()) return;

    const inputElement = chatInputRef?.current;
    if (!inputElement) return;

    // Get the actual DOM element (React Native Web creates a textarea/input)
    const domElement = inputElement._nativeTag
      ? document.querySelector(`[data-tag="${inputElement._nativeTag}"]`)
      : inputElement;

    if (!domElement) return;

    const handleCompositionStart = () => {
      setIsComposing(true);
    };

    const handleCompositionEnd = () => {
      setIsComposing(false);
    };

    // Add event listeners directly to DOM element
    domElement.addEventListener('compositionstart', handleCompositionStart);
    domElement.addEventListener('compositionend', handleCompositionEnd);

    return () => {
      domElement.removeEventListener(
        'compositionstart',
        handleCompositionStart,
      );
      domElement.removeEventListener('compositionend', handleCompositionEnd);
    };
  }, [chatInputRef?.current]);

  const {data} = useRoomInfo();
  const [name] = useUserName();
  const toastHeadingSize = useString(chatSendErrorTextSizeToastHeading)();
  const errorSubHeadingSize = useString(chatSendErrorTextSizeToastSubHeading);

  const isUploadStatusShown =
    uploadedFiles.filter(
      file =>
        file.upload_status === UploadStatus.IN_PROGRESS ||
        file.upload_status === UploadStatus.FAILURE,
    ).length > 0 || uploadedFiles.length === MAX_FILES_UPLOAD;

  const groupChatInputPlaceHolder = $config.EVENT_MODE
    ? useString(groupChatLiveInputPlaceHolderText)
    : useString(groupChatMeetingInputPlaceHolderText);
  const privateChatInputPlaceHolder = useString(
    privateChatInputPlaceHolderText,
  );

  const chatMessageInputPlaceholder =
    chatType === ChatType.Private
      ? privateChatInputPlaceHolder(defaultContent[selectedUserId]?.name)
      : groupChatInputPlaceHolder(name);

  const onChangeText = (text: string) => {
    setMessage(text);
  };

  const onSubmitEditing = () => {
    handleChatSend({
      sendChatSDKMessage,
      selectedUserId,
      message,
      setMessage,
      inputActive,
      uploadStatus,
      uploadedFiles,
      setUploadedFiles,
      setInputHeight,
      data,
      setShowEmojiPicker,
      toastHeadingSize,
      errorSubHeadingSize,
      _resetTextareaHeight,
      replyToMsgId,
      setReplyToMsgId,
      addMessageToStore,
      addMessageToPrivateStore,
    });
  };

  // IME composition handlers
  const handleCompositionStart = () => {
    setIsComposing(true);
  };

  const handleCompositionEnd = () => {
    setIsComposing(false);
  };

  const handleInput = event => {
    // Reset composition state if input event occurs without active composition
    if (isWeb() && !event.nativeEvent.isComposing && isComposing) {
      setIsComposing(false);
    }
  };

  // with multiline textinput enter prints /n
  const handleKeyPress = ({nativeEvent}) => {
    const currentlyComposing = nativeEvent.isComposing || isComposing;

    // Check if this is an Enter key during composition
    if (nativeEvent.key === 'Enter' && currentlyComposing) {
      return;
    }

    // Only submit on Enter if not composing with IME and no Shift key
    if (
      nativeEvent.key === 'Enter' &&
      !nativeEvent.shiftKey &&
      !currentlyComposing
    ) {
      nativeEvent.preventDefault();
      onSubmitEditing();
      setShowEmojiPicker(false); // This will close emoji picker on enter
      _resetTextareaHeight();
    }
  };

  const handleContentSizeChange = e => {
    const contentHeight = e.nativeEvent.contentSize.height;
    const lines = Math.floor((contentHeight - 24) / LINE_HEIGHT);
    const newHeight = lines < 5 ? LINE_HEIGHT * lines + 24 + 2 : MAX_HEIGHT; // Assuming lineHeight is LINE_HEIGHT
    setInputHeight(newHeight);
  };

  const handleUploadRetry = () => {
    uploadAttachment(uploadedFiles[0]);
  };

  const renderTextInput = (style = {}) => (
    <TextInput
      setRef={ref => (chatInputRef.current = ref)}
      onFocus={() => setInputActive(true)}
      onBlur={() => setInputActive(false)}
      value={message}
      multiline={true}
      onChangeText={onChangeText}
      textAlignVertical="top"
      scrollEnabled={true}
      style={{
        color: $config.FONT_COLOR,
        textAlign: 'left',
        width: '100%',
        alignSelf: 'center',
        fontFamily: ThemeConfig.FontFamily.sansPro,
        fontWeight: '400',
        height: inputHeight,
        padding: replyToMsgId ? 0 : 12,
        fontSize: ThemeConfig.FontSize.small,
        lineHeight: LINE_HEIGHT,
        borderWidth: 1,
        borderColor:
          $config.CARD_LAYER_5_COLOR + hexadecimalTransparency['40%'],
        backgroundColor: $config.CARD_LAYER_2_COLOR,
        borderRadius: 8,
        borderTopRightRadius: isUploadStatusShown ? 0 : 8,
        borderTopLeftRadius: isUploadStatusShown ? 0 : 8,
        maxHeight: MAX_HEIGHT,
        ...style,
      }}
      blurOnSubmit={false}
      onSubmitEditing={onSubmitEditing}
      placeholder={chatMessageInputPlaceholder}
      placeholderTextColor={$config.FONT_COLOR + hexadecimalTransparency['40%']}
      autoCorrect={false}
      onKeyPress={handleKeyPress}
      onChange={_handleHeightChange}
      // IME composition event handlers for React Native Web
      onCompositionStart={isWeb() ? handleCompositionStart : undefined}
      onCompositionEnd={isWeb() ? handleCompositionEnd : undefined}
      onInput={isWeb() ? handleInput : undefined}
    />
  );

  const renderAttachmentBubble = (file, index) => (
    <AttachmentBubble
      key={file.file_id}
      fileName={file.file_name}
      fileExt={file.file_ext}
      isFullWidth={true}
      fileType={file.file_type}
      secondaryComponent={
        file.upload_status === UploadStatus.IN_PROGRESS ? (
          <ActivityIndicator />
        ) : file.upload_status === UploadStatus.FAILURE ? (
          <TouchableOpacity onPress={handleUploadRetry}>
            <Text style={style.btnRetry}>{'Retry'}</Text>
          </TouchableOpacity>
        ) : file.upload_status === UploadStatus.SUCCESS ? (
          <View>
            <IconButton
              hoverEffect={true}
              hoverEffectStyle={{
                backgroundColor:
                  $config.CARD_LAYER_5_COLOR + hexadecimalTransparency['20%'],
                borderRadius: 20,
              }}
              iconProps={{
                iconType: 'plain',
                iconSize: 20,
                iconContainerStyle: {
                  padding: 2,
                },
                name: 'close',
                tintColor: $config.SECONDARY_ACTION_COLOR,
              }}
              onPress={() => {
                setUploadedFiles(files =>
                  files.filter(uploadedFile => {
                    return uploadedFile.file_id !== file.file_id;
                  }),
                );
              }}
            />
          </View>
        ) : null
      }
      containerStyle={{
        marginBottom: index !== uploadedFiles.length - 1 ? 6 : 0,
      }}
    />
  );

  const renderReplyMsg = () => {
    return (
      <ReplyMessageBubble
        repliedMsgId={replyToMsgId}
        replyTxt={''}
        showCoseIcon={true}
        showPreview={false}
      />
    );
  };

  return props?.render ? (
    props.render(
      message,
      onChangeText,
      onSubmitEditing,
      chatMessageInputPlaceholder,
    )
  ) : (
    <>
      {uploadedFiles.length > 0 ? (
        <View
          style={[
            style.inputWrapper,
            {paddingBottom: replyToMsgId ? 12 : 0},
            isUploadStatusShown
              ? {
                  borderTopLeftRadius: 0,
                  borderTopRightRadius: 0,
                  borderTopWidth: 0,
                }
              : {borderRadius: 8, borderTopWidth: 1},
          ]}>
          <ScrollView style={{maxHeight: showEmojiPicker ? 120 : '100%'}}>
            {!replyToMsgId && uploadedFiles.map(renderAttachmentBubble)}
            {/* {replyToMsgId && renderTextInput({borderWidth: 0, padddingLeft: 0})} */}
            <View>
              {replyToMsgId ? <View>{renderReplyMsg()}</View> : null}
              {replyToMsgId ? uploadedFiles.map(renderAttachmentBubble) : null}
              {!replyToMsgId
                ? renderTextInput({borderWidth: 0, padddingLeft: 0})
                : null}
            </View>
          </ScrollView>
        </View>
      ) : (
        <View
          style={
            replyToMsgId
              ? [style.inputWrapper, {borderRadius: 8, borderTopWidth: 1}]
              : {}
          }>
          {replyToMsgId ? <View>{renderReplyMsg()}</View> : null}
          {renderTextInput({borderWidth: 0, padddingLeft: 0})}
        </View>
      )}
    </>
  );
};

/**
 * Input component for the Chat interface
 */
export const ChatInput = () => {
  const {inputActive, showEmojiPicker} = useChatUIControls();

  return (
    <View
      style={[
        {
          flex: 1,
        },
      ]}>
      {showEmojiPicker && <ChatEmojiPicker />}
      <View style={style.inputView}>
        <ChatUploadStatus />
        <ChatTextInput />
        <ChatPanel />
      </View>
    </View>
  );
};

const style = StyleSheet.create({
  inputActiveView: {
    borderTopWidth: 1,
    borderTopColor: $config.PRIMARY_ACTION_BRAND_COLOR,
  },
  inputWrapper: {
    paddingHorizontal: 12,
    paddingTop: 12,
    backgroundColor: $config.CARD_LAYER_2_COLOR,
    borderWidth: 1,
    borderColor: $config.CARD_LAYER_5_COLOR + hexadecimalTransparency['40%'],
    borderRadius: 8,
  },
  inputView: {
    flex: 1,
    flexDirection: 'column',
    borderTopWidth: 1,
    borderTopColor: 'transparent',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
  },
  chatInputButton: {
    flex: 0.1,
    borderBottomRightRadius: 12,
    alignSelf: 'center',
    marginRight: 16,
  },
  emojiPicker: {
    width: '100%',
  },
  chatPanelContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 4,
  },
  chatPanel: {
    flexDirection: 'row',
  },
  btnRetry: {
    color: $config.PRIMARY_ACTION_BRAND_COLOR,
    fontFamily: ThemeConfig.FontFamily.sansPro,
    fontSize: 12,
    fontWeight: '600',
  },
});
export default ChatInput;
