/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* global Redux, Conversations, topMail3Pane, getMail3Pane,
          isInTab:true, openConversationInTabOrWindow,
          printConversation, ConversationUtils */

/* exported conversationApp, attachmentActions, messageActions */

"use strict";

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);
XPCOMUtils.defineLazyModuleGetters(this, {
  ContactHelpers: "chrome://conversations/content/modules/contact.js",
  openConversationInTabOrWindow:
    "chrome://conversations/content/modules/misc.js",
  MessageUtils: "chrome://conversations/content/modules/message.js",
});

const initialMessages = {
  msgData: [],
};

const initialSummary = {
  conversation: null,
  // TODO: What is loading used for?
  loading: true,
  iframesLoading: 0,
  subject: "",
};

function modifyOnlyMsg(currentState, msgUri, modifier) {
  const newState = { ...currentState };
  const newMsgData = [];
  for (let i = 0; i < currentState.msgData.length; i++) {
    if (currentState.msgData[i].msgUri == msgUri) {
      newMsgData.push(modifier({ ...currentState.msgData[i] }));
    } else {
      newMsgData.push(currentState.msgData[i]);
    }
  }
  newState.msgData = newMsgData;
  return newState;
}

const attachmentActions = {
  previewAttachment({ name, url, isPdf, maybeViewable }) {
    return async () => {
      if (maybeViewable) {
        // Can't use browser.tabs.create because imap://user@bar/ is an
        // illegal url.
        browser.conversations.createTab({
          url,
          type: "contentTab",
        });
      }
      if (isPdf) {
        browser.conversations.createTab({
          url:
            "chrome://conversations/content/pdfviewer/wrapper.xul?uri=" +
            encodeURIComponent(url) +
            "&name=" +
            encodeURIComponent(name),
          type: "chromeTab",
        });
      }
    };
  },
  downloadAll({ msgUri, attachmentDetails }) {
    return async () => {
      MessageUtils.downloadAllAttachments(
        topMail3Pane(window),
        msgUri,
        attachmentDetails
      );
    };
  },
  downloadAttachment({ msgUri, attachment }) {
    return async () => {
      MessageUtils.downloadAttachment(topMail3Pane(window), msgUri, attachment);
    };
  },
  openAttachment({ msgUri, attachment }) {
    return async () => {
      MessageUtils.openAttachment(topMail3Pane(window), msgUri, attachment);
    };
  },
  detachAttachment({ msgUri, attachment, shouldSave }) {
    return async () => {
      MessageUtils.detachAttachment(
        topMail3Pane(window),
        msgUri,
        attachment,
        shouldSave
      );
    };
  },
  showGalleryView({ msgUri }) {
    return async () => {
      browser.tabs.create({
        url: "/gallery/index.html?uri=" + encodeURI(msgUri),
      });
    };
  },
};

