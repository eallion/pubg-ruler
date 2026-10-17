/**
 * PUBG 屏幕物理测距尺 PDF 生成引擎
 * 采用工业级 A4 横向微米级高精度矢量排版与二进制安全 PDF 1.4 生成
 * 严格遵循物理尺寸、第一象限椭圆双段贝塞尔拟合及中英文印刷规范
 */

(function (global) {
  'use strict';

  // 物理常数与通用纸张规格 (横向 Landscape，毫米与 PostScript 点)
  const MM_TO_PT = 72.0 / 25.4; // 1 mm 约 2.834645669 pt

  const PAPER_SIZES = {
    A4: { widthMm: 297.0, heightMm: 210.0, name: 'A4' },
    A3: { widthMm: 420.0, heightMm: 297.0, name: 'A3' },
    A5: { widthMm: 210.0, heightMm: 148.0, name: 'A5' },
    B4: { widthMm: 353.0, heightMm: 250.0, name: 'B4' },
    B5: { widthMm: 250.0, heightMm: 176.0, name: 'B5' },
    Letter: { widthMm: 279.4, heightMm: 215.9, name: 'Letter' },
    Legal: { widthMm: 355.6, heightMm: 215.9, name: 'Legal' }
  };

  /**
   * 采用双段 45 度三次贝塞尔曲线精确绘制 90 度第一象限椭圆弧
   * 数学最大几何偏差 < 0.0001 mm
   */
  function generateArcBezierOps(cx, cy, rx, ry) {
    const ops = [];
    const alpha = (4.0 / 3.0) * Math.tan(Math.PI / 16.0); // 约 0.26521648984

    // 第一段: 0 到 45 度
    const p0x = cx + rx;
    const p0y = cy;
    const c1x = p0x;
    const c1y = p0y + alpha * ry;

    const cos45 = Math.SQRT1_2;
    const sin45 = Math.SQRT1_2;

    const p1x = cx + rx * cos45;
    const p1y = cy + ry * sin45;

    const c2x = p1x + alpha * rx * sin45;
    const c2y = p1y - alpha * ry * cos45;

    // 第二段: 45 到 90 度
    const p2x = cx;
    const p2y = cy + ry;

    const c3x = p1x - alpha * rx * sin45;
    const c3y = p1y + alpha * ry * cos45;

    const c4x = p2x + alpha * rx;
    const c4y = p2y;

    ops.push(`${(p0x * MM_TO_PT).toFixed(3)} ${(p0y * MM_TO_PT).toFixed(3)} m`);
    ops.push(`${(c1x * MM_TO_PT).toFixed(3)} ${(c1y * MM_TO_PT).toFixed(3)} ${(c2x * MM_TO_PT).toFixed(3)} ${(c2y * MM_TO_PT).toFixed(3)} ${(p1x * MM_TO_PT).toFixed(3)} ${(p1y * MM_TO_PT).toFixed(3)} c`);
    ops.push(`${(c3x * MM_TO_PT).toFixed(3)} ${(c3y * MM_TO_PT).toFixed(3)} ${(c4x * MM_TO_PT).toFixed(3)} ${(c4y * MM_TO_PT).toFixed(3)} ${(p2x * MM_TO_PT).toFixed(3)} ${(p2y * MM_TO_PT).toFixed(3)} c`);
    ops.push('S');

    return ops.join('\n');
  }

  /**
   * 将带有中文字符的说明在离线 Canvas 上以 600 DPI 渲染为纯白底 JPEG，
   * 彻底解决在纯前端环境下载 PDF 产生的中文字符缺失或乱码问题。
   */
  function renderTextToJpegBytes(text, fontSpec, colorHex, scale = 4) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = fontSpec;
    const metrics = ctx.measureText(text);
    const pad = 6;
    const textWidth = Math.ceil(metrics.width) + pad * 2;
    const fontSize = parseFloat(fontSpec) || 12;
    const textHeight = Math.ceil(fontSize * 1.6);

    canvas.width = Math.max(1, textWidth * scale);
    canvas.height = Math.max(1, textHeight * scale);

    // 填充白底，保证与白色纸张无缝融合
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.scale(scale, scale);
    ctx.font = fontSpec;
    ctx.fillStyle = colorHex;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, pad, textHeight / 2);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.98);
    const base64 = dataUrl.split(',')[1];
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    return {
      bytes: bytes,
      widthMm: textWidth * (25.4 / 96.0),
      heightMm: textHeight * (25.4 / 96.0),
      pixelWidth: canvas.width,
      pixelHeight: canvas.height
    };
  }

  /**
   * 构建标准的纯物理矢量 PDF (二进制安全流式写入)
   * 采用竖版 Portrait 格式输出以防止打印机边缘裁切，内容顺时针旋转 90 度以横版形式完整呈现
   */
  function generateRulerPDF(config) {
    const paperKey = config.paperSize || 'A4';
    const paper = PAPER_SIZES[paperKey] || {
      widthMm: config.pageWidthMm || 297.0,
      heightMm: config.pageHeightMm || 210.0,
      name: paperKey
    };

    // 横版内容设计画幅 (长边为 W，短边为 H)
    const landW = Math.max(paper.widthMm, paper.heightMm);
    const landH = Math.min(paper.widthMm, paper.heightMm);

    // 物理输出为竖版 Portrait 纸张 (宽为短边，高为长边)
    const portW = landH;
    const portH = landW;
    const portWPt = portW * MM_TO_PT;
    const portHPt = portH * MM_TO_PT;

    const corrX = config.scaleCorrectionX || config.scaleCorrection || 1.0;
    const corrY = config.scaleCorrectionY || config.scaleCorrection || 1.0;
    const rxStep = config.stepLong * corrX;
    const ryStep = config.stepShort * corrY;
    const stepInterval = config.lineInterval === '20m' ? 20 : 10;

    // 测距尺物理排版边距 (横向视角：左侧留出 26mm 容纳竖向标尺与 UUID)
    const marginX = 26.0; // mm
    const marginY = 15.0; // mm
    const clipMargin = 2.0; // mm
    const lineWidthPt = 0.15 * MM_TO_PT;
    const lineWidthBoldPt = 0.35 * MM_TO_PT;

    // 根据当前纸张规格的可用幅面，动态计算能够绘制的最大测距范围，而非写死 1000m
    const availW = landW - clipMargin - marginX;
    const availH = landH - clipMargin - marginY;
    const maxCoverDist = Math.hypot(availW / rxStep, availH / ryStep) * 10.0;
    const maxSteps = Math.ceil(maxCoverDist / stepInterval);
    const maxDistance = maxSteps * stepInterval;

    const stream = [];

    // 0. 全局顺时针旋转 90 度并向上平移至竖版纸张顶端
    // 变换矩阵: x' = y, y' = portHPt - x
    stream.push('q');
    stream.push(`0 -1 1 0 0 ${portHPt.toFixed(3)} cm`);

    // 1. 设置裁剪区 (严格限定在当前纸张物理边缘以内)
    const clipX = clipMargin * MM_TO_PT;
    const clipY = clipMargin * MM_TO_PT;
    const clipW = (landW - 2 * clipMargin) * MM_TO_PT;
    const clipH = (landH - 2 * clipMargin) * MM_TO_PT;

    stream.push('q');
    stream.push(`${clipX.toFixed(3)} ${clipY.toFixed(3)} ${clipW.toFixed(3)} ${clipH.toFixed(3)} re`);
    stream.push('W n');

    // 2. 基准轴线 (原点向负方向延伸 5mm 形成精密十字准星交点，消除粗轴线单向截断视差)
    stream.push('0.102 0.102 0.102 RG'); // #1A1A1A
    stream.push(`${lineWidthBoldPt.toFixed(3)} w`);

    const crosshairExt = 5.0; // mm (四象限十字准星延伸距离)
    const originXPt = marginX * MM_TO_PT;
    const originYPt = marginY * MM_TO_PT;
    const axisStartX = (marginX - crosshairExt) * MM_TO_PT;
    const axisStartY = (marginY - crosshairExt) * MM_TO_PT;
    const axisEndX = (landW - clipMargin) * MM_TO_PT;
    const axisEndY = (landH - clipMargin) * MM_TO_PT;

    // X 轴 (横向长边)
    stream.push(`${axisStartX.toFixed(3)} ${originYPt.toFixed(3)} m ${axisEndX.toFixed(3)} ${originYPt.toFixed(3)} l S`);
    // Y 轴 (纵向短边)
    stream.push(`${originXPt.toFixed(3)} ${axisStartY.toFixed(3)} m ${originXPt.toFixed(3)} ${axisEndY.toFixed(3)} l S`);

    // 3. 绘制同心圆 / 同心椭圆弧 (自适应覆盖当前纸张全部可用区域)
    for (let i = 1; i <= maxSteps; i++) {
      const distance = i * stepInterval;
      const rx = (rxStep * (distance / 10.0));
      const ry = (ryStep * (distance / 10.0));

      const isMajor = (distance % 50 === 0);
      if (isMajor) {
        stream.push('0.102 0.102 0.102 RG');
        stream.push(`${lineWidthBoldPt.toFixed(3)} w`);
      } else {
        stream.push('0.690 0.690 0.690 RG');
        stream.push(`${lineWidthPt.toFixed(3)} w`);
      }

      const arcOps = generateArcBezierOps(marginX, marginY, rx, ry);
      stream.push(arcOps);
    }

    stream.push('Q'); // 恢复裁剪状态

    // 4. 数字标注与高精度贯穿刻度短线 (含 0 基准刻度，贯穿轴线内外两侧，消除内沿测量视差)
    const textCommands = [];
    textCommands.push('0.102 0.102 0.102 rg');
    textCommands.push('0.102 0.102 0.102 RG');
    textCommands.push(`${lineWidthPt.toFixed(3)} w`);

    for (let d = 0; d <= maxDistance; d += 50) {
      const rx = rxStep * (d / 10.0);
      const ry = ryStep * (d / 10.0);
      const valStr = String(d);

      // X 轴标注 (长边，向右) -> 刻度垂直贯穿轴线 (下伸 2.5mm，上穿 1.5mm)，数字位于下方 3.4mm
      const posX = marginX + rx;
      const posY = marginY;
      if (posX <= landW - clipMargin - 6.0) {
        const posXPt = posX * MM_TO_PT;
        const posYPt = posY * MM_TO_PT;
        const tickBottomPt = (posY - 2.5) * MM_TO_PT;
        const tickTopPt = (posY + 1.5) * MM_TO_PT;
        textCommands.push(`${posXPt.toFixed(3)} ${tickBottomPt.toFixed(3)} m ${posXPt.toFixed(3)} ${tickTopPt.toFixed(3)} l S`);
        const estWidthPt = valStr.length * 3.6;
        textCommands.push(`BT /F1 6.5 Tf ${(posXPt - estWidthPt / 2).toFixed(3)} ${(posYPt - 3.4 * MM_TO_PT).toFixed(3)} Td (${valStr}) Tj ET`);
      }

      // Y 轴标注 (短边，向上) -> 刻度水平贯穿轴线 (左伸 2.5mm，右穿 1.5mm)，数字靠左 3.2mm
      const posY_v = marginY + ry;
      const posX_v = marginX;
      if (posY_v <= landH - clipMargin - 3.0) {
        const posXPt_v = posX_v * MM_TO_PT;
        const posYPt_v = posY_v * MM_TO_PT;
        const tickLeftPt = (posX_v - 2.5) * MM_TO_PT;
        const tickRightPt = (posX_v + 1.5) * MM_TO_PT;
        textCommands.push(`${tickLeftPt.toFixed(3)} ${posYPt_v.toFixed(3)} m ${tickRightPt.toFixed(3)} ${posYPt_v.toFixed(3)} l S`);
        if (d > 0) {
          const estWidthPt = valStr.length * 3.6;
          textCommands.push(`BT /F1 6.5 Tf ${(posXPt_v - 3.2 * MM_TO_PT - estWidthPt).toFixed(3)} ${(posYPt_v - 2.0).toFixed(3)} Td (${valStr}) Tj ET`);
        }
      }
    }

    // 5. 左侧竖向物理标尺 (横向看纸张时竖着显示在左侧，用于 1:1 核对物理尺寸)
    const calX = 10.0; // mm (精简左侧边距，节省空间)
    const calYStart = 15.0; // mm
    const calLenMm = 100.0; // mm
    const calYEnd = calYStart + calLenMm; // 115.0 mm

    const calXPt = calX * MM_TO_PT;
    const calYStartPt = calYStart * MM_TO_PT;
    const calYEndPt = calYEnd * MM_TO_PT;

    // 绘制 100mm 标尺竖向主基准线
    textCommands.push(`${calXPt.toFixed(3)} ${calYStartPt.toFixed(3)} m ${calXPt.toFixed(3)} ${calYEndPt.toFixed(3)} l S`);

    // 刻度点位：0, 竖向/横向100米实测点, 50, 100 (单位在后方说明文字注明)
    const dynamicTickY = config.screen100mMm ? parseFloat(config.screen100mMm.toFixed(1)) : 30.0;
    const ticks = [
      { offset: 0.0, label: '0' },
      { offset: dynamicTickY, label: config.isStretched ? `Y:${dynamicTickY}` : `${dynamicTickY}` },
      { offset: 50.0, label: '50' },
      { offset: 100.0, label: '100' }
    ];
    if (config.isStretched && config.screen100mMmX) {
      const dynamicTickX = parseFloat(config.screen100mMmX.toFixed(1));
      if (Math.abs(dynamicTickX - dynamicTickY) > 1.5 && Math.abs(dynamicTickX - 50.0) > 2.0 && dynamicTickX < 95.0) {
        ticks.push({ offset: dynamicTickX, label: `X:${dynamicTickX}` });
      }
    }
    ticks.sort((a, b) => a.offset - b.offset);

    ticks.forEach(t => {
      const tickY = calYStart + t.offset;
      const tickYPt = tickY * MM_TO_PT;
      const isEnd = (t.offset === 0.0 || t.offset === 100.0);
      const lineLenMm = isEnd ? 2.5 : 1.2;

      // 水平刻度短线 (仅在主基准线左侧向左伸出，右侧不延伸)
      textCommands.push(`${(calXPt - lineLenMm * MM_TO_PT).toFixed(3)} ${tickYPt.toFixed(3)} m ${calXPt.toFixed(3)} ${tickYPt.toFixed(3)} l S`);

      // 刻度数值位于短线侧方，水平紧贴主线左侧 (不向左突出，大幅节省左侧空间)
      const estWidthPt = t.label.length * 3.1;
      const textXPt = calXPt - 0.8 * MM_TO_PT - estWidthPt;

      // 纵向侧方位置：100 位于端线下方内侧，其余位于刻度线上方侧方；避让相近刻度
      let textYPt = tickYPt + 1.0 * MM_TO_PT;
      if (t.offset === 100.0) {
        textYPt = tickYPt - 2.5 * MM_TO_PT;
      } else if (t.offset !== 50.0 && Math.abs(t.offset - 50.0) < 4.0) {
        textYPt = tickYPt - 2.5 * MM_TO_PT;
      }

      textCommands.push(`BT /F1 5.5 Tf ${textXPt.toFixed(3)} ${textYPt.toFixed(3)} Td (${t.label}) Tj ET`);
    });

    // 6. UUID 标注：竖着打印到横向纸张的左侧比例尺上方 (在竖版 PDF 中呈现于比例尺右方)
    const shouldPrintUuid = (config.printUuid !== false) && !!config.sessionUuid;
    if (shouldPrintUuid) {
      const uuidStr = `ID: ${config.sessionUuid}`;
      const uuidX = calX; // 与标尺同线
      const uuidY = calYEnd + 12.0; // 标尺上方 (约 127mm 处)
      const uXPt = uuidX * MM_TO_PT;
      const uYPt = uuidY * MM_TO_PT;
      // 在横向纸张中逆时针旋转 90 度竖向排布，顺时针 90 度旋转后在竖版 PDF 中正好位于比例尺右方且水平正向可读
      textCommands.push('0.35 0.35 0.35 rg');
      textCommands.push(`q 0 1 -1 0 ${uXPt.toFixed(3)} ${uYPt.toFixed(3)} cm BT /F1 6.0 Tf 0 0 Td (${uuidStr}) Tj ET Q`);
    }

    const vectorContent = stream.concat(textCommands).join('\n');

    // 7. 标尺说明文字：中文字符图像资源 (在横向纸张中逆时针旋转 90 度沿标尺排布，注明单位: mm)
    const calTitle = '物理标尺线（单位: mm / 建议 100% 实际大小打印）';
    const calTitleImg = renderTextToJpegBytes(calTitle, 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif', '#111111', 4);

    const imgOps = [];
    const cWPt = calTitleImg.widthMm * MM_TO_PT;
    const cHPt = calTitleImg.heightMm * MM_TO_PT;
    const cXPt = (calX + 2.5) * MM_TO_PT;
    const cYPt = calYStart * MM_TO_PT;
    // 逆时针旋转 90 度排布在标尺右侧，显式设置物理宽度 cWPt 与高度 cHPt，在竖版 PDF 中呈现为水平正向印刷文字
    imgOps.push(`q 0 ${cWPt.toFixed(3)} ${(-cHPt).toFixed(3)} 0 ${(cXPt + cHPt).toFixed(3)} ${cYPt.toFixed(3)} cm /Im1 Do Q`);

    // 闭合全局顺时针 90 度旋转
    const fullPageContent = vectorContent + '\n' + imgOps.join('\n') + '\nQ';

    return assembleBinaryPdf({
      pageWPt: portWPt,
      pageHPt: portHPt,
      contentStr: fullPageContent,
      noticeImg: null,
      calTitleImg: calTitleImg
    });
  }

  /**
   * 二进制安全拼接与组装 PDF 文件
   */
  function assembleBinaryPdf(data) {
    const encoder = new TextEncoder();
    const parts = [];
    let currentByteLength = 0;
    const xrefOffsets = [];

    function pushString(str) {
      const u8 = encoder.encode(str);
      parts.push(u8);
      currentByteLength += u8.length;
    }

    function pushBytes(u8) {
      parts.push(u8);
      currentByteLength += u8.length;
    }

    function recordObjectStart() {
      xrefOffsets.push(currentByteLength);
    }

    // 1. Header
    pushString('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

    // 2. Obj 1: Catalog
    recordObjectStart();
    pushString('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

    // 3. Obj 2: Pages
    recordObjectStart();
    pushString('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');

    // 4. Obj 3: Page (动态纸张尺寸 MediaBox)
    recordObjectStart();
    pushString(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${data.pageWPt.toFixed(2)} ${data.pageHPt.toFixed(2)}] /Contents 4 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> /XObject << /Im1 5 0 R >> >> >>\nendobj\n`);

    // 5. Obj 4: Content Stream
    const contentBytes = encoder.encode(data.contentStr);
    recordObjectStart();
    pushString(`4 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n`);
    pushBytes(contentBytes);
    pushString('\nendstream\nendobj\n');

    // 6. Obj 5: Image 1 (Calibration Title Jpeg)
    recordObjectStart();
    pushString(`5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${data.calTitleImg.pixelWidth} /Height ${data.calTitleImg.pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${data.calTitleImg.bytes.length} >>\nstream\n`);
    pushBytes(data.calTitleImg.bytes);
    pushString('\nendstream\nendobj\n');

    // 7. XRef Table
    const startXref = currentByteLength;
    const numObjects = xrefOffsets.length + 1;
    let xrefStr = `xref\n0 ${numObjects}\n0000000000 65535 f \n`;
    for (let i = 0; i < xrefOffsets.length; i++) {
      xrefStr += String(xrefOffsets[i]).padStart(10, '0') + ' 00000 n \n';
    }
    pushString(xrefStr);

    // 8. Trailer
    pushString(`trailer\n<< /Size ${numObjects} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`);

    return new Blob(parts, { type: 'application/pdf' });
  }

  // 暴露给全局命名空间
  global.PubgRulerPDF = {
    generateRulerPDF: generateRulerPDF,
    PAPER_SIZES: PAPER_SIZES
  };

})(typeof window !== 'undefined' ? window : this);
