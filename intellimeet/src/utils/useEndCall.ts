import {useContext} from 'react';
import {useCustomization} from 'customization-implementation';
import {
  useCaption,
  useContent,
  useRoomInfo,
  useSTTAPI,
} from 'customization-api';
import {PropsContext, DispatchContext} from '../../agora-rn-uikit';
import {useHistory} from '../components/Router';
import {stopForegroundService} from '../subComponents/LocalEndCall';
import RTMEngine from '../rtm/RTMEngine';
import {ENABLE_AUTH} from '../auth/config';
import {useAuth} from '../auth/AuthProvider';
import {useChatConfigure} from '../components/chat/chatConfigure';

const useEndCall = () => {
  const history = useHistory();
  const {defaultContent} = useContent();
  const {isSTTActive} = useCaption();
  const {
    data: {isHost},
  } = useRoomInfo();
  const {authLogin} = useAuth();
  const {deleteChatUser} = useChatConfigure();
  const {stop: stopSTTAPI} = useSTTAPI();

  const {rtcProps} = useContext(PropsContext);
  const {dispatch} = useContext(DispatchContext);

  const beforeEndCall = useCustomization(
    data =>
      data?.lifecycle?.useBeforeEndCall && data?.lifecycle?.useBeforeEndCall(),
  );
  const afterEndCall = useCustomization(
    data =>
      data?.lifecycle?.useAfterEndCall && data?.lifecycle?.useAfterEndCall(),
  );

  return async () => {
    try {
      beforeEndCall &&
        (await beforeEndCall(isHost, history as unknown as History));
    } catch (error) {
      console.log('debugging error on beforeEndCall', error);
    }

    setTimeout(() => {
      dispatch({
        type: 'EndCall',
        value: [],
      });
    });
    // stopping foreground servie on end call
    stopForegroundService();
    // stopping STT on call end,if only last user is remaining in call
    const usersInCall = Object.entries(defaultContent).filter(
      item =>
        item[1].type === 'rtc' && item[1].isHost === 'true' && !item[1].offline,
    );
    if (usersInCall.length === 1 && isSTTActive) {
      console.log('Stopping stt api as only one host is in the call');
      stopSTTAPI().catch(error => {
        console.log('Error stopping stt', error);
      });
    }

    // removing user from chat server
    if ($config.CHAT) {
      deleteChatUser();
    }
    RTMEngine.getInstance().engine.leaveChannel(rtcProps.channel);
    if (!ENABLE_AUTH) {
      // await authLogout();
      await authLogin();
    }

    try {
      afterEndCall &&
        (await afterEndCall(isHost, history as unknown as History));
    } catch (error) {
      console.log('debugging error on afterEndCall', error);
    }
  };
};

export default useEndCall;
