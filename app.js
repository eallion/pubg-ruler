/**
 * PUBG 屏幕物理测距尺 Web 应用核心交互与算法逻辑
 * 严格遵循严谨物理学、显示器几何学与游戏坐标映射规范
 */

(function () {
  'use strict';

  // 全局异常可视化捕获横幅 (确保任何运行时错误都能在界面顶部直接显现，便于秒级排查)
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('error', function (event) {
      console.error('[PUBG Ruler Uncaught Error]:', event.error || event.message);
      try {
        let banner = document.getElementById('globalErrorBanner');
        if (!banner && document.body) {
          banner = document.createElement('div');
          banner.id = 'globalErrorBanner';
          banner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#b91c1c;color:#ffffff;padding:0.75rem 1.25rem;z-index:999999;font-size:0.85rem;font-family:ui-monospace,monospace;box-shadow:0 4px 16px rgba(0,0,0,0.6);display:flex;justify-content:space-between;align-items:center;';
          document.body.prepend(banner);
        }
        if (banner) {
          banner.innerHTML = `<span><strong>JavaScript 运行错误：</strong>${event.message} <span style="opacity:0.8">(${event.filename ? event.filename.split('/').pop() : ''}:${event.lineno})</span></span><button onclick="this.parentNode.remove()" style="background:transparent;border:1px solid #fff;color:#fff;border-radius:4px;padding:0.15rem 0.6rem;cursor:pointer;margin-left:1rem;">关闭</button>`;
        }
      } catch (e) {
        // 容错保护
      }
    });

    window.addEventListener('unhandledrejection', function (event) {
      console.error('[PUBG Ruler Unhandled Rejection]:', event.reason);
    });
  }

  // 生成标准 RFC4122 v4 UUID
  function generateUuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // PUBG 地图规格与缩放倍率特性规范
  const PUBG_MAP_SPECS = {
    '8x8': {
      id: '8x8',
      label: '8×8 大地图',
      shortLabel: '8×8',
      zoomDesc: '滚轮放大 3 次',
      zoomShort: '放大 3 次',
      zoomSteps: 3,
      scaleFactor: 1.0,
      examples: '海岛 (Erangel)、沙漠 (Miramar)、泰戈、帝斯顿、荣都',
      hint: '全图 8km，按 M 键打开大地图并向上滚轮放大 3 次'
    },
    '4x4': {
      id: '4x4',
      label: '4×4 中地图',
      shortLabel: '4×4',
      zoomDesc: '滚轮放大 2 次',
      zoomShort: '放大 2 次',
      zoomSteps: 2,
      scaleFactor: 1.0,
      examples: '萨诺 (Sanhok / 雨林)',
      hint: '全图 4km，按 M 键打开大地图并向上滚轮放大 2 次（物理视口与 8×8 相同）'
    },
    '3x3': {
      id: '3x3',
      label: '3×3 小地图',
      shortLabel: '3×3',
      zoomDesc: '保持默认（不放大）',
      zoomShort: '不放大',
      zoomSteps: 0,
      scaleFactor: 1.0 / 3.0,
      examples: '帕拉莫 (Paramo)',
      hint: '全图 3km，按 M 键打开大地图后保持初始视图，无需滚轮缩放'
    },
    '2x2': {
      id: '2x2',
      label: '2×2 超小地图',
      shortLabel: '2×2',
      zoomDesc: '保持默认（不放大）',
      zoomShort: '不放大',
      zoomSteps: 0,
      scaleFactor: 0.5,
      examples: '卡拉金 (Karakin)',
      hint: '全图 2km，按 M 键打开大地图后保持初始视图，无需滚轮缩放'
    }
  };

  // 状态中心 (State Store)
  const state = {
    currentStep: 1, // 1: 屏幕尺寸, 2: 分辨率, 3: 地图物理测量, 4: 生成与下载, 5: 打印校准
    previewOrientation: 'portrait', // 'portrait' (竖版打印物理视角) 或 'landscape' (横向正向阅读视角)
    sessionUuid: generateUuid(),
    printUuid: true, // 是否将 UUID 打印在纸张上
    paper: {
      size: 'A4',
      widthMm: 297.0,
      heightMm: 210.0
    },
    map: {
      size: '8x8',
      name: '8×8 大地图',
      zoomDesc: '滚轮放大 3 次',
      zoomSteps: 3,
      scaleFactor: 1.0,
      note: '海岛 (Erangel)、沙漠 (Miramar)、泰戈、帝斯顿、荣都'
    },
    screen: {
      mode: 'db', // 'db' (显示器数据库模式) 或 'generic' (通用/自定义模式)
      selectedModel: 'XL2546K',
      preset: '24.5',
      customSize: 24.5,
      aspectRatio: '16:9',
      widthMm: 543.744,
      heightMm: 302.616
    },
    resolution: {
      preset: '1728x1080',
      width: 1728,
      height: 1080,
      nativeWidth: 1920,
      nativeHeight: 1080,
      isStretched: true,
      stretchFactor: 1.1111,
      scaleEnabled: false,
      scalePercent: 100
    },
    measurement: {
      isManualCalculated: false,
      hasMeasurement: false,
      // 竖向短边 (Y轴，无拉伸基准)
      y100: 30.0,
      y300: 90.0,
      yFinal100: 30.0,
      yStep: 3.00, // 每10米
      // 横向长边 (X轴，拉伸向)
      x100: 33.33,
      x300: 100.0,
      xFinal100: 33.33,
      xStep: 3.3333333333333335, // 每10米
      densityMode: '10m' // '10m' (50m加粗) 或 '20m' (100m加粗)
    },
    calibration: {
      correctionFactorX: 1.0,
      correctionFactorY: 1.0,
      printed100m: 0,
      printed300m: 0,
      printedRuler100mm: 100.0,
      applied: false
    }
  };

  // 视口物理几何映射基准比率 (基于标准面板高度换算各尺寸物理视口尺寸)
  const BASE_PANEL_HEIGHT_MM = 298.89;
  const BASE_100M_VERTICAL_MM = 30.0;
  const MAP_VIEWPORT_RATIO = BASE_100M_VERTICAL_MM / BASE_PANEL_HEIGHT_MM; // 0.1003713740841112

  // 缩放百分比选项预设
  const SCALE_PRESETS = [70, 75, 80, 85, 90, 95, 100, 105, 110, 115, 120, 125, 130, 140, 150, 175, 200];

  // 常量与预设数据库（各物理面板独立切割尺寸，严禁合并）
  const SCREEN_PRESETS = [
    { id: '21.5', label: '21.5 英寸', ratio: '16:9', diagInch: 21.5, desc: '入门办公与家用屏' },
    { id: '23.6', label: '23.6 英寸', ratio: '16:9', diagInch: 23.6, desc: '早期经典电竞与曲面屏' },
    { id: '23.8', label: '23.8 英寸', ratio: '16:9', diagInch: 23.8, desc: '主流办公与入门电竞 (1080p)' },
    { id: '24.0', label: '24.0 英寸', ratio: '16:9', diagInch: 24.0, desc: '主流 24.0 英寸 1080p 电竞面板' },
    { id: '24.1', label: '24.1 英寸', ratio: '16:10', diagInch: 24.1, desc: '16:10 办公与专业屏' },
    { id: '24.5', label: '24.5 英寸', ratio: '16:9', diagInch: 24.5, desc: '职业 FPS 电竞黄金标准 (XL2546K/XL2566K)' },
    { id: '25.0', label: '25.0 英寸', ratio: '16:9', diagInch: 25.0, desc: '主流电竞尺寸，如 AW2518H/AW2521H' },
    { id: '26.5', label: '26.5 英寸', ratio: '16:9', diagInch: 26.5, desc: '主流 2K OLED 电竞面板物理尺寸' },
    { id: '27.0', label: '27.0 英寸', ratio: '16:9', diagInch: 27.0, desc: '主流 2K/4K 电竞屏 (27GP850, XG27AQ)' },
    { id: '28.0', label: '28.0 英寸', ratio: '16:9', diagInch: 28.0, desc: '4K 电竞与设计屏' },
    { id: '29.0', label: '29.0 英寸', ratio: '21:9', diagInch: 29.0, desc: '21:9 超宽入门带鱼屏' },
    { id: '31.5', label: '31.5 英寸', ratio: '16:9', diagInch: 31.5, desc: '标准 31.5 英寸大屏面板' },
    { id: '32.0', label: '32.0 英寸', ratio: '16:9', diagInch: 32.0, desc: '32.0 英寸物理面板' },
    { id: '34.0', label: '34.0 英寸', ratio: '21:9', diagInch: 34.0, desc: '21:9 超宽曲面带鱼屏' },
    { id: '37.5', label: '37.5 英寸', ratio: '21:9', diagInch: 37.5, desc: '超宽大尺寸带鱼屏' },
    { id: '41.5', label: '41.5 英寸', ratio: '16:9', diagInch: 41.5, desc: '42寸 OLED 电竞屏物理面板尺寸' },
    { id: '42.0', label: '42.0 英寸', ratio: '16:9', diagInch: 42.0, desc: '42.0 英寸电竞大屏' },
    { id: '48.0', label: '48.0 英寸', ratio: '16:9', diagInch: 48.0, desc: '48.0 英寸 OLED 大屏' },
    { id: '49.0', label: '49.0 英寸', ratio: '32:9', diagInch: 49.0, desc: '32:9 超级带鱼屏 (如 Odyssey G9)' },
    { id: 'custom', label: '自定义尺寸', ratio: 'custom', diagInch: 0, desc: '手动配置对角线英寸与面板比例' }
  ];

  const RESOLUTION_PRESETS = [
    { id: '1920x1080', name: '1920 × 1080 (1080p)', category: 'standard', w: 1920, h: 1080, desc: '标准 FHD 原生无拉伸 (16:9，同心圆)' },
    { id: '2560x1440', name: '2560 × 1440 (2K)', category: 'standard', w: 2560, h: 1440, desc: '标准 2K QHD 原生无拉伸 (16:9，同心圆)' },
    { id: '1728x1080', name: '1728 × 1080', category: 'stretched', w: 1728, h: 1080, desc: '1080p 常用 16:10 横向拉伸 (拉伸 1.11x)' },
    { id: '2304x1440', name: '2304 × 1440', category: 'stretched', w: 2304, h: 1440, desc: '2K 屏幕专用 16:10 横向拉伸 (拉伸 1.11x)' },
    { id: '3840x2160', name: '3840 × 2160 (4K)', category: 'standard', w: 3840, h: 2160, desc: '标准 4K UHD 原生无拉伸 (16:9，同心圆)' },
    { id: '3456x2160', name: '3456 × 2160', category: 'stretched', w: 3456, h: 2160, desc: '4K 屏幕专用 16:10 横向拉伸 (拉伸 1.11x)' },
    { id: '1440x1080', name: '1440 × 1080', category: 'stretched', w: 1440, h: 1080, desc: '极限 4:3 画面横向强力拉伸 (拉伸 1.33x)' },
    { id: 'custom', name: '其他 (自定义)', category: 'custom', w: 0, h: 0, desc: '手动配置游戏渲染宽度与高度' }
  ];

  // DOM 元素缓存对象与动态刷新机制
  const dom = {};

  function refreshDom() {
    dom.steps = document.querySelectorAll('.step-section');
    dom.stepIndicators = document.querySelectorAll('.step-indicator-item');
    dom.prevBtn = document.getElementById('prevBtn');
    dom.nextBtn = document.getElementById('nextBtn');
    dom.headerPaperTag = document.getElementById('headerPaperTag');
    dom.exportConfigBtn = document.getElementById('exportConfigBtn');
    dom.importConfigTrigger = document.getElementById('importConfigTrigger');
    dom.importConfigFile = document.getElementById('importConfigFile');
    dom.toastContainer = document.getElementById('toastContainer');
    dom.detectScreensCollapsible = document.getElementById('detectScreensCollapsible');
    dom.detectScreensToggle = document.getElementById('detectScreensToggle');
    dom.detectScreensArrow = document.getElementById('detectScreensArrow');
    dom.detectScreensToggleText = document.getElementById('detectScreensToggleText');
    dom.detectScreensBody = document.getElementById('detectScreensBody');
    dom.tabModeDb = document.getElementById('tabModeDb');
    dom.tabModeLaptop = document.getElementById('tabModeLaptop');
    dom.tabModeGeneric = document.getElementById('tabModeGeneric');
    dom.detectScreensBtn = document.getElementById('detectScreensBtn');
    dom.detectedScreensContainer = document.getElementById('detectedScreensContainer');
    dom.screenDbView = document.getElementById('screenDbView');
    dom.screenGenericView = document.getElementById('screenGenericView');
    dom.brandCustomDropdown = document.getElementById('brandCustomDropdown');
    dom.brandDropdownBtn = document.getElementById('brandDropdownBtn');
    dom.brandDropdownLabel = document.getElementById('brandDropdownLabel');
    dom.brandDropdownArrow = document.getElementById('brandDropdownArrow');
    dom.brandDropdownMenu = document.getElementById('brandDropdownMenu');
    dom.brandFilterSelect = document.getElementById('brandFilterSelect');
    dom.monitorSearchInput = document.getElementById('monitorSearchInput');
    dom.clearSearchBtn = document.getElementById('clearSearchBtn');
    dom.monitorDbList = document.getElementById('monitorDbList');
    dom.selectedMonitorNotice = document.getElementById('selectedMonitorNotice');
    dom.screenPresetContainer = document.getElementById('screenPresetContainer');
    dom.customScreenBox = document.getElementById('customScreenBox');
    dom.customDiagInput = document.getElementById('customDiagInput');
    dom.customRatioSelect = document.getElementById('customRatioSelect');
    dom.resPresetContainer = document.getElementById('resPresetContainer');
    dom.customResBox = document.getElementById('customResBox');
    dom.customResW = document.getElementById('customResW');
    dom.customResH = document.getElementById('customResH');
    dom.customScaleCheckbox = document.getElementById('customScaleCheckbox');
    dom.customScaleContainer = document.getElementById('customScaleContainer');
    dom.scaleCustomDropdown = document.getElementById('scaleCustomDropdown');
    dom.scaleDropdownBtn = document.getElementById('scaleDropdownBtn');
    dom.scaleDropdownLabel = document.getElementById('scaleDropdownLabel');
    dom.scaleDropdownArrow = document.getElementById('scaleDropdownArrow');
    dom.scaleDropdownMenu = document.getElementById('scaleDropdownMenu');
    dom.customScaleSelect = document.getElementById('customScaleSelect');
    dom.resAnalysisBox = document.getElementById('resAnalysisBox');
    dom.measureModeHint = document.getElementById('measureModeHint');
    dom.measureXGroup = document.getElementById('measureXGroup');
    dom.yMeasureModeSelect = document.getElementById('yMeasureModeSelect');
    dom.yMeasureInput = document.getElementById('yMeasureInput');
    dom.xMeasureModeSelect = document.getElementById('xMeasureModeSelect');
    dom.xMeasureInput = document.getElementById('xMeasureInput');
    dom.calcSummaryText = document.getElementById('calcSummaryText');
    dom.paperSizeSelect = document.getElementById('paperSizeSelect');
    dom.sessionUuidDisplay = document.getElementById('sessionUuidDisplay');
    dom.copyUuidBtn = document.getElementById('copyUuidBtn');
    dom.printUuidCheckbox = document.getElementById('printUuidCheckbox');
    dom.paperRangeHint = document.getElementById('paperRangeHint');
    dom.svgPreview = document.getElementById('svgPreview');
    dom.previewMeta = document.getElementById('previewMeta');
    dom.previewMetaList = document.getElementById('previewMetaList');
    dom.previewPaperBadge = document.getElementById('previewPaperBadge');
    dom.previewRotateBtn = document.getElementById('previewRotateBtn');
    dom.previewZoomBtn = document.getElementById('previewZoomBtn');
    dom.previewZoomModal = document.getElementById('previewZoomModal');
    dom.previewZoomCloseBtn = document.getElementById('previewZoomCloseBtn');
    dom.previewZoomBody = document.getElementById('previewZoomBody');
    dom.zoomStage = document.getElementById('zoomStage');
    dom.zoomPercentBadge = document.getElementById('zoomPercentBadge');
    dom.zoomInBtn = document.getElementById('zoomInBtn');
    dom.zoomOutBtn = document.getElementById('zoomOutBtn');
    dom.zoomResetBtn = document.getElementById('zoomResetBtn');
    dom.zoomRotateBtn = document.getElementById('zoomRotateBtn');
    dom.zoomPaperBadge = document.getElementById('zoomPaperBadge');
    dom.svgZoomPreview = document.getElementById('svgZoomPreview');
    dom.densityRadio10m = document.getElementById('density10m');
    dom.densityRadio20m = document.getElementById('density20m');
    dom.downloadPdfBtn = document.getElementById('downloadPdfBtn');
    dom.printPageBtn = document.getElementById('printPageBtn');
    dom.downloadSvgBtn = document.getElementById('downloadSvgBtn');
    dom.calibTarget100 = document.getElementById('calibTarget100');
    dom.calibTarget300 = document.getElementById('calibTarget300');
    dom.calibTargetY100 = document.getElementById('calibTargetY100');
    dom.calibTargetY300 = document.getElementById('calibTargetY300');
    dom.calibPrinted100 = document.getElementById('calibPrinted100');
    dom.calibPrinted300 = document.getElementById('calibPrinted300');
    dom.calibPrintedY100 = document.getElementById('calibPrintedY100');
    dom.calibPrintedY300 = document.getElementById('calibPrintedY300');
    dom.calibPrintedRuler = document.getElementById('calibPrintedRuler');
    dom.labelCalibPrinted100 = document.getElementById('labelCalibPrinted100');
    dom.labelCalibPrinted300 = document.getElementById('labelCalibPrinted300');
    dom.labelCalibPrintedY100 = document.getElementById('labelCalibPrintedY100');
    dom.labelCalibPrintedY300 = document.getElementById('labelCalibPrintedY300');
    dom.applyCalibBtn = document.getElementById('applyCalibBtn');
    dom.resetCalibBtn = document.getElementById('resetCalibBtn');
    dom.downloadCalibPdfBtn = document.getElementById('downloadCalibPdfBtn');
    dom.printCalibBtn = document.getElementById('printCalibBtn');
    dom.calibResultBox = document.getElementById('calibResultBox');
    dom.printArea = document.getElementById('printArea');
    // 理论参考双标准
    dom.theoryRecommendBadge = document.getElementById('theoryRecommendBadge');
    dom.theoryStandardBox = document.getElementById('theoryStandardBox');
    dom.theoryStretchedBox = document.getElementById('theoryStretchedBox');
    dom.theoryStd100 = document.getElementById('theoryStd100');
    dom.theoryStd300 = document.getElementById('theoryStd300');
    dom.theoryStrY100 = document.getElementById('theoryStrY100');
    dom.theoryStrX100 = document.getElementById('theoryStrX100');
    dom.applyTheoryStdBtn = document.getElementById('applyTheoryStdBtn');
    dom.applyTheoryStrBtn = document.getElementById('applyTheoryStrBtn');
    // 模态弹窗 0: 首次访问引导与使用说明
    dom.welcomeGuideModal = document.getElementById('welcomeGuideModal');
    dom.welcomeGuideCloseBtn = document.getElementById('welcomeGuideCloseBtn');
    dom.welcomeCloseBtn = document.getElementById('welcomeCloseBtn');
    dom.welcomeNewConfigBtn = document.getElementById('welcomeNewConfigBtn');
    dom.welcomeReadGuideBtn = document.getElementById('welcomeReadGuideBtn');
    dom.dontShowWelcomeToday = document.getElementById('dontShowWelcomeToday');
    // 模态弹窗 1: 地图设置
    dom.mapGuideModal = document.getElementById('mapGuideModal');
    dom.mapGuideCloseBtn = document.getElementById('mapGuideCloseBtn');
    dom.mapGuideNextBtn = document.getElementById('mapGuideNextBtn');
    dom.mapGuideStep1 = document.getElementById('mapGuideStep1');
    dom.mapGuideStep2 = document.getElementById('mapGuideStep2');
    dom.dontShowMapGuide = document.getElementById('dontShowMapGuide');
    // 模态弹窗 2: 打印须知
    dom.printNoticeModal = document.getElementById('printNoticeModal');
    dom.printNoticeCloseBtn = document.getElementById('printNoticeCloseBtn');
    dom.printNoticeConfirmBtn = document.getElementById('printNoticeConfirmBtn');
    dom.modalUuidText = document.getElementById('modalUuidText');
    dom.modalCopyUuidBtn = document.getElementById('modalCopyUuidBtn');
    dom.dontShowPrintNotice = document.getElementById('dontShowPrintNotice');
    // 模态弹窗 4: 打印校准提示
    dom.calibGuideModal = document.getElementById('calibGuideModal');
    dom.calibGuideCloseBtn = document.getElementById('calibGuideCloseBtn');
    dom.calibGuideConfirmBtn = document.getElementById('calibGuideConfirmBtn');
    dom.dontShowCalibGuide = document.getElementById('dontShowCalibGuide');
    // 步骤 5: UUID 核对
    dom.calibUuidInput = document.getElementById('calibUuidInput');
    dom.calibCheckUuidBtn = document.getElementById('calibCheckUuidBtn');
    dom.calibResetUuidBtn = document.getElementById('calibResetUuidBtn');
    dom.calibUuidStatus = document.getElementById('calibUuidStatus');
    dom.calibActiveUuidText = document.getElementById('calibActiveUuidText');
    dom.calibActiveSummaryText = document.getElementById('calibActiveSummaryText');
    // 步骤 3: 地图规格
    dom.mapSizeTabs = document.querySelectorAll('[data-map-size]');
    dom.mapZoomStatusTag = document.getElementById('mapZoomStatusTag');
    dom.mapSubtextHint = document.getElementById('mapSubtextHint');
  }

  // 立即执行初次抓取
  refreshDom();

  /**
   * 自定义 Apple 风格极简 Toast 提示弹窗 (替代浏览器原生 alert)
   */
  function showToast(message, type = 'info') {
    if (!dom.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast-item toast-${type}`;
    toast.textContent = message;
    dom.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'toastFadeOut 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards';
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 250);
    }, 3000);
  }

  /**
   * 初始化应用 (采用防御式单步执行与异常隔离，杜绝单点报错导致全局点击失效)
   */
  function init() {
    refreshDom();

    const tasks = [
      ['会话 UUID 初始化', initSessionUuid],
      ['显示器数据库初始化', initMonitorDb],
      ['缩放下拉框初始化', initScaleDropdown],
      ['显示器卡片渲染', renderScreenPresets],
      ['分辨率卡片渲染', renderResPresets],
      ['面板物理计算更新', updateScreenPhysics],
      ['分辨率拉伸分析', updateResolutionAnalysis],
      ['地图尺寸理论推导', estimateMapSizeFromScreen],
      ['实测输入框初始清空', clearMeasurementInputs],
      ['测量参数融合计算', updateMeasurementCalculation],
      ['打印纸张样式注入', updatePrintPaperStyle],
      ['交互事件绑定', bindEvents],
      ['旋转视角按钮同步', updateRotateButtonLabels],
      ['校准界面文案同步', updateCalibLabels],
      ['步骤初始化', () => renderStep(1)],
      ['矢量预览初次渲染', renderSvgPreview],
      ['首次访问引导检查', initWelcomeModal]
    ];

    for (const [taskName, taskFn] of tasks) {
      try {
        taskFn();
      } catch (err) {
        console.error(`[PUBG Ruler Init Error] 任务【${taskName}】执行异常:`, err);
      }
    }
  }

  /**
   * 初始化会话 UUID
   */
  function initSessionUuid() {
    let saved = localStorage.getItem('pubg_ruler_current_uuid');
    if (saved && saved.length >= 8) {
      state.sessionUuid = saved;
    } else {
      saved = generateUuid();
      state.sessionUuid = saved;
      localStorage.setItem('pubg_ruler_current_uuid', saved);
    }
    if (dom.sessionUuidDisplay) {
      dom.sessionUuidDisplay.textContent = state.sessionUuid.substring(0, 8);
      dom.sessionUuidDisplay.title = state.sessionUuid;
    }
  }

  /**
   * 更新纸张与预览视角徽章文本及测距覆盖范围
   */
  function updatePaperBadges() {
    const landW = Math.max(state.paper.widthMm, state.paper.heightMm);
    const landH = Math.min(state.paper.widthMm, state.paper.heightMm);
    const portW = landH;
    const portH = landW;
    const isPortrait = (state.previewOrientation === 'portrait');
    const badgeText = isPortrait ? `${portW} × ${portH} mm (${state.paper.size} 竖版)` : `${landW} × ${landH} mm (横向正读)`;

    if (dom.previewPaperBadge) {
      dom.previewPaperBadge.textContent = badgeText;
    }
    if (dom.zoomPaperBadge) {
      dom.zoomPaperBadge.textContent = badgeText;
    }
    if (dom.headerPaperTag) {
      dom.headerPaperTag.textContent = state.paper.size;
    }
    if (dom.previewRotateBtn) {
      dom.previewRotateBtn.textContent = isPortrait ? '旋转正读' : '恢复默认';
    }
    if (dom.zoomRotateBtn) {
      dom.zoomRotateBtn.textContent = isPortrait ? '旋转正读' : '恢复默认';
    }

    // 动态计算当前纸张规格下的绝对物理测距覆盖范围 (1:1 物理不缩放)
    if (dom.paperRangeHint) {
      const marginX = 26.0;
      const marginY = 15.0;
      const clipMargin = 2.0;
      const availW = landW - clipMargin - marginX;
      const availH = landH - clipMargin - marginY;
      const rx = (state.measurement.xStep || 3.3) * (state.calibration.correctionFactorX || 1.0);
      const ry = (state.measurement.yStep || 2.97) * (state.calibration.correctionFactorY || 1.0);
      const maxDistX = Math.floor(availW / (rx * 10)) * 100;
      const maxDistY = Math.floor(availH / (ry * 10)) * 100;
      const maxDiag = Math.round(Math.hypot(availW / rx, availH / ry) * 10);
      dom.paperRangeHint.innerHTML = `
        <strong>${state.paper.size} 幅面规格 (${portW} × ${portH} mm)</strong>：<br>
        横向最远测距约 <strong>${maxDistX} 米</strong>，纵向约 <strong>${maxDistY} 米</strong>，对角线覆盖约 <strong>${maxDiag} 米</strong>。<br>
        <span style="color: var(--text-tertiary); font-size: 0.74rem;">注：物理刻度比率保持 100% 绝对不变，专版自适应铺满当前纸张。</span>
      `;
    }
  }

  /**
   * 动态注入打印纸张样式，使物理打印与所选纸张尺寸完全吻合（竖版输出）
   */
  function updatePrintPaperStyle() {
    let styleEl = document.getElementById('dynamicPrintPaperStyle');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'dynamicPrintPaperStyle';
      document.head.appendChild(styleEl);
    }
    const landW = Math.max(state.paper.widthMm, state.paper.heightMm);
    const landH = Math.min(state.paper.widthMm, state.paper.heightMm);
    const portW = landH;
    const portH = landW;
    styleEl.textContent = `
      @media print {
        @page { size: ${portW}mm ${portH}mm portrait; margin: 0; }
        .preview-canvas-wrapper, .preview-canvas-wrapper svg {
          width: ${portW}mm !important;
          height: ${portH}mm !important;
        }
      }
    `;
    updatePaperBadges();
  }

  /**
   * 导出当前完整测距尺配置为 JSON 文件
   */
  function exportConfiguration() {
    const data = {
      version: '1.0',
      uuid: state.sessionUuid,
      printUuid: state.printUuid,
      exportedAt: new Date().toISOString(),
      paper: state.paper,
      map: state.map,
      screen: state.screen,
      resolution: state.resolution,
      measurement: state.measurement,
      calibration: state.calibration
    };
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pubg-ruler-${state.sessionUuid.substring(0, 8)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }

  /**
   * 导入并恢复 JSON 配置
   */
  function importConfiguration(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const data = JSON.parse(e.target.result);
        if (data.uuid) state.sessionUuid = data.uuid;
        if (typeof data.printUuid !== 'undefined') {
          state.printUuid = !!data.printUuid;
          if (dom.printUuidCheckbox) dom.printUuidCheckbox.checked = state.printUuid;
        }
        if (data.paper) state.paper = data.paper;
        if (data.map) {
          state.map = data.map;
          if (dom.mapSizeTabs) {
            dom.mapSizeTabs.forEach(btn => {
              btn.classList.toggle('active', btn.dataset.mapSize === state.map.size);
            });
          }
          if (dom.mapZoomStatusTag) {
            const spec = PUBG_MAP_SPECS[state.map.size] || PUBG_MAP_SPECS['8x8'];
            dom.mapZoomStatusTag.textContent = `${spec.shortLabel} ${spec.zoomShort}`;
          }
          if (dom.mapSubtextHint) {
            const spec = PUBG_MAP_SPECS[state.map.size] || PUBG_MAP_SPECS['8x8'];
            dom.mapSubtextHint.textContent = `${spec.hint}（包含：${spec.examples}）`;
          }
        }
        if (data.screen) state.screen = data.screen;
        if (data.resolution) state.resolution = data.resolution;
        if (data.measurement) state.measurement = data.measurement;
        if (data.calibration) state.calibration = data.calibration;

        localStorage.setItem('pubg_ruler_current_uuid', state.sessionUuid);
        if (dom.sessionUuidDisplay) {
          dom.sessionUuidDisplay.textContent = state.sessionUuid.substring(0, 8);
          dom.sessionUuidDisplay.title = state.sessionUuid;
        }
        if (dom.paperSizeSelect) dom.paperSizeSelect.value = state.paper.size;
        updatePrintPaperStyle();

        if (dom.yMeasureModeSelect) dom.yMeasureModeSelect.value = '100m';
        if (dom.yMeasureInput) {
          dom.yMeasureInput.value = state.measurement.y100 || state.measurement.yFinal100 || '';
          dom.yMeasureInput.placeholder = '输入 100m 屏幕实测高度';
        }
        if (dom.xMeasureModeSelect) dom.xMeasureModeSelect.value = '100m';
        if (dom.xMeasureInput) {
          dom.xMeasureInput.value = state.measurement.x100 || state.measurement.xFinal100 || '';
          dom.xMeasureInput.placeholder = '输入 100m 屏幕实测宽度';
        }

        if (state.resolution) {
          if (dom.customScaleCheckbox) {
            dom.customScaleCheckbox.checked = !!state.resolution.scaleEnabled;
          }
          if (dom.customScaleContainer) {
            dom.customScaleContainer.style.display = state.resolution.scaleEnabled ? 'inline-flex' : 'none';
            dom.customScaleContainer.classList.toggle('hidden', !state.resolution.scaleEnabled);
          }
          if (dom.scaleDropdownLabel) {
            dom.scaleDropdownLabel.textContent = `${state.resolution.scalePercent || 100}%`;
          }
          if (dom.customScaleSelect) {
            dom.customScaleSelect.value = state.resolution.scalePercent || 100;
          }
        }

        updateResolutionAnalysis();
        updateMeasurementCalculation();
        renderScreenPresets();
        renderResPresets();
        renderSvgPreview();
        showToast(`已成功导入配置：${state.sessionUuid.substring(0, 8)}`, 'success');
      } catch (err) {
        showToast('导入失败，请检查是否为有效的 JSON 配置文件。', 'error');
      }
    };
    reader.readAsText(file);
  }

  // 当前硬件数据库类别 ('monitor': 显示器, 'laptop': 笔记本)
  let currentDbCategory = 'monitor';

  /**
   * 初始化显示器/笔记本数据库品牌下拉框与列表
   */
  function initMonitorDb(category = 'monitor') {
    if (!window.PubgMonitorsDB) return;
    currentDbCategory = category;
    const brands = window.PubgMonitorsDB.getBrands(currentDbCategory);
    const allCount = window.PubgMonitorsDB.getAll(currentDbCategory).length;

    // 重置选定品牌标签
    if (dom.brandDropdownLabel) {
      dom.brandDropdownLabel.textContent = '全部品牌';
    }

    // 同步更新原生 select 作为降级与数据镜像
    if (dom.brandFilterSelect) {
      dom.brandFilterSelect.innerHTML = `<option value="all">全部品牌 (共 ${allCount} 款)</option>`;
      dom.brandFilterSelect.value = 'all';
    }

    // 填充纯 DOM 自定义下拉菜单 (避开 Linux Wayland 原生 popup 闪退)
    if (dom.brandDropdownMenu) {
      dom.brandDropdownMenu.innerHTML = '';

      const allItem = document.createElement('div');
      allItem.className = 'custom-dropdown-item active';
      allItem.dataset.value = 'all';
      allItem.innerHTML = `
        <span>全部品牌</span>
        <span class="custom-dropdown-badge">${allCount} 款</span>
      `;
      allItem.addEventListener('click', () => selectBrandFilter('all', '全部品牌'));
      dom.brandDropdownMenu.appendChild(allItem);

      brands.forEach(b => {
        const count = window.PubgMonitorsDB.getAll(currentDbCategory).filter(m => m.brand === b).length;
        if (dom.brandFilterSelect) {
          const opt = document.createElement('option');
          opt.value = b;
          opt.textContent = `${b} (${count}款)`;
          dom.brandFilterSelect.appendChild(opt);
        }

        const item = document.createElement('div');
        item.className = 'custom-dropdown-item';
        item.dataset.value = b;
        item.innerHTML = `
          <span>${b}</span>
          <span class="custom-dropdown-badge">${count} 款</span>
        `;
        item.addEventListener('click', () => selectBrandFilter(b, b));
        dom.brandDropdownMenu.appendChild(item);
      });
    }

    renderMonitorDbList();

    // 检查当前选定型号是否在该分类下，若不在则默认选中第一款机型
    const currentList = window.PubgMonitorsDB.getAll(currentDbCategory);
    const hasCurrent = currentList.some(m => m.model === state.screen.selectedModel);
    if (!hasCurrent && currentList.length > 0) {
      applySelectedMonitor(currentList[0], false);
    }
  }

  /**
   * 选定品牌过滤项
   */
  function selectBrandFilter(brandValue, labelText) {
    if (dom.brandFilterSelect) {
      dom.brandFilterSelect.value = brandValue;
    }
    if (dom.brandDropdownLabel) {
      dom.brandDropdownLabel.textContent = labelText || (brandValue === 'all' ? '全部品牌' : brandValue);
    }
    if (dom.brandDropdownMenu) {
      const items = dom.brandDropdownMenu.querySelectorAll('.custom-dropdown-item');
      items.forEach(el => {
        el.classList.toggle('active', el.dataset.value === brandValue);
      });
      dom.brandDropdownMenu.classList.add('hidden');
    }
    if (dom.brandDropdownBtn) {
      dom.brandDropdownBtn.classList.remove('open');
    }

    if (dom.monitorSearchInput) dom.monitorSearchInput.value = '';
    if (dom.clearSearchBtn) dom.clearSearchBtn.style.display = 'none';

    renderMonitorDbList();
  }

  /**
   * 初始化缩放百分比自定义下拉菜单
   */
  function initScaleDropdown() {
    if (!dom.scaleDropdownMenu) return;
    dom.scaleDropdownMenu.innerHTML = '';
    if (dom.customScaleSelect) dom.customScaleSelect.innerHTML = '';

    SCALE_PRESETS.forEach(pct => {
      if (dom.customScaleSelect) {
        const opt = document.createElement('option');
        opt.value = pct;
        opt.textContent = `${pct}%`;
        if (pct === 100) opt.selected = true;
        dom.customScaleSelect.appendChild(opt);
      }

      const item = document.createElement('div');
      item.className = `custom-dropdown-item ${pct === 100 ? 'active' : ''}`;
      item.dataset.value = pct;
      item.innerHTML = `<span>${pct}%</span>`;
      item.addEventListener('click', () => selectCustomScale(pct));
      dom.scaleDropdownMenu.appendChild(item);
    });
  }

  /**
   * 选定缩放百分比
   */
  function selectCustomScale(pct) {
    state.resolution.scalePercent = pct;
    if (dom.customScaleSelect) dom.customScaleSelect.value = pct;
    if (dom.scaleDropdownLabel) dom.scaleDropdownLabel.textContent = `${pct}%`;
    if (dom.scaleDropdownMenu) {
      const items = dom.scaleDropdownMenu.querySelectorAll('.custom-dropdown-item');
      items.forEach(el => {
        el.classList.toggle('active', parseInt(el.dataset.value, 10) === pct);
      });
      dom.scaleDropdownMenu.classList.add('hidden');
    }
    if (dom.scaleDropdownBtn) {
      dom.scaleDropdownBtn.classList.remove('open');
    }

    clearMeasurementInputs();
    updateResolutionAnalysis();
    estimateMapSizeFromScreen();
    renderSvgPreview();
  }

  /**
   * 渲染显示器/笔记本数据库卡片
   */
  function renderMonitorDbList() {
    if (!window.PubgMonitorsDB || !dom.monitorDbList) return;
    const query = dom.monitorSearchInput ? dom.monitorSearchInput.value.trim() : '';
    const brand = dom.brandFilterSelect ? dom.brandFilterSelect.value : 'all';

    if (dom.clearSearchBtn) {
      dom.clearSearchBtn.style.display = query.length > 0 ? 'block' : 'none';
    }

    const list = window.PubgMonitorsDB.search(query, brand, currentDbCategory);

    dom.monitorDbList.innerHTML = '';
    if (list.length === 0) {
      const typeName = (currentDbCategory === 'laptop' ? '笔记本' : '显示器');
      dom.monitorDbList.innerHTML = `
        <div style="padding: 1.5rem; text-align: center; color: var(--text-tertiary); font-size: 0.85rem;">
          <div>未检索到匹配的${typeName}型号。</div>
          <button type="button" class="btn btn-secondary btn-sm" id="emptyResetSearchBtn" style="margin-top: 0.75rem; font-size: 0.75rem;">清空搜索条件</button>
        </div>
      `;
      const emptyBtn = document.getElementById('emptyResetSearchBtn');
      if (emptyBtn) {
        emptyBtn.addEventListener('click', () => {
          if (dom.monitorSearchInput) dom.monitorSearchInput.value = '';
          if (dom.clearSearchBtn) dom.clearSearchBtn.style.display = 'none';
          if (dom.brandFilterSelect) dom.brandFilterSelect.value = 'all';
          if (dom.brandDropdownLabel) dom.brandDropdownLabel.textContent = '全部品牌';
          if (dom.brandDropdownMenu) {
            const items = dom.brandDropdownMenu.querySelectorAll('.custom-dropdown-item');
            items.forEach(el => el.classList.toggle('active', el.dataset.value === 'all'));
          }
          renderMonitorDbList();
        });
      }
      return;
    }

    list.forEach(item => {
      const isSelected = (state.screen.selectedModel === item.model && state.screen.mode === 'db');
      const card = document.createElement('div');
      card.className = `monitor-item-card ${isSelected ? 'active' : ''}`;
      card.innerHTML = `
        <div class="monitor-item-main">
          <div class="monitor-item-brand">${item.brand}</div>
          <div class="monitor-item-name">
            ${item.model}
          </div>
          <div class="monitor-item-note">${item.note || ''}</div>
        </div>
        <div class="monitor-item-specs">
          <div class="spec-pill-group">
            <span class="spec-pill">${item.diagInch}"</span>
            <span class="spec-pill">${item.nativeRes}</span>
            <span class="spec-pill">${item.refreshRate}</span>
            <span class="spec-pill">${item.panelType}</span>
          </div>
          <div class="spec-dim">面板: ${item.activeWidthMm.toFixed(2)} × ${item.activeHeightMm.toFixed(2)} mm</div>
        </div>
      `;
      card.addEventListener('click', () => {
        applySelectedMonitor(item, true);
      });
      dom.monitorDbList.appendChild(card);
    });
  }

  /**
   * 应用选中的显示器/笔记本硬件参数
   */
  function applySelectedMonitor(monitor, triggerUpdate = true) {
    state.screen.mode = 'db';
    state.screen.selectedModel = monitor.model;
    state.screen.customSize = monitor.diagInch;
    state.screen.aspectRatio = monitor.aspectRatio;
    state.screen.widthMm = monitor.activeWidthMm;
    state.screen.heightMm = monitor.activeHeightMm;
    state.measurement.isManualCalculated = false;

    // 同步到原生分辨率
    state.resolution.nativeWidth = monitor.nativeWidth;
    state.resolution.nativeHeight = monitor.nativeHeight;

    if (dom.selectedMonitorNotice) {
      const typeName = (monitor.category === 'laptop' ? '笔记本电脑' : '独立显示器');
      dom.selectedMonitorNotice.style.display = 'block';
      dom.selectedMonitorNotice.innerHTML = `
        <strong>已绑定硬件：${monitor.brand} ${monitor.model}</strong><br>
        设备类别：${typeName} | 屏幕尺寸：${monitor.diagInch} 英寸 (${monitor.aspectRatio}) | 原生分辨率：${monitor.nativeRes} (${monitor.refreshRate} ${monitor.panelType})<br>
        官方硬件有效面板显示区域：<strong>${monitor.activeWidthMm.toFixed(3)} mm × ${monitor.activeHeightMm.toFixed(3)} mm</strong>（微米级物理基准）
      `;
    }

    renderMonitorDbList();

    if (triggerUpdate) {
      clearMeasurementInputs();
      updateResolutionAnalysis();
      estimateMapSizeFromScreen();
      renderSvgPreview();
    }
  }

  /**
   * 针对操作系统底层 EDID 模糊标签（如 BenQ Corporation 24"）的智能词法解析器
   */
  function parseEdidLabel(rawLabel, realW, realH) {
    if (!rawLabel || typeof rawLabel !== 'string') return null;
    const text = rawLabel.trim();

    // 常见品牌正则映射表
    const brandMap = [
      { pattern: /\b(benq|zowie)\b/i, brand: 'ZOWIE / BenQ' },
      { pattern: /\b(asus|rog|tuf)\b/i, brand: 'ASUS' },
      { pattern: /\b(lg|ultragear)\b/i, brand: 'LG' },
      { pattern: /\b(alienware|dell)\b/i, brand: 'Alienware / Dell' },
      { pattern: /\b(samsung|odyssey)\b/i, brand: 'Samsung' },
      { pattern: /\b(aoc|agon)\b/i, brand: 'AOC / AGON' },
      { pattern: /\bktc\b/i, brand: 'KTC 康冠' },
      { pattern: /\bhkc\b/i, brand: 'HKC 惠科' },
      { pattern: /\btitan\b/i, brand: 'Titan Army 泰坦军团' },
      { pattern: /\b(redmi|xiaomi)\b/i, brand: 'Xiaomi / Redmi' },
      { pattern: /\binnocn\b/i, brand: 'Innocn 联合创新' },
      { pattern: /\bsanc\b/i, brand: 'SANC 三色' },
      { pattern: /\bthunderobot\b/i, brand: 'Thunderobot 雷神' },
      { pattern: /\bmsi\b/i, brand: 'MSI' },
      { pattern: /\b(acer|predator|nitro)\b/i, brand: 'Acer' },
      { pattern: /\bviewsonic\b/i, brand: 'ViewSonic 优派' },
      { pattern: /\bkoorui\b/i, brand: 'KOORUI 科睿' }
    ];

    let detectedBrand = null;
    for (const b of brandMap) {
      if (b.pattern.test(text)) {
        detectedBrand = b.brand;
        break;
      }
    }

    // 提取尺寸 (例如 24", 24.5", 27", 32", 34")
    const sizeMatch = text.match(/(\d{2}(?:\.\d)?)\s*(?:["寸吋inch]|$)/i);
    const detectedSize = sizeMatch ? parseFloat(sizeMatch[1]) : null;

    // 清洗掉无意义的注册公司/通用词
    const cleanedKeyword = text
      .replace(/\b(corporation|corp|inc|electronics|display|technology|co\.|ltd|generic|pnp|monitor)\b/gi, '')
      .replace(/["'”]/g, '')
      .trim();

    // 在数据库中搜索候选型号
    let candidates = [];
    if (window.PubgMonitorsDB) {
      const all = window.PubgMonitorsDB.getAll();
      candidates = all.filter(m => {
        // 品牌优先匹配
        if (detectedBrand && m.brand !== detectedBrand) return false;
        // 分辨率匹配 (若有)
        if (realW && realH && m.nativeWidth === realW && m.nativeHeight === realH) {
          // 尺寸高度匹配
          if (detectedSize && Math.abs(m.diagInch - detectedSize) <= 0.6) {
            return true;
          }
        }
        // 型号包含关键数字
        if (detectedSize && String(m.diagInch).startsWith(String(Math.floor(detectedSize)))) {
          return true;
        }
        return false;
      });

      // 如果有尺寸精确匹配的，排在最前 (例如 24.0" 匹配 XL2411P)
      if (detectedSize) {
        candidates.sort((a, b) => Math.abs(a.diagInch - detectedSize) - Math.abs(b.diagInch - detectedSize));
      }
    }

    return {
      raw: text,
      brand: detectedBrand,
      size: detectedSize,
      cleanedKeyword: cleanedKeyword,
      candidates: candidates
    };
  }

  /**
   * 调用标准 Window Management API 探测系统连接的物理显示设备
   */
  async function detectSystemScreens() {
    const container = dom.detectedScreensContainer;
    if (!container) return;
    container.style.display = 'block';
    container.innerHTML = '<div style="font-size: 0.8rem; color: var(--text-tertiary); padding: 0.4rem 0;">正在检索多显示设备配置...</div>';

    let screensList = [];
    let isWindowManagement = false;

    // 1. 尝试使用现代 W3C Window Management API (Chrome 100+)
    if ('getScreenDetails' in window) {
      try {
        const screenDetails = await window.getScreenDetails();
        isWindowManagement = true;
        screensList = screenDetails.screens.map((s, idx) => ({
          id: idx,
          label: s.label || `外接显示设备 ${idx + 1}`,
          width: s.width,
          height: s.height,
          dpr: s.devicePixelRatio || window.devicePixelRatio || 1,
          isPrimary: s.isPrimary,
          isInternal: s.isInternal,
          isCurrent: s === screenDetails.currentScreen
        }));
      } catch (err) {
        console.warn('Window Management permission denied or not granted:', err);
      }
    }

    // 2. 若不支持或未授权，优雅回退到标准 window.screen
    if (screensList.length === 0) {
      const dpr = window.devicePixelRatio || 1;
      screensList.push({
        id: 0,
        label: '当前主显示窗口设备',
        width: window.screen.width,
        height: window.screen.height,
        dpr: dpr,
        isPrimary: true,
        isInternal: false,
        isCurrent: true
      });
    }

    // 渲染检测到的屏幕列表
    let html = `
      <div style="font-size: 0.78rem; color: var(--text-secondary); margin-bottom: 0.5rem;">
        已探测到 <strong>${screensList.length}</strong> 个物理显示设备（${isWindowManagement ? '已获得多屏管理授权' : '当前窗口基本显示环境'}）。点击屏幕卡片可自动识别或直接确认型号：
      </div>
      <div style="display: flex; flex-direction: column; gap: 0.65rem;">
    `;

    screensList.forEach(s => {
      const realW = Math.round(s.width * s.dpr);
      const realH = Math.round(s.height * s.dpr);
      const parsed = parseEdidLabel(s.label, realW, realH);

      html += `
        <div class="option-card screen-detect-card" data-screen-id="${s.id}" style="padding: 0.85rem 1rem; margin-bottom: 0;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
            <div style="font-size: 0.92rem; font-weight: 600; color: #fff;">${s.label}</div>
            <div style="display: flex; gap: 0.35rem;">
              ${s.isPrimary ? '<span class="spec-pill" style="color: #60a5fa;">主屏</span>' : ''}
              ${s.isCurrent ? '<span class="spec-pill" style="color: #34d399;">当前窗口</span>' : ''}
            </div>
          </div>
          <div style="font-size: 0.78rem; color: var(--text-tertiary); font-family: var(--font-mono); margin-bottom: 0.4rem;">
            物理分辨率: ${realW} × ${realH} | 逻辑: ${s.width} × ${s.height} (缩放 ${(s.dpr * 100).toFixed(0)}%)
          </div>
      `;

      // 如果通过 EDID 解析出了品牌与匹配型号建议
      if (parsed && parsed.candidates && parsed.candidates.length > 0) {
        const top = parsed.candidates[0];
        html += `
          <div style="background: rgba(37, 99, 235, 0.08); border: 1px solid rgba(37, 99, 235, 0.25); border-radius: 6px; padding: 0.55rem 0.75rem; margin-top: 0.5rem;">
            <div style="font-size: 0.78rem; color: #93c5fd; margin-bottom: 0.25rem;">
              <strong>推荐型号：</strong>识别为 ${parsed.brand || ''} ${parsed.size ? parsed.size + ' 英寸' : ''}
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
              <span style="font-size: 0.82rem; font-weight: 600; color: #fff;">${top.brand} ${top.model} (${top.diagInch}" ${top.nativeRes} ${top.panelType})</span>
              <button type="button" class="btn btn-primary btn-sm btn-quick-bind" data-model="${top.model}" style="padding: 0.25rem 0.65rem; font-size: 0.75rem;">
                确认型号
              </button>
            </div>
          </div>
        `;
      }

      html += `</div>`;
    });

    html += `
      </div>
      <div style="margin-top: 0.6rem; font-size: 0.73rem; color: var(--text-tertiary); line-height: 1.4;">
        * 注：操作系统底层 EDID 描述符常将型号简写（如将 <strong>BenQ XL2546K</strong> 汇报为 <strong>BenQ Corporation 24.5"</strong>）。系统已自动通过品牌与尺寸完成智能消歧匹配，点击“确认型号”即可完成微米级面板参数绑定。
      </div>
    `;

    container.innerHTML = html;

    // 绑定确认型号按钮
    container.querySelectorAll('.btn-quick-bind').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const modelName = btn.dataset.model;
        const target = window.PubgMonitorsDB.getAll().find(m => m.model === modelName);
        if (target) {
          applySelectedMonitor(target, true);
          showToast(`已绑定显示器：${target.brand} ${target.model} (${target.activeWidthMm} × ${target.activeHeightMm} mm)`, 'success');
        }
      });
    });

    // 绑定点击屏幕卡片同步逻辑
    container.querySelectorAll('.screen-detect-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = parseInt(card.dataset.screenId, 10);
        const scr = screensList.find(x => x.id === id);
        if (!scr) return;

        const realW = Math.round(scr.width * scr.dpr);
        const realH = Math.round(scr.height * scr.dpr);

        state.resolution.nativeWidth = realW;
        state.resolution.nativeHeight = realH;

        const parsed = parseEdidLabel(scr.label, realW, realH);
        if (parsed) {
          // 自动切换品牌筛选下拉框
          if (parsed.brand && dom.brandFilterSelect) {
            dom.brandFilterSelect.value = parsed.brand;
          }
          // 自动填充有效搜索词
          if (dom.monitorSearchInput) {
            dom.monitorSearchInput.value = parsed.cleanedKeyword || '';
          }
          renderMonitorDbList();

          if (parsed.candidates && parsed.candidates.length > 0) {
            applySelectedMonitor(parsed.candidates[0], true);
            return;
          }
        }

        updateResolutionAnalysis();
        estimateMapSizeFromScreen();
        renderSvgPreview();
      });
    });
  }

  /**
   * 渲染显示器预设卡片
   */
  function renderScreenPresets() {
    dom.screenPresetContainer.innerHTML = '';
    SCREEN_PRESETS.forEach(preset => {
      const card = document.createElement('div');
      card.className = `option-card ${state.screen.preset === preset.id && state.screen.mode === 'generic' ? 'active' : ''}`;
      card.dataset.id = preset.id;
      card.innerHTML = `
        <div class="option-header">
          <div class="option-title">${preset.label}</div>
          <div class="option-badge">${preset.ratio}</div>
        </div>
        <div class="option-desc">${preset.desc}</div>
      `;
      card.addEventListener('click', () => selectScreenPreset(preset.id));
      dom.screenPresetContainer.appendChild(card);
    });
  }

  /**
   * 选择显示器预设
   */
  function selectScreenPreset(id) {
    state.screen.mode = 'generic';
    state.screen.preset = id;
    clearMeasurementInputs();
    if (id === 'custom') {
      dom.customScreenBox.classList.remove('hidden');
    } else {
      dom.customScreenBox.classList.add('hidden');
      const preset = SCREEN_PRESETS.find(p => p.id === id);
      state.screen.customSize = preset.diagInch;
      state.screen.aspectRatio = preset.ratio;
    }
    updateScreenPhysics();
    renderScreenPresets();
    estimateMapSizeFromScreen();
    renderSvgPreview();
  }

  /**
   * 计算显示器物理长宽尺寸 (毫米)
   */
  function updateScreenPhysics() {
    if (state.screen.mode === 'db') {
      // 数据库模式已加载官方微米级硬件有效面板尺寸，保持高精度
      return;
    }
    let diag = state.screen.customSize;
    let ratioW = 16;
    let ratioH = 9;

    if (state.screen.preset === 'custom') {
      diag = parseFloat(dom.customDiagInput.value) || 24.5;
      state.screen.customSize = diag;
      const parts = dom.customRatioSelect.value.split(':');
      ratioW = parseFloat(parts[0]) || 16;
      ratioH = parseFloat(parts[1]) || 9;
      state.screen.aspectRatio = dom.customRatioSelect.value;
    } else {
      const parts = state.screen.aspectRatio.split(':');
      ratioW = parseFloat(parts[0]) || 16;
      ratioH = parseFloat(parts[1]) || 9;
    }

    // 根据勾股定理换算物理尺寸 (mm)
    const diagMm = diag * 25.4;
    const hypotenuse = Math.sqrt(ratioW * ratioW + ratioH * ratioH);
    state.screen.widthMm = (ratioW / hypotenuse) * diagMm;
    state.screen.heightMm = (ratioH / hypotenuse) * diagMm;
  }

  /**
   * 渲染分辨率预设卡片
   */
  function renderResPresets() {
    dom.resPresetContainer.innerHTML = '';
    RESOLUTION_PRESETS.forEach(res => {
      const card = document.createElement('div');
      card.className = `option-card ${state.resolution.preset === res.id ? 'active' : ''}`;
      card.dataset.id = res.id;
      const badgeClass = res.category === 'stretched' ? 'badge-stretched' : 'badge-standard';
      const badgeText = res.category === 'stretched' ? '横向拉伸' : '标准无拉伸';
      card.innerHTML = `
        <div class="option-header">
          <div class="option-title">${res.name}</div>
          <span class="badge ${badgeClass}">${badgeText}</span>
        </div>
        <div class="option-desc">${res.desc}</div>
      `;
      card.addEventListener('click', () => selectResPreset(res.id));
      dom.resPresetContainer.appendChild(card);
    });
  }

  /**
   * 选择分辨率预设
   */
  function selectResPreset(id) {
    state.resolution.preset = id;
    clearMeasurementInputs();
    if (id === 'custom') {
      dom.customResBox.classList.remove('hidden');
    } else {
      dom.customResBox.classList.add('hidden');
      const item = RESOLUTION_PRESETS.find(r => r.id === id);
      state.resolution.width = item.w;
      state.resolution.height = item.h;
    }
    renderResPresets();
    updateResolutionAnalysis();
    estimateMapSizeFromScreen();
    renderSvgPreview();
  }

  /**
   * 分析分辨率并计算拉伸因子
   */
  function updateResolutionAnalysis() {
    let w = state.resolution.width;
    let h = state.resolution.height;

    if (state.resolution.preset === 'custom') {
      w = parseInt(dom.customResW.value, 10) || 1920;
      h = parseInt(dom.customResH.value, 10) || 1080;
      state.resolution.width = w;
      state.resolution.height = h;
    }

    // 根据显示器原生比例对比
    const parts = state.screen.aspectRatio.split(':');
    const screenAspect = (parseFloat(parts[0]) || 16) / (parseFloat(parts[1]) || 9);
    const gameAspect = w / h;

    // 拉伸因子 = 显示器物理点阵纵横比 / 游戏渲染像素纵横比
    let stretch = screenAspect / gameAspect;
    // 针对 PUBG 游戏内 16:10 拉伸 (如 1728x1080, 2304x1440, 3456x2160) 游戏实测校准：
    // 在 16:9 显示器上放大3次实测 100m 对应 33.10mm (未拉伸基准 30.00mm)，游戏内实测有效拉伸因子为 33.1 / 30.0 = 1.10333
    if (Math.abs(screenAspect - 16 / 9) < 0.02 && Math.abs(gameAspect - 1.6) < 0.02) {
      stretch = 33.1 / 30.0;
    }
    const isStretched = Math.abs(stretch - 1.0) > 0.01;

    state.resolution.isStretched = isStretched;
    state.resolution.stretchFactor = stretch;

    let scaleInfo = '';
    if (state.resolution.preset === 'custom' && state.resolution.scaleEnabled) {
      scaleInfo = `<br>缩放配置：<strong>${state.resolution.scalePercent}%</strong>`;
    }

    const mapSpec = PUBG_MAP_SPECS[state.map.size] || PUBG_MAP_SPECS['8x8'];
    const mapHintText = `（当前【${mapSpec.shortLabel}】规格：${mapSpec.zoomShort}）`;

    if (isStretched) {
      dom.resAnalysisBox.className = 'status-box status-warning';
      const rawStretch = (screenAspect / gameAspect).toFixed(4);
      let stretchDesc = `产生 <strong>${(stretch).toFixed(4)} 倍</strong> 的横向物理拉伸`;
      if (Math.abs(stretch - (screenAspect / gameAspect)) > 0.001) {
        stretchDesc = `理论点阵拉伸为 <strong>${rawStretch} 倍</strong>，结合游戏大地图视口实测校准为 <strong>${(stretch).toFixed(4)} 倍</strong>（以保证横向 100m 精确对齐 33.10 mm）`;
      }
      dom.resAnalysisBox.innerHTML = `
        <strong>已识别为非标准拉伸分辨率</strong><br>
        当前游戏渲染比例为 <strong>${(gameAspect).toFixed(3)}:1</strong>，全屏显示于 <strong>${state.screen.aspectRatio}</strong> 显示器上，${stretchDesc}。${scaleInfo}<br>
        系统将启用<strong>同心椭圆算法</strong>（横向自动扩展为长半轴，纵向为短半轴），确保打印尺与屏幕拉伸图像几何严密贴合。
      `;
      dom.measureModeHint.innerHTML = `您当前使用了<strong>横向拉伸非标分辨率</strong>${mapHintText}，由于横竖像素形变不同，需要分别测量<strong>竖向（短边）</strong>和<strong>横向（长边）</strong>的物理尺寸。`;
      dom.measureXGroup.classList.remove('hidden');
    } else {
      dom.resAnalysisBox.className = 'status-box status-info';
      dom.resAnalysisBox.innerHTML = `
        <strong>已识别为标准无拉伸分辨率</strong><br>
        当前游戏渲染比例与显示器物理比例严格一致 (1:1 正方形像素)。${scaleInfo ? `<br>${scaleInfo}` : ''}<br>系统将采用<strong>同心圆算法</strong>生成测距尺。
      `;
      dom.measureModeHint.innerHTML = `您当前为<strong>标准未拉伸分辨率</strong>${mapHintText}，游戏内横向与竖向比例相同，仅需测量单向物理尺寸即可（系统将自动同步生成完美正圆同心尺）。`;
      dom.measureXGroup.classList.add('hidden');
    }
    updateCalibLabels();
  }

  /**
   * 动态更新校准界面的表单标签文本（标准分辨率显示“同心圆”，非标准分辨率显示“同心椭圆”）
   */
  function updateCalibLabels() {
    const isStretched = !!state.resolution.isStretched;
    const shape = isStretched ? '同心椭圆' : '同心圆';
    if (dom.labelCalibPrinted100) {
      dom.labelCalibPrinted100.textContent = `用直尺测量打印纸张${shape}横向的 100m`;
    }
    if (dom.labelCalibPrinted300) {
      dom.labelCalibPrinted300.textContent = `用直尺测量打印纸张${shape}横向的 300m`;
    }
    if (dom.labelCalibPrintedY100) {
      dom.labelCalibPrintedY100.textContent = `用直尺测量打印纸张${shape}竖向的 100m`;
    }
    if (dom.labelCalibPrintedY300) {
      dom.labelCalibPrintedY300.textContent = `用直尺测量打印纸张${shape}竖向的 300m`;
    }
  }

  /**
   * 获取垂直方向 (Y轴) 当前换算为 100m 的物理测量值 (mm)
   */
  function getCurrentY100Value() {
    if (!dom.yMeasureInput) return NaN;
    const raw = dom.yMeasureInput.value.trim();
    if (!raw) return NaN;
    const val = parseFloat(raw);
    if (isNaN(val) || val <= 0) return NaN;
    const mode = dom.yMeasureModeSelect ? dom.yMeasureModeSelect.value : '100m';
    return mode === '300m' ? (val / 3.0) : val;
  }

  /**
   * 获取水平方向 (X轴) 当前换算为 100m 的物理测量值 (mm)
   */
  function getCurrentX100Value() {
    if (!dom.xMeasureInput) return NaN;
    const raw = dom.xMeasureInput.value.trim();
    if (!raw) return NaN;
    const val = parseFloat(raw);
    if (isNaN(val) || val <= 0) return NaN;
    const mode = dom.xMeasureModeSelect ? dom.xMeasureModeSelect.value : '100m';
    return mode === '300m' ? (val / 3.0) : val;
  }

  /**
   * 检验步骤 3 实测数据是否完整有效
   */
  function hasValidMeasurementInput() {
    const y100 = getCurrentY100Value();
    if (isNaN(y100) || y100 <= 0) return false;

    if (state.resolution.isStretched) {
      const x100 = getCurrentX100Value();
      if (isNaN(x100) || x100 <= 0) return false;
    }

    return true;
  }

  /**
   * 聚焦首个未填写的实测输入框
   */
  function focusFirstMissingMeasurementInput() {
    const y100 = getCurrentY100Value();
    if (isNaN(y100) || y100 <= 0) {
      if (dom.yMeasureInput) dom.yMeasureInput.focus();
      return;
    }

    if (state.resolution.isStretched) {
      const x100 = getCurrentX100Value();
      if (isNaN(x100) || x100 <= 0) {
        if (dom.xMeasureInput) dom.xMeasureInput.focus();
        return;
      }
    }
  }

  /**
   * 清空步骤 3 的实测输入数据，保证不自动预填任何内容
   */
  function clearMeasurementInputs() {
    if (dom.yMeasureInput) {
      dom.yMeasureInput.value = '';
      dom.yMeasureInput.placeholder = '输入 100m 屏幕实测高度';
    }
    if (dom.xMeasureInput) {
      dom.xMeasureInput.value = '';
      dom.xMeasureInput.placeholder = '输入 100m 屏幕实测宽度';
    }
    if (dom.yMeasureModeSelect) dom.yMeasureModeSelect.value = '100m';
    if (dom.xMeasureModeSelect) dom.xMeasureModeSelect.value = '100m';
    state.measurement.isManualCalculated = false;
    state.measurement.hasMeasurement = false;
    updateMeasurementCalculation();
  }

  /**
   * 根据显示器对角线与分辨率，理论推导绝地求生地图物理尺寸 (预设两套标准：标准分辨率基准 vs 非标拉伸基准)
   */
  function estimateMapSizeFromScreen() {
    const mapSpec = PUBG_MAP_SPECS[state.map.size] || PUBG_MAP_SPECS['8x8'];
    const mapScale = mapSpec.scaleFactor; // 8x8/4x4 为 1.0, 2x2 为 0.5, 3x3 为 1/3
    let scaleRatio = 1.0;
    if (state.resolution.preset === 'custom' && state.resolution.scaleEnabled && state.resolution.scalePercent > 0) {
      scaleRatio = state.resolution.scalePercent / 100.0;
    }
    const estimated100m_base = state.screen.heightMm * MAP_VIEWPORT_RATIO * scaleRatio * mapScale; // 竖向未拉伸物理长度 (mm)

    // 套系 A: 标准分辨率基准 (1:1 正圆)
    const std100 = parseFloat(estimated100m_base.toFixed(2));
    const std300 = parseFloat((std100 * 3.0).toFixed(2));

    // 套系 B: 非标拉伸基准 (横向拉伸同心椭圆，基于物理纵横比理论拉伸)
    const stretch = state.resolution.stretchFactor || 1.0;
    const strY100 = std100;
    const strY300 = std300;
    const strX100 = parseFloat((std100 * stretch).toFixed(2));
    const strX300 = parseFloat((strX100 * 3.0).toFixed(2));

    // 更新界面双标准卡片展示数值
    if (dom.theoryStd100) dom.theoryStd100.textContent = `${std100.toFixed(2)} mm`;
    if (dom.theoryStd300) dom.theoryStd300.textContent = `${std300.toFixed(2)} mm`;
    if (dom.theoryStrY100) dom.theoryStrY100.textContent = `${strY100.toFixed(2)} mm`;
    if (dom.theoryStrX100) dom.theoryStrX100.textContent = `${strX100.toFixed(2)} mm`;

    // 推荐高亮指示
    if (state.resolution.isStretched) {
      if (dom.theoryStandardBox) dom.theoryStandardBox.classList.remove('active-recommend');
      if (dom.theoryStretchedBox) dom.theoryStretchedBox.classList.add('active-recommend');
      if (dom.theoryRecommendBadge) {
        dom.theoryRecommendBadge.textContent = '非标推荐';
        dom.theoryRecommendBadge.className = 'badge badge-stretched';
      }
    } else {
      if (dom.theoryStandardBox) dom.theoryStandardBox.classList.add('active-recommend');
      if (dom.theoryStretchedBox) dom.theoryStretchedBox.classList.remove('active-recommend');
      if (dom.theoryRecommendBadge) {
        dom.theoryRecommendBadge.textContent = '标准推荐';
        dom.theoryRecommendBadge.className = 'badge badge-standard';
      }
    }

    // 默认不向输入框预填数据，保持为空让用户输入或主动点击理论参考
    // 若用户尚未输入实测值，在 state 内部计算并保留理论值，确保右侧 SVG 矢量预览图拥有正常样张基准
    if (!hasValidMeasurementInput()) {
      const bestY = state.resolution.isStretched ? strY100 : std100;
      const bestX = state.resolution.isStretched ? strX100 : std100;
      state.measurement.yFinal100 = bestY;
      state.measurement.yStep = bestY / 10.0;
      state.measurement.xFinal100 = bestX;
      state.measurement.xStep = bestX / 10.0;
    }
  }

  /**
   * 应用标准分辨率理论基准（用户主动点击时才填入）
   */
  function applyTheoryStandard() {
    state.measurement.isManualCalculated = false;
    const mapSpec = PUBG_MAP_SPECS[state.map.size] || PUBG_MAP_SPECS['8x8'];
    const mapScale = mapSpec.scaleFactor;
    let scaleRatio = 1.0;
    if (state.resolution.preset === 'custom' && state.resolution.scaleEnabled && state.resolution.scalePercent > 0) {
      scaleRatio = state.resolution.scalePercent / 100.0;
    }
    const base100 = parseFloat((state.screen.heightMm * MAP_VIEWPORT_RATIO * scaleRatio * mapScale).toFixed(2));
    const base300 = parseFloat((base100 * 3.0).toFixed(2));

    if (dom.yMeasureModeSelect && dom.yMeasureInput) {
      dom.yMeasureInput.value = dom.yMeasureModeSelect.value === '300m' ? base300 : base100;
    }
    if (dom.xMeasureModeSelect && dom.xMeasureInput) {
      dom.xMeasureInput.value = dom.xMeasureModeSelect.value === '300m' ? base300 : base100;
    }

    state.measurement.hasMeasurement = true;
    updateMeasurementCalculation();
    renderSvgPreview();
    showToast(`已填入 ${mapSpec.shortLabel} 标准理论基准`, 'info');
  }

  /**
   * 应用非标拉伸理论基准（用户主动点击时才填入）
   */
  function applyTheoryStretched() {
    state.measurement.isManualCalculated = false;
    const mapSpec = PUBG_MAP_SPECS[state.map.size] || PUBG_MAP_SPECS['8x8'];
    const mapScale = mapSpec.scaleFactor;
    let scaleRatio = 1.0;
    if (state.resolution.preset === 'custom' && state.resolution.scaleEnabled && state.resolution.scalePercent > 0) {
      scaleRatio = state.resolution.scalePercent / 100.0;
    }
    const base100 = parseFloat((state.screen.heightMm * MAP_VIEWPORT_RATIO * scaleRatio * mapScale).toFixed(2));
    const base300 = parseFloat((base100 * 3.0).toFixed(2));
    const stretch = state.resolution.stretchFactor || 1.0;
    const x100 = parseFloat((base100 * stretch).toFixed(2));
    const x300 = parseFloat((x100 * 3.0).toFixed(2));

    if (dom.yMeasureModeSelect && dom.yMeasureInput) {
      dom.yMeasureInput.value = dom.yMeasureModeSelect.value === '300m' ? base300 : base100;
    }
    if (dom.xMeasureModeSelect && dom.xMeasureInput) {
      dom.xMeasureInput.value = dom.xMeasureModeSelect.value === '300m' ? x300 : x100;
    }

    state.measurement.hasMeasurement = true;
    updateMeasurementCalculation();
    renderSvgPreview();
    showToast(`已填入 ${mapSpec.shortLabel} 非标拉伸理论基准`, 'info');
  }

  /**
   * 切换当前地图规格 (8x8, 4x4, 3x3, 2x2)
   */
  function switchMapSize(size) {
    const spec = PUBG_MAP_SPECS[size];
    if (!spec) return;
    clearMeasurementInputs();
    state.map = {
      size: spec.id,
      name: spec.label,
      zoomDesc: spec.zoomDesc,
      zoomSteps: spec.zoomSteps,
      scaleFactor: spec.scaleFactor,
      note: spec.examples
    };

    if (dom.mapSizeTabs) {
      dom.mapSizeTabs.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mapSize === size);
      });
    }

    if (dom.mapZoomStatusTag) {
      dom.mapZoomStatusTag.textContent = `${spec.shortLabel} ${spec.zoomShort}`;
    }
    if (dom.mapSubtextHint) {
      dom.mapSubtextHint.textContent = `${spec.hint}（包含：${spec.examples}）`;
    }

    estimateMapSizeFromScreen();
    updateResolutionAnalysis();
    renderSvgPreview();
    showToast(`已切换地图：${spec.label}（${spec.zoomShort}）`, 'info');
  }

  /**
   * 实测数据融合计算 (100m 与 300m 严格 3 倍自洽联动)
   */
  function updateMeasurementCalculation() {
    if (!hasValidMeasurementInput()) {
      state.measurement.hasMeasurement = false;
      if (dom.calcSummaryText) {
        dom.calcSummaryText.className = 'status-box status-info';
        dom.calcSummaryText.innerHTML = `
          <span style="color: var(--text-secondary);">
            等待输入实测尺寸：垂直方向${state.resolution.isStretched ? '与水平方向' : ''}请填写 100m 或 300m 对应实测值。
          </span>
        `;
      }
      return;
    }

    state.measurement.hasMeasurement = true;
    if (dom.calcSummaryText) {
      dom.calcSummaryText.className = 'status-box status-success';
    }

    const y100Best = getCurrentY100Value();
    const yStep = y100Best / 10.0; // 每10米物理步长

    state.measurement.y100 = parseFloat(y100Best.toFixed(2));
    state.measurement.y300 = parseFloat((y100Best * 3.0).toFixed(2));
    state.measurement.yFinal100 = y100Best;
    state.measurement.yStep = yStep;

    if (state.resolution.isStretched) {
      const x100Best = getCurrentX100Value();
      const xStep = x100Best / 10.0;

      state.measurement.x100 = parseFloat(x100Best.toFixed(2));
      state.measurement.x300 = parseFloat((x100Best * 3.0).toFixed(2));
      state.measurement.xFinal100 = x100Best;
      state.measurement.xStep = xStep;
    } else {
      // 标准模式横竖相等
      state.measurement.x100 = state.measurement.y100;
      state.measurement.x300 = state.measurement.y300;
      state.measurement.xFinal100 = y100Best;
      state.measurement.xStep = yStep;
    }

    let summaryHtml = `
      竖向基准：100米为 <strong>${y100Best.toFixed(2)} mm</strong>（300米为 <strong>${(y100Best * 3.0).toFixed(2)} mm</strong>，每 10 米 <strong>${yStep.toFixed(3)} mm</strong>）
    `;

    if (state.resolution.isStretched) {
      summaryHtml += `<br>横向拉伸：100米为 <strong>${state.measurement.xFinal100.toFixed(2)} mm</strong>（300米为 <strong>${(state.measurement.xFinal100 * 3.0).toFixed(2)} mm</strong>，每 10 米 <strong>${state.measurement.xStep.toFixed(3)} mm</strong>）`;
    }

    if (dom.calcSummaryText) {
      dom.calcSummaryText.innerHTML = summaryHtml;
    }

    // 同步到校准界面基准提示
    if (dom.calibTarget100) {
      dom.calibTarget100.textContent = `${state.measurement.xFinal100.toFixed(2)} mm`;
    }
    if (dom.calibTarget300) {
      dom.calibTarget300.textContent = `${(state.measurement.xFinal100 * 3.0).toFixed(2)} mm`;
    }
    if (dom.calibTargetY100) {
      dom.calibTargetY100.textContent = `${state.measurement.yFinal100.toFixed(2)} mm`;
    }
    if (dom.calibTargetY300) {
      dom.calibTargetY300.textContent = `${(state.measurement.yFinal100 * 3.0).toFixed(2)} mm`;
    }
  }

  /**
   * 绘制核心 SVG 图纸矢量内容
   * @param {SVGSVGElement} svg 目标 SVG 元素
   * @param {'portrait'|'landscape'} orientation 渲染朝向
   */
  function renderSvgContent(svg, orientation = 'portrait') {
    if (!svg) return;

    const landW = Math.max(state.paper.widthMm, state.paper.heightMm);
    const landH = Math.min(state.paper.widthMm, state.paper.heightMm);
    const portW = landH;
    const portH = landW;

    const isPortrait = (orientation === 'portrait');
    const marginX = 26.0; // mm (左侧留出 26mm 容纳竖向标尺与 UUID)
    const marginY = 15.0; // mm

    const rxStep = state.measurement.xStep * state.calibration.correctionFactorX;
    const ryStep = state.measurement.yStep * state.calibration.correctionFactorY;
    const isStretched = state.resolution.isStretched;
    const stepInterval = state.measurement.densityMode === '20m' ? 20 : 10;

    // 根据当前纸张规格的可用幅面，自适应计算能够画满整张纸的最大测距范围，而非写死 1000m
    const availW = landW - 2.0 - marginX;
    const availH = landH - 2.0 - marginY;
    const maxCoverDist = Math.hypot(availW / rxStep, availH / ryStep) * 10.0;
    const maxSteps = Math.ceil(maxCoverDist / stepInterval);
    const maxDistance = maxSteps * stepInterval;

    // 清空 SVG
    svg.innerHTML = '';
    if (isPortrait) {
      svg.setAttribute('viewBox', `0 0 ${portW} ${portH}`);
    } else {
      svg.setAttribute('viewBox', `0 0 ${landW} ${landH}`);
    }

    // 若为全屏放大预览的 SVG，显式赋予确定物理基准宽高，彻底根除在 flex 盒中塌缩为 0px 的缺陷
    if (svg.id === 'svgZoomPreview') {
      const baseH = 680;
      const ratio = isPortrait ? (portW / portH) : (landW / landH);
      const baseW = Math.round(baseH * ratio);
      svg.style.width = `${baseW}px`;
      svg.style.height = `${baseH}px`;
      svg.setAttribute('width', `${baseW}`);
      svg.setAttribute('height', `${baseH}`);
    }

    // SVG 背景
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', isPortrait ? portW : landW);
    bg.setAttribute('height', isPortrait ? portH : landH);
    bg.setAttribute('fill', '#ffffff');
    svg.appendChild(bg);

    // 旋转变换容器 (竖版视角下顺时针旋转 90 度，映射真实竖版打印物理视角)
    const rootGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    if (isPortrait) {
      rootGroup.setAttribute('transform', `translate(${portW}, 0) rotate(90)`);
    }

    // 坐标系转换 (横向设计坐标系下：原点位于左下角 marginX, landH - marginY)
    const originX = marginX;
    const originY = landH - marginY;

    // 绘制主基准轴 (原点向负方向延伸 5mm 形成精密十字准星交点，消除粗轴线单向截断视差)
    const axisGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    axisGroup.setAttribute('stroke', '#1a1a1a');
    axisGroup.setAttribute('stroke-width', '0.35');

    // X 轴 (向左延伸 5mm)
    const xAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    xAxis.setAttribute('x1', originX - 5.0);
    xAxis.setAttribute('y1', originY);
    xAxis.setAttribute('x2', landW - 2.0);
    xAxis.setAttribute('y2', originY);
    axisGroup.appendChild(xAxis);

    // Y 轴 (向下延伸 5mm 形成十字交点)
    const yAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    yAxis.setAttribute('x1', originX);
    yAxis.setAttribute('y1', originY + 5.0);
    yAxis.setAttribute('x2', originX);
    yAxis.setAttribute('y2', 2.0);
    axisGroup.appendChild(yAxis);
    rootGroup.appendChild(axisGroup);

    // 绘制同心圆/同心椭圆弧 (自适应覆盖当前纸张全部可用区域)
    const arcsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    arcsGroup.setAttribute('fill', 'none');

    for (let i = 1; i <= maxSteps; i++) {
      const d = i * stepInterval;
      const rx = rxStep * (d / 10.0);
      const ry = ryStep * (d / 10.0);

      // 第一象限椭圆弧: 从 (originX + rx, originY) 到 (originX, originY - ry)
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const dAttr = `M ${originX + rx} ${originY} A ${rx} ${ry} 0 0 0 ${originX} ${originY - ry}`;
      p.setAttribute('d', dAttr);

      const isMajor = (d % 50 === 0);
      if (isMajor) {
        p.setAttribute('stroke', '#1a1a1a');
        p.setAttribute('stroke-width', '0.25');
      } else {
        p.setAttribute('stroke', '#b5b5b5');
        p.setAttribute('stroke-width', '0.12');
      }
      arcsGroup.appendChild(p);
    }
    rootGroup.appendChild(arcsGroup);

    // 绘制 50 步进刻度与文字 (含 0 基准刻度，贯穿轴线内外两侧，消除内沿测量视差)
    const labelsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    labelsGroup.setAttribute('fill', '#1a1a1a');
    labelsGroup.setAttribute('font-family', 'system-ui, -apple-system, sans-serif');
    labelsGroup.setAttribute('font-size', '2.2');
    labelsGroup.setAttribute('text-anchor', 'middle');

    for (let d = 0; d <= maxDistance; d += 50) {
      const rx = rxStep * (d / 10.0);
      const ry = ryStep * (d / 10.0);

      // X 轴标注 (长边，向右) -> 刻度垂直贯穿轴线 (下伸 2.5mm，上穿 1.5mm)
      const xPos = originX + rx;
      if (xPos <= landW - 6.0) {
        const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        tick.setAttribute('x1', xPos);
        tick.setAttribute('y1', originY - 1.5);
        tick.setAttribute('x2', xPos);
        tick.setAttribute('y2', originY + 2.5);
        tick.setAttribute('stroke', '#1a1a1a');
        tick.setAttribute('stroke-width', '0.18');
        labelsGroup.appendChild(tick);

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', xPos);
        text.setAttribute('y', originY + 4.2);
        text.textContent = d;
        labelsGroup.appendChild(text);
      }

      // Y 轴标注 (短边，向上) -> 刻度水平贯穿轴线 (左伸 2.5mm，右穿 1.5mm)
      const yPos = originY - ry;
      if (yPos >= 6.0) {
        const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        tick.setAttribute('x1', originX - 2.5);
        tick.setAttribute('y1', yPos);
        tick.setAttribute('x2', originX + 1.5);
        tick.setAttribute('y2', yPos);
        tick.setAttribute('stroke', '#1a1a1a');
        tick.setAttribute('stroke-width', '0.18');
        labelsGroup.appendChild(tick);

        if (d > 0) {
          const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          text.setAttribute('x', originX - 3.2);
          text.setAttribute('y', yPos + 0.8);
          text.setAttribute('text-anchor', 'end');
          text.textContent = d;
          labelsGroup.appendChild(text);
        }
      }
    }
    rootGroup.appendChild(labelsGroup);

    // 绘制左侧竖向物理标尺 (横向看纸张时竖着显示在左侧，用于 1:1 核对物理尺寸)
    const calGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const calX = 10.0;
    const calYStart = originY; // 底部向上起算 (与原点底边齐平)
    const calYEnd = calYStart - 100.0;

    // 100mm 标尺竖向主基准线
    const calLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    calLine.setAttribute('x1', calX);
    calLine.setAttribute('y1', calYStart);
    calLine.setAttribute('x2', calX);
    calLine.setAttribute('y2', calYEnd);
    calLine.setAttribute('stroke', '#1a1a1a');
    calLine.setAttribute('stroke-width', '0.25');
    calGroup.appendChild(calLine);

    const screen100YTick = parseFloat(state.measurement.yFinal100.toFixed(1));
    const ticks = [
      { offset: 0, label: '0' },
      { offset: screen100YTick, label: isStretched ? `Y:${screen100YTick}` : `${screen100YTick}` },
      { offset: 50, label: '50' },
      { offset: 100, label: '100' }
    ];
    if (isStretched) {
      const screen100XTick = parseFloat(state.measurement.xFinal100.toFixed(1));
      if (Math.abs(screen100XTick - screen100YTick) > 1.5 && Math.abs(screen100XTick - 50) > 2.0 && screen100XTick < 95) {
        ticks.push({ offset: screen100XTick, label: `X:${screen100XTick}` });
      }
    }
    ticks.sort((a, b) => a.offset - b.offset);

    ticks.forEach(t => {
      const curY = calYStart - t.offset;
      const isEnd = (t.offset === 0 || t.offset === 100);
      const lineLen = isEnd ? 2.5 : 1.2;

      // 水平刻度短线 (仅在主基准线左侧向左伸出，右侧不延伸)
      const tLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      tLine.setAttribute('x1', calX - lineLen);
      tLine.setAttribute('y1', curY);
      tLine.setAttribute('x2', calX);
      tLine.setAttribute('y2', curY);
      tLine.setAttribute('stroke', '#1a1a1a');
      tLine.setAttribute('stroke-width', isEnd ? '0.25' : '0.18');
      calGroup.appendChild(tLine);

      // 刻度数值位于短线侧方，水平紧贴主线左侧 (不向左突出，大幅节省左侧空间)
      const tText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      tText.setAttribute('x', calX - 0.6);
      tText.setAttribute('text-anchor', 'end');
      tText.setAttribute('font-size', '1.8');
      tText.setAttribute('fill', '#1a1a1a');
      tText.setAttribute('font-family', 'system-ui, -apple-system, sans-serif');

      // 纵向侧方位置：100 位于端线下方内侧，其余位于刻度线上方侧方；避让相近刻度
      let textY = curY - 0.9;
      if (t.offset === 100) {
        textY = curY + 2.2;
      } else if (t.offset !== 50 && Math.abs(t.offset - 50) < 4.0) {
        textY = curY + 2.2;
      }
      tText.setAttribute('y', textY);
      tText.textContent = t.label;
      calGroup.appendChild(tText);
    });

    // 标尺说明文字：在横向纸张中逆时针旋转 90 度沿标尺垂直排布 (注明单位: mm)
    const calTitle = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    calTitle.setAttribute('x', calX + 2.5);
    calTitle.setAttribute('y', calYStart);
    calTitle.setAttribute('transform', `rotate(-90, ${calX + 2.5}, ${calYStart})`);
    calTitle.setAttribute('font-size', '2.0');
    calTitle.setAttribute('fill', '#222222');
    calTitle.setAttribute('font-family', 'system-ui, -apple-system, sans-serif');
    calTitle.textContent = '物理标尺线（单位: mm / 建议 100% 实际大小打印）';
    calGroup.appendChild(calTitle);

    // UUID 标注：竖着打印到横向纸张的左侧比例尺上方 (在竖版视角中呈现在比例尺右方)
    if (state.printUuid && state.sessionUuid) {
      const uuidText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      const uuidY = calYEnd - 12.0;
      uuidText.setAttribute('x', calX);
      uuidText.setAttribute('y', uuidY);
      uuidText.setAttribute('transform', `rotate(-90, ${calX}, ${uuidY})`);
      uuidText.setAttribute('font-size', '2.0');
      uuidText.setAttribute('fill', '#4b5563');
      uuidText.setAttribute('font-family', 'var(--font-mono), monospace');
      uuidText.textContent = `ID: ${state.sessionUuid.substring(0, 8)}`;
      calGroup.appendChild(uuidText);
    }

    rootGroup.appendChild(calGroup);

    svg.appendChild(rootGroup);

    // 更新预览元数据列表 (单行独立清晰呈现)
    if (dom.previewMetaList) {
      const modeText = isStretched 
        ? `同心椭圆 (拉伸 ${state.resolution.stretchFactor.toFixed(2)}x)` 
        : '同心圆 (原生标准)';
      const x100 = (rxStep * 10).toFixed(2);
      const y100 = (ryStep * 10).toFixed(2);
      const corrX = (state.calibration.correctionFactorX || 1.0).toFixed(4);
      const corrY = (state.calibration.correctionFactorY || 1.0).toFixed(4);

      dom.previewMetaList.innerHTML = `
        <li class="preview-meta-item">
          <span class="meta-label">图形形态</span>
          <span class="meta-val">${modeText}</span>
        </li>
        <li class="preview-meta-item">
          <span class="meta-label">适配地图</span>
          <span class="meta-val">${state.map.name} (${state.map.zoomDesc})</span>
        </li>
        <li class="preview-meta-item">
          <span class="meta-label">纸张画幅</span>
          <span class="meta-val">${state.paper.size} 竖版 (${portW} × ${portH} mm)</span>
        </li>
        <li class="preview-meta-item">
          <span class="meta-label">横向测距</span>
          <span class="meta-val">100m = ${x100} mm (每10m ${(rxStep).toFixed(2)}mm)</span>
        </li>
        <li class="preview-meta-item">
          <span class="meta-label">竖向测距</span>
          <span class="meta-val">100m = ${y100} mm (每10m ${(ryStep).toFixed(2)}mm)</span>
        </li>
        <li class="preview-meta-item">
          <span class="meta-label">机械补偿</span>
          <span class="meta-val">横向 ${corrX} | 竖向 ${corrY}</span>
        </li>
      `;
    }
  }

  /**
   * 渲染交互式 SVG 实时预览（支持主面板与放大弹窗联动）
   */
  function renderSvgPreview() {
    if (dom.svgPreview) {
      renderSvgContent(dom.svgPreview, state.previewOrientation);
    }
    if (dom.previewZoomModal && !dom.previewZoomModal.classList.contains('hidden') && dom.svgZoomPreview) {
      renderSvgContent(dom.svgZoomPreview, state.previewOrientation);
    }
    updatePaperBadges();
  }

  let mapGuideCurrentStep = 1;

  /**
   * 将当前完整测距尺配置追加写入本地历史记录库 (便于为不同顾客或配置检索)
   */
  function saveCurrentConfigToHistory() {
    try {
      const historyStr = localStorage.getItem('pubg_ruler_history') || '[]';
      let historyList = JSON.parse(historyStr);
      if (!Array.isArray(historyList)) historyList = [];

      const currentRecord = {
        uuid: state.sessionUuid,
        shortUuid: state.sessionUuid.substring(0, 8),
        savedAt: new Date().toISOString(),
        screenModel: (state.screen.mode === 'db' ? state.screen.selectedModel : `${state.screen.customSize}" (${state.screen.aspectRatio})`),
        resolution: `${state.resolution.width}×${state.resolution.height}`,
        isStretched: state.resolution.isStretched,
        stretchFactor: state.resolution.stretchFactor,
        scaleEnabled: state.resolution.scaleEnabled,
        scalePercent: state.resolution.scalePercent,
        map: JSON.parse(JSON.stringify(state.map)),
        screen: JSON.parse(JSON.stringify(state.screen)),
        resolutionObj: JSON.parse(JSON.stringify(state.resolution)),
        measurement: JSON.parse(JSON.stringify(state.measurement)),
        calibration: JSON.parse(JSON.stringify(state.calibration)),
        paper: JSON.parse(JSON.stringify(state.paper)),
        printUuid: state.printUuid
      };

      // 依据 UUID 去重置顶
      historyList = historyList.filter(item => item.uuid !== state.sessionUuid && item.shortUuid !== currentRecord.shortUuid);
      historyList.unshift(currentRecord);
      if (historyList.length > 50) historyList = historyList.slice(0, 50);

      localStorage.setItem('pubg_ruler_history', JSON.stringify(historyList));
    } catch (e) {
      // 容错处理
    }
  }

  /**
   * 测距原理 5 步动态指引矢量动画控制器 (纯代码实现)
   */
  let welcomeDemoTimers = [];
  let welcomeDemoAnimFrame = null;

  function stopWelcomeDemo() {
    welcomeDemoTimers.forEach(t => clearTimeout(t));
    welcomeDemoTimers = [];
    if (welcomeDemoAnimFrame) {
      cancelAnimationFrame(welcomeDemoAnimFrame);
      welcomeDemoAnimFrame = null;
    }
  }

  function startWelcomeDemo() {
    stopWelcomeDemo();
    const paperSheet = document.getElementById('demoPaperSheet');
    const origin = document.getElementById('demoOriginGroup');
    const target = document.getElementById('demoTargetGroup');
    const ray = document.getElementById('demoRayLine');
    const arc300 = document.getElementById('demoArc300');
    const arc300Text = document.getElementById('demoArc300Text');
    const arc350 = document.getElementById('demoArc350');
    const arc350Text = document.getElementById('demoArc350Text');
    const arc400 = document.getElementById('demoArc400');
    const arc400Text = document.getElementById('demoArc400Text');
    const badge = document.getElementById('demoDistanceBadge');
    const stepText = document.getElementById('demoStepBadge');

    if (!paperSheet || !origin || !target || !ray) return;

    // 0ms：彻底复位所有动态元素为初始状态（自身 1 号原点始终存在常驻可见）
    origin.style.opacity = '1';
    target.style.opacity = '0';
    target.style.transition = 'opacity 0.3s ease';

    // 纸张初始状态：透明度0，左下固定，右上微翘
    paperSheet.style.transition = 'none';
    paperSheet.style.opacity = '0';
    paperSheet.style.transform = 'perspective(900px) rotateX(24deg) rotateY(-20deg) rotateZ(5deg) scale(0.95)';
    paperSheet.style.filter = 'drop-shadow(-18px 24px 22px rgba(0, 0, 0, 0.75))';
    paperSheet.style.clipPath = 'polygon(0% 100%, 0% 100%, 0% 100%, 0% 100%)';

    ray.style.opacity = '0';
    ray.setAttribute('x1', '80');
    ray.setAttribute('y1', '200');
    ray.setAttribute('x2', '80');
    ray.setAttribute('y2', '200');
    ray.style.strokeDasharray = '4 3';

    if (arc300) {
      arc300.style.stroke = 'rgba(96, 165, 250, 0.55)';
      arc300.style.strokeWidth = '1.6';
      arc300.style.filter = 'none';
      arc300.style.transition = 'all 0.4s ease';
    }
    if (arc300Text) {
      arc300Text.style.fill = 'rgba(147, 197, 253, 0.7)';
      arc300Text.style.transition = 'all 0.4s ease';
    }
    if (arc350) {
      arc350.style.stroke = 'rgba(96, 165, 250, 0.3)';
      arc350.style.strokeWidth = '1.1';
      arc350.style.filter = 'none';
      arc350.style.transition = 'all 0.4s ease';
    }
    if (arc350Text) {
      arc350Text.style.fill = 'rgba(147, 197, 253, 0.45)';
      arc350Text.style.fontWeight = 'normal';
      arc350Text.style.transition = 'all 0.4s ease';
    }
    if (arc400) {
      arc400.style.stroke = 'rgba(96, 165, 250, 0.35)';
      arc400.style.strokeWidth = '1.2';
      arc400.style.filter = 'none';
      arc400.style.transition = 'all 0.4s ease';
    }
    if (arc400Text) {
      arc400Text.style.fill = 'rgba(147, 197, 253, 0.55)';
      arc400Text.style.transition = 'all 0.4s ease';
    }
    if (badge) {
      badge.style.opacity = '0';
      badge.style.transform = 'translateY(6px)';
      badge.style.transition = 'opacity 0.35s ease, transform 0.35s ease';
    }
    if (stepText) stepText.textContent = '步骤 1 / 4：地图标记目标（在地图上打下战术 Ping 标）';

    // 步骤 1：标记目标点 (500ms)
    welcomeDemoTimers.push(setTimeout(() => {
      target.style.opacity = '1';
      if (stepText) stepText.textContent = '步骤 1 / 4：地图标记目标（在地图上打下战术 Ping 标）';
    }, 500));

    // 步骤 2：对齐覆贴图纸，左下固定原点慢慢翻动抚平 (1700ms)
    welcomeDemoTimers.push(setTimeout(() => {
      if (stepText) stepText.textContent = '步骤 2 / 4：对齐覆贴图纸（以 1 号自身为 0 点贴合测距尺）';
      // 阶段 1：纸张显现，左下角对准原点，右上悬空微翘
      paperSheet.style.transition = 'opacity 0.25s ease, clip-path 0.3s ease';
      paperSheet.style.opacity = '1';
      paperSheet.style.clipPath = 'polygon(0% 100%, 35% 100%, 0% 35%, 0% 100%)';

      // 阶段 2：250ms 后平滑翻动抚贴全屏展开 (历时 1.35 秒)
      welcomeDemoTimers.push(setTimeout(() => {
        paperSheet.style.transition = 'transform 1.35s cubic-bezier(0.16, 1, 0.3, 1), filter 1.35s ease, clip-path 1.35s cubic-bezier(0.16, 1, 0.3, 1)';
        paperSheet.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg) rotateZ(0deg) scale(1)';
        paperSheet.style.filter = 'drop-shadow(0 2px 10px rgba(0, 0, 0, 0.35))';
        paperSheet.style.clipPath = 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)';
      }, 250));
    }, 1700));

    // 步骤 3：连接原点到标点 & 高亮对应的 350m 及相邻区间弧线 (3400ms)
    welcomeDemoTimers.push(setTimeout(() => {
      if (stepText) stepText.textContent = '步骤 3 / 4：连接原点与标点（标点落于 300m 与 400m 弧线区间）';
      ray.style.opacity = '1';
      const animStart = performance.now();
      const animDuration = 480;
      // 向量从 (80, 200) 到 (248, 74): dx = 168, dy = -126, 长度 210px 严格对应 350m
      function stepRay(now) {
        const progress = Math.min((now - animStart) / animDuration, 1);
        const ease = 1 - Math.pow(1 - progress, 3);
        ray.setAttribute('x2', (80 + 168 * ease).toFixed(1));
        ray.setAttribute('y2', (200 - 126 * ease).toFixed(1));
        if (progress < 1) {
          welcomeDemoAnimFrame = requestAnimationFrame(stepRay);
        }
      }
      welcomeDemoAnimFrame = requestAnimationFrame(stepRay);

      // 高亮 350m 细分参考弧及相邻的 300m / 400m 弧线
      if (arc350) {
        arc350.style.stroke = '#facc15';
        arc350.style.strokeWidth = '2.2';
        arc350.style.filter = 'drop-shadow(0 0 6px #facc15)';
      }
      if (arc350Text) {
        arc350Text.style.fill = '#facc15';
        arc350Text.style.fontWeight = 'bold';
      }
      if (arc300) {
        arc300.style.stroke = '#93c5fd';
        arc300.style.strokeWidth = '2.2';
      }
      if (arc400) {
        arc400.style.stroke = '#93c5fd';
        arc400.style.strokeWidth = '2.0';
      }
    }, 3400));

    // 步骤 4：显示非整百米距离读数卡片 350 m (4600ms)
    welcomeDemoTimers.push(setTimeout(() => {
      if (stepText) stepText.textContent = '步骤 4 / 4：估读实际距离（位于 300m 与 400m 正中，精准为 350 米）';
      if (badge) {
        badge.style.opacity = '1';
        badge.style.transform = 'translateY(0)';
      }
    }, 4600));

    // 循环重播 (7400ms 后平滑重启)
    welcomeDemoTimers.push(setTimeout(() => {
      if (!dom.welcomeGuideModal || dom.welcomeGuideModal.classList.contains('hidden')) return;
      startWelcomeDemo();
    }, 7400));
  }

  /**
   * 打开首次访问引导与使用说明模态弹窗
   */
  function openWelcomeModal() {
    if (!dom.welcomeGuideModal) return;
    const todayStr = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem('pubg_ruler_hide_welcome_date') === todayStr) {
      return;
    }
    if (dom.dontShowWelcomeToday) {
      dom.dontShowWelcomeToday.checked = false;
    }
    dom.welcomeGuideModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    startWelcomeDemo();
  }

  /**
   * 关闭首次访问引导与使用说明模态弹窗
   */
  function closeWelcomeModal() {
    if (!dom.welcomeGuideModal) return;
    stopWelcomeDemo();
    if (dom.dontShowWelcomeToday && dom.dontShowWelcomeToday.checked) {
      const todayStr = new Date().toISOString().slice(0, 10);
      localStorage.setItem('pubg_ruler_hide_welcome_date', todayStr);
    }
    dom.welcomeGuideModal.classList.add('hidden');
    document.body.style.overflow = '';
  }

  /**
   * 全新开始：生成新的 UUID 并重置为一套全新的方案配置
   */
  function handleStartNewConfig() {
    const newUuid = generateUuid();
    state.sessionUuid = newUuid;
    localStorage.setItem('pubg_ruler_current_uuid', newUuid);

    if (dom.sessionUuidDisplay) {
      dom.sessionUuidDisplay.textContent = newUuid.substring(0, 8);
      dom.sessionUuidDisplay.title = newUuid;
    }

    // 重置测量和校准状态
    clearMeasurementInputs();
    resetCalibration();
    estimateMapSizeFromScreen();
    initCalibUuidSection();
    renderStep(1);
    renderSvgPreview();

    closeWelcomeModal();
    showToast(`已生成全新配置方案 [${newUuid.substring(0, 8)}]`, 'success');
  }

  /**
   * 初始化检查是否需要弹出首次访问引导
   */
  function initWelcomeModal() {
    // 1. 检查是否来自使用说明页面的跳转或返回
    let fromGuide = false;
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const isFromUrl = urlParams.get('from') === 'guide';
      const isFromSession = sessionStorage.getItem('pubg_ruler_skip_welcome') === '1';
      const isFromReferrer = !!(document.referrer && document.referrer.includes('guide.html'));

      if (isFromUrl || isFromSession || isFromReferrer) {
        fromGuide = true;
        sessionStorage.removeItem('pubg_ruler_skip_welcome');
        // 清理 URL 中的 ?from=guide 参数，保持浏览器地址栏整洁
        if (isFromUrl && window.history && window.history.replaceState) {
          const cleanUrl = window.location.pathname + window.location.hash;
          window.history.replaceState({}, '', cleanUrl);
        }
      }
    } catch (e) {
      // 容错处理
    }

    if (fromGuide) {
      // 来自使用说明页面，用户已阅读指南，直接静默跳过弹窗
      return;
    }

    // 2. 检查“今日不再提示”是否在当天生效
    const todayStr = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem('pubg_ruler_hide_welcome_date') !== todayStr) {
      setTimeout(() => {
        openWelcomeModal();
      }, 350);
    }
  }

  /**
   * 打开步骤 3 地图设置引导弹窗
   */
  function openMapGuideModal() {
    if (!dom.mapGuideModal) return;
    if (localStorage.getItem('pubg_ruler_hide_map_guide') === 'true') {
      return;
    }
    mapGuideCurrentStep = 1;
    if (dom.dontShowMapGuide) {
      dom.dontShowMapGuide.checked = false;
    }
    if (dom.mapGuideStep1) {
      dom.mapGuideStep1.classList.remove('hidden');
      dom.mapGuideStep1.style.display = 'block';
    }
    if (dom.mapGuideStep2) {
      dom.mapGuideStep2.classList.add('hidden');
      dom.mapGuideStep2.style.display = 'none';
    }
    if (dom.mapGuideNextBtn) dom.mapGuideNextBtn.textContent = '确认';
    dom.mapGuideModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  /**
   * 关闭步骤 3 地图设置引导弹窗
   */
  function closeMapGuideModal() {
    if (!dom.mapGuideModal) return;
    if (dom.dontShowMapGuide && dom.dontShowMapGuide.checked) {
      localStorage.setItem('pubg_ruler_hide_map_guide', 'true');
    }
    dom.mapGuideModal.classList.add('hidden');
    document.body.style.overflow = '';
  }

  /**
   * 打开步骤 4 打印须知模态弹窗
   */
  function openPrintNoticeModal() {
    if (!dom.printNoticeModal) return;
    if (localStorage.getItem('pubg_ruler_hide_print_notice') === 'true') {
      return;
    }
    if (dom.dontShowPrintNotice) {
      dom.dontShowPrintNotice.checked = false;
    }
    if (dom.modalUuidText) {
      dom.modalUuidText.textContent = state.sessionUuid;
    }
    dom.printNoticeModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  /**
   * 关闭步骤 4 打印须知模态弹窗
   */
  function closePrintNoticeModal() {
    if (!dom.printNoticeModal) return;
    if (dom.dontShowPrintNotice && dom.dontShowPrintNotice.checked) {
      localStorage.setItem('pubg_ruler_hide_print_notice', 'true');
    }
    dom.printNoticeModal.classList.add('hidden');
    document.body.style.overflow = '';
  }

  /**
   * 打开步骤 5 打印校准提示模态弹窗
   */
  function openCalibGuideModal() {
    if (!dom.calibGuideModal) return;
    if (localStorage.getItem('pubg_ruler_hide_calib_guide') === 'true') {
      return;
    }
    if (dom.dontShowCalibGuide) {
      dom.dontShowCalibGuide.checked = false;
    }
    dom.calibGuideModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  /**
   * 关闭步骤 5 打印校准提示模态弹窗
   */
  function closeCalibGuideModal() {
    if (!dom.calibGuideModal) return;
    if (dom.dontShowCalibGuide && dom.dontShowCalibGuide.checked) {
      localStorage.setItem('pubg_ruler_hide_calib_guide', 'true');
    }
    dom.calibGuideModal.classList.add('hidden');
    document.body.style.overflow = '';
  }

  /**
   * 同步旋转按钮文本（默认竖版视角显示“旋转正读”，旋转后显示“恢复默认”）
   */
  function updateRotateButtonLabels() {
    const isDefault = (state.previewOrientation === 'portrait');
    const label = isDefault ? '旋转正读' : '恢复默认';
    if (dom.previewRotateBtn) dom.previewRotateBtn.textContent = label;
    if (dom.zoomRotateBtn) dom.zoomRotateBtn.textContent = label;
  }

  /**
   * 切换全局矢量图纸预览朝向（竖版打印视角 / 横向正向阅读视角）
   */
  function togglePreviewOrientation() {
    state.previewOrientation = (state.previewOrientation === 'portrait' ? 'landscape' : 'portrait');
    updateRotateButtonLabels();
    renderSvgPreview();
    showToast(`已切换至${state.previewOrientation === 'portrait' ? '竖版视角' : '横向正读视角'}`, 'info');
  }

  let zoomScale = 1.0;

  /**
   * 设置全屏高清预览的缩放比例 (支持 0.4x ~ 4.0x)
   */
  function setZoomScale(scale) {
    zoomScale = Math.max(0.4, Math.min(4.0, parseFloat(scale.toFixed(2))));
    if (dom.zoomStage) {
      dom.zoomStage.style.transform = `scale(${zoomScale})`;
    }
    if (dom.zoomPercentBadge) {
      dom.zoomPercentBadge.textContent = `${Math.round(zoomScale * 100)}%`;
    }
  }

  /**
   * 打开预览全屏高清放大查看 Lightbox
   */
  function openZoomModal() {
    if (!dom.previewZoomModal) return;
    dom.previewZoomModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    setZoomScale(1.0);
    updateRotateButtonLabels();
    if (dom.svgZoomPreview) {
      renderSvgContent(dom.svgZoomPreview, state.previewOrientation);
    }
    updatePaperBadges();
  }

  /**
   * 关闭预览全屏高清放大查看 Lightbox
   */
  function closeZoomModal() {
    if (!dom.previewZoomModal) return;
    dom.previewZoomModal.classList.add('hidden');
    document.body.style.overflow = '';
    setZoomScale(1.0);
  }

  /**
   * 初始化步骤 5 的 UUID 核对状态卡片
   */
  function initCalibUuidSection() {
    const shortUuid = state.sessionUuid.substring(0, 8);
    if (dom.calibUuidInput) {
      dom.calibUuidInput.value = shortUuid;
    }
    if (dom.calibActiveUuidText) {
      dom.calibActiveUuidText.textContent = shortUuid;
    }
    if (dom.calibActiveSummaryText) {
      const model = state.screen.mode === 'db' ? state.screen.selectedModel : `${state.screen.customSize}"`;
      dom.calibActiveSummaryText.textContent = `当前活跃：${model} | ${state.resolution.width}×${state.resolution.height}`;
    }
    if (dom.calibUuidStatus) {
      dom.calibUuidStatus.className = 'status-box status-info';
    }
  }

  /**
   * 核对纸张上的 UUID，支持多人顾客历史方案调出
   */
  function handleCheckUuid() {
    const q = (dom.calibUuidInput ? dom.calibUuidInput.value : '').trim().toLowerCase();
    if (!q) {
      showToast('请输入纸张上的 8 位或完整 UUID', 'warning');
      return;
    }

    const currentShort = state.sessionUuid.substring(0, 8).toLowerCase();
    const currentFull = state.sessionUuid.toLowerCase();

    // 1. 匹配当前活跃配置
    if (q === currentShort || q === currentFull) {
      if (dom.calibUuidStatus) {
        dom.calibUuidStatus.className = 'status-box status-success';
        dom.calibUuidStatus.innerHTML = `<strong>UUID 核对一致</strong>：当前正为此方案 (${currentShort}) 执行校准，数据匹配完毕。`;
      }
      showToast('UUID 核对匹配：当前方案已锁定', 'success');
      return;
    }

    // 2. 从本地历史库检索顾客历史配置
    let historyList = [];
    try {
      historyList = JSON.parse(localStorage.getItem('pubg_ruler_history') || '[]');
    } catch(e) {
      historyList = [];
    }

    const matched = historyList.find(item => 
      (item.shortUuid && item.shortUuid.toLowerCase() === q) || 
      (item.uuid && item.uuid.toLowerCase() === q)
    );

    if (matched) {
      // 载入历史配置数据
      if (matched.screen) state.screen = matched.screen;
      if (matched.resolutionObj) state.resolution = matched.resolutionObj;
      if (matched.measurement) state.measurement = matched.measurement;
      if (matched.calibration) state.calibration = matched.calibration;
      if (matched.map) {
        state.map = matched.map;
        if (dom.mapSizeTabs) {
          dom.mapSizeTabs.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mapSize === state.map.size);
          });
        }
        if (dom.mapZoomStatusTag) {
          const spec = PUBG_MAP_SPECS[state.map.size] || PUBG_MAP_SPECS['8x8'];
          dom.mapZoomStatusTag.textContent = `${spec.shortLabel} ${spec.zoomShort}`;
        }
        if (dom.mapSubtextHint) {
          const spec = PUBG_MAP_SPECS[state.map.size] || PUBG_MAP_SPECS['8x8'];
          dom.mapSubtextHint.textContent = `${spec.hint}（包含：${spec.examples}）`;
        }
      }
      if (matched.paper) state.paper = matched.paper;
      if (typeof matched.printUuid !== 'undefined') {
        state.printUuid = !!matched.printUuid;
        if (dom.printUuidCheckbox) dom.printUuidCheckbox.checked = state.printUuid;
      }
      state.sessionUuid = matched.uuid;

      if (dom.sessionUuidDisplay) dom.sessionUuidDisplay.textContent = matched.shortUuid;
      if (dom.calibActiveUuidText) dom.calibActiveUuidText.textContent = matched.shortUuid;
      if (dom.calibActiveSummaryText) {
        dom.calibActiveSummaryText.textContent = `已载入历史顾客方案：${matched.screenModel} | ${matched.resolution}`;
      }
      if (dom.calibUuidStatus) {
        dom.calibUuidStatus.className = 'status-box status-success';
        dom.calibUuidStatus.innerHTML = `<strong>已调取历史方案</strong>：已自动同步 ${matched.screenModel} (${matched.resolution}) 的测距物理参数！`;
      }

      if (dom.yMeasureModeSelect) dom.yMeasureModeSelect.value = '100m';
      if (dom.yMeasureInput && matched.measurement) {
        dom.yMeasureInput.value = matched.measurement.yFinal100 ? matched.measurement.yFinal100.toFixed(2) : (matched.measurement.y100 || '');
        dom.yMeasureInput.placeholder = '输入 100m 屏幕实测高度';
      }
      if (dom.xMeasureModeSelect) dom.xMeasureModeSelect.value = '100m';
      if (dom.xMeasureInput && matched.measurement) {
        dom.xMeasureInput.value = matched.measurement.xFinal100 ? matched.measurement.xFinal100.toFixed(2) : (matched.measurement.x100 || '');
        dom.xMeasureInput.placeholder = '输入 100m 屏幕实测宽度';
      }

      updateMeasurementCalculation();
      renderSvgPreview();
      showToast(`已成功载入顾客方案 [${matched.shortUuid}]`, 'success');
    } else {
      if (dom.calibUuidStatus) {
        dom.calibUuidStatus.className = 'status-box status-warning';
        dom.calibUuidStatus.innerHTML = `未在本地历史库中检索到 UUID <code>${q}</code>。将保持当前屏幕测距基准继续校准。`;
      }
      showToast('未在本地找到该 UUID 对应的历史配置', 'warning');
    }
  }

  /**
   * 重置 UUID 核对为当前活跃方案
   */
  function handleResetUuid() {
    initSessionUuid();
    initCalibUuidSection();
    showToast('已重置为当前活跃配置 UUID', 'info');
  }

  /**
   * 切换步骤引导 (Apple 风格平滑步进)
   */
  function renderStep(step) {
    state.currentStep = step;
    dom.steps.forEach(sec => {
      const s = parseInt(sec.dataset.step, 10);
      sec.classList.toggle('active', s === step);
    });

    dom.stepIndicators.forEach(ind => {
      const s = parseInt(ind.dataset.step, 10);
      ind.classList.toggle('active', s === step);
      ind.classList.toggle('completed', s < step);
    });

    dom.prevBtn.disabled = (step === 1);
    dom.prevBtn.textContent = '上一步';
    if (step === 4) {
      dom.nextBtn.textContent = '校准微调';
    } else if (step === 5) {
      dom.nextBtn.textContent = '完成';
    } else {
      dom.nextBtn.textContent = '下一步';
    }

    // 步骤 3 弹出地图设置弹窗
    if (step === 3) {
      openMapGuideModal();
    }
    // 步骤 4 弹出打印确认弹窗
    else if (step === 4) {
      openPrintNoticeModal();
      saveCurrentConfigToHistory();
    }
    // 步骤 5 初始化 UUID 核对信息并弹出校准提示
    else if (step === 5) {
      initCalibUuidSection();
      saveCurrentConfigToHistory();
      updateCalibLabels();
      openCalibGuideModal();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
    renderSvgPreview();
  }

  /**
   * 下载由矢量引擎生成的 PDF 文件
   */
  function downloadGeneratedPDF() {
    if (!hasValidMeasurementInput()) {
      showToast('未检测到有效实测数据，请先在步骤 3 输入实测数据或点击理论参考填入', 'warning');
      renderStep(3);
      focusFirstMissingMeasurementInput();
      return;
    }
    updateMeasurementCalculation();
    const config = {
      paperSize: state.paper.size,
      pageWidthMm: state.paper.widthMm,
      pageHeightMm: state.paper.heightMm,
      sessionUuid: state.sessionUuid.substring(0, 8),
      printUuid: state.printUuid,
      stepLong: state.measurement.xStep,
      stepShort: state.measurement.yStep,
      screen100mMm: state.measurement.yFinal100,
      screen100mMmX: state.measurement.xFinal100,
      isStretched: state.resolution.isStretched,
      scaleCorrectionX: state.calibration.correctionFactorX || 1.0,
      scaleCorrectionY: state.calibration.correctionFactorY || 1.0,
      scaleCorrection: state.calibration.correctionFactorX || 1.0,
      lineInterval: state.measurement.densityMode
    };

    const pdfBlob = window.PubgRulerPDF.generateRulerPDF(config);
    const fileName = `pubg_ruler_${state.map.size}_${state.resolution.width}x${state.resolution.height}_${state.paper.size}_${state.sessionUuid.substring(0, 8)}.pdf`;

    const downloadLink = document.createElement('a');
    downloadLink.href = URL.createObjectURL(pdfBlob);
    downloadLink.download = fileName;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(downloadLink.href);
  }

  /**
   * 下载当前高精度 SVG 矢量文件
   */
  function downloadCurrentSVG() {
    if (!hasValidMeasurementInput()) {
      showToast('未检测到有效实测数据，请先在步骤 3 输入实测数据或点击理论参考填入', 'warning');
      renderStep(3);
      focusFirstMissingMeasurementInput();
      return;
    }
    renderSvgPreview();
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(dom.svgPreview);
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const fileName = `pubg_ruler_${state.map.size}_${state.resolution.width}x${state.resolution.height}_${state.paper.size}_${state.sessionUuid.substring(0, 8)}.svg`;

    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }

  /**
   * 应用打印后实测校准回推
   */
  function applyCalibration() {
    const targetX100 = state.measurement.xFinal100;
    const targetX300 = targetX100 * 3.0;
    const targetY100 = state.measurement.yFinal100;
    const targetY300 = targetY100 * 3.0;

    const printedX100 = (dom.calibPrinted100 && dom.calibPrinted100.value) ? parseFloat(dom.calibPrinted100.value) : NaN;
    const printedX300 = (dom.calibPrinted300 && dom.calibPrinted300.value) ? parseFloat(dom.calibPrinted300.value) : NaN;
    const printedY100 = (dom.calibPrintedY100 && dom.calibPrintedY100.value) ? parseFloat(dom.calibPrintedY100.value) : NaN;
    const printedY300 = (dom.calibPrintedY300 && dom.calibPrintedY300.value) ? parseFloat(dom.calibPrintedY300.value) : NaN;
    const printedRuler = (dom.calibPrintedRuler && dom.calibPrintedRuler.value) ? parseFloat(dom.calibPrintedRuler.value) : NaN;

    let factorX = state.calibration.correctionFactorX || 1.0;
    let factorY = state.calibration.correctionFactorY || 1.0;
    const messages = [];

    // 1. 横向实测补偿计算 (X轴)
    if (printedX100 && printedX100 > 0) {
      let effX = printedX100;
      if (printedX300 && printedX300 > 0) {
        effX = (printedX100 + 3.0 * printedX300) / 10.0;
      }
      factorX = targetX100 / effX;
      messages.push(`横向测量：理论 ${targetX100.toFixed(2)} mm，纸张实测 ${effX.toFixed(2)} mm → 补偿比率 <strong>${factorX.toFixed(5)}</strong>`);
    } else if (printedX300 && printedX300 > 0) {
      factorX = targetX300 / printedX300;
      messages.push(`横向300m测量：理论 ${targetX300.toFixed(2)} mm，纸张实测 ${printedX300.toFixed(2)} mm → 补偿比率 <strong>${factorX.toFixed(5)}</strong>`);
    }

    // 2. 竖向实测补偿计算 (Y轴)
    let hasExplicitY = false;
    if (printedY100 && printedY100 > 0) {
      let effY = printedY100;
      if (printedY300 && printedY300 > 0) {
        effY = (printedY100 + 3.0 * printedY300) / 10.0;
      }
      factorY = targetY100 / effY;
      hasExplicitY = true;
      messages.push(`竖向测量：理论 ${targetY100.toFixed(2)} mm，纸张实测 ${effY.toFixed(2)} mm → 补偿比率 <strong>${factorY.toFixed(5)}</strong>`);
    } else if (printedY300 && printedY300 > 0) {
      factorY = targetY300 / printedY300;
      hasExplicitY = true;
      messages.push(`竖向300m测量：理论 ${targetY300.toFixed(2)} mm，纸张实测 ${printedY300.toFixed(2)} mm → 补偿比率 <strong>${factorY.toFixed(5)}</strong>`);
    }

    // 3. 比例尺 100mm 实测 (标尺位于纸张左侧纵轴)
    if (printedRuler && printedRuler > 0) {
      const rulerFactor = 100.0 / printedRuler;
      messages.push(`比例尺测量：理论 100.00 mm，纸张实测 ${printedRuler.toFixed(2)} mm → 标尺比率 <strong>${rulerFactor.toFixed(5)}</strong>`);
      if (!hasExplicitY) {
        factorY = rulerFactor;
      }
      if ((!printedX100 || isNaN(printedX100)) && (!printedX300 || isNaN(printedX300))) {
        factorX = rulerFactor;
      }
    }

    if (messages.length === 0) {
      showToast('请输入有效的纸张实测数值 (mm)', 'warning');
      return;
    }

    state.calibration.correctionFactorX = factorX;
    state.calibration.correctionFactorY = factorY;
    state.calibration.applied = true;

    dom.calibResultBox.className = 'status-box status-success';
    dom.calibResultBox.innerHTML = `
      <strong>校对参数计算完成并已生效</strong><br>
      ${messages.join('<br>')}<br>
      补偿比率：横向 <strong>${factorX.toFixed(5)}</strong>，竖向 <strong>${factorY.toFixed(5)}</strong><br>
      修正后每100米尺寸：横向 <strong>${(targetX100 * factorX).toFixed(2)} mm</strong>，竖向 <strong>${(targetY100 * factorY).toFixed(2)} mm</strong>
    `;

    renderSvgPreview();
    showToast('校准补偿已生效', 'success');
  }

  /**
   * 重置校准
   */
  function resetCalibration() {
    state.calibration.correctionFactorX = 1.0;
    state.calibration.correctionFactorY = 1.0;
    state.calibration.applied = false;
    dom.calibPrinted100.value = '';
    dom.calibPrinted300.value = '';
    if (dom.calibPrintedY100) dom.calibPrintedY100.value = '';
    if (dom.calibPrintedY300) dom.calibPrintedY300.value = '';
    dom.calibPrintedRuler.value = '';
    dom.calibResultBox.className = 'status-box status-info';
    dom.calibResultBox.innerHTML = '未应用打印误差补偿，当前修正比率为 1.00000。';
    renderSvgPreview();
    showToast('校准已重置为默认比率 1.0', 'info');
  }

  /**
   * 绑定事件监听器
   */
  function bindEvents() {
    // 步骤导航点击
    if (dom.stepIndicators) {
      dom.stepIndicators.forEach(ind => {
        ind.addEventListener('click', () => {
          const targetStep = parseInt(ind.dataset.step, 10);
          if (targetStep > 3 && !hasValidMeasurementInput()) {
            showToast('请先完成步骤 3 的地图实测尺寸填写，或点击【理论推导参考】一键填入', 'warning');
            renderStep(3);
            focusFirstMissingMeasurementInput();
            return;
          }
          renderStep(targetStep);
        });
      });
    }

    if (dom.prevBtn) {
      dom.prevBtn.addEventListener('click', () => {
        if (state.currentStep > 1) renderStep(state.currentStep - 1);
      });
    }

    if (dom.nextBtn) {
      dom.nextBtn.addEventListener('click', () => {
        if (state.currentStep === 3) {
          if (!hasValidMeasurementInput()) {
            showToast('请测量并输入地图实测尺寸，或点击上方【理论推导参考】一键填入', 'warning');
            focusFirstMissingMeasurementInput();
            return;
          }
        }
        if (state.currentStep < 5) {
          renderStep(state.currentStep + 1);
        } else {
          downloadGeneratedPDF();
        }
      });
    }

    // 步骤 1: Tab 模式切换 (显示器型号库 vs 笔记本 vs 通用规格)
    if (dom.tabModeDb && dom.tabModeLaptop && dom.tabModeGeneric) {
      dom.tabModeDb.addEventListener('click', () => {
        currentDbCategory = 'monitor';
        dom.tabModeDb.classList.add('active');
        dom.tabModeLaptop.classList.remove('active');
        dom.tabModeGeneric.classList.remove('active');
        dom.screenDbView.classList.remove('hidden');
        dom.screenGenericView.classList.add('hidden');
        if (dom.monitorSearchInput) {
          dom.monitorSearchInput.value = '';
          dom.monitorSearchInput.placeholder = '输入型号搜索，如：XL2546K, 27GP850, 24G2...';
        }
        initMonitorDb('monitor');
      });

      dom.tabModeLaptop.addEventListener('click', () => {
        currentDbCategory = 'laptop';
        dom.tabModeLaptop.classList.add('active');
        dom.tabModeDb.classList.remove('active');
        dom.tabModeGeneric.classList.remove('active');
        dom.screenDbView.classList.remove('hidden');
        dom.screenGenericView.classList.add('hidden');
        if (dom.monitorSearchInput) {
          dom.monitorSearchInput.value = '';
          dom.monitorSearchInput.placeholder = '输入笔记本型号搜索，如：拯救者 Y9000P, 枪神 8, 暗影精灵 9, 天选 5...';
        }
        initMonitorDb('laptop');
      });

      dom.tabModeGeneric.addEventListener('click', () => {
        dom.tabModeGeneric.classList.add('active');
        dom.tabModeDb.classList.remove('active');
        dom.tabModeLaptop.classList.remove('active');
        dom.screenGenericView.classList.remove('hidden');
        dom.screenDbView.classList.add('hidden');
        renderScreenPresets();
      });
    }

    // 步骤 1: 屏幕探测工具栏折叠/展开
    if (dom.detectScreensToggle && dom.detectScreensCollapsible && dom.detectScreensBody) {
      dom.detectScreensToggle.addEventListener('click', () => {
        const isOpen = dom.detectScreensCollapsible.classList.toggle('open');
        dom.detectScreensBody.classList.toggle('hidden', !isOpen);
        if (dom.detectScreensToggleText) {
          dom.detectScreensToggleText.textContent = isOpen ? '收起' : '展开';
        }
      });
    }

    // 步骤 1: 系统多显示设备探测
    if (dom.detectScreensBtn) {
      dom.detectScreensBtn.addEventListener('click', detectSystemScreens);
    }

    // 步骤 1: 品牌自定义下拉菜单交互 (防止原生 popup 闪退)
    if (dom.brandDropdownBtn && dom.brandDropdownMenu) {
      dom.brandDropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = dom.brandDropdownMenu.classList.toggle('hidden');
        dom.brandDropdownBtn.classList.toggle('open', !isOpen);
        if (dom.scaleDropdownMenu) {
          dom.scaleDropdownMenu.classList.add('hidden');
          if (dom.scaleDropdownBtn) dom.scaleDropdownBtn.classList.remove('open');
        }
      });
    }

    // 步骤 1: 品牌筛选与型号即时搜索（含联动清空）
    if (dom.brandFilterSelect) {
      dom.brandFilterSelect.addEventListener('change', () => {
        if (dom.monitorSearchInput) dom.monitorSearchInput.value = '';
        if (dom.clearSearchBtn) dom.clearSearchBtn.style.display = 'none';
        renderMonitorDbList();
      });
    }

    if (dom.monitorSearchInput) {
      dom.monitorSearchInput.addEventListener('input', () => {
        renderMonitorDbList();
      });
    }

    if (dom.clearSearchBtn) {
      dom.clearSearchBtn.addEventListener('click', () => {
        if (dom.monitorSearchInput) dom.monitorSearchInput.value = '';
        dom.clearSearchBtn.style.display = 'none';
        renderMonitorDbList();
        if (dom.monitorSearchInput) dom.monitorSearchInput.focus();
      });
    }

    // 显示器自定义输入
    if (dom.customDiagInput) {
      dom.customDiagInput.addEventListener('input', () => {
        clearMeasurementInputs();
        updateScreenPhysics();
        estimateMapSizeFromScreen();
        renderSvgPreview();
      });
    }

    if (dom.customRatioSelect) {
      dom.customRatioSelect.addEventListener('change', () => {
        clearMeasurementInputs();
        updateScreenPhysics();
        updateResolutionAnalysis();
        estimateMapSizeFromScreen();
        renderSvgPreview();
      });
    }

    // 步骤 2: 自定义分辨率输入
    if (dom.customResW) {
      dom.customResW.addEventListener('input', () => {
        clearMeasurementInputs();
        updateResolutionAnalysis();
        estimateMapSizeFromScreen();
        renderSvgPreview();
      });
    }

    if (dom.customResH) {
      dom.customResH.addEventListener('input', () => {
        clearMeasurementInputs();
        updateResolutionAnalysis();
        estimateMapSizeFromScreen();
        renderSvgPreview();
      });
    }

    // 步骤 2: 自定义缩放勾选框切换
    if (dom.customScaleCheckbox && dom.customScaleContainer) {
      dom.customScaleCheckbox.addEventListener('change', () => {
        clearMeasurementInputs();
        state.resolution.scaleEnabled = dom.customScaleCheckbox.checked;
        dom.customScaleContainer.style.display = state.resolution.scaleEnabled ? 'inline-flex' : 'none';
        dom.customScaleContainer.classList.toggle('hidden', !state.resolution.scaleEnabled);
        updateResolutionAnalysis();
        estimateMapSizeFromScreen();
        renderSvgPreview();
      });
    }

    // 步骤 2: 缩放自定义下拉菜单展开/收起
    if (dom.scaleDropdownBtn && dom.scaleDropdownMenu) {
      dom.scaleDropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = dom.scaleDropdownMenu.classList.toggle('hidden');
        dom.scaleDropdownBtn.classList.toggle('open', !isOpen);
        if (dom.brandDropdownMenu) {
          dom.brandDropdownMenu.classList.add('hidden');
          if (dom.brandDropdownBtn) dom.brandDropdownBtn.classList.remove('open');
        }
      });
    }

    // 全局点击外部区域收起所有打开的自定义下拉菜单
    document.addEventListener('click', (e) => {
      if (dom.brandCustomDropdown && !dom.brandCustomDropdown.contains(e.target)) {
        if (dom.brandDropdownMenu) dom.brandDropdownMenu.classList.add('hidden');
        if (dom.brandDropdownBtn) dom.brandDropdownBtn.classList.remove('open');
      }
      if (dom.scaleCustomDropdown && !dom.scaleCustomDropdown.contains(e.target)) {
        if (dom.scaleDropdownMenu) dom.scaleDropdownMenu.classList.add('hidden');
        if (dom.scaleDropdownBtn) dom.scaleDropdownBtn.classList.remove('open');
      }
    });

    // ESC 键收起所有打开的弹窗与自定义下拉菜单
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (dom.welcomeGuideModal && !dom.welcomeGuideModal.classList.contains('hidden')) {
          closeWelcomeModal();
          return;
        }
        if (dom.previewZoomModal && !dom.previewZoomModal.classList.contains('hidden')) {
          closeZoomModal();
          return;
        }
        if (dom.mapGuideModal && !dom.mapGuideModal.classList.contains('hidden')) {
          closeMapGuideModal();
          return;
        }
        if (dom.printNoticeModal && !dom.printNoticeModal.classList.contains('hidden')) {
          closePrintNoticeModal();
          return;
        }
        if (dom.calibGuideModal && !dom.calibGuideModal.classList.contains('hidden')) {
          closeCalibGuideModal();
          return;
        }
        if (dom.brandDropdownMenu) dom.brandDropdownMenu.classList.add('hidden');
        if (dom.brandDropdownBtn) dom.brandDropdownBtn.classList.remove('open');
        if (dom.scaleDropdownMenu) dom.scaleDropdownMenu.classList.add('hidden');
        if (dom.scaleDropdownBtn) dom.scaleDropdownBtn.classList.remove('open');
      }
    });

    // 步骤 3: 垂直方向 (Y轴) 下拉模式切换 (100m <-> 300m 自动 3 倍转换)
    if (dom.yMeasureModeSelect) {
      dom.yMeasureModeSelect.addEventListener('change', () => {
        const mode = dom.yMeasureModeSelect.value;
        if (dom.yMeasureInput) {
          dom.yMeasureInput.placeholder = (mode === '300m' ? '输入 300m 屏幕实测高度' : '输入 100m 屏幕实测高度');
          const raw = dom.yMeasureInput.value.trim();
          if (raw) {
            const val = parseFloat(raw);
            if (!isNaN(val) && val > 0) {
              if (mode === '300m') {
                dom.yMeasureInput.value = parseFloat((val * 3.0).toFixed(2));
              } else {
                dom.yMeasureInput.value = parseFloat((val / 3.0).toFixed(2));
              }
            }
          }
        }
        state.measurement.isManualCalculated = true;
        updateMeasurementCalculation();
        renderSvgPreview();
      });
    }

    // 步骤 3: 垂直方向 (Y轴) 实测输入
    if (dom.yMeasureInput) {
      dom.yMeasureInput.addEventListener('input', () => {
        state.measurement.isManualCalculated = true;
        updateMeasurementCalculation();
        renderSvgPreview();
      });
    }

    // 步骤 3: 水平方向 (X轴) 下拉模式切换 (100m <-> 300m 自动 3 倍转换)
    if (dom.xMeasureModeSelect) {
      dom.xMeasureModeSelect.addEventListener('change', () => {
        const mode = dom.xMeasureModeSelect.value;
        if (dom.xMeasureInput) {
          dom.xMeasureInput.placeholder = (mode === '300m' ? '输入 300m 屏幕实测宽度' : '输入 100m 屏幕实测宽度');
          const raw = dom.xMeasureInput.value.trim();
          if (raw) {
            const val = parseFloat(raw);
            if (!isNaN(val) && val > 0) {
              if (mode === '300m') {
                dom.xMeasureInput.value = parseFloat((val * 3.0).toFixed(2));
              } else {
                dom.xMeasureInput.value = parseFloat((val / 3.0).toFixed(2));
              }
            }
          }
        }
        state.measurement.isManualCalculated = true;
        updateMeasurementCalculation();
        renderSvgPreview();
      });
    }

    // 步骤 3: 水平方向 (X轴) 实测输入
    if (dom.xMeasureInput) {
      dom.xMeasureInput.addEventListener('input', () => {
        state.measurement.isManualCalculated = true;
        updateMeasurementCalculation();
        renderSvgPreview();
      });
    }

    // 理论参考双标准应用
    if (dom.applyTheoryStdBtn) {
      dom.applyTheoryStdBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        applyTheoryStandard();
      });
    }
    if (dom.applyTheoryStrBtn) {
      dom.applyTheoryStrBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        applyTheoryStretched();
      });
    }
    if (dom.theoryStandardBox) {
      dom.theoryStandardBox.addEventListener('click', () => applyTheoryStandard());
    }
    if (dom.theoryStretchedBox) {
      dom.theoryStretchedBox.addEventListener('click', () => applyTheoryStretched());
    }
    // 步骤 3: 地图规格切换
    if (dom.mapSizeTabs) {
      dom.mapSizeTabs.forEach(btn => {
        btn.addEventListener('click', () => {
          switchMapSize(btn.dataset.mapSize);
        });
      });
    }

    // 模态弹窗 0: 首次访问引导与使用说明交互
    if (dom.welcomeGuideCloseBtn) {
      dom.welcomeGuideCloseBtn.addEventListener('click', closeWelcomeModal);
    }
    if (dom.welcomeNewConfigBtn) {
      dom.welcomeNewConfigBtn.addEventListener('click', handleStartNewConfig);
    }
    if (dom.welcomeCloseBtn) {
      dom.welcomeCloseBtn.addEventListener('click', closeWelcomeModal);
    }
    const replayBtn = document.getElementById('demoReplayBtn');
    if (replayBtn) {
      replayBtn.addEventListener('click', () => {
        startWelcomeDemo();
      });
    }
    if (dom.welcomeReadGuideBtn) {
      dom.welcomeReadGuideBtn.addEventListener('click', () => {
        if (dom.dontShowWelcomeToday && dom.dontShowWelcomeToday.checked) {
          const todayStr = new Date().toISOString().slice(0, 10);
          localStorage.setItem('pubg_ruler_hide_welcome_date', todayStr);
        }
      });
    }

    // 模态弹窗 1: 地图设置引导交互
    if (dom.mapGuideCloseBtn) {
      dom.mapGuideCloseBtn.addEventListener('click', closeMapGuideModal);
    }
    if (dom.mapGuideNextBtn) {
      dom.mapGuideNextBtn.addEventListener('click', () => {
        if (mapGuideCurrentStep === 1) {
          mapGuideCurrentStep = 2;
          if (dom.mapGuideStep1) {
            dom.mapGuideStep1.classList.add('hidden');
            dom.mapGuideStep1.style.display = 'none';
          }
          if (dom.mapGuideStep2) {
            dom.mapGuideStep2.classList.remove('hidden');
            dom.mapGuideStep2.style.display = 'block';
          }
          dom.mapGuideNextBtn.textContent = '确认已放大';
        } else {
          closeMapGuideModal();
        }
      });
    }

    // 模态弹窗 2: 打印须知确认交互
    if (dom.printNoticeCloseBtn) {
      dom.printNoticeCloseBtn.addEventListener('click', closePrintNoticeModal);
    }
    if (dom.printNoticeConfirmBtn) {
      dom.printNoticeConfirmBtn.addEventListener('click', closePrintNoticeModal);
    }
    if (dom.modalCopyUuidBtn) {
      dom.modalCopyUuidBtn.addEventListener('click', () => {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(state.sessionUuid).then(() => {
            dom.modalCopyUuidBtn.textContent = '已复制';
            showToast('配置 UUID 已复制至剪贴板', 'success');
            setTimeout(() => { dom.modalCopyUuidBtn.textContent = '复制'; }, 1500);
          }).catch(() => {
            showToast(`UUID: ${state.sessionUuid}`, 'info');
          });
        } else {
          showToast(`UUID: ${state.sessionUuid}`, 'info');
        }
      });
    }

    // 模态弹窗 4: 打印校准提示确认交互
    if (dom.calibGuideCloseBtn) {
      dom.calibGuideCloseBtn.addEventListener('click', closeCalibGuideModal);
    }
    if (dom.calibGuideConfirmBtn) {
      dom.calibGuideConfirmBtn.addEventListener('click', closeCalibGuideModal);
    }

    // 步骤 5: 配置 UUID 核对与恢复
    if (dom.calibCheckUuidBtn) {
      dom.calibCheckUuidBtn.addEventListener('click', handleCheckUuid);
    }
    if (dom.calibResetUuidBtn) {
      dom.calibResetUuidBtn.addEventListener('click', handleResetUuid);
    }
    if (dom.calibUuidInput) {
      dom.calibUuidInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleCheckUuid();
      });
    }

    // 实测输入框回车快捷应用补偿
    [dom.calibPrinted100, dom.calibPrinted300, dom.calibPrintedY100, dom.calibPrintedY300, dom.calibPrintedRuler].forEach(inp => {
      if (inp) {
        inp.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') applyCalibration();
        });
      }
    });

    // 步骤 4: 纸张规格切换
    if (dom.paperSizeSelect) {
      dom.paperSizeSelect.addEventListener('change', () => {
        const selected = dom.paperSizeSelect.value;
        const paperInfo = (window.PubgRulerPDF && window.PubgRulerPDF.PAPER_SIZES && window.PubgRulerPDF.PAPER_SIZES[selected])
          ? window.PubgRulerPDF.PAPER_SIZES[selected]
          : { widthMm: 297.0, heightMm: 210.0, name: selected };
        state.paper.size = selected;
        state.paper.widthMm = paperInfo.widthMm;
        state.paper.heightMm = paperInfo.heightMm;
        updatePrintPaperStyle();
        renderSvgPreview();
      });
    }

    // 打印 UUID 勾选切换
    if (dom.printUuidCheckbox) {
      dom.printUuidCheckbox.checked = !!state.printUuid;
      dom.printUuidCheckbox.addEventListener('change', () => {
        state.printUuid = dom.printUuidCheckbox.checked;
        renderSvgPreview();
        showToast(state.printUuid ? '已开启：图纸将打印配置 ID' : '已关闭：图纸不打印配置 ID', 'info');
      });
    }

    // 复制 ID 按钮
    if (dom.copyUuidBtn) {
      dom.copyUuidBtn.addEventListener('click', () => {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(state.sessionUuid).then(() => {
            dom.copyUuidBtn.textContent = '已复制';
            showToast('UUID 已复制至剪贴板', 'success');
            setTimeout(() => { dom.copyUuidBtn.textContent = '复制 ID'; }, 1500);
          }).catch(() => {
            showToast(`UUID: ${state.sessionUuid}`, 'info');
          });
        } else {
          showToast(`UUID: ${state.sessionUuid}`, 'info');
        }
      });
    }

    // 导出与导入配置
    if (dom.exportConfigBtn) {
      dom.exportConfigBtn.addEventListener('click', exportConfiguration);
    }
    if (dom.importConfigTrigger && dom.importConfigFile) {
      dom.importConfigTrigger.addEventListener('click', () => {
        dom.importConfigFile.click();
      });
      dom.importConfigFile.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          importConfiguration(e.target.files[0]);
          e.target.value = '';
        }
      });
    }

    // 刻度密度单选
    if (dom.densityRadio10m) {
      dom.densityRadio10m.addEventListener('change', () => {
        if (dom.densityRadio10m.checked) {
          state.measurement.densityMode = '10m';
          renderSvgPreview();
        }
      });
    }

    if (dom.densityRadio20m) {
      dom.densityRadio20m.addEventListener('change', () => {
        if (dom.densityRadio20m.checked) {
          state.measurement.densityMode = '20m';
          renderSvgPreview();
        }
      });
    }

    // 下载与打印按钮
    if (dom.downloadPdfBtn) {
      dom.downloadPdfBtn.addEventListener('click', downloadGeneratedPDF);
    }
    if (dom.downloadSvgBtn) {
      dom.downloadSvgBtn.addEventListener('click', downloadCurrentSVG);
    }
    if (dom.printPageBtn) {
      dom.printPageBtn.addEventListener('click', () => {
        window.print();
      });
    }

    // 步骤 5 中的下载与打印快捷按钮
    if (dom.downloadCalibPdfBtn) {
      dom.downloadCalibPdfBtn.addEventListener('click', downloadGeneratedPDF);
    }
    if (dom.printCalibBtn) {
      dom.printCalibBtn.addEventListener('click', () => {
        window.print();
      });
    }

    // 校对按钮
    if (dom.applyCalibBtn) {
      dom.applyCalibBtn.addEventListener('click', applyCalibration);
    }
    if (dom.resetCalibBtn) {
      dom.resetCalibBtn.addEventListener('click', resetCalibration);
    }

    // 预览旋转与全屏放大控制
    if (dom.previewRotateBtn) {
      dom.previewRotateBtn.addEventListener('click', togglePreviewOrientation);
    }
    if (dom.zoomRotateBtn) {
      dom.zoomRotateBtn.addEventListener('click', togglePreviewOrientation);
    }
    if (dom.previewZoomBtn) {
      dom.previewZoomBtn.addEventListener('click', openZoomModal);
    }
    if (dom.previewZoomCloseBtn) {
      dom.previewZoomCloseBtn.addEventListener('click', closeZoomModal);
    }
    if (dom.previewZoomModal) {
      dom.previewZoomModal.addEventListener('click', (e) => {
        if (e.target === dom.previewZoomModal) {
          closeZoomModal();
        }
      });
    }

    // 全屏放大持续缩放与滚轮交互
    if (dom.zoomInBtn) {
      dom.zoomInBtn.addEventListener('click', () => setZoomScale(zoomScale + 0.25));
    }
    if (dom.zoomOutBtn) {
      dom.zoomOutBtn.addEventListener('click', () => setZoomScale(zoomScale - 0.25));
    }
    if (dom.zoomResetBtn) {
      dom.zoomResetBtn.addEventListener('click', () => setZoomScale(1.0));
    }
    if (dom.previewZoomBody) {
      dom.previewZoomBody.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.15 : -0.15;
        setZoomScale(zoomScale + delta);
      }, { passive: false });
    }

    // 弹窗“不再显示”复选框联动初始化与监听
    if (dom.dontShowWelcomeToday) {
      const todayStr = new Date().toISOString().slice(0, 10);
      dom.dontShowWelcomeToday.checked = (localStorage.getItem('pubg_ruler_hide_welcome_date') === todayStr);
      dom.dontShowWelcomeToday.addEventListener('change', () => {
        if (dom.dontShowWelcomeToday.checked) {
          localStorage.setItem('pubg_ruler_hide_welcome_date', todayStr);
        } else {
          localStorage.removeItem('pubg_ruler_hide_welcome_date');
        }
      });
    }
    if (dom.dontShowMapGuide) {
      dom.dontShowMapGuide.checked = (localStorage.getItem('pubg_ruler_hide_map_guide') === 'true');
      dom.dontShowMapGuide.addEventListener('change', () => {
        if (dom.dontShowMapGuide.checked) {
          localStorage.setItem('pubg_ruler_hide_map_guide', 'true');
        } else {
          localStorage.removeItem('pubg_ruler_hide_map_guide');
        }
      });
    }
    if (dom.dontShowPrintNotice) {
      dom.dontShowPrintNotice.checked = (localStorage.getItem('pubg_ruler_hide_print_notice') === 'true');
      dom.dontShowPrintNotice.addEventListener('change', () => {
        if (dom.dontShowPrintNotice.checked) {
          localStorage.setItem('pubg_ruler_hide_print_notice', 'true');
        } else {
          localStorage.removeItem('pubg_ruler_hide_print_notice');
        }
      });
    }
    if (dom.dontShowCalibGuide) {
      dom.dontShowCalibGuide.checked = (localStorage.getItem('pubg_ruler_hide_calib_guide') === 'true');
      dom.dontShowCalibGuide.addEventListener('change', () => {
        if (dom.dontShowCalibGuide.checked) {
          localStorage.setItem('pubg_ruler_hide_calib_guide', 'true');
        } else {
          localStorage.removeItem('pubg_ruler_hide_calib_guide');
        }
      });
    }
  }

  // 挂载启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
