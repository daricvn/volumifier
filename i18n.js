// Localization for Volumifier.
// Plain (non-module) script: exposes a global `I18N` consumed by popup.js,
// which is loaded right after this file. Keep it framework-free so the build
// can minify it in place alongside the other popup scripts.
//
//   I18N.t(key, params)  -> translated string ({name} placeholders filled)
//   I18N.setLang(code)   -> switch active language
//   I18N.getLang()       -> active language code
//   I18N.detect()        -> best language for the browser UI, falls back to "en"
//   I18N.order           -> language codes in menu order
//   I18N.names           -> native language names
//   I18N.flags           -> inline SVG flag markup per language

(function () {
  // Languages in the order they appear in the picker.
  const ORDER = ["en", "zh", "ja", "vi", "es", "fr", "de"];

  // Native names shown beside each flag.
  const NAMES = {
    en: "English",
    zh: "中文",
    ja: "日本語",
    vi: "Tiếng Việt",
    es: "Español",
    fr: "Français",
    de: "Deutsch",
  };

  const STRINGS = {
    en: {
      reading: "Reading active tab…",
      reset: "Reset to 100%",
      modeGeneric: "Generic",
      modeGenericTitle: "Boost everything",
      modeVoice: "Voice",
      modeVoiceTitle: "Boost voice only",
      modeBass: "Bass",
      modeBassTitle: "Boost bass only",
      mute: "Mute (0%)",
      max: "Max (600%)",
      playingAudio: "Playing audio",
      boosted: "BOOSTED",
      switchTo: "Switch to",
      cannotBoost: "Could not boost this tab.",
      boostingTo: "Boosting to {v}%",
      volume: "Volume {v}%",
      noActiveTab: "No active tab.",
      cantBoostBrowser: "Can't boost browser pages",
      activeTab: "Active tab",
      openNormalPage: "Open a normal web page to boost audio.",
      resetDone: "Reset to 100%.",
      dragToBoost: "Extension by Takayoshi Code",
      tab: "Tab",
      language: "Language",
      autoLevel: "Auto-level",
      autoLevelHint: "Tame loud ads, lift quiet videos",
      autoLevelTitle: "Even out loud and quiet audio",
      autoOn: "Auto-level on — evening out loudness.",
      autoOff: "Auto-level off.",
      fsMode: "Fullscreen mode",
      fsModeTitle: "Keep video fullscreen working while boosting",
      fsOn: "Fullscreen mode on — boosting in-page.",
      fsOff: "Fullscreen mode off — using tab capture.",
      fsNoMedia: "No boostable media found on this page.",
      reloadNeeded: "Reload to boost this page",
      reloadHint: "This tab's audio can't be captured until the page reloads.",
      reloadBtn: "Reload",
      reloadingPage: "Reloading page…",
    },
    zh: {
      reading: "正在读取当前标签页…",
      reset: "重置为 100%",
      modeGeneric: "通用",
      modeGenericTitle: "增强所有声音",
      modeVoice: "人声",
      modeVoiceTitle: "仅增强人声",
      modeBass: "低音",
      modeBassTitle: "仅增强低音",
      mute: "静音 (0%)",
      max: "最大 (600%)",
      playingAudio: "正在播放",
      boosted: "已增强",
      switchTo: "切换",
      cannotBoost: "无法增强此标签页。",
      boostingTo: "增强至 {v}%",
      volume: "音量 {v}%",
      noActiveTab: "没有活动标签页。",
      cantBoostBrowser: "无法增强浏览器页面",
      activeTab: "当前标签页",
      openNormalPage: "请打开普通网页以增强音频。",
      resetDone: "已重置为 100%。",
      dragToBoost: "Extension by Takayoshi Code",
      tab: "标签页",
      language: "语言",
      autoLevel: "自动平衡",
      autoLevelHint: "压制响亮广告，提升安静视频",
      autoLevelTitle: "平衡响亮与安静的音频",
      autoOn: "自动平衡已开启 — 正在均衡响度。",
      autoOff: "自动平衡已关闭。",
      fsMode: "全屏模式",
      fsModeTitle: "增强时保持视频全屏可用",
      fsOn: "全屏模式已开启 — 在页面内增强。",
      fsOff: "全屏模式已关闭 — 使用标签页捕获。",
      fsNoMedia: "此页面未找到可增强的媒体。",
      reloadNeeded: "重新加载以增强此页面",
      reloadHint: "在页面重新加载前，无法捕获此标签页的音频。",
      reloadBtn: "重新加载",
      reloadingPage: "正在重新加载…",
    },
    ja: {
      reading: "アクティブなタブを読み込み中…",
      reset: "100% にリセット",
      modeGeneric: "標準",
      modeGenericTitle: "すべてを増幅",
      modeVoice: "音声",
      modeVoiceTitle: "音声のみ増幅",
      modeBass: "低音",
      modeBassTitle: "低音のみ増幅",
      mute: "ミュート (0%)",
      max: "最大 (600%)",
      playingAudio: "再生中",
      boosted: "増幅中",
      switchTo: "切り替え",
      cannotBoost: "このタブを増幅できませんでした。",
      boostingTo: "{v}% に増幅中",
      volume: "音量 {v}%",
      noActiveTab: "アクティブなタブがありません。",
      cantBoostBrowser: "ブラウザのページは増幅できません",
      activeTab: "アクティブなタブ",
      openNormalPage: "通常のウェブページを開いて音声を増幅してください。",
      resetDone: "100% にリセットしました。",
      dragToBoost: "Extension by Takayoshi Code",
      tab: "タブ",
      language: "言語",
      autoLevel: "自動レベル調整",
      autoLevelHint: "大きい広告を抑え、静かな動画を持ち上げる",
      autoLevelTitle: "大小の音量を均一にする",
      autoOn: "自動レベル調整オン — 音量を均一化中。",
      autoOff: "自動レベル調整オフ。",
      fsMode: "全画面モード",
      fsModeTitle: "増幅中も動画の全画面表示を維持",
      fsOn: "全画面モードオン — ページ内で増幅中。",
      fsOff: "全画面モードオフ — タブキャプチャを使用。",
      fsNoMedia: "このページに増幅可能なメディアがありません。",
      reloadNeeded: "このページを増幅するには再読み込み",
      reloadHint: "ページを再読み込みするまで、このタブの音声を取得できません。",
      reloadBtn: "再読み込み",
      reloadingPage: "再読み込み中…",
    },
    vi: {
      reading: "Đang đọc thẻ đang mở…",
      reset: "Đặt lại về 100%",
      modeGeneric: "Chung",
      modeGenericTitle: "Tăng tất cả âm thanh",
      modeVoice: "Giọng nói",
      modeVoiceTitle: "Chỉ tăng giọng nói",
      modeBass: "Âm trầm",
      modeBassTitle: "Chỉ tăng âm trầm",
      mute: "Tắt tiếng (0%)",
      max: "Tối đa (600%)",
      playingAudio: "Đang phát âm thanh",
      boosted: "ĐÃ TĂNG",
      switchTo: "Chuyển tới",
      cannotBoost: "Không thể tăng âm thẻ này.",
      boostingTo: "Đang tăng lên {v}%",
      volume: "Âm lượng {v}%",
      noActiveTab: "Không có thẻ đang mở.",
      cantBoostBrowser: "Không thể tăng âm trang trình duyệt",
      activeTab: "Thẻ đang mở",
      openNormalPage: "Mở một trang web thường để tăng âm thanh.",
      resetDone: "Đã đặt lại về 100%.",
      dragToBoost: "Extension by Takayoshi Code",
      tab: "Thẻ",
      language: "Ngôn ngữ",
      autoLevel: "Tự cân bằng",
      autoLevelHint: "Giảm quảng cáo to, nâng video nhỏ",
      autoLevelTitle: "Cân bằng âm to và nhỏ",
      autoOn: "Tự cân bằng bật — đang cân bằng độ to.",
      autoOff: "Tự cân bằng tắt.",
      fsMode: "Chế độ toàn màn hình",
      fsModeTitle: "Giữ video toàn màn hình khi tăng âm",
      fsOn: "Chế độ toàn màn hình bật — tăng âm trong trang.",
      fsOff: "Chế độ toàn màn hình tắt — dùng thu âm thẻ.",
      fsNoMedia: "Không tìm thấy phương tiện để tăng âm trên trang này.",
      reloadNeeded: "Tải lại để tăng âm trang này",
      reloadHint: "Không thể thu âm thanh của thẻ này cho đến khi tải lại trang.",
      reloadBtn: "Tải lại",
      reloadingPage: "Đang tải lại trang…",
    },
    es: {
      reading: "Leyendo la pestaña activa…",
      reset: "Restablecer al 100%",
      modeGeneric: "General",
      modeGenericTitle: "Amplificar todo",
      modeVoice: "Voz",
      modeVoiceTitle: "Amplificar solo la voz",
      modeBass: "Graves",
      modeBassTitle: "Amplificar solo los graves",
      mute: "Silenciar (0%)",
      max: "Máx (600%)",
      playingAudio: "Reproduciendo audio",
      boosted: "AMPLIFICADO",
      switchTo: "Cambiar a",
      cannotBoost: "No se pudo amplificar esta pestaña.",
      boostingTo: "Amplificando al {v}%",
      volume: "Volumen {v}%",
      noActiveTab: "No hay pestaña activa.",
      cantBoostBrowser: "No se pueden amplificar las páginas del navegador",
      activeTab: "Pestaña activa",
      openNormalPage: "Abre una página web normal para amplificar el audio.",
      resetDone: "Restablecido al 100%.",
      dragToBoost: "Extension by Takayoshi Code",
      tab: "Pestaña",
      language: "Idioma",
      autoLevel: "Autonivel",
      autoLevelHint: "Calma anuncios fuertes, sube vídeos bajos",
      autoLevelTitle: "Equilibra el audio fuerte y bajo",
      autoOn: "Autonivel activado — igualando el volumen.",
      autoOff: "Autonivel desactivado.",
      fsMode: "Modo pantalla completa",
      fsModeTitle: "Mantén la pantalla completa del vídeo al amplificar",
      fsOn: "Modo pantalla completa activado — amplificando en la página.",
      fsOff: "Modo pantalla completa desactivado — usando captura de pestaña.",
      fsNoMedia: "No se encontró contenido amplificable en esta página.",
      reloadNeeded: "Recarga para amplificar esta página",
      reloadHint: "No se puede capturar el audio de esta pestaña hasta recargar la página.",
      reloadBtn: "Recargar",
      reloadingPage: "Recargando página…",
    },
    fr: {
      reading: "Lecture de l'onglet actif…",
      reset: "Réinitialiser à 100%",
      modeGeneric: "Général",
      modeGenericTitle: "Tout amplifier",
      modeVoice: "Voix",
      modeVoiceTitle: "Amplifier uniquement la voix",
      modeBass: "Basses",
      modeBassTitle: "Amplifier uniquement les basses",
      mute: "Couper le son (0%)",
      max: "Max (600%)",
      playingAudio: "Audio en cours",
      boosted: "AMPLIFIÉ",
      switchTo: "Basculer vers",
      cannotBoost: "Impossible d'amplifier cet onglet.",
      boostingTo: "Amplification à {v}%",
      volume: "Volume {v}%",
      noActiveTab: "Aucun onglet actif.",
      cantBoostBrowser: "Impossible d'amplifier les pages du navigateur",
      activeTab: "Onglet actif",
      openNormalPage: "Ouvrez une page web normale pour amplifier le son.",
      resetDone: "Réinitialisé à 100%.",
      dragToBoost: "Extension by Takayoshi Code",
      tab: "Onglet",
      language: "Langue",
      autoLevel: "Auto-niveau",
      autoLevelHint: "Atténue les pubs fortes, relève les vidéos faibles",
      autoLevelTitle: "Égalise l'audio fort et faible",
      autoOn: "Auto-niveau activé — égalisation du volume.",
      autoOff: "Auto-niveau désactivé.",
      fsMode: "Mode plein écran",
      fsModeTitle: "Garde le plein écran vidéo pendant l'amplification",
      fsOn: "Mode plein écran activé — amplification dans la page.",
      fsOff: "Mode plein écran désactivé — capture d'onglet.",
      fsNoMedia: "Aucun média amplifiable trouvé sur cette page.",
      reloadNeeded: "Recharger pour amplifier cette page",
      reloadHint: "L'audio de cet onglet ne peut pas être capturé avant le rechargement.",
      reloadBtn: "Recharger",
      reloadingPage: "Rechargement…",
    },
    de: {
      reading: "Aktiver Tab wird gelesen…",
      reset: "Auf 100% zurücksetzen",
      modeGeneric: "Allgemein",
      modeGenericTitle: "Alles verstärken",
      modeVoice: "Stimme",
      modeVoiceTitle: "Nur Stimme verstärken",
      modeBass: "Bass",
      modeBassTitle: "Nur Bass verstärken",
      mute: "Stumm (0%)",
      max: "Max (600%)",
      playingAudio: "Audio wird abgespielt",
      boosted: "VERSTÄRKT",
      switchTo: "Wechseln zu",
      cannotBoost: "Dieser Tab konnte nicht verstärkt werden.",
      boostingTo: "Verstärkung auf {v}%",
      volume: "Lautstärke {v}%",
      noActiveTab: "Kein aktiver Tab.",
      cantBoostBrowser: "Browserseiten können nicht verstärkt werden",
      activeTab: "Aktiver Tab",
      openNormalPage: "Öffne eine normale Webseite, um den Ton zu verstärken.",
      resetDone: "Auf 100% zurückgesetzt.",
      dragToBoost: "Extension by Takayoshi Code",
      tab: "Tab",
      language: "Sprache",
      autoLevel: "Auto-Pegel",
      autoLevelHint: "Laute Werbung dämpfen, leise Videos anheben",
      autoLevelTitle: "Laute und leise Töne ausgleichen",
      autoOn: "Auto-Pegel an — Lautstärke wird ausgeglichen.",
      autoOff: "Auto-Pegel aus.",
      fsMode: "Vollbildmodus",
      fsModeTitle: "Video-Vollbild beim Verstärken beibehalten",
      fsOn: "Vollbildmodus an — Verstärkung in der Seite.",
      fsOff: "Vollbildmodus aus — Tab-Aufnahme wird verwendet.",
      fsNoMedia: "Keine verstärkbaren Medien auf dieser Seite gefunden.",
      reloadNeeded: "Neu laden, um diese Seite zu verstärken",
      reloadHint: "Der Ton dieses Tabs kann erst nach dem Neuladen erfasst werden.",
      reloadBtn: "Neu laden",
      reloadingPage: "Seite wird neu geladen…",
    },
  };

  // Inline SVG flags (viewBox 60x40). Emoji flags don't render on Windows,
  // so the markup is drawn explicitly. A reusable unit star path keeps the
  // multi-star flags compact.
  const STAR =
    "M0,-1L0.2245,-0.309L0.951,-0.309L0.363,0.118L0.588,0.809L0,0.382L-0.588,0.809L-0.363,0.118L-0.951,-0.309L-0.2245,-0.309Z";

  const FLAGS = {
    en:
      '<svg viewBox="0 0 60 40" preserveAspectRatio="none">' +
      '<rect width="60" height="40" fill="#012169"/>' +
      '<path d="M0,0 60,40 M60,0 0,40" stroke="#fff" stroke-width="8"/>' +
      '<path d="M0,0 60,40 M60,0 0,40" stroke="#C8102E" stroke-width="4"/>' +
      '<path d="M30,0V40 M0,20H60" stroke="#fff" stroke-width="12"/>' +
      '<path d="M30,0V40 M0,20H60" stroke="#C8102E" stroke-width="7"/></svg>',
    zh:
      '<svg viewBox="0 0 60 40" preserveAspectRatio="none">' +
      '<rect width="60" height="40" fill="#DE2910"/>' +
      '<g fill="#FFDE00">' +
      '<path d="' + STAR + '" transform="translate(12,11) scale(7)"/>' +
      '<path d="' + STAR + '" transform="translate(24,5) rotate(23) scale(2.4)"/>' +
      '<path d="' + STAR + '" transform="translate(29,10) rotate(46) scale(2.4)"/>' +
      '<path d="' + STAR + '" transform="translate(29,17) rotate(70) scale(2.4)"/>' +
      '<path d="' + STAR + '" transform="translate(24,22) rotate(21) scale(2.4)"/>' +
      '</g></svg>',
    ja:
      '<svg viewBox="0 0 60 40" preserveAspectRatio="none">' +
      '<rect width="60" height="40" fill="#fff"/>' +
      '<circle cx="30" cy="20" r="11" fill="#BC002D"/></svg>',
    vi:
      '<svg viewBox="0 0 60 40" preserveAspectRatio="none">' +
      '<rect width="60" height="40" fill="#DA251D"/>' +
      '<path d="' + STAR + '" transform="translate(30,20) scale(11)" fill="#FF0"/></svg>',
    es:
      '<svg viewBox="0 0 60 40" preserveAspectRatio="none">' +
      '<rect width="60" height="40" fill="#AA151B"/>' +
      '<rect y="10" width="60" height="20" fill="#F1BF00"/></svg>',
    fr:
      '<svg viewBox="0 0 60 40" preserveAspectRatio="none">' +
      '<rect width="60" height="40" fill="#fff"/>' +
      '<rect width="20" height="40" fill="#0055A4"/>' +
      '<rect x="40" width="20" height="40" fill="#EF4135"/></svg>',
    de:
      '<svg viewBox="0 0 60 40" preserveAspectRatio="none">' +
      '<rect width="60" height="40" fill="#000"/>' +
      '<rect y="13.33" width="60" height="13.33" fill="#D00"/>' +
      '<rect y="26.66" width="60" height="13.34" fill="#FFCE00"/></svg>',
  };

  let current = "en";

  function setLang(code) {
    if (STRINGS[code]) current = code;
    return current;
  }
  function getLang() {
    return current;
  }
  function t(key, params) {
    let s = (STRINGS[current] && STRINGS[current][key]) ?? STRINGS.en[key] ?? key;
    if (params) for (const k in params) s = s.replace("{" + k + "}", params[k]);
    return s;
  }
  function detect() {
    const ui = (
      (typeof chrome !== "undefined" && chrome.i18n && chrome.i18n.getUILanguage
        ? chrome.i18n.getUILanguage()
        : navigator.language) || "en"
    ).toLowerCase();
    const code = ui.split("-")[0];
    return STRINGS[code] ? code : "en";
  }

  globalThis.I18N = { t, setLang, getLang, detect, order: ORDER, names: NAMES, flags: FLAGS };
})();
