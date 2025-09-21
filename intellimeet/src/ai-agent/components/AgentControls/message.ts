import {decodeStreamMessage, Base64} from '../../../ai-agent/utils';
import {LogSource, logger} from '../../../logger/AppBuilderLogger';
import LocalEventEmitter, {
  LocalEventsEnum,
} from '../../../rtm-events-api/LocalEvents';
import {Buffer} from 'buffer';

const DEFAULT_MESSAGE_CACHE_TIMEOUT = 1000 * 60 * 5; // 5 minutes
const DEFAULT_INTERVAL = 200; // milliseconds

export type TDataChunk = {
  message_id: string;
  part_idx: number;
  part_sum: number;
  content: string;
};

export type TDataChunkMessageV1 = {
  /** Boolean indicating if the text will no longer change (always True for ASR results) */
  is_final: boolean;
  /** Int user ID - 0 for AI agent, non-zero for corresponding user int uid */
  stream_id: number;
  /** String unique identifier for each subtitle message */
  message_id: string;
  /** String data type, defaults to 'transcribe' */
  data_type: string;
  /** Int timestamp when subtitle was generated */
  text_ts: number;
  /** String subtitle content */
  text: string;
};

export type TDataChunkMessageWord = {
  word: string;
  start_ms: number;
  duration_ms: number;
  stable: boolean;
};

export type TMessageEngineObjectWord = TDataChunkMessageWord & {
  word_status?: EMessageStatus;
};

export type TQueueItem = {
  turn_id: number;
  text: string;
  words: TMessageEngineObjectWord[];
  status: EMessageStatus;
  stream_id: number;
};

// https://github.com/TEN-framework/ten_ai_base/blob/main/interface/ten_ai_base/transcription.py
/**
 * Represents the current status of a message in the system
 *
 * IN_PROGRESS (0): Message is still being processed/streamed
 * END (1): Message has completed normally
 * INTERRUPTED (2): Message was interrupted before completion
 */
export enum EMessageStatus {
  IN_PROGRESS = 0,
  END = 1,
  INTERRUPTED = 2,
}

export enum ETranscriptionObjectType {
  USER_TRANSCRIPTION = 'user.transcription',
  AI_AGENTION = 'assistant.transcription',
  MSG_INTERRUPTED = 'message.interrupt',
}

/**
 * Defines different modes for message rendering
 *
 * TEXT: Processes messages as complete text blocks without word-by-word processing.
 * Messages are handled as entire units.
 *
 * WORD: Processes messages word by word, enabling granular control.
 * Suitable for real-time word-by-word display or analysis.
 *
 * AUTO: Automatically determines the most suitable processing mode (TEXT or WORD)
 * based on context or message characteristics.
 */
export enum EMessageEngineMode {
  TEXT = 'text',
  WORD = 'word',
  AUTO = 'auto',
}

export interface ITranscriptionBase {
  object: ETranscriptionObjectType;
  text: string;
  start_ms: number;
  duration_ms: number;
  language: string;
  turn_id: number;
  stream_id: number;
  user_id: string;
  words: TDataChunkMessageWord[] | null;
}

export interface IUserTranscription extends ITranscriptionBase {
  object: ETranscriptionObjectType.USER_TRANSCRIPTION; // "user.transcription"
  final: boolean;
}

export interface IAgentTranscription extends ITranscriptionBase {
  object: ETranscriptionObjectType.AI_AGENTION; // "assistant.transcription"
  quiet: boolean;
  turn_seq_id: number;
  turn_status: EMessageStatus;
}

export interface IMessageInterrupt {
  object: ETranscriptionObjectType.MSG_INTERRUPTED; // "message.interrupt"
  message_id: string;
  data_type: 'message';
  turn_id: number;
  start_ms: number;
  send_ts: number;
}

/**
 * Represents a message item in the chat history
 * @property uid - Unique identifier for the message sender
 * @property turn_id - ID representing the turn/sequence in the conversation
 * @property text - The actual message content/transcript
 * @property status - Current status of the message (e.g. in progress, completed, interrupted)
 */
