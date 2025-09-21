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
import React, {useContext} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Linking,
  Image,
  Pressable,
  TouchableOpacity,
  ActivityIndicator,
  StyleProp,
  ViewStyle,
} from 'react-native';
import Hyperlink from 'react-native-hyperlink';
import {useString} from '../utils/useString';
import {ChatBubbleProps} from '../components/ChatContext';
import {isMobileUA, isWebInternal, trimText} from '../utils/common';
import {
  useChatUIControls,
  useContent,
  useLocalUid,
  IconButton,
} from 'customization-api';
import ThemeConfig from '../theme';
import hexadecimalTransparency from '../utils/hexadecimalTransparency';
import {containsOnlyEmojis, formatAMPM, isURL} from '../utils';
import {ChatType, UploadStatus} from '../components/chat-ui/useChatUIControls';
import ImageIcon from '../atoms/ImageIcon';
import {ChatActionMenu, MoreMenu} from './chat/ChatActionMenu';
import ImagePopup from './chat/ImagePopup';
import {
  ChatMessageType,
  useChatMessages,
} from '../components/chat-messages/useChatMessages';
import {
  chatMsgDeletedText,
  videoRoomUserFallbackText,
} from '../language/default-labels/videoCallScreenLabels';
import {ReactionPicker, CustomReactionPicker} from './chat/ChatEmoji';
import {useChatConfigure} from '../../src/components/chat/chatConfigure';
import Tooltip from '../../src/atoms/Tooltip';
import {MoreMessageOptions} from './chat/ChatQuickActionsMenu';
import {EMessageStatus} from '../../src/ai-agent/components/AgentControls/message';

type AttachmentBubbleProps = {
  fileName: string;
  fileExt: string;
  isFullWidth?: boolean;
  fileType?: string;
  msg?: string;
  secondaryComponent?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>; // Accepting external styles
};

export const AttachmentBubble: React.FC<AttachmentBubbleProps> = ({
  fileName,
  fileExt,
  isFullWidth = false,
  fileType = '',
  secondaryComponent,
  containerStyle,
  msg,
}) => {
  const {uploadStatus} = useChatUIControls();

  return (
    <>
      <View
        style={[
          containerStyle,
          style.fileContainer,
          isFullWidth && {width: '100%'},
          uploadStatus === UploadStatus.FAILURE && {
            borderColor:
              $config.SEMANTIC_ERROR + hexadecimalTransparency['40%'],
          },
        ]}>
        <View style={[style.fileBlock]}>
          <ImageIcon
            base64={true}
            iconSize={24}
            iconType="plain"
            name={
              fileType === ChatMessageType.IMAGE
                ? 'chat_attachment_image'
                : fileExt === 'pdf'
                ? 'chat_attachment_pdf'
                : fileExt === 'doc' || fileExt === 'docx'
                ? 'chat_attachment_doc'
                : 'chat_attachment_unknown'
            }
            tintColor={$config.SEMANTIC_NEUTRAL}
          />
          <Text style={style.bubbleText} numberOfLines={1} ellipsizeMode="tail">
            {fileName}
          </Text>
        </View>
        {secondaryComponent}
      </View>
      {msg && <Text style={[style.bubbleText, style.fileText]}>{msg}</Text>}
    </>
  );
};

