(() => {
  function init() {
    const chatHistory = [];
    let isOpen = false;

    // ---------- Styles ----------
    const style = document.createElement("style");
    style.textContent = `
      .proofy-chat-btn{
        position:fixed;bottom:20px;right:20px;z-index:9999;
        padding:12px 16px;border-radius:999px;border:none;cursor:pointer;
        background:linear-gradient(135deg,#6ee7b7,#3b82f6);
        color:#0b1020;font-weight:700;box-shadow:0 10px 30px rgba(0,0,0,.25);
      }
      .proofy-panel{
        position:fixed;bottom:86px;right:20px;z-index:9999;
        width:min(380px, calc(100vw - 40px));
        height:min(560px, calc(100vh - 140px));
        background:rgba(10,16,32,.92);
        border:1px solid rgba(255,255,255,.10);
        border-radius:18px;overflow:hidden;
        box-shadow:0 20px 60px rgba(0,0,0,.45);
        backdrop-filter: blur(10px);
        display:none;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
        color:#eaf1ff;
      }
      .proofy-header{
        display:flex;align-items:center;justify-content:space-between;
        padding:12px 12px;border-bottom:1px solid rgba(255,255,255,.08);
        background:rgba(255,255,255,.03);
      }
      .proofy-title{
        font-weight:800;letter-spacing:.2px;font-size:14px;
        display:flex;gap:10px;align-items:center;
      }
      .proofy-dot{
        width:10px;height:10px;border-radius:999px;background:linear-gradient(135deg,#6ee7b7,#3b82f6);
        box-shadow:0 0 0 3px rgba(110,231,183,.12);
      }
      .proofy-actions{display:flex;gap:8px;align-items:center;}
      .proofy-x{
        width:34px;height:34px;border-radius:12px;border:1px solid rgba(255,255,255,.10);
        background:rgba(255,255,255,.04);color:#eaf1ff;cursor:pointer;
      }
      .proofy-body{
        padding:12px;height:calc(100% - 56px - 64px);overflow:auto;
      }
      .proofy-quick{
        display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;
      }
      .proofy-qbtn{
        padding:8px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.12);
        background:rgba(255,255,255,.04);color:#eaf1ff;cursor:pointer;font-weight:700;font-size:12px;
      }
      .proofy-msg{margin:10px 0;display:flex;flex-direction:column;gap:8px;}
      .proofy-msg.user{align-items:flex-end;}
      .proofy-msg.assistant{align-items:flex-start;}
      .proofy-bubble{
        max-width:85%;
        padding:10px 12px;border-radius:14px;
        border:1px solid rgba(255,255,255,.10);
        background:rgba(255,255,255,.04);
        line-height:1.35;font-size:13px;
        white-space:pre-wrap;
      }
      .proofy-msg.user .proofy-bubble{
        background:rgba(59,130,246,.20);
        border-color:rgba(59,130,246,.25);
      }
      .proofy-bubble a{color:#93c5fd;text-decoration:underline;}
      .proofy-ctas{display:flex;gap:8px;flex-wrap:wrap;max-width:85%;}
      .proofy-cta{
        display:inline-flex;align-items:center;
        padding:9px 12px;border-radius:999px;
        border:1px solid rgba(255,255,255,.14);
        background:rgba(255,255,255,.06);
        color:#eaf1ff;text-decoration:none;font-weight:800;font-size:12px;
        cursor:pointer;
      }
      .proofy-cta:hover{background:rgba(255,255,255,.10);}
      .proofy-footer{
        display:flex;gap:8px;padding:10px;border-top:1px solid rgba(255,255,255,.08);
        background:rgba(255,255,255,.02);
      }
      .proofy-input{
        flex:1;padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.12);
        background:rgba(0,0,0,.20);color:#eaf1ff;outline:none;
      }
      .proofy-send{
        padding:10px 14px;border-radius:12px;border:none;cursor:pointer;
        background:linear-gradient(135deg,#6ee7b7,#3b82f6);
        color:#0b1020;font-weight:900;
      }
      .proofy-hint{
        margin-top:8px;font-size:11px;opacity:.75;
      }
    `;
    document.head.appendChild(style);

    // ---------- Button ----------
    const button = document.createElement("button");
    button.className = "proofy-chat-btn";
    button.innerText = "Fråg