export interface IMessageListItem {
  uid: number;
  turn_id: number;
  text: string;
  status: EMessageStatus;
}

interface IMessageArrayItem<T> {
  uid: number;
  turn_id: number;
  _time: number;
  text: string;
  status: EMessageStatus;
  metadata: T | null;
}
/**
 * Message engine that handles real-time transcription and subtitle rendering
 *
 * The engine processes incoming RTC messages and manages the state of transcribed text.
 * It supports different rendering modes:
 * - Auto: Automatically determines the best rendering mode based on message content
 * - Text: Simple text-based rendering of complete messages
 * - Word: Word-by-word rendering with timing information
 *
 * The engine maintains an internal queue and cache to handle message ordering,
 * interruptions, and partial updates. It emits updates through a callback when
 * the message list changes.
 *
 * @property rtcEngine - RTC engine instance for real-time communication
 * @property renderMode - Mode for subtitle rendering (Auto, Text, or Word)
 * @property callback - Callback function invoked when message list updates
 */
export class MessageEngine {
  // handle rtc-engine stream message
  private _messageCache: Record<string, TDataChunk[]> = {};
  private _messageCacheTimeout: number = DEFAULT_MESSAGE_CACHE_TIMEOUT;

  /** @deprecated */
  private _legacyMode: boolean = false;

  private _mode: EMessageEngineMode = EMessageEngineMode.AUTO; // mode should only be set once
  private _queue: TQueueItem[] = [];
  private _interval: number = DEFAULT_INTERVAL; // milliseconds
  private _intervalRef: NodeJS.Timeout | null = null;
  private _pts: number = 0; // current pts
  private _lastPoppedQueueItem: TQueueItem | null | undefined = null;
  private _isRunning: boolean = false;

  public messageList: IMessageArrayItem<
    Partial<IUserTranscription | IAgentTranscription>
  >[] = [];
  /**
   * Callback function that gets triggered whenever the message list is updated
   * Takes the updated message list as a parameter and returns void
   * Can be null if no callback is needed
   */
  public onMessageListUpdate:
    | ((messageList: IMessageListItem[]) => void)
    | null = null;

  constructor(
    renderMode?: EMessageEngineMode,
    callback?: (messageList: IMessageListItem[]) => void,
  ) {
    this.run({
      legacyMode: false,
    });
    this.setMode(renderMode ?? EMessageEngineMode.AUTO);
    this.onMessageListUpdate = callback ?? null;
  }

  // not req as doin in init
  private _listenRtcEvents() {
    // this._rtcEngine.on('audio-metadata', (metadata: Uint8Array) => {
    //   const pts64 = Number(new DataView(metadata.buffer).getBigUint64(0, true));
    //   this.setPts(pts64);
    // });
    // this._rtcEngine.on('stream-message', (_: UID, payload: Uint8Array) => {
    //   this.handleStreamMessage(payload);
    // });
  }

  public run(options?: {legacyMode?: boolean}) {
    this._isRunning = true;
    this._legacyMode = options?.legacyMode ?? false;
  }

  public setupInterval() {
    if (!this._isRunning) {
      console.error(
        LogSource.AgoraSDK,
        'AI_AGENT',
        'Message service is not running',
      );
      return;
    }
    if (this._intervalRef) {
      clearInterval(this._intervalRef);
      this._intervalRef = null;
    }
    this._intervalRef = setInterval(
      this._handleQueue.bind(this),
      this._interval,
    );
  }

  public teardownInterval() {
    if (this._intervalRef) {
      clearInterval(this._intervalRef);
      this._intervalRef = null;
    }
  }

  public setPts(pts: number) {
    if (this._pts < pts) {
      this._pts = pts;
    }
  }