export const ReplyMessageBubble = ({
  repliedMsgId,
  replyTxt,
  showCoseIcon = false,
  showPreview = true,
}) => {
  const {messageStore, privateMessageStore} = useChatMessages();
  const {defaultContent} = useContent();
  const {setReplyToMsgId, chatType, privateChatUser} = useChatUIControls();
  const localUid = useLocalUid();
  let repliedMsg = [];
  const msgStore =
    chatType === ChatType.Group
      ? messageStore
      : privateMessageStore[privateChatUser] || messageStore;
  repliedMsg = msgStore.filter(msg => msg.msgId === repliedMsgId);
  if (repliedMsg.length == 0 && chatType === ChatType.Private) {
    repliedMsg = messageStore.filter(msg => msg.msgId === repliedMsgId);
  }

  if (repliedMsg.length == 0) {
    return null;
  }
  const isAttachMsg = repliedMsg[0]?.type !== ChatMessageType.TXT;

  let time = formatAMPM(new Date(repliedMsg[0]?.createdTimestamp));
  const name =
    localUid === repliedMsg[0]?.uid
      ? 'You'
      : trimText(defaultContent[repliedMsg[0]?.uid]?.name);
  const text = repliedMsg[0]?.msg;
  const fileName = `[${repliedMsg[0]?.fileName}]`;
  const fileExt = repliedMsg[0]?.ext;

  return (
    <View style={style.repliedMsgContainer}>
      <View
        style={{
          flexDirection: 'row',
          gap: 8,
          alignItems: 'center',
        }}>
        <View style={style.repliedMsgContent}>
          {isAttachMsg ? (
            repliedMsg[0]?.type === ChatMessageType.IMAGE ? (
              <Image
                source={{uri: repliedMsg[0]?.thumb}}
                style={style.replyPreviewImg}
              />
            ) : (
              <ImageIcon
                base64={true}
                iconSize={32}
                iconType="plain"
                name={
                  fileExt === 'pdf'
                    ? 'chat_attachment_pdf'
                    : fileExt === 'doc' || fileExt === 'docx'
                    ? 'chat_attachment_doc'
                    : 'chat_attachment_unknown'
                }
                tintColor={$config.SEMANTIC_NEUTRAL}
              />
            )
          ) : (
            // <Text style={style.messageStyle}>{text}</Text>
            <></>
          )}
        </View>
        <View>
          <View style={{display: 'flex', flexDirection: 'row'}}>
            <Text
              style={style.userNameStyle}
              numberOfLines={1}
              ellipsizeMode="tail">
              {name}
            </Text>
            <Text
              style={style.timestampStyle}
              numberOfLines={1}
              ellipsizeMode="tail">
              {time}
            </Text>
          </View>
          {isAttachMsg ? (
            <Text
              style={style.replyMessageStyle}
              numberOfLines={1}
              ellipsizeMode="tail">
              {fileName + ' ' + text}
            </Text>
          ) : (
            <Text style={[style.messageStyle, {maxWidth: 265}]}>{text}</Text>
          )}
        </View>
      </View>
      {showCoseIcon && (
        <View>
          <IconButton
            hoverEffect={false}
            hoverEffectStyle={{
              backgroundColor: $config.ICON_BG_COLOR,
              borderRadius: 20,
            }}
            iconProps={{
              iconType: 'plain',
              iconContainerStyle: {
                padding: 5,
              },
              iconSize: 20,
              name: 'close',
              tintColor: $config.SECONDARY_ACTION_COLOR,
            }}
            onPress={() => {
              // handleEmojiClose();
              // setShowEmojiPicker(false);
              setReplyToMsgId('');
            }}
          />
        </View>
      )}
    </View>
  );
};

const ChatLastMsgOptions = ({msgId, isLocal, userId, type, message}) => {
  const {setReplyToMsgId} = useChatUIControls();
  return (
    <View
      style={[
        style.chatLastMsgOptions,
        isLocal ? style.lastOptionsLocalView : style.lastOptionsRemoteView,
      ]}>
      <View>
        <IconButton
          hoverEffect={false}
          hoverEffectStyle={{
            backgroundColor: $config.ICON_BG_COLOR,
            borderRadius: 20,
          }}
          iconProps={{
            iconType: 'plain',
            iconContainerStyle: {
              padding: 2,
            },
            iconSize: 20,
            name: 'reply',
            tintColor: $config.SECONDARY_ACTION_COLOR,
          }}
          onPress={() => {
            setReplyToMsgId(msgId);
          }}
        />
      </View>
      <View>
        <CustomReactionPicker
          isLocal={isLocal}
          messageId={msgId}
          setIsHovered={() => {}}
        />
      </View>

      <MoreMessageOptions
        userId={userId}
        isLocal={isLocal}
        messageId={msgId}
        type={type}
        message={message}
        showReplyOption={false}
        setIsHovered={() => {}}
      />
    </View>
  );
};

