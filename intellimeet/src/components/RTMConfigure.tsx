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
// @ts-nocheck
import React, {useState, useContext, useEffect, useRef} from 'react';
import RtmEngine, {RtmChannelAttribute} from 'agora-react-native-rtm';
import {
  ContentInterface,
  DispatchContext,
  PropsContext,
  useLocalUid,
} from '../../agora-rn-uikit';
import ChatContext from './ChatContext';
import {Platform} from 'react-native';
import {backOff} from 'exponential-backoff';
import {useString} from '../utils/useString';
import {isAndroid, isIOS, isWeb, isWebInternal} from '../utils/common';
import {useContent, useIsAttendee, useUserName} from 'customization-api';
import {
  safeJsonParse,
  timeNow,
  hasJsonStructure,
  getMessageTime,
  get32BitUid,
} from '../rtm/utils';
import {EventUtils, EventsQueue, EventNames} from '../rtm-events';
import events, {PersistanceLevel} from '../rtm-events-api';
import RTMEngine from '../rtm/RTMEngine';
import {filterObject} from '../utils';
import SDKEvents from '../utils/SdkEvents';
import isSDK from '../utils/isSDK';
import {useAsyncEffect} from '../utils/useAsyncEffect';
import {
  WaitingRoomStatus,
  useRoomInfo,
} from '../components/room-info/useRoomInfo';
import LocalEventEmitter, {
  LocalEventsEnum,
} from '../rtm-events-api/LocalEvents';
import {PSTNUserLabel} from '../language/default-labels/videoCallScreenLabels';
import {controlMessageEnum} from '../components/ChatContext';
import {LogSource, logger} from '../logger/AppBuilderLogger';
import {RECORDING_BOT_UID} from '../utils/constants';

export enum UserType {
  ScreenShare = 'screenshare',
}