  public handleStreamMessage(stream: Uint8Array) {
    if (!this._isRunning) {
      logger.warn(
        LogSource.AgoraSDK,
        'AI_AGENT',
        'Message service is not running',
      );
      return;
    }
    const chunk = this.streamMessage2Chunk(stream);
    if (this._legacyMode) {
      this.handleChunk(chunk, this.handleMessageLegacy.bind(this));
      return;
    }
    this.handleChunk<
      IUserTranscription | IAgentTranscription | IMessageInterrupt
    >(chunk, this.handleMessage.bind(this));
  }

  /** @deprecated */
  public handleMessageLegacy(message: TDataChunkMessageV1) {
    const isTextValid = message?.text && message.text?.trim().length > 0;
    if (!isTextValid) {
      logger.debug(
        LogSource.AgoraSDK,
        'AI_AGENT',
        '[handleMessageLegacy]',
        'Drop message with empty text',
        message,
      );
      return;
    }
    const lastEndedItem = this.messageList.findLast(
      item =>
        item.uid === message.stream_id && item.status === EMessageStatus.END,
    );
    const lastInProgressItem = this.messageList.findLast(
      item =>
        item.uid === message.stream_id &&
        item.status === EMessageStatus.IN_PROGRESS,
    );
    if (lastEndedItem) {
      logger.debug(
        LogSource.AgoraSDK,
        'AI_AGENT',
        '[handleMessageLegacy] lastEndedItem',
        JSON.stringify(lastEndedItem),
      );
      if (lastEndedItem._time >= message.text_ts) {
        logger.debug(
          LogSource.AgoraSDK,
          'AI_AGENT',
          '[handleMessageLegacy] discard lastEndedItem',
        );
        // discard
        return;
      } else {
        if (lastInProgressItem) {
          logger.debug(
            LogSource.AgoraSDK,
            'AI_AGENT',
            '[handleMessageLegacy] update lastInProgressItem',
          );
          lastInProgressItem._time = message.text_ts;
          lastInProgressItem.text = message.text;
          lastInProgressItem.status = message.is_final
            ? EMessageStatus.END
            : EMessageStatus.IN_PROGRESS;
        } else {
          logger.debug(
            LogSource.AgoraSDK,
            'AI_AGENT',
            '[handleMessageLegacy] append new item',
          );
          this._appendChatHistory({
            uid: message.stream_id,
            turn_id: message.text_ts,
            _time: message.text_ts,
            text: message.text,
            status: message.is_final
              ? EMessageStatus.END
              : EMessageStatus.IN_PROGRESS,
            metadata: null,
          });
        }
      }
    } else {
      if (lastInProgressItem) {
        logger.debug(
          LogSource.AgoraSDK,
          'AI_AGENT',
          '[handleMessageLegacy] update lastInProgressItem',
        );
        lastInProgressItem._time = message.text_ts;
        lastInProgressItem.text = message.text;
        lastInProgressItem.status = message.is_final
          ? EMessageStatus.END
          : EMessageStatus.IN_PROGRESS;
      } else {
        logger.debug(
          LogSource.AgoraSDK,
          'AI_AGENT',
          '[handleMessageLegacy] append new item',
        );
        this._appendChatHistory({
          uid: message.stream_id,
          turn_id: message.text_ts,
          _time: message.text_ts,
          text: message.text,
          status: message.is_final
            ? EMessageStatus.END
            : EMessageStatus.IN_PROGRESS,
          metadata: null,
        });
      }
    }
    this.messageList.sort((a, b) => a._time - b._time);
    this._mutateChatHistory();
  }