const messageActions = {
  editDraft({ msgUri, shiftKey }) {
    return async () => {
      MessageUtils.editDraft(topMail3Pane(window), msgUri, shiftKey);
    };
  },

  editAsNew({ msgUri, shiftKey }) {
    return async () => {
      MessageUtils.editAsNew(topMail3Pane(window), msgUri, shiftKey);
    };
  },
  reply({ msgUri, shiftKey }) {
    return async () => {
      MessageUtils.reply(topMail3Pane(window), msgUri, shiftKey);
    };
  },
  replyAll({ msgUri, shiftKey }) {
    return async () => {
      MessageUtils.replyAll(topMail3Pane(window), msgUri, shiftKey);
    };
  },
  replyList({ msgUri, shiftKey }) {
    return async () => {
      MessageUtils.replyList(topMail3Pane(window), msgUri, shiftKey);
    };
  },
  forward({ msgUri, shiftKey }) {
    return async () => {
      MessageUtils.forward(topMail3Pane(window), msgUri, shiftKey);
    };
  },
  archive({ id }) {
    return async () => {
      browser.messages.archive([id]).catch(console.error);
    };
  },
  delete({ id }) {
    return async () => {
      browser.messages.delete([id]).catch(console.error);
    };
  },
  openClassic({ msgUri }) {
    return async () => {
      MessageUtils.openInClassic(topMail3Pane(window), msgUri);
    };
  },
  openSource({ msgUri }) {
    return async () => {
      MessageUtils.openInSourceView(topMail3Pane(window), msgUri);
    };
  },
  setTags({ id, tags }) {
    return async () => {
      browser.messages
        .update(id, {
          tags: tags.map(t => t.id),
        })
        .catch(console.error);
    };
  },
  toggleTagByIndex({ id, index, tags }) {
    return async () => {
      browser.messages
        .listTags()
        .then(allTags => {
          // browser.messages.tags works via arrays of tag id/keys only,
          // so strip away all non-key information
          allTags = allTags.map(t => t.key);
          // for some reason a mix of `tag.key` and `tag.id` is used in Conversations
          tags = tags.map(t => t.id);
          const toggledTag = allTags[index];

          // Toggling a tag that is out of range does nothing.
          if (!toggledTag) {
            return null;
          }
          if (tags.includes(toggledTag)) {
            tags = tags.filter(t => t !== toggledTag);
          } else {
            tags.push(toggledTag);
          }

          return browser.messages.update(id, {
            tags,
          });
        })
        .catch(console.error);
    };
  },
  setStarred({ id, starred }) {
    return async () => {
      browser.messages
        .update(id, {
          flagged: starred,
        })
        .catch(console.error);
    };
  },
  markAsRead({ msgUri }) {
    return async () => {
      const msg = Conversations.currentConversation.getMessage(msgUri);
      msg.read = true;
    };
  },
  selected({ msgUri }) {
    return async () => {
      if (Conversations.currentConversation) {
        const msg = Conversations.currentConversation.getMessage(msgUri);
        if (msg) {
          msg.onSelected();
        }
      }
    };
  },
  toggleConversationRead({ read }) {
    return async (dispatch, getState) => {
      const state = getState().messages;
      for (let msg of state.msgData) {
        browser.messages.update(msg.id, { read }).catch(console.error);
      }
    };
  },
  archiveConversation() {
    return async (dispatch, getState) => {
      const state = getState().messages;
      ConversationUtils.archive(
        topMail3Pane(window),
        isInTab,
        state.msgData.map(msg => msg.msgUri)
      );
    };
  },
  deleteConversation() {
    return async (dispatch, getState) => {
      const state = getState().messages;
      const win = topMail3Pane(window);
      if (
        ConversationUtils.delete(
          win,
          isInTab,
          state.msgData.map(msg => msg.msgUri)
        )
      ) {
        ConversationUtils.closeTab(win, window.frameElement);
      }
    };
  },
  clickIframe({ event }) {
    return () => {
      // Hand this off to Thunderbird's content clicking algorithm as that's simplest.
      if (!topMail3Pane(window).contentAreaClick(event)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
  },
  showRemoteContent({ msgUri }) {
    return async () => {
      Conversations.currentConversation.showRemoteContent(msgUri);
    };
  },
  alwaysShowRemoteContent({ msgUri, realFrom }) {
    return async () => {
      Conversations.currentConversation.alwaysShowRemoteContent(
        realFrom,
        msgUri
      );
    };
  },
  detachTab() {
    return async (dispatch, getState) => {
      const state = getState().messages;
      // TODO: Fix re-enabling composition when expanded into new tab.
      // let willExpand = element.hasClass("expand") && startedEditing();
      // Pick _initialSet and not msgHdrs so as to enforce the invariant
      //  that the messages from _initialSet are in the current view.
      const urls = state.msgData.map(x => x.msgUri);
      // "&willExpand=" + Number(willExpand);
      // First, save the draft, and once it's saved, then move on to opening the
      // conversation in a new tab...
      // onSave(() => {
      openConversationInTabOrWindow(urls);
      // });
    };
  },
  notificationClick({ msgUri, notificationType, extraData }) {
    return async () => {
      const msg = Conversations.currentConversation.getMessage(msgUri);
      msg.msgPluginNotification(
        topMail3Pane(window),
        notificationType,
        extraData
      );
    };
  },
  tagClick({ msgUri, event, details }) {
    return async () => {
      const msg = Conversations.currentConversation.getMessage(msgUri);
      msg.msgPluginTagClick(topMail3Pane(window), event, details);
    };
  },
};

function messages(state = initialMessages, action) {
  switch (action.type) {
    case "REPLACE_CONVERSATION_DETAILS": {
      return {
        ...state,
        ...action.messages,
      };
    }
    case "MSG_EXPAND": {
      return modifyOnlyMsg(state, action.msgUri, msg => {
        const newMsg = { ...msg };
        newMsg.expanded = action.expand;
        return newMsg;
      });
    }
    case "TOGGLE_CONVERSATION_EXPANDED": {
      const newState = { ...state };
      const newMsgData = [];
      for (let msg of newState.msgData) {
        const newMsg = { ...msg, expanded: action.expand };
        newMsgData.push(newMsg);
      }
      newState.msgData = newMsgData;
      return newState;
    }
    case "MSG_UPDATE_DATA": {
      return modifyOnlyMsg(state, action.msgData.msgUri, msg => {
        return { ...msg, ...action.msgData };
      });
    }
    case "MSG_ADD_SPECIAL_TAG": {
      return modifyOnlyMsg(state, action.uri, msg => {
        let newSpecialTags;
        if (!("specialTags" in msg)) {
          newSpecialTags = [action.tagDetails];
        } else {
          newSpecialTags = [...msg.specialTags, action.tagDetails];
        }
        return { ...msg, specialTags: newSpecialTags };
      });
    }
    case "MSG_REMOVE_SPECIAL_TAG": {
      return modifyOnlyMsg(state, action.uri, msg => {
        const newSpecialTags = [...msg.specialTags];
        return {
          ...msg,
          specialTags: newSpecialTags.filter(
            t => t.name != action.tagDetails.name
          ),
        };
      });
    }
    case "MARK_AS_JUNK": {
      // This action should only be activated when the conversation is not a
      //  conversation in a tab AND there's only one message in the conversation,
      //  i.e. the currently selected message
      ConversationUtils.markAsJunk(topMail3Pane(window), action.isJunk);
      if (!action.isJunk) {
        // TODO: We should possibly wait until we get the notification before
        // clearing the state here.
        return modifyOnlyMsg(state, action.msgUri, msg => {
          const newMsg = { ...msg };
          newMsg.isJunk = action.isJunk;
          return newMsg;
        });
      }
      return state;
    }
    case "MSG_IGNORE_PHISHING": {
      MessageUtils.ignorePhishing(action.msgUri);
      return modifyOnlyMsg(state, action.msgUri, msg => {
        const newMsg = { ...msg };
        newMsg.isPhishing = false;
        return newMsg;
      });
    }
    case "MSG_SHOW_DETAILS": {
      const newState = { ...state };
      const newMsgData = [];
      for (let i = 0; i < state.msgData.length; i++) {
        if (state.msgData[i].msgUri == action.msgUri) {
          newMsgData.push({ ...state.msgData[i], detailsShowing: action.show });
          if (!newMsgData.hdrDetails) {
            // Let this exit before we start the function.
            setTimeout(() => {
              MessageUtils.getMsgHdrDetails(window, action.msgUri);
            }, 0);
          }
        } else {
          newMsgData.push(state.msgData[i]);
        }
      }
      newState.msgData = newMsgData;
      return newState;
    }
    case "MSG_HDR_DETAILS": {
      const newState = { ...state };
      const newMsgData = [];
      for (let i = 0; i < state.msgData.length; i++) {
        if (state.msgData[i].msgUri == action.msgUri) {
          newMsgData.push({
            ...state.msgData[i],
            extraLines: action.extraLines,
          });
        } else {
          newMsgData.push(state.msgData[i]);
        }
      }
      newState.msgData = newMsgData;
      return newState;
    }
    case "REMOVE_MESSAGE_FROM_CONVERSATION": {
      const newState = { ...state };
      const newMsgData = [];
      for (let i = 0; i < state.msgData.length; i++) {
        if (state.msgData[i].msgUri != action.msgUri) {
          newMsgData.push(state.msgData[i]);
        }
      }
      newState.msgData = newMsgData;
      return newState;
    }
    case "APPEND_MESSAGES": {
      const newState = { ...state };
      newState.msgData = newState.msgData.concat(action.msgData);
      return newState;
    }
    case "MSG_SHOW_NOTIFICATION": {
      return modifyOnlyMsg(state, action.msgData.msgUri, msg => {
        const newMsg = { ...msg };
        if ("extraNotifications" in msg) {
          let i = msg.extraNotifications.findIndex(
            n => n.type == action.msgData.notification.type
          );
          if (i != -1) {
            newMsg.extraNotifications = [...msg.extraNotifications];
            newMsg.extraNotifications[i] = action.msgData.notification;
          } else {
            newMsg.extraNotifications = [
              ...msg.extraNotifications,
              action.msgData.notification,
            ];
          }
        } else {
          newMsg.extraNotifications = [action.msgData.notification];
        }
        return newMsg;
      });
    }
    default: {
      return state;
    }
  }
}

function summary(state = initialSummary, action) {
  switch (action.type) {
    case "REPLACE_CONVERSATION_DETAILS": {
      if (!("summary" in action)) {
        return state;
      }
      return {
        ...state,
        ...action.summary,
      };
    }
    case "ADD_CONTACT": {
      browser.convContacts.beginNew({
        email: action.email,
        displayName: action.name,
      });
      // TODO: In theory we should be updating the store so that the button can
      // then be updated to indicate this is now in the address book. However,
      // until we start getting the full conversation messages hooked up, this
      // won't be easy. As this is only a small bit of hidden UI, we can punt on
      // this for now.
      return state;
    }
    case "COPY_EMAIL": {
      navigator.clipboard.writeText(action.email);
      return state;
    }
    case "CREATE_FILTER": {
      topMail3Pane(window).MsgFilters(action.email, null);
      return state;
    }
    case "EDIT_CONTACT": {
      browser.convContacts.beginEdit({
        email: action.email,
      });
      return state;
    }
    case "FORWARD_CONVERSATION": {
      Conversations.currentConversation.forward().catch(console.error);
      return state;
    }
    case "OPEN_LINK": {
      getMail3Pane().messenger.launchExternalURL(action.url);
      return state;
    }
    case "PRINT_CONVERSATION": {
      // TODO: Fix printing
      printConversation();
      return state;
    }
    case "SEND_EMAIL": {
      ContactHelpers.composeMessage(
        action.name,
        action.email,
        topMail3Pane(window).gFolderDisplay.displayedFolder
      );
      return state;
    }
    case "SEND_UNSENT": {
      ConversationUtils.sendUnsent(topMail3Pane(window));
      return state;
    }
    case "SHOW_MESSAGES_INVOLVING": {
      ContactHelpers.showMessagesInvolving(
        topMail3Pane(window),
        action.name,
        action.email
      );
      return state;
    }
    case "SWITCH_TO_FOLDER": {
      ConversationUtils.switchToFolderAndMsg(
        topMail3Pane(window),
        action.msgUri
      );
      return state;
    }
    case "MSG_STREAM_MSG": {
      let newState = { ...state };
      if (!action.dueToExpansion) {
        newState.iframesLoading++;
      }
      state.conversation
        .getMessage(action.msgUri)
        .streamMessage(topMail3Pane(window).msgWindow, action.docshell);
      return newState;
    }
    case "MSG_STREAM_LOAD_FINISHED": {
      let newState = { ...state };
      if (!action.dueToExpansion) {
        newState.iframesLoading--;
        if (newState.iframesLoading < 0) {
          newState.iframesLoading = 0;
        }
      }
      // It might be that we're trying to send a message on unmount, but the
      // conversation/message has gone away. If that's the case, we just skip
      // and move on.
      if (state.conversation && state.conversation.getMessage) {
        const msg = state.conversation.getMessage(action.msgUri);
        if (msg) {
          msg.postStreamMessage(topMail3Pane(window).msgWindow, action.iframe);
        }
      }
      return newState;
    }
    default: {
      return state;
    }
  }
}

const conversationApp = Redux.combineReducers({
  messages,
  summary,
});
