/* 海报绘制模块。
   本文件是海报版式的唯一来源（Canvas 逐像素绘制）。
   当前状态：文本字段已实现实时排版；图片区仍为占位（下一步补齐）。 */

(function () {
  "use strict";

  // 海报尺寸单一来源（720×1280，9:16）
  const POSTER_WIDTH = 720;
  const POSTER_HEIGHT = 1280;

  // 字体栈（本机实测：微软雅黑、Noto Sans SC 可用）
  const FONT_STACK = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';

  // 三版式主题色
  const THEME_COLORS = {
    classic: "#ff4d57",
    clean: "#13a8c7",
    boom: "#ff6c35"
  };

  function themeColor(template) {
    return THEME_COLORS[template] || THEME_COLORS.classic;
  }

  // 圆角矩形路径
  function roundedRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  // 收尾标点：不得出现在行首
  const NO_LINE_START = new Set(["，", "。", "、", "；", "：", "！", "？", "）", "》", "」", "』", "】", "）", "…", ".", ",", ";", ":", "!", "?"]);

  function isLineStartForbidden(ch) {
    return NO_LINE_START.has(ch);
  }

  // 判断字符是否属于「单词」字符（拉丁字母 / 数字，连续串不拆）
  function isWordChar(ch) {
    return /[A-Za-z0-9]/.test(ch);
  }

  // 把文本切成 token：连续英文/数字为一个词，其余每个字符单独成 token。
  // 空格附加到前一个 token 尾部，避免断行时空格落到下一行开头。
  function tokenize(text) {
    const chars = Array.from(text);
    const tokens = [];
    let word = "";
    const flush = () => { if (word) { tokens.push(word); word = ""; } };
    for (const ch of chars) {
      if (isWordChar(ch)) {
        word += ch;
      } else if (ch === " " || ch === "\t") {
        // 空格：若已有词，附到词尾；否则作为独立 token（行首空格后续会被吞掉）
        if (word) {
          word += ch;
        } else if (tokens.length > 0) {
          tokens[tokens.length - 1] += ch;
        } else {
          tokens.push(ch);
        }
      } else {
        flush();
        tokens.push(ch);
      }
    }
    flush();
    return tokens;
  }

  // 中文换行：中文逐字断、英文/数字按词断；行首避让收尾标点；行数上限 + 省略号。
  // 纯逻辑版：返回行数组，不绘制（供测试与复用）。
  function wrapTextLines(text, measure, maxWidth, maxLines) {
    const src = text == null ? "" : String(text);
    const tokens = tokenize(src);
    const lines = [];
    let line = "";

    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];

      if (line && measure(line + tok) > maxWidth) {
        // 当前 token 放不下
        if (isLineStartForbidden(tok[0])) {
          // 行首不能是收尾标点：尽量把标点并到上一行末尾
          if (measure(line + tok) <= maxWidth) {
            line = line + tok;
            lines.push(line);
            line = "";
          } else {
            // 上一行也放不下，标点直接丢弃（避免溢出，也避免出现在行首）
            lines.push(line);
            line = "";
          }
        } else {
          lines.push(line);
          line = tok;
        }
      } else {
        line = line + tok;
      }

      if (lines.length === maxLines) break;
    }

    // 处理残留行
    if (line && lines.length < maxLines) {
      lines.push(line);
    }

    // 超过 maxLines：最后一行截断加省略号
    if (lines.length === maxLines) {
      let consumed = 0;
      for (const l of lines) consumed += Array.from(l).length;
      if (consumed < Array.from(src).length) {
        let last = lines[maxLines - 1];
        while (last.length > 0 && isLineStartForbidden(Array.from(last).slice(-1)[0])) {
          last = last.slice(0, -1);
        }
        if (last.length === 0) {
          last = "…";
        } else {
          while (last.length > 0 && measure(last + "…") > maxWidth) {
            last = last.slice(0, -1);
          }
          last = last + "…";
        }
        lines[maxLines - 1] = last;
      }
    }

    return lines;
  }

  // 中文换行：基于 wrapTextLines，直接绘制到 ctx。返回绘制后的底部 y 坐标。
  function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    const measure = (s) => ctx.measureText(s).width;
    const lines = wrapTextLines(text, measure, maxWidth, maxLines);
    lines.forEach((item, index) => ctx.fillText(item, x, y + index * lineHeight));
    return y + lines.length * lineHeight;
  }

  // 图片适配：铺满裁切（cover）
  function drawImageCover(ctx, img, x, y, w, h) {
    const scale = Math.max(w / img.width, h / img.height);
    const sw = w / scale;
    const sh = h / scale;
    const sx = (img.width - sw) / 2;
    const sy = (img.height - sh) / 2;
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  }

  // 图片适配：完整展示（contain）
  function drawImageContain(ctx, img, x, y, w, h) {
    const scale = Math.min(w / img.width, h / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    const dx = x + (w - dw) / 2;
    const dy = y + (h - dh) / 2;
    ctx.drawImage(img, dx, dy, dw, dh);
  }

  // 根据用户选择的「展示比例」计算图片区宽高比
  function selectedImageRatio(state, img) {
    const mode = (state.imageRatio || "auto").trim() || "auto";
    if (mode === "3:4") return 3 / 4;
    if (mode === "1:1") return 1;
    if (mode === "free" && img) return Math.max(0.55, Math.min(1.3, img.width / img.height));
    if (!img) return 3 / 4;
    const sourceRatio = img.width / img.height;
    if (sourceRatio >= 0.9 && sourceRatio <= 1.1) return 1;
    return Math.max(0.55, Math.min(1.3, sourceRatio));
  }

  // 绘制商品主图：cover 裁切 / contain（模糊垫背防白边）/ 无图占位
  function drawProductImage(ctx, state, img, x, y, w, h) {
    ctx.save();
    roundedRect(ctx, x, y, w, h, 22);
    ctx.clip();
    if (!img) {
      ctx.fillStyle = "#eef1f5";
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = "#8e98a8";
      ctx.font = '500 28px ' + FONT_STACK;
      ctx.textAlign = "center";
      ctx.fillText("商品主图", x + w / 2, y + h / 2 + 10);
      ctx.textAlign = "left";
    } else if ((state.imageFit || "contain") === "cover") {
      drawImageCover(ctx, img, x, y, w, h);
    } else {
      // contain：用模糊放大副本垫背，避免留白突兀
      ctx.filter = "blur(20px)";
      drawImageCover(ctx, img, x - 20, y - 20, w + 40, h + 40);
      ctx.filter = "none";
      ctx.fillStyle = "rgba(255,255,255,.26)";
      ctx.fillRect(x, y, w, h);
      drawImageContain(ctx, img, x, y, w, h);
    }
    ctx.restore();
  }

  // 未填字段的占位默认值
  function placeholder(key) {
    const map = {
      topTag: "今日开团",
      brandName: "团长昵称",
      productTitle: "商品标题",
      subtitle: "一句话卖点",
      leaderNote: "这里填写团长推荐语",
      shipping: "规格 / 发货信息",
      buttonMain: "长按识别 跟团购买",
      buttonSub: "早买早发 · 手慢无"
    };
    return map[key] || "";
  }

  // 取字段值：空值回退占位
  function text(state, key) {
    const v = state[key];
    if (v == null) return placeholder(key);
    const s = String(v).trim();
    return s === "" ? placeholder(key) : s;
  }

  // 海报绘制主函数
  // state 字段：template, topTag, brandName, productTitle, subtitle,
  //            originalPrice, salePrice, leaderNote, shipping, buttonMain, buttonSub,
  //            points, productImage, qrImage, imageRatio, imageFit
  function drawPoster(ctx, state) {
    const accent = themeColor(state.template);

    // 白底
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);

    // 顶部色条
    ctx.fillStyle = state.template === "clean" ? "#ffffff" : accent;
    ctx.fillRect(0, 0, POSTER_WIDTH, 90);
    if (state.template === "clean") {
      ctx.fillStyle = accent;
      ctx.fillRect(0, 86, POSTER_WIDTH, 4);
    }

    // 团长昵称 / 品牌（顶栏左侧）
    ctx.fillStyle = state.template === "clean" ? "#1f2329" : "#ffffff";
    ctx.font = '800 26px ' + FONT_STACK;
    ctx.textAlign = "left";
    wrapText(ctx, text(state, "brandName"), 36, 58, 430, 28, 1);

    // 顶部标签（顶栏右侧胶囊）
    const tag = text(state, "topTag");
    ctx.font = '800 24px ' + FONT_STACK;
    const tagW = Math.min(220, ctx.measureText(tag).width + 48);
    roundedRect(ctx, POSTER_WIDTH - tagW - 36, 20, tagW, 50, 25);
    ctx.fillStyle = state.template === "clean" ? accent : "rgba(255,255,255,.25)";
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.fillText(tag, POSTER_WIDTH - tagW - 12, 53);

    // 商品标题（最多 2 行）
    ctx.fillStyle = "#1f2329";
    ctx.font = '900 36px ' + FONT_STACK;
    const titleBottom = wrapText(ctx, text(state, "productTitle"), 36, 132, 648, 40, 2);

    // 副标题（1 行，胶囊底）
    const subtitleText = text(state, "subtitle");
    ctx.font = '700 23px ' + FONT_STACK;
    const subtitleW = Math.min(600, ctx.measureText(subtitleText).width + 34);
    const subtitleY = titleBottom + 10;
    roundedRect(ctx, 36, subtitleY, subtitleW, 42, 21);
    ctx.fillStyle = "#f4f6f9";
    ctx.fill();
    ctx.fillStyle = "#748092";
    wrapText(ctx, subtitleText, 53, subtitleY + 28, subtitleW - 34, 28, 1);

    // 商品主图区（对齐参考实现：按展示比例 + 适配方式绘制，三版式差异）
    const pointItems = (state.points || []).filter(Boolean).slice(0, 6);
    const sourceRatio = state.template === "boom"
      ? Math.max(1.05, selectedImageRatio(state, state.productImage))
      : selectedImageRatio(state, state.productImage);
    const baseImageHeight = Math.max(390, 510 - Math.max(0, pointItems.length - 3) * 38);
    const maxImageWidth = state.template === "boom" ? 648 : state.template === "clean" ? 350 : 500;
    const imgH = Math.min(baseImageHeight, maxImageWidth / sourceRatio);
    const imgW = imgH * sourceRatio;
    const imgX = state.template === "clean" ? 36 : (POSTER_WIDTH - imgW) / 2;
    const imgY = subtitleY + 56;

    ctx.save();
    ctx.shadowColor = "rgba(31, 35, 41, .16)";
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 12;
    roundedRect(ctx, imgX, imgY, imgW, imgH, 22);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.restore();

    if (state.template === "boom") {
      ctx.strokeStyle = "#ffe0d1";
      ctx.lineWidth = 3;
      roundedRect(ctx, imgX, imgY, imgW, imgH, 22);
      ctx.stroke();
    }

    drawProductImage(ctx, state, state.productImage, imgX, imgY, imgW, imgH);

    // 卖点（序号圆点 + 文本；clean 版式在图右侧清单式）
    let y = state.template === "clean" ? imgY + 40 : imgY + imgH + 24;
    ctx.textBaseline = "alphabetic";
    pointItems.forEach((point, index) => {
      const pointX = state.template === "clean" ? imgX + imgW + 30 : 90;
      const markerX = state.template === "clean" ? imgX + imgW + 16 : 58;
      const pointWidth = state.template === "clean" ? POSTER_WIDTH - pointX - 28 : 590;
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(markerX, y - 8, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = '900 20px ' + FONT_STACK;
      ctx.textAlign = "center";
      ctx.fillText(String(index + 1), markerX, y);
      ctx.textAlign = "left";
      ctx.fillStyle = "#1f2329";
      ctx.font = '700 24px ' + FONT_STACK;
      y = wrapText(ctx, point, pointX, y, pointWidth, 30, state.template === "clean" ? 2 : 1) + 8;
    });

    if (state.template === "clean") y = Math.max(y, imgY + imgH + 24);

    y += 4;

    // 价格卡片
    roundedRect(ctx, 36, y, 648, 86, 18);
    ctx.fillStyle = state.template === "clean" ? "#eefafd" : state.template === "boom" ? "#fff4ee" : "#fff3f4";
    ctx.fill();
    ctx.strokeStyle = state.template === "clean" ? "#bfeef6" : state.template === "boom" ? "#ffd9c6" : "#ffd6da";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = accent;
    ctx.font = '900 31px ' + FONT_STACK;
    ctx.fillText("¥", 68, y + 56);
    ctx.font = '950 52px ' + FONT_STACK;
    const sale = Number(state.salePrice);
    ctx.fillText(Number.isFinite(sale) ? sale.toFixed(2) : "0.00", 108, y + 60);

    ctx.fillStyle = "#a2aab8";
    ctx.font = '400 24px ' + FONT_STACK;
    const orig = Number(state.originalPrice);
    const origText = "¥" + (Number.isFinite(orig) ? orig.toFixed(2) : "0.00");
    ctx.fillText(origText, 296, y + 56);
    ctx.strokeStyle = "#a2aab8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(296, y + 47);
    ctx.lineTo(296 + ctx.measureText(origText).width, y + 47);
    ctx.stroke();

    const discount = Math.max(0, (Number(state.originalPrice) || 0) - (Number(state.salePrice) || 0));
    const saveText = discount > 0 ? "立省 ¥" + Math.round(discount) : "立即跟团";
    roundedRect(ctx, 512, y + 17, 132, 52, 26);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = '900 24px ' + FONT_STACK;
    ctx.textAlign = "center";
    ctx.fillText(saveText, 512 + 66, y + 52);
    ctx.textAlign = "left";

    y += 98;

    // 团长说（最多 2 行）
    roundedRect(ctx, 36, y, 648, 76, 18);
    ctx.fillStyle = "#f4f6f9";
    ctx.fill();
    ctx.fillStyle = accent;
    ctx.font = '800 23px ' + FONT_STACK;
    ctx.fillText("团长说：", 66, y + 32);
    ctx.fillStyle = "#3d4655";
    ctx.font = '500 23px ' + FONT_STACK;
    wrapText(ctx, text(state, "leaderNote"), 160, y + 32, 500, 27, 2);

    y += 86;

    // 虚线分隔
    ctx.strokeStyle = "#e1e5ed";
    ctx.setLineDash([7, 7]);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(POSTER_WIDTH, y);
    ctx.stroke();
    ctx.setLineDash([]);

    y += 16;

    // 底部二维码 + 按钮文案 + 规格信息卡片
    roundedRect(ctx, 24, y - 10, 672, 110, 18);
    ctx.fillStyle = "#fbfcfe";
    ctx.fill();
    ctx.strokeStyle = "#edf0f5";
    ctx.lineWidth = 1;
    ctx.stroke();

    // 二维码（真实图片，cover 裁切；无图占位）
    roundedRect(ctx, 36, y, 80, 80, 16);
    ctx.fillStyle = "#eef0f4";
    ctx.fill();
    ctx.save();
    roundedRect(ctx, 36, y, 80, 80, 16);
    ctx.clip();
    if (state.qrImage) {
      drawImageCover(ctx, state.qrImage, 36, y, 80, 80);
    } else {
      ctx.fillStyle = "#b0b8c6";
      ctx.font = '750 20px ' + FONT_STACK;
      ctx.textAlign = "center";
      ctx.fillText("二维码", 76, y + 48);
      ctx.textAlign = "left";
    }
    ctx.restore();

    // 按钮主文案（1 行）
    ctx.fillStyle = "#1f2329";
    ctx.font = '950 28px ' + FONT_STACK;
    wrapText(ctx, text(state, "buttonMain"), 140, y + 33, 524, 32, 1);

    // 按钮副文案（1 行）
    ctx.fillStyle = "#7f8998";
    ctx.font = '650 22px ' + FONT_STACK;
    wrapText(ctx, text(state, "buttonSub"), 140, y + 64, 524, 28, 1);

    // 规格 / 发货信息（1 行）
    ctx.fillStyle = "#7f8998";
    ctx.font = '500 19px ' + FONT_STACK;
    wrapText(ctx, text(state, "shipping"), 140, y + 96, 524, 24, 1);
  }

  // 挂载到 window，供 app.js 调用
  window.PosterModule = {
    POSTER_WIDTH: POSTER_WIDTH,
    POSTER_HEIGHT: POSTER_HEIGHT,
    FONT_STACK: FONT_STACK,
    THEME_COLORS: THEME_COLORS,
    themeColor: themeColor,
    roundedRect: roundedRect,
    wrapText: wrapText,
    wrapTextLines: wrapTextLines,
    placeholder: placeholder,
    text: text,
    drawImageCover: drawImageCover,
    drawImageContain: drawImageContain,
    drawPoster: drawPoster
  };
})();