  public handleMessage(
    message: IUserTranscription | IAgentTranscription | IMessageInterrupt,
  ) {
    // check if message is transcription
    const isAgentMessage =
      message.object === ETranscriptionObjectType.AI_AGENTION;
    const isUserMessage =
      message.object === ETranscriptionObjectType.USER_TRANSCRIPTION;
    const isMessageInterrupt =
      message.object === ETranscriptionObjectType.MSG_INTERRUPTED;
    if (!isAgentMessage && !isUserMessage && !isMessageInterrupt) {
      logger.debug(
        LogSource.AgoraSDK,
        'AI_AGENT',
        'Unknown message type',
        message,
      );
      return;
    }
    // set mode (only once)
    if (isAgentMessage && this._mode === EMessageEngineMode.AUTO) {
      // check if words is empty, and set mode
      if (!message.words) {
        this.setMode(EMessageEngineMode.TEXT);
      } else {
        this.setupInterval();
        this.setMode(EMessageEngineMode.WORD);
      }
    }
    // handle Agent Message
    if (isAgentMessage && this._mode === EMessageEngineMode.WORD) {
      this.handleWordAgentMessage(message);
      return;
    }
    if (isAgentMessage && this._mode === EMessageEngineMode.TEXT) {
      this.handleTextMessage(message as unknown as IUserTranscription);
      return;
    }
    // handle User Message
    if (isUserMessage) {
      this.handleTextMessage(message);
      return;
    }
    // handle Message Interrupt
    if (isMessageInterrupt) {
      this.handleMessageInterrupt(message);
      return;
    }
    // unknown mode
    console.error(LogSource.AgoraSDK, 'AI_AGENT', 'Unknown mode', message);
  }

  public handleTextMessage(message: IUserTranscription) {
    const turn_id = message.turn_id;
    const text = message.text || '';
    const stream_id = message.stream_id;
    const turn_status = EMessageStatus.END;

    const targetChatHistoryItem = this.messageList.find(
      item => item.turn_id === turn_id && item.uid === stream_id,
    );
    // if not found, push to messageList
    if (!targetChatHistoryItem) {
      this._appendChatHistory({
        turn_id,
        uid: stream_id,
        _time: new Date().getTime(),
        text,
        status: turn_status,
        metadata: message,
      });
    } else {
      // if found, update text and status
      targetChatHistoryItem.text = text;
      targetChatHistoryItem.status = turn_status;
      targetChatHistoryItem.metadata = message;
    }
    this._mutateChatHistory();
  }

  public handleMessageInterrupt(message: IMessageInterrupt) {
    // logger.debug(
    //   LogSource.AgoraSDK,
    //   'AI_AGENT',
    //   'handleMessageInterrupt',
    //   message,
    // );
    const turn_id = message.turn_id;
    const start_ms = message.start_ms;
    this._interruptQueue({
      turn_id,
      start_ms,
    });
    this._mutateChatHistory();
  }

  public handleWordAgentMessage(message: IAgentTranscription) {
    // drop message if turn_status is undefined
    if (typeof message.turn_status === 'undefined') {
      logger.debug(
        LogSource.AgoraSDK,
        'AI_AGENT',
        'Drop message with undefined turn_status',
        message,
      );
      return;
    }

    logger.debug(
      LogSource.AgoraSDK,
      'AI_AGENT',
      'handleWordAgentMessage',
      JSON.stringify(message),
    );

    const turn_id = message.turn_id;
    const text = message.text || '';
    const words = message.words || [];
    const stream_id = message.stream_id;
    const lastPoppedQueueItemTurnId = this._lastPoppedQueueItem?.turn_id;
    // drop message if turn_id is less than last popped queue item
    // except for the first turn(greeting message, turn_id is 0)
    if (
      lastPoppedQueueItemTurnId &&
      turn_id !== 0 &&
      turn_id <= lastPoppedQueueItemTurnId
    ) {
      logger.debug(
        LogSource.AgoraSDK,
        'AI_AGENT',
        'Drop message with turn_id less than last popped queue item',
        message,
      );
      return;
    }
    this._pushToQueue({
      turn_id,
      words,
      text,
      status: message.turn_status,
      stream_id,
    });
  }

