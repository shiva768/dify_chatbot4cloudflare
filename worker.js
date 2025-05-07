// Cloudflare Workers + Slack + Dify (KV使用バージョン)
// KV: THREAD_MAP に slack thread_ts <-> dify conversation_id を保存

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
    console.log(`event.type: ${event.type}`)
    if (event.bot_id || ["bot_message", "message_changed"].includes(event.subtype)) {
        console.log('bot message, message changed');
        return; // Bot が出した or 編集通知 → 無視
    }
    if (!event || !(event.type === "app_mention" || event.type === "message")) {
        console.log('other message');
        return;
    }

    const channel = event.channel;
    const user = event.user || "slack_user";
    const threadTs = event.thread_ts || event.ts;
    const rawText = event.text || "";
    const userMessage = rawText.replace(/<@[^>]+>\s*/, "").trim();

    // KVから conversation_id を取得（なければ初回）
    const conversationId = await env.THREAD_MAP.get(threadTs);
    console.log(`threadTs: ${threadTs}, conversationId: ${conversationId}`);

    const isAppMention = event.type === "app_mention";
    const isDirectMessage = body.event.channel_type === "im";
    // 既に KV に登録されているスレッドならメンション無しでも続行
    if (!(isAppMention || isDirectMessage) && !conversationId) {
        console.log('no mention and thread message');
        return;
    }

    console.log(`event.type: ${event.type}`)
    // Slackに「考え中...」を即投稿
    const placeholderRes = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            channel,
            thread_ts: threadTs,
            text: "🤖 *考え中...（AIのやつが入力中）*",
        }),
    });
    const placeholderJson = await placeholderRes.json();
    const messageTs = placeholderJson.ts;

    const difyPayload = {
        app_id: env.DIFY_APP_ID,
        inputs: {},
        query: userMessage,
        response_mode: "blocking",
        user,
    };
    if (conversationId) {
        difyPayload.conversation_id = conversationId;
    }

    let answer = "⚠️ ごめんなさい、応答に失敗しました。";
    try {
        const difyRes = await fetch("https://api.dify.ai/v1/chat-messages", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${env.DIFY_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(difyPayload),
        });
        const difyJson = await difyRes.json();
        answer = difyJson.answer || answer;

        if (!conversationId && difyJson.conversation_id) {
            console.log(`put threadTs: ${threadTs}, conversationId: ${difyJson.conversation_id}`);
            await env.THREAD_MAP.put(threadTs, difyJson.conversation_id, {expirationTtl: env.THREAD_LIFETIME_SEC});
        }
    } catch (err) {
        answer = `❌ Dify error: ${err.message}`;
        console.error("Dify fetch failed:", err);
    }

    // Slackメッセージを上書き
    await fetch("https://slack.com/api/chat.update", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            channel,
            ts: messageTs,
            text: `💡 *AIのやつ*: ${answer}`,
        }),
    });
}
