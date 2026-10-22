/* 应用主逻辑：状态管理、表单绑定、版式切换、恢复示例、导出。 */

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const state = {
    template: "classic",
    productImage: "",
    qrImage: "",
    points: [
      "产地直发，没有中间商加价",
      "冰糖心占比高，一口爆汁甜",
      "坏果包赔，售后无忧"
    ]
  };

  const fields = [
    "topTag", "brandName", "productTitle", "subtitle", "originalPrice",
    "salePrice", "leaderNote", "shipping", "buttonMain", "buttonSub", "imageRatio", "imageFit"
  ];

  function value(id) {
    return $(id).value.trim();
  }

  function money(num) {
    const parsed = Number(num);
    if (!Number.isFinite(parsed)) return "0.00";
    return parsed.toFixed(2);
  }

  // 从表单收集当前绘制所需的状态快照
  function collectState() {
    return {
      template: state.template,
      productImage: state.productImage,
      qrImage: state.qrImage,
      points: state.points.slice(),
      topTag: value("topTag"),
      brandName: value("brandName"),
      productTitle: value("productTitle"),
      subtitle: value("subtitle"),
      originalPrice: value("originalPrice"),
      salePrice: value("salePrice"),
      leaderNote: value("leaderNote"),
      shipping: value("shipping"),
      buttonMain: value("buttonMain"),
      buttonSub: value("buttonSub"),
      imageRatio: value("imageRatio"),
      imageFit: value("imageFit")
    };
  }

  function renderPointsEditor() {
    $("points").innerHTML = "";
    state.points.forEach((point, index) => {
      const row = document.createElement("div");
      row.className = "point-row";

      const input = document.createElement("input");
      input.type = "text";
      input.value = point;
      input.setAttribute("aria-label", `卖点 ${index + 1}`);
      input.addEventListener("input", () => {
        state.points[index] = input.value;
        render();
      });

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "icon-btn";
      remove.textContent = "×";
      remove.title = "删除这条卖点";
      remove.addEventListener("click", () => {
        state.points.splice(index, 1);
        renderPointsEditor();
        render();
      });

      row.append(input, remove);
      $("points").append(row);
    });
  }

  function loadImage(src) {
    return new Promise((resolve) => {
      if (!src) return resolve(null);
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  let renderToken = 0;

  async function renderCanvasPreview() {
    const token = ++renderToken;
    const canvas = $("previewCanvas");
    const ctx = canvas.getContext("2d");
    const snapshot = collectState();
    const productImg = await loadImage(snapshot.productImage);
    const qrImg = await loadImage(snapshot.qrImage);
    if (token !== renderToken) return;
    snapshot.productImage = productImg;
    snapshot.qrImage = qrImg;
    window.PosterModule.drawPoster(ctx, snapshot);
  }

  function render() {
    renderCanvasPreview();
  }

  function readFileAsDataUrl(file, callback) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => callback(String(reader.result));
    reader.readAsDataURL(file);
  }

  async function exportPoster() {
    const canvas = document.createElement("canvas");
    canvas.width = window.PosterModule.POSTER_WIDTH;
    canvas.height = window.PosterModule.POSTER_HEIGHT;
    const ctx = canvas.getContext("2d");
    const snapshot = collectState();
    snapshot.productImage = await loadImage(snapshot.productImage);
    snapshot.qrImage = await loadImage(snapshot.qrImage);
    window.PosterModule.drawPoster(ctx, snapshot);

    const link = document.createElement("a");
    link.download = `快团团素材-${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  function bind() {
    fields.forEach((id) => {
      $(id).addEventListener("input", render);
      $(id).addEventListener("change", render);
    });

    document.querySelectorAll(".template-option").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelectorAll(".template-option").forEach((item) => item.classList.remove("active"));
        button.classList.add("active");
        state.template = button.dataset.template;
        render();
      });
    });

    $("addPoint").addEventListener("click", () => {
      if (state.points.length >= 6) return;
      state.points.push("");
      renderPointsEditor();
      render();
    });

    $("productImage").addEventListener("change", (event) => {
      readFileAsDataUrl(event.target.files[0], (src) => {
        state.productImage = src;
        render();
      });
    });

    $("qrImage").addEventListener("change", (event) => {
      readFileAsDataUrl(event.target.files[0], (src) => {
        state.qrImage = src;
        render();
      });
    });

    $("resetDemo").addEventListener("click", () => {
      $("topTag").value = "今日开团";
      $("brandName").value = "小美优选·团长";
      $("productTitle").value = "【新疆直发】阿克苏冰糖心苹果 5斤装";
      $("subtitle").value = "咬一口爆汁甜脆 · 产地现摘现发";
      $("originalPrice").value = "39.9";
      $("salePrice").value = "19.9";
      $("leaderNote").value = "我自己吃了两箱，真的甜！这个价格基本就是产地价了，库存不多，手慢无～";
      $("shipping").value = "5斤/箱 · 默认圆通 · 48h 内发货 · 坏果包赔";
      $("buttonMain").value = "长按识别 跟团购买";
      $("buttonSub").value = "早买早发 · 手慢无";
      $("imageRatio").value = "auto";
      $("imageFit").value = "contain";
      state.points = [
        "产地直发，没有中间商加价",
        "冰糖心占比高，一口爆汁甜",
        "坏果包赔，售后无忧"
      ];
      state.productImage = "";
      state.qrImage = "";
      $("productImage").value = "";
      $("qrImage").value = "";
      renderPointsEditor();
      render();
    });

    $("exportPng").addEventListener("click", exportPoster);
  }

  bind();
  renderPointsEditor();
  render();

  // 自检输出：页面加载后把布局几何写入隐藏节点，供 headless 回归测试提取。
  // 对用户无感知；不依赖 getImageData，避免无头环境 GPU 崩溃。
  window.addEventListener("load", function () {
    function r(sel) {
      var el = document.querySelector(sel);
      if (!el) return null;
      var b = el.getBoundingClientRect();
      return { w: Math.round(b.width), h: Math.round(b.height) };
    }
    var canvas = document.getElementById("previewCanvas");
    var ratio = canvas && canvas.clientHeight ? (canvas.clientWidth / canvas.clientHeight) : null;
    var report = {
      viewportW: window.innerWidth,
      editor: r(".editor"),
      previewWrap: r(".preview-wrap"),
      phone: r(".phone"),
      canvas: r(".previewCanvas"),
      canvasRatio: ratio ? Number(ratio.toFixed(4)) : null,
      expectedRatio: 720 / 1280,
      templateOptions: document.querySelectorAll(".template-option").length,
      pointRows: document.querySelectorAll(".point-row").length,
      hasExportBtn: !!document.getElementById("exportPng"),
      hasResetBtn: !!document.getElementById("resetDemo")
    };
    var node = document.createElement("script");
    node.type = "application/json";
    node.id = "__layout_report";
    node.textContent = JSON.stringify(report);
    document.body.appendChild(node);
  });
})();