  public sortWordsWithStatus(
    words: TDataChunkMessageWord[],
    turn_status: EMessageStatus,
  ) {
    if (words.length === 0) {
      return words;
    }
    const sortedWords: TMessageEngineObjectWord[] = words
      .map(word => ({
        ...word,
        word_status: EMessageStatus.IN_PROGRESS,
      }))
      .sort((a, b) => a.start_ms - b.start_ms)
      .reduce((acc, curr) => {
        // Only add if start_ms is unique
        if (!acc.find(word => word.start_ms === curr.start_ms)) {
          acc.push(curr);
        }
        return acc;
      }, [] as TMessageEngineObjectWord[]);
    const isMessageFinal = turn_status !== EMessageStatus.IN_PROGRESS;
    if (isMessageFinal) {
      sortedWords[sortedWords.length - 1].word_status = turn_status;
    }
    return sortedWords;
  }

  public setMode(mode: EMessageEngineMode) {
    if (this._mode !== EMessageEngineMode.AUTO) {
      logger.warn(
        LogSource.AgoraSDK,
        'AI_AGENT',
        'Mode should only be set once, but it is set again',
        'current mode:',
        this._mode,
      );
      return;
    }
    if (mode === EMessageEngineMode.AUTO) {
      logger.warn(
        LogSource.AgoraSDK,
        'AI_AGENT',
        'Unknown mode should not be set again',
        'current mode:',
        this._mode,
      );
      return;
    }
    this._mode = mode;
  }

  public cleanMessageCache() {
    this._messageCache = {};
  }

  public cleanup() {
    logger.debug(LogSource.AgoraSDK, 'AI_AGENT', 'Cleanup message service');
    this._isRunning = false;
    this._legacyMode = false;
    // (super) cleanup message cache
    this.cleanMessageCache();
    // teardown interval
    this.teardownInterval();
    // cleanup queue
    this._queue = [];
    this._lastPoppedQueueItem = null;
    this._pts = 0;
    // cleanup messageList
    this.messageList = [];
    // cleanup mode
    this._mode = EMessageEngineMode.AUTO;
  }

  // utils: Uint8Array -> string
  public streamMessage2Chunk(stream: Uint8Array) {
    const chunk = decodeStreamMessage(stream);
    return chunk;
  }

  /**
   * @param chunk String format: {message_id}|{part_idx}|{part_sum}|{part_data}
   * message_id: string, unique message_id id
   * part_idx: number, splited part index, from 1 to total_parts
   * part_sum: number | string, total parts, '???' means unknown
   * part_data: string, base64 encoded content
   */
  public handleChunk<
    T extends
      | TDataChunkMessageV1
      | IUserTranscription
      | IAgentTranscription
      | IMessageInterrupt,
  >(chunk: string, callback?: (message: T) => void): void {
    try {
      // split chunk by '|'
      const [msgId, partIdx, partSum, partData] = chunk.split('|');
      // convert to TDataChunk
      const input: TDataChunk = {
        message_id: msgId,
        part_idx: parseInt(partIdx, 10),
        part_sum: partSum === '???' ? -1 : parseInt(partSum, 10), // -1 means total parts unknown
        content: partData,
      };
      // check if total parts is known, skip if unknown
      if (input.part_sum === -1) {
        logger.debug(
          LogSource.AgoraSDK,
          'AI_AGENT',
          'total parts unknown, waiting for further parts.',
        );
        return;
      }

      // check if cached
      // case 1: not cached, create new cache
      if (!this._messageCache[input.message_id]) {
        this._messageCache[input.message_id] = [];
        // set cache timeout, drop it if incomplete after timeout
        setTimeout(() => {
          if (
            this._messageCache[input.message_id] &&
            this._messageCache[input.message_id].length < input.part_sum
          ) {
            logger.debug(
              LogSource.AgoraSDK,
              'AI_AGENT',
              input.message_id,
              'message cache timeout, drop it.',
            );
            delete this._messageCache[input.message_id];
          }
        }, this._messageCacheTimeout);
      }
      // case 2: cached, add to cache(and sort by part_idx)
      if (
        !this._messageCache[input.message_id]?.find(
          item => item.part_idx === input.part_idx,
        )
      ) {
        // unique push
        this._messageCache[input.message_id].push(input);
      }
      this._messageCache[input.message_id].sort(
        (a, b) => a.part_idx - b.part_idx,
      );

      // check if complete
      if (this._messageCache[input.message_id].length === input.part_sum) {
        const message = this._messageCache[input.message_id]
          .map(chunk => chunk.content)
          .join('');

        // decode message
        // logger.debug(
        //   LogSource.AgoraSDK,
        //   'AI_AGENT',
        //   '[message]',
        //   atob(message),
        // );

        // const decodedMessage = JSON.parse(atob(message));
        const decodedMessage = JSON.parse(
          Buffer.from(message, 'base64').toString('utf-8'),
        );

        // logger.debug(
        //   LogSource.AgoraSDK,
        //   'AI_AGENT',
        //   '[decodedMessage]',
        //   decodedMessage,
        // );

        // callback
        callback?.(decodedMessage);

        // delete cache
        delete this._messageCache[input.message_id];
      }

      // end
      return;
    } catch (error: unknown) {
      console.error(LogSource.AgoraSDK, 'AI_AGENT', 'handleChunk error', error);
      return;
    }
  }

