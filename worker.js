const CONSTANTS = {
    THINKING_MESSAGE: "🤖 *考え中...（AIのやつが入力中）*",
    ERROR_MESSAGE: "⚠️ ごめんなさい、応答に失敗しました。",
    RESPONSE_PREFIX: "💡 *AIのやつ*: ",
    DEFAULT_USER: "slack_user"
};

// APIクライアントの分離
class SlackClient {
    constructor(token) {
        this.token = token;
        this.headers = {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
        };
    }

    async postMessage(channel, thread_ts, text) {
        const response = await fetch("https://slack.com/api/chat.postMessage", {
            method: "POST",
            headers: this.headers,
            body: JSON.stringify({channel, thread_ts, text})
        });
        return response.json();
    }

    async updateMessage(channel, ts, text) {
        return fetch("https://slack.com/api/chat.update", {
            method: "POST",
            headers: this.headers,
            body: JSON.stringify({channel, ts, text})
        });
    }
}

class DifyClient {
    constructor(apiKey, appId) {
        this.apiKey = apiKey;
        this.appId = appId;
        this.headers = {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json"
        };
    }

    async sendMessage(message, user, conversationId = null) {
        const payload = {
            app_id: this.appId,
            inputs: {},
            query: message,
            response_mode: "blocking",
            user
        };

        if (conversationId) {
            payload.conversation_id = conversationId;
        }

        const response = await fetch("https://api.dify.ai/v1/chat-messages", {
            method: "POST",
            headers: this.headers,
            body: JSON.stringify(payload)
        });

        return response.json();
    }
}

export default {
    async fetch(request, env, ctx) {
        if (request.headers.get("X-Slack-Retry-Num")) {
            return new Response("Retry ignored", {status: 200});
        }

        const url = new URL(request.url);
        if (url.pathname === "/event") {
            const body = await request.json();
            ctx.waitUntil(handleSlackEvent(body, env));
            return new Response("OK", {status: 200});
        }

        return new Response("Slack bot ready");
    }
};

async function handleSlackEvent(body, env) {
    const event = body.event;

    if (!shouldProcessEvent(event)) {
        return;
    }

    const messageData = extractMessageData(event, body);
    const conversationId = await env.THREAD_MAP.get(messageData.threadTs);

    if (!shouldContinueProcessing(messageData, conversationId, body)) {
        return;
    }

    const slackClient = new SlackClient(env.SLACK_BOT_TOKEN);
    const difyClient = new DifyClient(env.DIFY_API_KEY, env.DIFY_APP_ID);

    // 考え中メッセージの投稿
    const placeholderMessage = await postThinkingMessage(slackClient, messageData);

    // Difyとの対話処理
    const response = await processDifyResponse(
        difyClient,
        messageData,
        conversationId,
        env
    );

    // 返信の更新
    await updateResponse(slackClient, messageData, placeholderMessage.ts, response);
}

function shouldProcessEvent(event) {
    if (event.bot_id || ["bot_message", "message_changed"].includes(event.subtype)) {
        return false;
    }
    return event && (event.type === "app_mention" || event.type === "message");
}

function extractMessageData(event, body) {
    return {
        channel: event.channel,
        user: event.user || CONSTANTS.DEFAULT_USER,
        threadTs: event.thread_ts || event.ts,
        userMessage: (event.text || "").replace(/<@[^>]+>\s*/, "").trim(),
        isAppMention: event.type === "app_mention",
        isDirectMessage: body.event.channel_type === "im"
    };
}

function shouldContinueProcessing(messageData, conversationId, body) {
    return messageData.isAppMention ||
        messageData.isDirectMessage ||
        conversationId;
}

async function postThinkingMessage(slackClient, messageData) {
    return await slackClient.postMessage(
        messageData.channel,
        messageData.threadTs,
        CONSTANTS.THINKING_MESSAGE
    );
}

async function processDifyResponse(difyClient, messageData, conversationId, env) {
    try {
        const difyResponse = await difyClient.sendMessage(
            messageData.userMessage,
            messageData.user,
            conversationId
        );

        if (!conversationId && difyResponse.conversation_id) {
            await env.THREAD_MAP.put(
                messageData.threadTs,
                difyResponse.conversation_id,
                {expirationTtl: env.THREAD_LIFETIME_SEC}
            );
        }

        return difyResponse.answer || CONSTANTS.ERROR_MESSAGE;
    } catch (err) {
        console.error("Dify fetch failed:", err);
        return `❌ Dify error: ${err.message}`;
    }
}

async function updateResponse(slackClient, messageData, messageTs, answer) {
    await slackClient.updateMessage(
        messageData.channel,
        messageTs,
        `${CONSTANTS.RESPONSE_PREFIX}${answer}`
    );
}