const ChatBubble = (props: ChatBubbleProps) => {
  const {defaultContent} = useContent();
  const {chatType, privateChatUser} = useChatUIControls();
  const [actionMenuVisible, setActionMenuVisible] =
    React.useState<boolean>(false);
  const [lightboxVisible, setLightboxVisible] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const moreIconRef = React.useRef<View>(null);
  const {removeReaction, addReaction} = useChatConfigure();

  let {
    isLocal,
    isSameUser,
    message,
    createdTimestamp,
    uid,
    isDeleted,
    msgId,
    updatedTimestamp,
    previousMessageCreatedTimestamp,
    type,
    url,
    thumb,
    fileName,
    ext,
    reactions,
    scrollOffset,
    replyToMsgId,
    isLastMsg,
    remoteUIConfig,
    agent_text_status = null,
    disableReactions = false,
  } = props;

  const localUid = useLocalUid();

  let time = formatAMPM(new Date(createdTimestamp));

  const chatMsgDeletedTxt = useString(chatMsgDeletedText);

  let forceShowUserNameandTimeStamp = false;
  //calculate time difference between current message and last message
  //if difference over 2 minutes passed from previous message
  //then show the user and timestamp again even if same user
  if (previousMessageCreatedTimestamp && createdTimestamp) {
    try {
      const startTime = new Date(previousMessageCreatedTimestamp);
      const endTime = new Date(createdTimestamp);
      let resultInMinutes = 0;
      if (startTime && endTime) {
        const difference = endTime.getTime() - startTime.getTime(); // This will give difference in milliseconds
        resultInMinutes = Math.round(difference / 60000);
      }
      forceShowUserNameandTimeStamp =
        resultInMinutes && !isNaN(resultInMinutes) && resultInMinutes >= 2
          ? true
          : false;
    } catch (e) {}
  }

  const handleUrl = (url: string) => {
    if (isWebInternal()) {
      window.open(url, '_blank');
    } else {
      Linking.openURL(url);
    }
  };

  const handleImageLoad = () => {
    setIsLoading(false);
  };
  //commented for v1 release
  //const remoteUserDefaultLabel = useString('remoteUserDefaultLabel')();
  const remoteUserDefaultLabel = useString(videoRoomUserFallbackText)();

  const getUsername = () => {
    if (isLocal) {
      return 'You';
    }
    if (remoteUIConfig?.username) {
      return trimText(remoteUIConfig?.username);
    }
    return defaultContent[uid]?.name
      ? trimText(defaultContent[uid].name)
      : remoteUserDefaultLabel;
  };

  return props?.render ? (
    props.render(
      isLocal,
      message,
      createdTimestamp,
      uid,
      msgId,
      isDeleted,
      updatedTimestamp,
      isSameUser,
      type,
      thumb,
      url,
      fileName,
      ext,
      previousMessageCreatedTimestamp,
      reactions,
      replyToMsgId,
    )
  ) : (
    <>
      {(!isSameUser || forceShowUserNameandTimeStamp) &&
      !(chatType === ChatType.Private && privateChatUser) ? (
        <View
          style={{
            flexDirection: 'row',
            justifyContent: isLocal ? 'flex-end' : 'flex-start',
            alignItems: 'center',
            marginBottom: 4,
            marginTop: 16,
            marginHorizontal: 12,
          }}>
          {!isLocal && remoteUIConfig?.avatarIcon && (
            <View style={{marginRight: 5}}>
              <ImageIcon
                iconType="plain"
                iconSize={24}
                icon={remoteUIConfig?.avatarIcon}
              />
            </View>
          )}
          <Text style={style.userNameStyle}>{getUsername()}</Text>
          <Text style={style.timestampStyle}>{time}</Text>
        </View>
      ) : (!isSameUser || forceShowUserNameandTimeStamp) &&
        chatType === ChatType.Private &&
        privateChatUser ? (
        <View
          style={{
            flexDirection: 'row',
            justifyContent: isLocal ? 'flex-end' : 'flex-start',
            marginBottom: 4,
            marginTop: 16,
            marginHorizontal: 12,
          }}>
          <Text style={style.timestampStyle}>{time}</Text>
        </View>
      ) : (
        <></>
      )}
      <PlatformWrapper isLocal={isLocal}>
        {(
          isHovered: boolean,
          setIsHovered: React.Dispatch<React.SetStateAction<boolean>>,
        ) => {
          return (
            <View
              style={[
                isLocal
                  ? style.chatBubbleLocalView
                  : {
                      ...style.chatBubbleRemoteView,
                      ...(remoteUIConfig?.bubbleStyleLayer1 || {}),
                    },
                isURL(message) ? {maxWidth: '88%'} : {},
              ]}>
              {isHovered && !isDeleted && !disableReactions && (
                <ReactionPicker
                  messageId={msgId}
                  isLocal={isLocal}
                  userId={uid}
                  type={type}
                  message={message}
                  setIsHovered={setIsHovered}
                />
              )}
              <View
                style={[
                  isLocal
                    ? style.chatBubbleLocalViewLayer2
                    : {
                        ...style.chatBubbleRemoteViewLayer2,
                        ...(remoteUIConfig?.bubbleStyleLayer2 || {}),
                      },
                  type === ChatMessageType.IMAGE && style.chatBubbleViewImg,
                ]}>
                {isDeleted ? (
                  <View style={style.deleteMsgContainer}>
                    <ImageIcon
                      iconSize={18}
                      iconType="plain"
                      name="remove"
                      tintColor={$config.SEMANTIC_NEUTRAL}
                    />
                    <Text
                      style={[
                        style.messageStyle,
                        {color: $config.SEMANTIC_NEUTRAL, marginLeft: 5},
                      ]}>
                      {chatMsgDeletedTxt(getUsername())}
                    </Text>
                  </View>
                ) : (
                  <Hyperlink
                    onPress={handleUrl}
                    linkStyle={{
                      color: $config.FONT_COLOR,
                      textDecorationLine: 'underline',
                    }}>
                    {type === ChatMessageType.TXT && (
                      <>
                        {replyToMsgId && (
                          <ReplyMessageBubble
                            repliedMsgId={replyToMsgId}
                            replyTxt={message}
                          />
                        )}
                        <Text
                          style={[
                            style.messageStyle,
                            containsOnlyEmojis(message)
                              ? {fontSize: 24, lineHeight: 32}
                              : {fontSize: 14, lineHeight: 20},
                          ]}
                          selectable={true}>
                          {message}
                          {!isLocal &&
                            agent_text_status ===
                              EMessageStatus.IN_PROGRESS && (
                              <Text
                                style={{
                                  fontSize: 12,
                                  color: $config.SECONDARY_ACTION_COLOR,
                                }}>
                                {' '}
                                ...
                              </Text>
                            )}
                        </Text>
                      </>
                    )}
                    {type === ChatMessageType.IMAGE && (
                      <View>
                        {replyToMsgId && (
                          <ReplyMessageBubble
                            repliedMsgId={replyToMsgId}
                            replyTxt={message}
                          />
                        )}
                        <TouchableOpacity
                          style={{
                            justifyContent: 'center',
                            alignItems: 'center',
                          }}
                          onPress={() => {
                            !isLoading && setLightboxVisible(true);
                          }}>
                          {isLoading ? (
                            <View style={style.spinnerContainer}>
                              <ActivityIndicator
                                size="small"
                                color={$config.PRIMARY_ACTION_BRAND_COLOR}
                              />
                            </View>
                          ) : null}
                          <>
                            <Image
                              source={{uri: thumb}}
                              style={style.previewImg}
                              onLoad={handleImageLoad}
                            />
                          </>
                        </TouchableOpacity>
                        {message && (
                          <Text style={[style.captionText, style.bubbleText]}>
                            {message}
                          </Text>
                        )}
                        {lightboxVisible ? (
                          <ImagePopup
                            modalVisible={lightboxVisible}
                            setModalVisible={setLightboxVisible}
                            imageUrl={url}
                            msgId={msgId}
                            fileName={fileName}
                            senderName={getUsername()}
                            timestamp={createdTimestamp}
                            isLocal={isLocal}
                          />
                        ) : null}
                      </View>
                    )}
                    {type === ChatMessageType.FILE && (
                      <>
                        {replyToMsgId && (
                          <ReplyMessageBubble
                            repliedMsgId={replyToMsgId}
                            replyTxt={message}
                          />
                        )}
                        <AttachmentBubble
                          fileName={fileName}
                          fileExt={ext}
                          msg={message}
                          secondaryComponent={
                            <View>
                              <MoreMenu
                                ref={moreIconRef}
                                setActionMenuVisible={setActionMenuVisible}
                              />
                              <ChatActionMenu
                                actionMenuVisible={actionMenuVisible}
                                setActionMenuVisible={setActionMenuVisible}
                                btnRef={moreIconRef}
                                fileName={fileName}
                                fileUrl={url}
                                msgId={msgId}
                                privateChatUser={privateChatUser}
                                isLocal={isLocal}
                                userId={uid}
                              />
                            </View>
                          }
                        />
                      </>
                    )}
                  </Hyperlink>
                )}
              </View>
            </View>
          );
        }}
      </PlatformWrapper>
      {!isDeleted && (
        <View>
          <View
            style={[
              style.reactionContainer,
              isLocal ? style.reactionLocalView : style.reactionRemoteView,
            ]}>
            {reactions?.map((reactionObj, index) => {
              const msg =
                reactionObj.userList.length > 3
                  ? `${reactionObj.userList
                      .slice(0, 2)
                      .map(uid => {
                        return Number(uid) === localUid
                          ? 'You(click to remove)'
                          : defaultContent[uid]?.name || 'User';
                      })
                      .join(', ')} and ${
                      reactionObj.userList.length - 2
                    } others`
                  : `${reactionObj.userList
                      .map(uid => {
                        return Number(uid) === localUid
                          ? 'You(click to remove)'
                          : defaultContent[uid]?.name || 'User';
                      })
                      .join(', ')}`;

              return reactionObj.count > 0 ? (
                <Tooltip
                  scrollY={scrollOffset}
                  key={`${uid}-${reactionObj.reaction}`}
                  // toolTipMessage={msg}
                  toolTipMessage={
                    <Text>
                      <Text style={{color: $config.FONT_COLOR, fontSize: 12}}>
                        {msg}
                      </Text>
                      <Text
                        style={{
                          color:
                            $config.FONT_COLOR + hexadecimalTransparency['40%'],
                          fontSize: 12,
                        }}>
                        {' '}
                        reacted with{' '}
                      </Text>
                      <Text>{reactionObj.reaction}</Text>
                    </Text>
                  }
                  containerStyle={`max-width:200px;z-index:100000;`}
                  placement={`${isLocal ? 'left' : 'right'}`}
                  fontSize={12}
                  renderContent={(isToolTipVisible, setToolTipVisible) => {
                    return (
                      <TouchableOpacity
                        style={style.reactionWrapper}
                        onPress={() => {
                          if (
                            reactionObj.userList.includes(localUid.toString())
                          ) {
                            removeReaction(msgId, reactionObj.reaction);
                          } else {
                            addReaction(msgId, reactionObj.reaction);
                          }
                        }}>
                        <Text style={{fontSize: 10}}>
                          {reactionObj.reaction}
                        </Text>
                        <Text style={style.reactionCount}>
                          {reactionObj.count}
                        </Text>
                      </TouchableOpacity>
                    );
                  }}
                />
              ) : (
                <></>
              );
            })}
          </View>

          {isLastMsg && (
            <ChatLastMsgOptions
              msgId={msgId}
              isLocal={isLocal}
              userId={uid}
              type={type}
              message={message}
            />
          )}
        </View>
      )}
    </>
  );
};

