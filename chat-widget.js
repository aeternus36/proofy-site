(() => {
  const chatHistory = [];

  const button = document.createElement("button");
  button.innerText = "Fråga oss";
  button.style.position = "fixed";
  button.style.bottom = "20px";
  button.style.right = "20px";
  button.style.zIndex = "9999";
  button.style.padding = "12px 16px";
  button.style.borderRadius = "999px";
  button.style.border = "none";
  button.style.cursor = "pointer";
  button.style.background = "linear-gradient(135deg, #6ee7b7, #3b82f6)";
  button.style.color = "#0b1020";
  button.style.fontWeight = "600";

  document.body.appendChild(button);

  button.onclick = () => {
    alert("Chatten är öppen – skriv din fråga längst ner till höger 👋");
  };

  window.sendMessageToProofy = async function (text) {
    chatHistory.push({ role: "user", content: text });

    const res = await fetch("/.netlify/functions/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: chatHistory,
      }),
    });

    const data = await res.json();
    chatHistory.push({ role: "assistant", content: data.reply });
    return data.reply;
  };
})();