  private _pushToQueue(data: {
    turn_id: number;
    words: TMessageEngineObjectWord[];
    text: string;
    status: EMessageStatus;
    stream_id: number;
  }) {
    const targetQueueItem = this._queue.find(
      item => item.turn_id === data.turn_id,
    );
    const latestTurnId = this._queue.reduce((max, item) => {
      return Math.max(max, item.turn_id);
    }, 0);
    // if not found, push to queue or drop if turn_id is less than latestTurnId
    if (!targetQueueItem) {
      // drop if turn_id is less than latestTurnId
      if (data.turn_id < latestTurnId) {
        logger.debug(
          LogSource.AgoraSDK,
          'AI_AGENT',
          'Drop message with turn_id less than latestTurnId',
          data,
        );
        return;
      }
      const newQueueItem = {
        turn_id: data.turn_id,
        text: data.text,
        words: this.sortWordsWithStatus(data.words, data.status),
        status: data.status,
        stream_id: data.stream_id,
      };
      logger.debug(
        LogSource.AgoraSDK,
        'AI_AGENT',
        'Push to queue',
        newQueueItem,
        JSON.stringify(newQueueItem),
      );
      // push to queue
      this._queue.push(newQueueItem);
      return;
    }
    // if found, update text, words(sorted with status) and turn_status
    logger.debug(
      LogSource.AgoraSDK,
      'AI_AGENT',
      'Update queue item',
      JSON.stringify(targetQueueItem),
      JSON.stringify(data),
    );
    targetQueueItem.text = data.text;
    targetQueueItem.words = this.sortWordsWithStatus(
      [...targetQueueItem.words, ...data.words],
      data.status,
    );
    // if targetQueueItem.status is end, and data.status is in_progress, skip status update (unexpected case)
    if (
      targetQueueItem.status !== EMessageStatus.IN_PROGRESS &&
      data.status === EMessageStatus.IN_PROGRESS
    ) {
      return;
    }
    targetQueueItem.status = data.status;
  }