const PlatformWrapper = ({children, isLocal, isChatBubble = true}) => {
  const [isHovered, setIsHovered] = React.useState(false);

  const handleMouseEnter = () => setIsHovered(true);
  const handleMouseLeave = () => setIsHovered(false);

  return isWebInternal() && !isMobileUA() ? (
    React.cloneElement(children(isHovered, setIsHovered), {
      style: {
        cursor: isHovered ? 'pointer' : 'auto',
        zIndex: isHovered ? 99999 : -1,
        ...(isChatBubble
          ? isLocal
            ? style.chatBubbleLocalView
            : style.chatBubbleRemoteView
          : {}),
      },

      onMouseEnter: handleMouseEnter,
      onMouseLeave: handleMouseLeave,
    })
  ) : (
    <Pressable
      onPress={() => {
        setIsHovered(prev => !prev);
      }}
      style={{
        alignSelf: isLocal ? 'flex-end' : 'flex-start',
      }}>
      {children(isHovered, setIsHovered)}
    </Pressable>
  );
};

const style = StyleSheet.create({
  userNameStyle: {
    fontFamily: ThemeConfig.FontFamily.sansPro,
    fontWeight: '600',
    fontSize: ThemeConfig.FontSize.tiny,
    color: $config.FONT_COLOR + hexadecimalTransparency['70%'],
  },
  timestampStyle: {
    fontFamily: ThemeConfig.FontFamily.sansPro,
    fontWeight: '400',
    fontSize: ThemeConfig.FontSize.tiny,
    color: $config.FONT_COLOR + hexadecimalTransparency['30%'],
    marginLeft: 4,
  },
  chatBubbleRemoteView: {
    backgroundColor: $config.CARD_LAYER_2_COLOR,
    alignSelf: 'flex-start',
    marginBottom: 2,
    marginHorizontal: 12,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 8,
    maxWidth: '88%',
    position: 'relative',
  },
  chatBubbleRemoteViewLayer2: {
    backgroundColor: 'transparent',
    //  width: '100%',
    // height: '100%',
    padding: 8,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 0,
  },
  chatBubbleLocalViewLayer2: {
    //width: '100%',
    //height: '100%',
    padding: 8,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 0,
    backgroundColor:
      $config.PRIMARY_ACTION_BRAND_COLOR + hexadecimalTransparency['10%'],
  },
  chatBubbleLocalView: {
    backgroundColor:
      $config.CARD_LAYER_5_COLOR + hexadecimalTransparency['20%'],
    alignSelf: 'flex-end',
    marginBottom: 2,
    marginHorizontal: 12,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 0,
    maxWidth: '88%',
    position: 'relative',
  },
  reactionLocalView: {
    alignSelf: 'flex-end',
    marginVertical: 2,
    marginHorizontal: 12,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 0,
    maxWidth: '88%',
    position: 'relative',
  },
  reactionRemoteView: {
    alignSelf: 'flex-start',
    marginVertical: 2,
    marginHorizontal: 12,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 8,
    maxWidth: '88%',
    position: 'relative',
  },
  messageStyle: {
    fontFamily: ThemeConfig.FontFamily.sansPro,
    fontWeight: '400',
    fontSize: ThemeConfig.FontSize.small,
    lineHeight: ThemeConfig.FontSize.small * 1.45,
    color: $config.FONT_COLOR,
    flexWrap: 'wrap',
  },
  replyMessageStyle: {
    fontFamily: ThemeConfig.FontFamily.sansPro,
    fontWeight: '400',
    fontSize: ThemeConfig.FontSize.tiny,
    lineHeight: ThemeConfig.FontSize.small,
    color: $config.FONT_COLOR + hexadecimalTransparency['40%'],
    marginTop: 4,
    maxWidth: 200,
  },
  previewImg: {
    width: 256,
    height: 160,
    resizeMode: 'cover',
    borderRadius: 4,
  },
  replyPreviewImg: {
    width: 36,
    height: 36,
    borderRadius: 2,
    resizeMode: 'cover',
  },

  chatBubbleViewImg: {
    paddingHorizontal: 6,
    paddingVertical: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bubbleText: {
    color: $config.FONT_COLOR,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: ThemeConfig.FontFamily.sansPro,
  },
  fileText: {
    paddingLeft: 8,
    paddingTop: 8,
    maxWidth: 240,
  },
  captionText: {
    maxWidth: 240,
    paddingLeft: 6,
    paddingTop: 8,
  },
  fileContainer: {
    flexDirection: 'row',
    gap: 2,
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 8,
    backgroundColor: $config.CARD_LAYER_4_COLOR,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: $config.CARD_LAYER_5_COLOR + hexadecimalTransparency['10%'],
    width: 240,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1, // For Android
  },
  fileBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 0.8,
  },
  spinnerContainer: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  deleteMsgContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  mtZero: {
    marginTop: 0,
  },
  reactionWrapper: {
    paddingHorizontal: 6,
    paddingVertical: 5,
    justifyContent: 'center',
    alignItems: 'center',
    display: 'flex',
    flexDirection: 'row',
    borderRadius: 12,
    backgroundColor: $config.CARD_LAYER_2_COLOR,
  },
  reactionCount: {
    fontSize: 10,
    fontFamily: ThemeConfig.FontFamily.sansPro,
    fontWeight: '400',
    color: $config.SECONDARY_ACTION_COLOR + hexadecimalTransparency['40%'],
    marginLeft: 2,
  },
  reactionContainer: {
    display: 'flex',
    flexDirection: 'row',
    gap: 4,
    zIndex: 5,
    elevation: -1,
  },
  reactionUserList: {
    position: 'absolute',
  },
  repliedMsgContainer: {
    backgroundColor:
      $config.CARD_LAYER_1_COLOR + hexadecimalTransparency['45%'],
    borderRadius: 4,
    borderLeftWidth: 2,
    padding: 8,
    borderLeftColor: $config.SEMANTIC_NEUTRAL + hexadecimalTransparency['80%'],
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  repliedMsgContent: {
    maxHeight: 100,
    overflow: 'scroll',
  },
  chatLastMsgOptions: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
  },
  lastOptionsLocalView: {
    alignSelf: 'flex-end',
    marginVertical: 2,
    marginHorizontal: 12,
    position: 'relative',
  },
  lastOptionsRemoteView: {
    alignSelf: 'flex-start',
    marginVertical: 2,
    marginHorizontal: 12,
    position: 'relative',
  },
});

export default ChatBubble;
