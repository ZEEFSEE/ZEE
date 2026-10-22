import { isStockQuestion, resolveStockCode, formatQuoteSummary } from "./mia-stock-awareness-core.mjs";

(() => {
  const PROJECT_URL = "https://dbooikzqprnqbgpfwsze.supabase.co";
  // This is the same publishable key already used by mia-chat.html; it is not a secret key.
  const PUBLISHABLE_KEY = "sb_publishable_spH47ZngJJTk13cpYPBjSw_X5qAsBmK";
  const STOCK_QUERY_URL = PROJECT_URL + "/functions/v1/mia-stock-query";
  const STOCK_CHAT_URL = PROJECT_URL + "/functions/v1/mia-stock-chat";
  const form = document.getElementById("composer");
  if (!form) return;

  function setStatus(message, kind = "") {
    const node = document.getElementById("status");
    if (!node) return;
    node.textContent = message;
    node.className = kind;
  }

  function addTemporaryBubble(role, content) {
    const log = document.getElementById("log");
    if (!log) return;
    const welcome = log.querySelector(".welcome");
    if (welcome) welcome.remove();
    const bubble = document.createElement("div");
    bubble.className = "bubble " + (role === "user" ? "user" : "assistant");
    bubble.textContent = String(content || "");
    log.appendChild(bubble);
    log.scrollTop = log.scrollHeight;
  }

  form.addEventListener("submit", async (event) => {
    const input = document.getElementById("message");
    const message = String(input?.value || "").trim();
    if (!isStockQuestion(message)) return;

    // Intercept before the normal send handler so market Q&A does not enter
    // mia-chat's conversation/memory persistence path.
    event.preventDefault();
    event.stopImmediatePropagation();

    const token = sessionStorage.getItem("mia_chat_token") || "";
    if (!token) {
      setStatus("请先登录 Mia 独立聊天室，再查询股票。", "error");
      return;
    }
    if (!message) return;

    const code = resolveStockCode(message);
    if (!code) {
      addTemporaryBubble("user", message);
      addTemporaryBubble("assistant", "我可以查询已接入的 A 股行情。请提供 6 位股票代码（例如 600519），或使用目前支持的名称：贵州茅台、平安银行、比亚迪、宁德时代、五粮液。指数暂未接入。");
      input.value = "";
      setStatus("未请求行情：无法从问题中确定受支持的 A 股代码。此次问答仅临时显示，不写入聊天历史或长期记忆。", "good");
      return;
    }

    const send = document.getElementById("send");
    const previousText = send?.textContent;
    if (send) { send.disabled = true; send.textContent = "查询中…"; }
    if (input) input.disabled = true;
    addTemporaryBubble("user", message);
    input.value = "";
    setStatus("正在获取 " + code + " 的最新可用行情…");

    try {
      const quoteResponse = await fetch(STOCK_QUERY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": PUBLISHABLE_KEY,
          "Authorization": "Bearer " + PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ code }),
        cache: "no-store",
      });
      const quoteResult = await quoteResponse.json().catch(() => ({}));
      if (!quoteResponse.ok || !quoteResult.ok || !quoteResult.data) {
        throw new Error(quoteResult.error || ("行情查询失败（HTTP " + quoteResponse.status + "）"));
      }

      const stockResponse = await fetch(STOCK_CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": PUBLISHABLE_KEY,
          "Authorization": "Bearer " + token,
        },
        body: JSON.stringify({ message, quote: quoteResult.data }),
        cache: "no-store",
      });
      const stockResult = await stockResponse.json().catch(() => ({}));
      if (!stockResponse.ok || !stockResult.ok || !stockResult.reply) {
        throw new Error(stockResult.error || ("股票解释失败（HTTP " + stockResponse.status + "）"));
      }

      addTemporaryBubble("assistant", formatQuoteSummary(stockResult.quote || quoteResult.data) + "\\n\\nMia：\\n" + stockResult.reply);
      setStatus("行情已返回。为遵守独立聊天边界，本次股票问答只在当前页面临时显示，不写入 mia_messages、mia_memories、情绪或人格状态；刷新页面后不会作为聊天历史保留。", "good");
    } catch (error) {
      addTemporaryBubble("assistant", "这次我没能可靠取得股票行情，因此不会猜测价格。原因：" + (error?.message || String(error)));
      setStatus("股票查询失败；没有转交普通聊天，也没有写入 Mia 聊天历史或长期记忆。", "error");
    } finally {
      if (send) { send.disabled = false; send.textContent = previousText || "发送 ↗"; }
      if (input) { input.disabled = false; input.focus(); }
    }
  }, true);
})();