  private _handleQueue() {
    const queueLength = this._queue.length;
    // empty queue, skip
    if (queueLength === 0) {
      logger.debug(LogSource.AgoraSDK, 'AI_AGENT', 'Queue is empty, skip');
      return;
    }
    const curPTS = this._pts;
    // only one item, update messageList with queueItem
    if (queueLength === 1) {
      console.debug(
        LogSource.AgoraSDK,
        'AI_AGENT',
        'Queue has only one item, update messageList',
        JSON.stringify(this._queue[0]),
      );
      const queueItem = this._queue[0];
      this._handleTurnObj(queueItem, curPTS);
      this._mutateChatHistory();
      return;
    }
    if (queueLength > 2) {
      console.error(
        LogSource.AgoraSDK,
        'AI_AGENT',
        'Queue length is greater than 2, but it should not happen',
      );
    }
    // assume the queueLength is 2
    if (queueLength > 1) {
      this._queue = this._queue.sort((a, b) => a.turn_id - b.turn_id);
      const nextItem = this._queue[this._queue.length - 1];
      const lastItem = this._queue[this._queue.length - 2];
      // check if nextItem is started
      const firstWordOfNextItem = nextItem.words[0];
      // if firstWordOfNextItem.start_ms > curPTS, work on lastItem
      if (firstWordOfNextItem.start_ms > curPTS) {
        this._handleTurnObj(lastItem, curPTS);
        this._mutateChatHistory();
        return;
      }
      // if firstWordOfNextItem.start_ms <= curPTS, work on nextItem, assume lastItem is interrupted(and drop it)
      const lastItemCorrespondingChatHistoryItem = this.messageList.find(
        item =>
          item.turn_id === lastItem.turn_id && item.uid === lastItem.stream_id,
      );
      if (!lastItemCorrespondingChatHistoryItem) {
        logger.warn(
          LogSource.AgoraSDK,
          'AI_AGENT',
          'No corresponding messageList item found',
          lastItem,
        );
        return;
      }
      lastItemCorrespondingChatHistoryItem.status = EMessageStatus.INTERRUPTED;
      this._lastPoppedQueueItem = this._queue.shift();
      // handle nextItem
      this._handleTurnObj(nextItem, curPTS);
      this._mutateChatHistory();
      return;
    }
  }

  private _interruptQueue(options: {turn_id: number; start_ms: number}) {
    const turn_id = options.turn_id;
    const start_ms = options.start_ms;
    const correspondingQueueItem = this._queue.find(
      item => item.turn_id === turn_id,
    );
    if (!correspondingQueueItem) {
      // logger.debug(
      //   LogSource.AgoraSDK,
      //   'AI_AGENT',
      //   'No corresponding queue item found',
      //   options,
      // );
      return;
    }
    // if correspondingQueueItem exists, update its status to interrupted
    correspondingQueueItem.status = EMessageStatus.INTERRUPTED;
    // split words into two parts, set left one word and all right words to interrupted
    const leftWords = correspondingQueueItem.words.filter(
      word => word.start_ms <= start_ms,
    );
    const rightWords = correspondingQueueItem.words.filter(
      word => word.start_ms > start_ms,
    );
    // check if leftWords is empty
    const isLeftWordsEmpty = leftWords.length === 0;
    if (isLeftWordsEmpty) {
      // if leftWords is empty, set all words to interrupted
      correspondingQueueItem.words.forEach(word => {
        word.word_status = EMessageStatus.INTERRUPTED;
      });
    } else {
      // if leftWords is not empty, set leftWords[leftWords.length - 1].word_status to interrupted
      leftWords[leftWords.length - 1].word_status = EMessageStatus.INTERRUPTED;
      // and all right words to interrupted
      rightWords.forEach(word => {
        word.word_status = EMessageStatus.INTERRUPTED;
      });
      // update words
      correspondingQueueItem.words = [...leftWords, ...rightWords];
    }
  }