const RtmConfigure = (props: any) => {
  const rtmInitTimstamp = new Date().getTime();
  const localUid = useLocalUid();
  const {callActive} = props;
  const {rtcProps} = useContext(PropsContext);
  const {dispatch} = useContext(DispatchContext);
  const {defaultContent, activeUids} = useContent();
  const defaultContentRef = useRef({defaultContent: defaultContent});
  const activeUidsRef = useRef({activeUids: activeUids});

  const {
    waitingRoomStatus,
    data: {isHost},
  } = useRoomInfo();
  const waitingRoomStatusRef = useRef({waitingRoomStatus: waitingRoomStatus});

  const isHostRef = useRef({isHost: isHost});

  useEffect(() => {
    isHostRef.current.isHost = isHost;
  }, [isHost]);

  useEffect(() => {
    waitingRoomStatusRef.current.waitingRoomStatus = waitingRoomStatus;
  }, [waitingRoomStatus]);

  /**
   * inside event callback state won't have latest value.
   * so creating ref to access the state
   */
  useEffect(() => {
    activeUidsRef.current.activeUids = activeUids;
  }, [activeUids]);

  useEffect(() => {
    defaultContentRef.current.defaultContent = defaultContent;
  }, [defaultContent]);

  const [hasUserJoinedRTM, setHasUserJoinedRTM] = useState<boolean>(false);
  const [isInitialQueueCompleted, setIsInitialQueueCompleted] = useState(false);
  const [onlineUsersCount, setTotalOnlineUsers] = useState<number>(0);

  let engine = useRef<RtmEngine>(null!);
  const timerValueRef: any = useRef(5);

  React.useEffect(() => {
    setTotalOnlineUsers(
      Object.keys(
        filterObject(
          defaultContent,
          ([k, v]) =>
            v?.type === 'rtc' &&
            !v.offline &&
            activeUids.indexOf(v?.uid) !== -1,
        ),
      ).length,
    );
  }, [defaultContent]);

  React.useEffect(() => {
    if (!$config.ENABLE_CONVERSATIONAL_AI) {
      const handBrowserClose = ev => {
        ev.preventDefault();
        return (ev.returnValue = 'Are you sure you want to exit?');
      };
      const logoutRtm = () => {
        engine.current.leaveChannel(rtcProps.channel);
      };

      if (!isWebInternal()) return;
      window.addEventListener(
        'beforeunload',
        isWeb() && !isSDK() ? handBrowserClose : () => {},
      );

      window.addEventListener('pagehide', logoutRtm);
      // cleanup this component
      return () => {
        window.removeEventListener(
          'beforeunload',
          isWeb() && !isSDK() ? handBrowserClose : () => {},
        );
        window.removeEventListener('pagehide', logoutRtm);
      };
    }
  }, []);

  const doLoginAndSetupRTM = async () => {
    try {
      logger.log(LogSource.AgoraSDK, 'API', 'RTM login starts');
      await engine.current.login({
        uid: localUid.toString(),
        token: rtcProps.rtm,
      });
      logger.log(LogSource.AgoraSDK, 'API', 'RTM login done');
      RTMEngine.getInstance().setLocalUID(localUid.toString());
      logger.log(LogSource.AgoraSDK, 'API', 'RTM local Uid set');
      timerValueRef.current = 5;
      await setAttribute();
      logger.log(LogSource.AgoraSDK, 'Log', 'RTM setting attribute done');
    } catch (error) {
      logger.error(LogSource.AgoraSDK, 'Log', 'RTM login failed..Trying again');
      setTimeout(async () => {
        timerValueRef.current = timerValueRef.current + timerValueRef.current;
        doLoginAndSetupRTM();
      }, timerValueRef.current * 1000);
    }
  };

  const setAttribute = async () => {
    const rtmAttributes = [
      {key: 'screenUid', value: String(rtcProps.screenShareUid)},
      {key: 'isHost', value: String(isHostRef.current.isHost)},
    ];
    try {
      await engine.current.setLocalUserAttributes(rtmAttributes);
      logger.log(
        LogSource.AgoraSDK,
        'API',
        'RTM setting local user attributes',
        {
          attr: rtmAttributes,
        },
      );
      timerValueRef.current = 5;
      await joinChannel();
      logger.log(LogSource.AgoraSDK, 'Log', 'RTM join channel done', {
        data: rtmAttributes,
      });
      setHasUserJoinedRTM(true);
      await runQueuedEvents();
      setIsInitialQueueCompleted(true);
      logger.log(
        LogSource.AgoraSDK,
        'Log',
        'RTM queued events finished running',
        {
          attr: rtmAttributes,
        },
      );
    } catch (error) {
      logger.error(
        LogSource.AgoraSDK,
        'Log',
        'RTM setAttribute failed..Trying again',
      );
      setTimeout(async () => {
        timerValueRef.current = timerValueRef.current + timerValueRef.current;
        setAttribute();
      }, timerValueRef.current * 1000);
    }
  };

  const joinChannel = async () => {
    try {
      if (RTMEngine.getInstance().channelUid !== rtcProps.channel) {
        await engine.current.joinChannel(rtcProps.channel);
        logger.log(LogSource.AgoraSDK, 'API', 'RTM joinChannel', {
          data: rtcProps.channel,
        });
        RTMEngine.getInstance().setChannelId(rtcProps.channel);
        logger.log(
          LogSource.AgoraSDK,
          'API',
          'RTM setChannelId',
          rtcProps.channel,
        );
        logger.debug(
          LogSource.SDK,
          'Event',
          'Emitting rtm joined',
          rtcProps.channel,
        );
        SDKEvents.emit('_rtm-joined', rtcProps.channel);
      } else {
        logger.debug(
          LogSource.AgoraSDK,
          'Log',
          'RTM already joined channel skipping',
          rtcProps.channel,
        );
      }
      timerValueRef.current = 5;
      await getMembers();
      await readAllChannelAttributes();
      logger.log(LogSource.AgoraSDK, 'Log', 'RTM getMembers done');
    } catch (error) {
      logger.error(
        LogSource.AgoraSDK,
        'Log',
        'RTM joinChannel failed..Trying again',
      );
      setTimeout(async () => {
        timerValueRef.current = timerValueRef.current + timerValueRef.current;
        joinChannel();
      }, timerValueRef.current * 1000);
    }
  };

  const updateRenderListState = (
    uid: number,
    data: Partial<ContentInterface>,
  ) => {
    dispatch({type: 'UpdateRenderList', value: [uid, data]});
  };

  const getMembers = async () => {
    try {
      logger.log(
        LogSource.AgoraSDK,
        'API',
        'RTM getChannelMembersByID(getMembers) start',
      );
      await engine.current
        .getChannelMembersBychannelId(rtcProps.channel)
        .then(async data => {
          logger.log(
            LogSource.AgoraSDK,
            'API',
            'RTM getChannelMembersByID data received',
            data,
          );
          await Promise.all(
            data.members.map(async (member: any) => {
              const backoffAttributes = backOff(
                async () => {
                  logger.log(
                    LogSource.AgoraSDK,
                    'API',
                    `RTM fetching getUserAttributesByUid for member ${member.uid}`,
                  );
                  const attr = await engine.current.getUserAttributesByUid(
                    member.uid,
                  );
                  if (!attr || !attr.attributes) {
                    logger.log(
                      LogSource.AgoraSDK,
                      'API',
                      'RTM attributes for member not found',
                    );
                    throw attr;
                  }
                  logger.log(
                    LogSource.AgoraSDK,
                    'API',
                    `RTM getUserAttributesByUid for member ${member.uid} received`,
                    {
                      attr,
                    },
                  );
                  for (const key in attr.attributes) {
                    if (
                      attr.attributes.hasOwnProperty(key) &&
                      attr.attributes[key]
                    ) {
                      return attr;
                    } else {
                      throw attr;
                    }
                  }
                },
                {
                  retry: (e, idx) => {
                    logger.debug(
                      LogSource.AgoraSDK,
                      'Log',
                      `[retrying] Attempt ${idx}. Fetching ${member.uid}'s name`,
                      e,
                    );
                    return true;
                  },
                },
              );
              try {
                const attr = await backoffAttributes;
                console.log('[user attributes]:', {attr});
                //RTC layer uid type is number. so doing the parseInt to convert to number
                //todo hari check android uid comparsion
                const uid = parseInt(member.uid);
                const screenUid = parseInt(attr?.attributes?.screenUid);
                //start - updating user data in rtc
                const userData = {
                  screenUid: screenUid,
                  //below thing for livestreaming
                  type: uid === parseInt(RECORDING_BOT_UID) ? 'bot' : 'rtc',
                  uid,
                  offline: false,
                  isHost: attr?.attributes?.isHost,
                  lastMessageTimeStamp: 0,
                };
                updateRenderListState(uid, userData);
                //end- updating user data in rtc

                //start - updating screenshare data in rtc
                const screenShareUser = {
                  type: UserType.ScreenShare,
                  parentUid: uid,
                };
                updateRenderListState(screenUid, screenShareUser);
                //end - updating screenshare data in rtc
                // setting screenshare data
                // name of the screenUid, isActive: false, (when the user starts screensharing it becomes true)
                // isActive to identify all active screenshare users in the call
                for (const [key, value] of Object.entries(attr?.attributes)) {
                  if (hasJsonStructure(value as string)) {
                    const data = {
                      evt: key,
                      value: value,
                    };
                    // TODOSUP: Add the data to queue, dont add same mulitple events, use set so as to not repeat events
                    EventsQueue.enqueue({
                      data: data,
                      uid: member.uid,
                      ts: timeNow(),
                    });
                  }
                }
              } catch (e) {
                logger.error(
                  LogSource.AgoraSDK,
                  'Log',
                  `Could not retrieve name of ${member.uid}`,
                  e,
                );
              }
            }),
          );
          logger.debug(
            LogSource.AgoraSDK,
            'Log',
            'RTM fetched all data and user attr...RTM init done',
          );
        });
      timerValueRef.current = 5;
    } catch (error) {
      setTimeout(async () => {
        timerValueRef.current = timerValueRef.current + timerValueRef.current;
        await getMembers();
      }, timerValueRef.current * 1000);
    }
  };

  const readAllChannelAttributes = async () => {
    try {
      await engine.current
        .getChannelAttributes(rtcProps.channel)
        .then(async data => {
          for (const item of data) {
            const {key, value, lastUpdateTs, lastUpdateUserId} = item;
            if (hasJsonStructure(value as string)) {
              const evtData = {
                evt: key,
                value,
              };
              // TODOSUP: Add the data to queue, dont add same mulitple events, use set so as to not repeat events
              EventsQueue.enqueue({
                data: evtData,
                uid: lastUpdateUserId,
                ts: lastUpdateTs,
              });
            }
          }
          logger.log(
            LogSource.AgoraSDK,
            'API',
            'RTM getChannelAttributes data received',
            data,
          );
        });
      timerValueRef.current = 5;
    } catch (error) {
      setTimeout(async () => {
        timerValueRef.current = timerValueRef.current + timerValueRef.current;
        await readAllChannelAttributes();
      }, timerValueRef.current * 1000);
    }
  };

  const init = async () => {
    //on sdk due to multiple re-render we are getting rtm error code 8
    //you are joining the same channel too frequently, exceeding the allowed rate of joining the same channel multiple times within a short period
    //so checking rtm connection state before proceed
    if (engine?.current?.client?.connectionState === 'CONNECTED') {
      return;
    }
    logger.log(LogSource.AgoraSDK, 'Log', 'RTM creating engine...');
    engine.current = RTMEngine.getInstance().engine;
    RTMEngine.getInstance();
    logger.log(LogSource.AgoraSDK, 'Log', 'RTM engine creation done');

    engine.current.on('connectionStateChanged', (evt: any) => {
      //console.log(evt);
    });
    engine.current.on('error', (evt: any) => {
      // console.log(evt);
    });
    engine.current.on('channelMemberJoined', (data: any) => {
      logger.log(LogSource.AgoraSDK, 'Event', 'channelMemberJoined', data);
      const backoffAttributes = backOff(
        async () => {
          logger.log(
            LogSource.AgoraSDK,
            'API',
            `RTM fetching getUserAttributesByUid for member ${data.uid}`,
          );
          const attr = await engine.current.getUserAttributesByUid(data.uid);
          if (!attr || !attr.attributes) {
            logger.log(
              LogSource.AgoraSDK,
              'API',
              'RTM attributes for member not found',
            );
            throw attr;
          }
          logger.log(
            LogSource.AgoraSDK,
            'API',
            `RTM getUserAttributesByUid for member ${data.uid} received`,
            {
              attr,
            },
          );
          for (const key in attr.attributes) {
            if (attr.attributes.hasOwnProperty(key) && attr.attributes[key]) {
              return attr;
            } else {
              throw attr;
            }
          }
        },
        {
          retry: (e, idx) => {
            logger.debug(
              LogSource.AgoraSDK,
              'Log',
              `[retrying] Attempt ${idx}. Fetching ${data.uid}'s name`,
              e,
            );
            return true;
          },
        },
      );
      async function getname() {
        try {
          const attr = await backoffAttributes;
          console.log('[user attributes]:', {attr});
          const uid = parseInt(data.uid);
          const screenUid = parseInt(attr?.attributes?.screenUid);

          //start - updating user data in rtc
          const userData = {
            screenUid: screenUid,
            //below thing for livestreaming
            type: uid === parseInt(RECORDING_BOT_UID) ? 'bot' : 'rtc',
            uid,
            offline: false,
            lastMessageTimeStamp: 0,
            isHost: attr?.attributes?.isHost,
          };
          updateRenderListState(uid, userData);
          //end- updating user data in rtc

          //start - updating screenshare data in rtc
          const screenShareUser = {
            type: UserType.ScreenShare,
            parentUid: uid,
          };
          updateRenderListState(screenUid, screenShareUser);
          //end - updating screenshare data in rtc
        } catch (e) {
          logger.error(
            LogSource.AgoraSDK,
            'Event',
            `Failed to retrive name of ${data.uid}`,
            e,
          );
        }
      }
      getname();
    });

    engine.current.on('channelMemberLeft', (data: any) => {
      logger.debug(LogSource.AgoraSDK, 'Event', 'channelMemberLeft', data);
      // Chat of left user becomes undefined. So don't cleanup
      const uid = data?.uid ? parseInt(data?.uid) : undefined;
      if (!uid) return;
      SDKEvents.emit('_rtm-left', uid);
      // updating the rtc data
      updateRenderListState(uid, {
        offline: true,
      });
    });

    engine.current.addListener(
      'ChannelAttributesUpdated',
      (attributeList: RtmChannelAttribute[]) => {
        try {
          attributeList.map((attribute: RtmChannelAttribute) => {
            const {key, value, lastUpdateTs, lastUpdateUserId} = attribute;
            const timestamp = getMessageTime(lastUpdateTs);
            const sender = Platform.OS
              ? get32BitUid(lastUpdateUserId)
              : parseInt(lastUpdateUserId);
            eventDispatcher(
              {
                evt: key,
                value,
              },
              sender,
              timestamp,
            );
          });
        } catch (error) {
          logger.error(
            LogSource.Events,
            'CUSTOM_EVENTS',
            'error while dispatching through eventDispatcher',
            error,
          );
        }
      },
    );

    engine.current.on('messageReceived', (evt: any) => {
      logger.debug(LogSource.Events, 'CUSTOM_EVENTS', 'messageReceived', evt);
      const {peerId, ts, text} = evt;
      const [err, msg] = safeJsonParse(text);
      if (err) {
        logger.error(
          LogSource.Events,
          'CUSTOM_EVENTS',
          'JSON payload incorrect, Error while parsing the payload',
          err,
        );
      }

      const timestamp = getMessageTime(ts);

      const sender = isAndroid() ? get32BitUid(peerId) : parseInt(peerId);

      try {
        eventDispatcher(msg, sender, timestamp);
      } catch (error) {
        logger.error(
          LogSource.Events,
          'CUSTOM_EVENTS',
          'error while dispatching through eventDispatcher',
          err,
        );
      }
    });

    engine.current.on('channelMessageReceived', evt => {
      logger.debug(
        LogSource.Events,
        'CUSTOM_EVENTS',
        'channelMessageReceived',
        evt,
      );

      const {uid, channelId, text, ts} = evt;
      //whiteboard upload
      if (uid == 1010101) {
        const [err, res] = safeJsonParse(text);
        if (err) {
          logger.error(
            LogSource.Events,
            'CUSTOM_EVENTS',
            'JSON payload incorrect, Error while parsing the payload',
            err,
          );
        }

        if (res?.data?.data?.images) {
          LocalEventEmitter.emit(
            LocalEventsEnum.WHITEBOARD_FILE_UPLOAD,
            res?.data?.data?.images,
          );
        }
      } else {
        const [err, msg] = safeJsonParse(text);
        if (err) {
          logger.error(
            LogSource.Events,
            'CUSTOM_EVENTS',
            'JSON payload incorrect, Error while parsing the payload',
            err,
          );
        }

        const timestamp = getMessageTime(ts);

        const sender = Platform.OS ? get32BitUid(uid) : parseInt(uid);

        if (channelId === rtcProps.channel) {
          try {
            eventDispatcher(msg, sender, timestamp);
          } catch (error) {
            logger.error(
              LogSource.Events,
              'CUSTOM_EVENTS',
              'error while dispatching through eventDispatcher',
              error,
            );
          }
        }
      }
    });

    await doLoginAndSetupRTM();
  };

  const runQueuedEvents = async () => {
    try {
      while (!EventsQueue.isEmpty()) {
        const currEvt = EventsQueue.dequeue();
        await eventDispatcher(currEvt.data, currEvt.uid, currEvt.ts);
      }
    } catch (error) {
      logger.error(
        LogSource.Events,
        'CUSTOM_EVENTS',
        'error while running queue events',
        error,
      );
    }
  };

  const eventDispatcher = async (
    data: {
      evt: string;
      value: string;
    },
    sender: string,
    ts: number,
  ) => {
    console.debug(
      LogSource.Events,
      'CUSTOM_EVENTS',
      'inside eventDispatcher ',
      data,
    );

    let evt = '',
      value = {};

    if (data.feat === 'WAITING_ROOM') {
      if (data.etyp === 'REQUEST') {
        const outputData = {
          evt: `${data.feat}_${data.etyp}`,
          payload: JSON.stringify({
            attendee_uid: data.data.data.attendee_uid,
            attendee_screenshare_uid: data.data.data.attendee_screenshare_uid,
          }),
          persistLevel: 1,
          source: 'core',
        };
        const formattedData = JSON.stringify(outputData);
        evt = data.feat + '_' + data.etyp; //rename if client side RTM meessage is to be sent for approval
        value = formattedData;
      }
      if (data.etyp === 'RESPONSE') {
        const outputData = {
          evt: `${data.feat}_${data.etyp}`,
          payload: JSON.stringify({
            approved: data.data.data.approved,
            channelName: data.data.data.channel_name,
            mainUser: data.data.data.mainUser,
            screenShare: data.data.data.screenShare,
            whiteboard: data.data.data.whiteboard,
            chat: data.data.data?.chat,
          }),
          persistLevel: 1,
          source: 'core',
        };
        const formattedData = JSON.stringify(outputData);
        evt = data.feat + '_' + data.etyp;
        value = formattedData;
      }
    } else {
      if (
        $config.ENABLE_WAITING_ROOM &&
        !isHostRef.current?.isHost &&
        waitingRoomStatusRef.current?.waitingRoomStatus !==
          WaitingRoomStatus.APPROVED
      ) {
        if (
          data.evt === controlMessageEnum.muteAudio ||
          data.evt === controlMessageEnum.muteVideo
        ) {
          return;
        } else {
          evt = data.evt;
          value = data.value;
        }
      } else {
        evt = data.evt;
        value = data.value;
      }
    }

    try {
      const {payload, persistLevel, source} = JSON.parse(value);
      // Step 1: Set local attributes
      if (persistLevel === PersistanceLevel.Session) {
        const rtmAttribute = {key: evt, value: value};
        await engine.current.addOrUpdateLocalUserAttributes([rtmAttribute]);
      }
      // Step 2: Emit the event
      console.debug(LogSource.Events, 'CUSTOM_EVENTS', 'emiting event..: ');
      EventUtils.emitEvent(evt, source, {payload, persistLevel, sender, ts});
      // Because async gets evaluated in a different order when in an sdk
      if (evt === 'name') {
        setTimeout(() => {
          EventUtils.emitEvent(evt, source, {
            payload,
            persistLevel,
            sender,
            ts,
          });
        }, 200);
      }
    } catch (error) {
      console.error(
        LogSource.Events,
        'CUSTOM_EVENTS',
        'error while emiting event:',
        error,
      );
    }
  };

  const end = async () => {
    if (!callActive) {
      return;
    }
    await RTMEngine.getInstance().destroy();
    logger.log(LogSource.AgoraSDK, 'API', 'RTM destroy done');
    if (isIOS() || isAndroid()) {
      EventUtils.clear();
    }
    setHasUserJoinedRTM(false);
    logger.debug(LogSource.AgoraSDK, 'Log', 'RTM cleanup done');
  };

  useAsyncEffect(async () => {
    //waiting room attendee -> rtm login will happen on page load
    if ($config.ENABLE_WAITING_ROOM) {
      //attendee
      //for waiting room attendee rtm login will happen on mount
      if (!isHost && !callActive) {
        await init();
      }
      //host
      if (
        isHost &&
        ($config.AUTO_CONNECT_RTM || (!$config.AUTO_CONNECT_RTM && callActive))
      ) {
        await init();
      }
    } else {
      //non waiting room case
      //host and attendee
      if (
        $config.AUTO_CONNECT_RTM ||
        (!$config.AUTO_CONNECT_RTM && callActive)
      ) {
        await init();
      }
    }
    return async () => {
      await end();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rtcProps.channel, rtcProps.appId, callActive]);

  return (
    <ChatContext.Provider
      value={{
        isInitialQueueCompleted,
        rtmInitTimstamp,
        hasUserJoinedRTM,
        engine: engine.current,
        localUid: localUid,
        onlineUsersCount,
      }}>
      {props.children}
    </ChatContext.Provider>
  );
};

export default RtmConfigure;
