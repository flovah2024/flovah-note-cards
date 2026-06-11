/* FLOVAH NOTE CARDS · 뷰어 공통 스크립트
   - 슬라이드 자동 번호(01/10)
   - 전체 보기 / 개별 보기
   - 텍스트 편집 (자동 저장 · localStorage)
   - 배경 다크/라이트 전환 (전체 반전 + 슬라이드별)
   - PNG 저장 (html2canvas, 1080x1350 원본 크기)
*/
(function () {
  const slides = Array.from(document.querySelectorAll('.deck .slide'));
  const total = slides.length;
  const docTitle = (document.querySelector('meta[name="card-slug"]')?.content) || 'flovah-note';
  const STORE_KEY = 'flovah-cards:' + docTitle;

  const LOGO_DARK_BG = 'logo-light.svg';  /* 다크 배경 → 밝은 로고 */
  const LOGO_LIGHT_BG = 'logo.svg';       /* 페이퍼 배경 → 잉크 로고 */

  /* ── 0. 저장된 편집본 복원 ───────────────────────────
     card-version: 파일의 글 내용이 업데이트되면 버전을 올려서
     이전에 저장된 편집본(옛 내용)이 새 내용을 덮어쓰지 않게 함 */
  const contentVersion = document.querySelector('meta[name="card-version"]')?.content || '1';
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (saved && Array.isArray(saved.slides) && saved.slides.length === total) {
      let restore = true;
      if ((saved.version || '1') !== contentVersion) {
        /* 글 원본이 업데이트됨 → 직접 편집한 내용을 버릴지 사용자에게 확인 */
        restore = confirm(
          '이 글의 원본 내용이 업데이트되었습니다.\n\n' +
          '확인 = 내가 직접 편집한 버전을 그대로 유지\n' +
          '취소 = 편집 내용을 버리고 업데이트된 원본 보기'
        );
        if (!restore) localStorage.removeItem(STORE_KEY);
      }
      if (restore) {
        saved.slides.forEach((s, i) => {
          slides[i].className = s.cls;
          slides[i].innerHTML = s.html;
        });
        if ((saved.version || '1') !== contentVersion) {
          /* 유지를 선택했으면 버전을 갱신해 같은 질문이 반복되지 않게 함 */
          saved.version = contentVersion;
          try { localStorage.setItem(STORE_KEY, JSON.stringify(saved)); } catch (e) {}
        }
      }
    }
  } catch (e) { /* 복원 실패 시 원본 유지 */ }

  function persist() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        version: contentVersion,
        slides: slides.map((s) => ({ cls: s.className, html: s.innerHTML })),
        savedAt: Date.now(),
      }));
    } catch (e) { /* 저장 공간 부족 등은 조용히 무시 */ }
  }

  /* ── 0.5 이미지 src를 내장 데이터로 교체 ──────────────
     파일로 직접 열어도(file://) PNG 저장이 막히지 않도록
     배경/로고 이미지를 데이터 URI로 바꿔 캔버스 오염을 방지 */
  const ASSETS = window.__assets || {};
  function resolveAsset(src) {
    const base = (src || '').split('/').pop().split('?')[0];
    return ASSETS[base] || src;
  }
  function logoSrc(isDark) {
    return isDark ? (window.__logoLight || '../logo-light.svg') : (window.__logoInk || '../logo.svg');
  }
  slides.forEach((s) => {
    const isDark = s.classList.contains('dark');
    s.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src') || '';
      if (/logo(-light)?\.svg/.test(src) || img.dataset.logo) {
        img.dataset.logo = '1';
        img.src = logoSrc(isDark);
      } else if (!src.startsWith('data:')) {
        img.src = resolveAsset(src);
      }
    });
  });

  /* ── 1. 슬라이드를 프레임으로 감싸기 (스케일 표시용) ── */
  const deckFrames = slides.map((s) => {
    const f = document.createElement('div');
    f.className = 'slide-frame';
    s.parentNode.insertBefore(f, s);
    f.appendChild(s);
    return f;
  });

  /* ── 2. 자동 번호 ────────────────────────────────── */
  function renumber() {
    slides.forEach((s, i) => {
      const pg = s.querySelector('.s-page');
      if (pg) pg.textContent = String(i + 1).padStart(2, '0') + ' / ' + String(total).padStart(2, '0');
    });
  }
  renumber();

  /* ── 3. 화면용 스케일 ────────────────────────────── */
  function fit() {
    document.querySelectorAll('.slide-frame').forEach((f) => {
      const s = f.querySelector('.slide');
      if (s) s.style.transform = 'scale(' + f.clientWidth / 1080 + ')';
    });
  }
  window.addEventListener('resize', fit);
  requestAnimationFrame(fit);

  /* ── 4. 배경 다크/라이트 전환 ─────────────────────── */
  function fixLogos(slide) {
    const isDark = slide.classList.contains('dark');
    slide.querySelectorAll('img.s-logo, img.s-closing-logo').forEach((img) => {
      img.src = logoSrc(isDark);
    });
  }
  function flipSlide(slide) {
    slide.classList.toggle('paper');
    slide.classList.toggle('dark');
    fixLogos(slide);
    persist();
  }
  document.getElementById('btn-flip-all')?.addEventListener('click', () => {
    slides.forEach(flipSlide);
    if (document.body.classList.contains('mode-single')) showSingle(cur);
  });

  /* ── 5. 텍스트 편집 모드 ─────────────────────────── */
  const EDITABLE = ['.s-brand', '.s-issue', '.s-cover-title', '.s-cover-sub', '.s-label',
    '.s-title', '.s-body', '.s-block', '.s-row-tag', '.s-row-text',
    '.s-cell-tag', '.s-cell-title', '.s-cell-desc', '.s-closing-text', '.s-closing-url'].join(',');
  const btnEdit = document.getElementById('btn-edit');
  let editing = false;
  let saveTimer = null;

  function setEditing(on) {
    editing = on;
    btnEdit.classList.toggle('active', on);
    btnEdit.textContent = on ? '편집 중 (자동 저장)' : '편집';
    document.body.classList.toggle('mode-editing', on);
    slides.forEach((s) => {
      s.querySelectorAll(EDITABLE).forEach((el) => {
        if (on) el.setAttribute('contenteditable', 'true');
        else el.removeAttribute('contenteditable');
      });
    });
  }
  btnEdit?.addEventListener('click', () => setEditing(!editing));
  /* 전체 보기와 개별 보기 어디서 수정해도 자동 저장 */
  document.addEventListener('input', (e) => {
    if (!e.target.closest || !e.target.closest('.slide')) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 400);
  });

  /* ── 5.2 편집 모드 · 폰트 컬러 팔레트 ─────────────────
     텍스트를 드래그로 선택한 뒤 칩을 클릭하면 색이 적용됨 */
  const PALETTE = [
    ['#FF6B35', 'Flame (포인트 오렌지)'],
    ['#1D1D1F', 'Ink (잉크 블랙)'],
    ['#FFFFFF', 'White'],
    ['#F0ECE7', 'Paper (크림)'],
    ['#9A9A9E', 'Gray (보조 회색)'],
  ];
  (function buildColorBar() {
    const bar = document.createElement('div');
    bar.className = 'color-bar';
    bar.innerHTML = '<span class="cb-label">글자색</span>' + PALETTE.map(([c, name]) =>
      '<button class="color-chip" data-color="' + c + '" title="' + name + '" style="background:' + c + '"></button>'
    ).join('');
    document.body.appendChild(bar);

    /* mousedown에서 기본 동작을 막아 텍스트 선택이 풀리지 않게 함 */
    bar.addEventListener('mousedown', (e) => e.preventDefault());
    bar.addEventListener('click', (e) => {
      const chip = e.target.closest('.color-chip');
      if (!chip || !editing) return;
      const sel = window.getSelection();
      if (!sel.rangeCount || sel.isCollapsed) { alert('먼저 색을 바꿀 텍스트를 드래그로 선택해주세요.'); return; }
      /* 선택 영역이 편집 가능한 요소 안인지 확인 */
      const node = sel.anchorNode;
      const el = node && (node.nodeType === 1 ? node : node.parentElement);
      const editable = el && el.closest('[contenteditable="true"]');
      if (!editable) return;
      editable.focus();
      document.execCommand('styleWithCSS', false, true);
      document.execCommand('foreColor', false, chip.dataset.color);
      persist();
    });
  })();

  /* 초기화: 편집·배경 변경 모두 원본으로 */
  document.getElementById('btn-reset')?.addEventListener('click', () => {
    if (!confirm('편집한 내용과 배경 변경을 모두 원본으로 되돌릴까요?')) return;
    localStorage.removeItem(STORE_KEY);
    localStorage.removeItem('flovah-bg:' + docTitle);
    localStorage.removeItem('flovah-bgimg:' + docTitle);
    localStorage.removeItem('flovah-bgimg:' + docTitle + ':orig');
    localStorage.removeItem('flovah-memo:' + docTitle);
    location.reload();
  });

  /* ── 5.5 배경 이미지 선택 + 톤다운 ────────────────── */
  const BG_KEY = 'flovah-bg:' + docTitle;
  const bgList = (document.querySelector('meta[name="card-backgrounds"]')?.content || '')
    .split(',').map((s) => s.trim()).filter(Boolean);

  function bgState() {
    try { return JSON.parse(localStorage.getItem(BG_KEY) || 'null') || {}; }
    catch (e) { return {}; }
  }
  function saveBgState(st) {
    try { localStorage.setItem(BG_KEY, JSON.stringify(st)); } catch (e) {}
  }
  const BGIMG_KEY = 'flovah-bgimg:' + docTitle;
  function applyBg() {
    const st = bgState();
    slides.forEach((s) => {
      const bg = s.querySelector('.s-bg');
      if (!bg) return;
      const img = bg.querySelector('img');
      if (st.src === 'none') bg.style.display = 'none';
      else {
        bg.style.display = '';
        if (img) {
          if (st.src === '__custom__') img.src = localStorage.getItem(BGIMG_KEY) || resolveAsset(bgList[0] || '');
          else if (st.src) img.src = resolveAsset(st.src);
        }
      }
      if (st.dim) bg.style.setProperty('--dim', st.dim);
    });
    document.querySelectorAll('.bg-thumb[data-src]').forEach((b) => {
      b.classList.toggle('selected', b.dataset.src === (st.src || (bgList[0] || 'none')));
    });
    const slider = document.getElementById('dim-range');
    const val = document.getElementById('dim-val');
    if (slider && st.dim) { slider.value = Math.round(st.dim * 100); }
    if (val && slider) val.textContent = slider.value + '%';
    if (document.body.classList.contains('mode-single')) showSingle(cur);
  }

  /* 개별 보기 하단에 컨트롤 UI 구성 */
  function buildBgControls() {
    const single = document.querySelector('.single');
    if (!single || !bgList.length) return;
    let wrap = single.querySelector('.bg-controls');
    if (wrap) wrap.remove();
    wrap = document.createElement('div');
    wrap.className = 'bg-controls';
    let thumbs = bgList.map((src, i) =>
      '<button class="bg-thumb" data-src="' + src + '" title="배경 ' + (i + 1) + '"><img src="' + src + '" alt=""></button>'
    ).join('');
    const custom = localStorage.getItem(BGIMG_KEY);
    if (custom) {
      thumbs += '<button class="bg-thumb" data-src="__custom__" title="업로드한 이미지"><img src="' + custom + '" alt=""><span class="bg-del" title="업로드한 이미지 삭제">×</span></button>';
    }
    wrap.innerHTML =
      '<span class="bgc-label">표지 배경</span>' +
      '<div class="bg-thumbs">' + thumbs +
      '<button class="bg-thumb none" data-src="none" title="배경 없음">없음</button>' +
      '<button class="bg-thumb none" id="bg-upload-btn" title="이미지 업로드 (HEIC 가능)">+</button>' +
      '<input type="file" id="bg-upload-input" accept="image/*,.heic,.heif" style="display:none"></div>' +
      '<div class="dim-slider"><span class="bgc-label">톤다운</span>' +
      '<input type="range" id="dim-range" min="60" max="95" value="82">' +
      '<span class="dim-val" id="dim-val">82%</span></div>' +
      (custom ? '<button class="tb-btn" id="bg-adjust-btn">이미지 조정</button>' : '');
    single.appendChild(wrap);

    wrap.querySelector('#bg-adjust-btn')?.addEventListener('click', openImgEditor);

    wrap.querySelectorAll('.bg-thumb[data-src]').forEach((b) => {
      b.addEventListener('click', () => {
        const st = bgState(); st.src = b.dataset.src; saveBgState(st); applyBg();
      });
    });

    /* 업로드한 이미지 삭제 */
    wrap.querySelector('.bg-del')?.addEventListener('click', (e) => {
      e.stopPropagation(); e.preventDefault();
      if (!confirm('업로드한 이미지를 삭제할까요?')) return;
      localStorage.removeItem(BGIMG_KEY);
      const st = bgState();
      if (st.src === '__custom__') { delete st.src; saveBgState(st); }
      buildBgControls(); applyBg();
    });
    const slider = wrap.querySelector('#dim-range');
    slider.addEventListener('input', () => {
      wrap.querySelector('#dim-val').textContent = slider.value + '%';
      const st = bgState(); st.dim = slider.value / 100; saveBgState(st); applyBg();
    });

    /* 직접 이미지 업로드 (1400px 이하로 압축해 저장) */
    const upBtn = wrap.querySelector('#bg-upload-btn');
    const upInput = wrap.querySelector('#bg-upload-input');
    upBtn.addEventListener('click', () => upInput.click());
    upInput.addEventListener('change', async () => {
      const raw = upInput.files[0]; if (!raw) return;
      let f = raw;
      /* HEIC → JPEG 변환 (필요할 때만 라이브러리 로드) */
      if (/\.heic$|\.heif$/i.test(raw.name) || /heic|heif/i.test(raw.type)) {
        try {
          if (!window.heic2any) {
            await new Promise((res, rej) => {
              const s = document.createElement('script');
              s.src = 'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';
              s.onload = res; s.onerror = () => rej(new Error('load fail'));
              document.head.appendChild(s);
            });
          }
          f = await heic2any({ blob: raw, toType: 'image/jpeg', quality: 0.9 });
        } catch (e) { alert('HEIC 변환에 실패했습니다. 인터넷 연결을 확인해주세요.'); return; }
      }
      const fr = new FileReader();
      fr.onload = () => {
        const im = new Image();
        im.onload = () => {
          const max = 1400, sc = Math.min(1, max / Math.max(im.width, im.height));
          const cv = document.createElement('canvas');
          cv.width = Math.round(im.width * sc); cv.height = Math.round(im.height * sc);
          cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
          const data = cv.toDataURL('image/jpeg', 0.85);
          try {
            localStorage.setItem(BGIMG_KEY, data);
            localStorage.setItem(BGIMG_KEY + ':orig', data); /* 조정용 원본 보관 */
          }
          catch (e) { alert('이미지가 너무 큽니다. 더 작은 파일로 시도해주세요.'); return; }
          const st = bgState(); st.src = '__custom__'; saveBgState(st);
          buildBgControls(); applyBg();
        };
        im.src = fr.result;
      };
      fr.readAsDataURL(f);
    });
  }
  buildBgControls();

  /* ── 5.6 업로드 이미지 조정 (확대 · 크롭 · 회전) ────── */
  function openImgEditor() {
    const orig = localStorage.getItem(BGIMG_KEY + ':orig') || localStorage.getItem(BGIMG_KEY);
    if (!orig) return;
    const W = 360, H = 450; /* 미리보기 캔버스 (1080x1350의 1/3) */
    let zoom = 1, rot = 0, offX = 0, offY = 0;

    const ov = document.createElement('div');
    ov.className = 'img-editor-overlay';
    ov.innerHTML =
      '<div class="img-editor">' +
      '<div class="ie-title">이미지 조정 <small>드래그로 위치 이동</small></div>' +
      '<canvas class="ie-canvas" width="' + W + '" height="' + H + '"></canvas>' +
      '<div class="ie-row"><span class="bgc-label">확대</span>' +
      '<input type="range" class="ie-zoom" min="100" max="300" value="100">' +
      '<button class="tb-btn ie-rotate">회전 90°</button></div>' +
      '<div class="ie-row"><button class="tb-btn ie-cancel">취소</button>' +
      '<button class="tb-btn active ie-apply">적용</button></div>' +
      '</div>';
    document.body.appendChild(ov);

    const canvas = ov.querySelector('.ie-canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    function coverScale(w, h) {
      const swapped = rot % 180 !== 0;
      const iw = swapped ? img.height : img.width;
      const ih = swapped ? img.width : img.height;
      return Math.max(w / iw, h / ih);
    }
    function draw(c, w, h, k) {
      const x = c.getContext('2d');
      x.clearRect(0, 0, w, h);
      x.save();
      x.translate(w / 2 + offX * k, h / 2 + offY * k);
      x.rotate(rot * Math.PI / 180);
      const s = coverScale(w, h) * zoom;
      x.drawImage(img, -img.width * s / 2, -img.height * s / 2, img.width * s, img.height * s);
      x.restore();
    }
    function render() { draw(canvas, W, H, 1); }

    img.onload = render;
    img.src = orig;

    /* 드래그로 위치 이동 */
    let dragging = false, sx = 0, sy = 0;
    canvas.addEventListener('pointerdown', (e) => { dragging = true; sx = e.clientX - offX; sy = e.clientY - offY; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => { if (!dragging) return; offX = e.clientX - sx; offY = e.clientY - sy; render(); });
    canvas.addEventListener('pointerup', () => { dragging = false; });

    ov.querySelector('.ie-zoom').addEventListener('input', (e) => { zoom = e.target.value / 100; render(); });
    ov.querySelector('.ie-rotate').addEventListener('click', () => { rot = (rot + 90) % 360; render(); });
    ov.querySelector('.ie-cancel').addEventListener('click', () => ov.remove());
    ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });

    ov.querySelector('.ie-apply').addEventListener('click', () => {
      const out = document.createElement('canvas');
      out.width = 1080; out.height = 1350;
      draw(out, 1080, 1350, 1080 / W);
      try { localStorage.setItem(BGIMG_KEY, out.toDataURL('image/jpeg', 0.85)); }
      catch (e) { alert('저장 공간이 부족합니다.'); return; }
      const st = bgState(); st.src = '__custom__'; saveBgState(st);
      ov.remove();
      buildBgControls(); applyBg();
    });
  }

  /* ── 6. 전체 / 개별 보기 ─────────────────────────── */
  const btnGrid = document.getElementById('btn-grid');
  const btnSingle = document.getElementById('btn-single');
  const stage = document.querySelector('.single .stage');
  const pgLabel = document.querySelector('.single-nav .pg');
  let cur = 0;

  /* 개별 보기는 복제본이 아니라 실제 슬라이드를 옮겨와 표시 → 편집이 그대로 반영됨 */
  let stagedIdx = null;
  function returnStaged() {
    if (stagedIdx === null) return;
    deckFrames[stagedIdx].appendChild(slides[stagedIdx]);
    stagedIdx = null;
  }
  function showSingle(i) {
    cur = (i + total) % total;
    returnStaged();
    stage.innerHTML = '';
    const frame = document.createElement('div');
    frame.className = 'slide-frame';
    frame.appendChild(slides[cur]);
    stagedIdx = cur;
    stage.appendChild(frame);
    pgLabel.textContent = String(cur + 1).padStart(2, '0') + ' / ' + String(total).padStart(2, '0');
    requestAnimationFrame(fit);
  }
  function setMode(single) {
    document.body.classList.toggle('mode-single', single);
    btnGrid.classList.toggle('active', !single);
    btnSingle.classList.toggle('active', single);
    if (single) showSingle(cur);
    else { returnStaged(); requestAnimationFrame(fit); }
  }
  btnGrid.addEventListener('click', () => setMode(false));
  btnSingle.addEventListener('click', () => setMode(true));
  document.getElementById('btn-prev').addEventListener('click', () => showSingle(cur - 1));
  document.getElementById('btn-next').addEventListener('click', () => showSingle(cur + 1));

  /* ── 7. PNG 저장 ─────────────────────────────────── */
  const exportStage = document.getElementById('export-stage');
  async function savePng(i) {
    const clone = slides[i].cloneNode(true);
    clone.style.transform = 'none';
    clone.querySelectorAll('[contenteditable]').forEach((el) => el.removeAttribute('contenteditable'));
    exportStage.appendChild(clone);
    await document.fonts.ready;
    const canvas = await html2canvas(clone, { width: 1080, height: 1350, scale: 1, useCORS: true, backgroundColor: null });
    exportStage.removeChild(clone);
    const a = document.createElement('a');
    a.download = docTitle + '-' + String(i + 1).padStart(2, '0') + '.png';
    a.href = canvas.toDataURL('image/png');
    a.click();
  }
  const btnAll = document.getElementById('btn-save-all');
  btnAll.addEventListener('click', async () => {
    btnAll.disabled = true;
    const orig = btnAll.textContent;
    try {
      for (let i = 0; i < total; i++) {
        btnAll.textContent = '저장 중... ' + (i + 1) + '/' + total;
        await savePng(i);
        await new Promise((r) => setTimeout(r, 400));
      }
    } catch (e) {
      alert('PNG 저장 중 오류가 발생했습니다.\n' + (e && e.message ? e.message : e));
    } finally {
      btnAll.textContent = orig;
      btnAll.disabled = false;
    }
  });

  /* ── 8. 슬라이드별 호버 버튼 (PNG · 배경 전환) ────── */
  document.querySelectorAll('.deck .slide-frame').forEach((f, i) => {
    const save = document.createElement('button');
    save.className = 'frame-save';
    save.textContent = 'PNG 저장';
    save.addEventListener('click', () => savePng(i));
    f.appendChild(save);

    const flip = document.createElement('button');
    flip.className = 'frame-save frame-flip';
    flip.textContent = '배경 전환';
    flip.addEventListener('click', () => flipSlide(slides[i]));
    f.appendChild(flip);

    /* 카드 클릭 → 해당 장의 개별 보기로 전환 (편집 중 제외) */
    f.addEventListener('click', (e) => {
      if (editing) return;
      if (e.target.closest('.frame-save')) return;
      cur = i;
      setMode(true);
    });
  });

  /* 개별 보기에서 현재 장 저장 */
  document.getElementById('btn-save-cur').addEventListener('click', async () => {
    try { await savePng(cur); }
    catch (e) { alert('PNG 저장 중 오류가 발생했습니다.\n' + (e && e.message ? e.message : e)); }
  });

  /* ── 10. GitHub 저장 ─────────────────────────────────
     현재 편집 상태(텍스트·색상·배경·메모)를 저장소의 파일로 커밋.
     저장 후에는 파일이 원본이 되므로 이 브라우저의 임시 저장본은 비움 */
  const GH = { owner: 'flovah2024', repo: 'flovah-note-cards', branch: 'main' };
  const onGitHubPages = /github\.io$/.test(location.hostname) || /githubusercontent/.test(location.hostname) || true;

  function reverseAssetMap() {
    const rev = {};
    Object.keys(ASSETS).forEach((base) => { rev[ASSETS[base]] = '../assets/' + base; });
    return rev;
  }

  function serializeDeck() {
    const rev = reverseAssetMap();
    const parts = [];
    slides.forEach((s) => {
      const c = s.cloneNode(true);
      c.removeAttribute('style');
      c.querySelectorAll('[contenteditable]').forEach((el) => el.removeAttribute('contenteditable'));
      c.querySelectorAll('img').forEach((img) => {
        if (img.dataset.logo) {
          img.setAttribute('src', c.classList.contains('dark') ? '../logo-light.svg' : '../logo.svg');
          img.removeAttribute('data-logo');
        } else {
          const src = img.getAttribute('src') || '';
          if (rev[src]) img.setAttribute('src', rev[src]);
          /* 직접 업로드한 이미지(데이터 형식)는 그대로 파일에 내장됨 */
        }
      });
      parts.push('  ' + c.outerHTML);
    });
    if (memoCard) parts.push('  ' + memoCard.outerHTML);
    return '<div class="deck">\n\n' + parts.join('\n\n') + '\n\n</div>';
  }

  async function ghApi(method, path, body, token) {
    const res = await fetch('https://api.github.com' + path, {
      method,
      headers: {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error('GitHub API ' + res.status + ': ' + t.slice(0, 200));
    }
    return res.json();
  }

  /* UTF-8 안전 base64 인코딩/디코딩 (대용량 안전: 청크 단위 처리) */
  const b64encode = (str) => {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin);
  };
  const b64decode = (b64) => {
    const bin = atob(b64.replace(/\s/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  };

  async function saveToGitHub() {
    let token = localStorage.getItem('flovah-gh-token');
    if (!token) {
      token = prompt('GitHub 토큰(PAT)을 입력해주세요.\n한 번만 입력하면 이 브라우저에 저장됩니다.');
      if (!token) return;
      token = token.trim();
      localStorage.setItem('flovah-gh-token', token);
    }
    const fileName = location.pathname.split('/').pop();
    const apiPath = '/repos/' + GH.owner + '/' + GH.repo + '/contents/articles/' + fileName;
    const btn = document.getElementById('btn-gh-save');
    const orig = btn.textContent;
    btn.disabled = true; btn.textContent = '저장 중...';
    try {
      const cur = await ghApi('GET', apiPath + '?ref=' + GH.branch, null, token);
      let rawB64 = cur.content;
      if (!rawB64) {
        /* 1MB 이상 파일은 blob API로 내용을 받아야 함 */
        const blob = await ghApi('GET', '/repos/' + GH.owner + '/' + GH.repo + '/git/blobs/' + cur.sha, null, token);
        rawB64 = blob.content;
      }
      let content = b64decode(rawB64);
      const start = content.indexOf('<div class="deck">');
      const end = content.indexOf('<div class="single">');
      if (start === -1 || end === -1) throw new Error('파일 구조를 인식하지 못했습니다.');
      content = content.slice(0, start) + serializeDeck() + '\n\n' + content.slice(end);
      await ghApi('PUT', apiPath, {
        message: '카드 내용 업데이트: ' + fileName + ' (' + new Date().toISOString().slice(0, 16).replace('T', ' ') + ')',
        content: b64encode(content),
        sha: cur.sha,
        branch: GH.branch,
      }, token);
      /* 파일이 원본이 됐으니 이 브라우저의 임시 저장본 정리 */
      localStorage.removeItem(STORE_KEY);
      localStorage.removeItem(MEMO_KEY);
      btn.textContent = '저장 완료';
      alert('GitHub에 저장되었습니다.\n사이트에는 약 1분 안에 반영됩니다.');
      setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 1500);
    } catch (e) {
      btn.textContent = orig; btn.disabled = false;
      if (/401|403/.test(e.message)) {
        localStorage.removeItem('flovah-gh-token');
        alert('토큰이 올바르지 않거나 권한이 없습니다. 다시 시도하면 토큰을 새로 입력할 수 있습니다.');
      } else {
        alert('저장 실패: ' + e.message);
      }
    }
  }

  /* 툴바에 버튼 추가 */
  (function addGhSaveButton() {
    const toolbar = document.querySelector('.toolbar');
    if (!toolbar) return;
    const b = document.createElement('button');
    b.className = 'tb-btn'; b.id = 'btn-gh-save';
    b.textContent = 'GitHub 저장';
    toolbar.insertBefore(b, document.getElementById('btn-reset'));
    b.addEventListener('click', saveToGitHub);
  })();

  /* 개별 보기: 키보드 좌우 키로 슬라이드 넘기기 */
  document.addEventListener('keydown', (e) => {
    if (!document.body.classList.contains('mode-single')) return;
    if (e.target.closest('input, textarea, [contenteditable]')) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); showSingle(cur - 1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); showSingle(cur + 1); }
  });

  /* ── 9. 업로드 노트 (캡션 · 해시태그 메모) ──────────── */
  const MEMO_KEY = 'flovah-memo:' + docTitle;
  const memoCard = document.querySelector('.memo-card');
  if (memoCard) {
    /* 저장된 메모 복원 */
    try {
      const m = JSON.parse(localStorage.getItem(MEMO_KEY) || 'null');
      if (m) {
        memoCard.querySelectorAll('.memo-field').forEach((f) => {
          if (m[f.dataset.memo] !== undefined) f.innerHTML = m[f.dataset.memo];
        });
      }
    } catch (e) {}

    let memoTimer = null;
    memoCard.addEventListener('input', () => {
      clearTimeout(memoTimer);
      memoTimer = setTimeout(() => {
        const m = {};
        memoCard.querySelectorAll('.memo-field').forEach((f) => { m[f.dataset.memo] = f.innerHTML; });
        try { localStorage.setItem(MEMO_KEY, JSON.stringify(m)); } catch (e) {}
      }, 400);
    });

    /* 복사 버튼 */
    memoCard.querySelectorAll('.memo-copy').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const f = memoCard.querySelector('.memo-field[data-memo="' + btn.dataset.target + '"]');
        const text = f.innerText.trim();
        try {
          await navigator.clipboard.writeText(text);
          const orig = btn.textContent;
          btn.textContent = '복사됨';
          setTimeout(() => { btn.textContent = orig; }, 1200);
        } catch (e) { alert('복사에 실패했습니다. 직접 선택해서 복사해주세요.'); }
      });
    });
  }

  /* 저장된 배경 선택/톤다운 적용 */
  applyBg();

  /* (구) 허브 순서 → NO. 동기화 기능은 날짜 표기(Jun.2026 등)로 전환되며 제거됨 */
})();