  private _handleTurnObj(queueItem: TQueueItem, curPTS: number) {
    let correspondingChatHistoryItem = this.messageList.find(
      item =>
        item.turn_id === queueItem.turn_id && item.uid === queueItem.stream_id,
    );
    logger.debug(
      LogSource.AgoraSDK,
      'AI_AGENT',
      '_handleTurnObj',
      this._pts,
      JSON.stringify(queueItem),
      JSON.stringify(queueItem.words),
      'correspondingChatHistoryItem',
      JSON.stringify(correspondingChatHistoryItem),
    );
    if (!correspondingChatHistoryItem) {
      logger.debug(
        LogSource.AgoraSDK,
        'AI_AGENT',
        'No corresponding messageList item found',
        'push to messageList',
      );
      correspondingChatHistoryItem = {
        turn_id: queueItem.turn_id,
        uid: queueItem.stream_id,
        _time: new Date().getTime(),
        text: '',
        status: queueItem.status,
        metadata: queueItem,
      };
      this._appendChatHistory(correspondingChatHistoryItem);
    }
    // update correspondingChatHistoryItem._time for chatHistory auto-scroll
    correspondingChatHistoryItem._time = new Date().getTime();
    // update correspondingChatHistoryItem.metadata
    correspondingChatHistoryItem.metadata = queueItem;
    // update correspondingChatHistoryItem.status if queueItem.status is interrupted(from message.interrupt event)
    if (queueItem.status === EMessageStatus.INTERRUPTED) {
      correspondingChatHistoryItem.status = EMessageStatus.INTERRUPTED;
    }
    // pop all valid word items(those word.start_ms <= curPTS) in queueItem
    const validWords: TMessageEngineObjectWord[] = [];
    const restWords: TMessageEngineObjectWord[] = [];
    for (const word of queueItem.words) {
      if (word.start_ms <= curPTS) {
        validWords.push(word);
      } else {
        restWords.push(word);
      }
    }
    // check if restWords is empty
    const isRestWordsEmpty = restWords.length === 0;
    // check if validWords last word is final
    const isLastWordFinal =
      validWords[validWords.length - 1]?.word_status !==
      EMessageStatus.IN_PROGRESS;
    // if restWords is empty and validWords last word is final, this turn is ended
    if (isRestWordsEmpty && isLastWordFinal) {
      // update messageList with queueItem
      correspondingChatHistoryItem.text = queueItem.text;
      correspondingChatHistoryItem.status = queueItem.status;
      // pop queueItem
      this._lastPoppedQueueItem = this._queue.shift();
      return;
    }
    // if restWords is not empty, update correspondingChatHistoryItem.text
    const validWordsText = validWords
      .filter(word => word.word_status === EMessageStatus.IN_PROGRESS)
      .map(word => word.word)
      .join('');
    correspondingChatHistoryItem.text = validWordsText;
    // if validWords last word is interrupted, this turn is ended
    const isLastWordInterrupted =
      validWords[validWords.length - 1]?.word_status ===
      EMessageStatus.INTERRUPTED;
    if (isLastWordInterrupted) {
      // pop queueItem
      this._lastPoppedQueueItem = this._queue.shift();
      return;
    }
    return;
  }

  private _appendChatHistory(
    item: IMessageArrayItem<Partial<IUserTranscription | IAgentTranscription>>,
  ) {
    // if item.turn_id is 0, append to the front of messageList(greeting message)
    if (item.turn_id === 0) {
      this.messageList = [item, ...this.messageList];
    } else {
      this.messageList.push(item);
    }
  }

  private _mutateChatHistory() {
    // logger.debug(LogSource.AgoraSDK,'AI_AGENT', 'Mutate messageList', this.messageList)
    // logger.debug(
    //   LogSource.AgoraSDK,
    //   'AI_AGENT',
    //   'Mutate messageList',
    //   this._pts,
    //   this.messageList
    //     .map(item => `${item.text}[status: ${item.status}]`)
    //     .join('\n'),
    // );
    this.onMessageListUpdate?.(this.messageList as IMessageListItem[]);
  }
}

export let messageService: MessageEngine | null = null;

/**
 * Initializes the Message Engine (if not already initialized)
 * @returns {MessageEngine} Singleton instance of MessageEngine
 */
export function initializeMessageEngine(): MessageEngine {
  if (!messageService) {
    messageService = new MessageEngine(EMessageEngineMode.TEXT, chatHistory => {
      LocalEventEmitter.emit(LocalEventsEnum.AGENT_TRANSCRIPT_CHANGE, {
        data: {
          type: 'message',
          chatHistory,
        },
      });
    });
  }
  return messageService;
}

export function closeMessageEngine() {
  if (messageService) {
    messageService.cleanup();
    messageService = null;
  }
}
