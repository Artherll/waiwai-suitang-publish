(function () {
  "use strict";

  const data = window.WAIWAI_DATA;
  const original = window.WAIWAI_ORIGINAL || {};
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const statusStrip = document.getElementById("statusStrip");
  const cityOverlay = document.getElementById("cityOverlay");
  const textOverlay = document.getElementById("textOverlay");
  const messageOverlay = document.getElementById("messageOverlay");
  const diceOverlay = document.getElementById("diceOverlay");
  const W = 128;
  const H = 128;
  const MAP = 24;
  const TILE = 24;
  const VIEW = 5;
  const ACTOR_W = 12;
  const ACTOR_H = 18;
  const MOVE_ANIM_MS = 230;
  const AUTO_WALK_START_MS = 240;
  const AUTO_WALK_GAP_MS = 70;
  let diceOverlaySignature = "";
  const CITY_SPRITES = [
    { sx: 0, sw: 24, tiles: 1 },
    { sx: 24, sw: 36, tiles: 2 },
    { sx: 60, sw: 72, tiles: 3 },
    { sx: 132, sw: 72, tiles: 3 }
  ];
  const assets = {
    map: loadImage("./assets/map.png"),
    city: loadImage("./assets/cites.png"),
    actor: loadImage("./assets/dz.png"),
    title: loadImage("./assets/st.png"),
    war: loadImage("./assets/war.png")
  };
  const originalCityPositions = getOriginalCityPositions();
  const startPos = resolveRoadStart(originalCityPositions[0] || data.cityPositions[0]);
  const citySource = original.cityNames && original.cityStats
    ? original.cityNames.map((c, index) => [c[0], c[1], original.cityStats[index]])
    : data.cityRaw;
  const generalSource = original.generalNames && original.generalRaw
    ? original.generalNames.map((name, index) => [name, original.generalRaw[index], index])
    : data.generals.map((g, index) => [g[0], g[1], index + 1]);

  const COLORS = {
    black: "#0b0a08",
    paper: "#e7d69a",
    paperDark: "#b9a96d",
    ink: "#17120e",
    line: "#5d5134",
    road: "#8f7f4a",
    grass: "#637c43",
    forest: "#355733",
    water: "#325c76",
    field: "#b79b42",
    cityPlayer: "#e0c45c",
    cityEnemy: "#d35a43",
    village: "#a77242",
    school: "#7a6099",
    highlight: "#fff0a6",
    ok: "#7fbe70",
    danger: "#d65d45"
  };

  function loadImage(src) {
    const image = new Image();
    image.src = src;
    return image;
  }

  function getOriginalCityPositions() {
    const positions = [];
    const map = original.worldMap || [];
    for (let y = 0; y < map.length; y += 1) {
      for (let x = 0; x < map[y].length; x += 1) {
        const cityIndex = map[y][x] >> 24;
        if (cityIndex > 0) positions[cityIndex - 1] = [x, y];
      }
    }
    return positions;
  }

  function roadTypeAt(x, y) {
    if (x < 0 || y < 0 || x >= MAP || y >= MAP) return 0;
    const row = original.worldMap && original.worldMap[y];
    if (!row) return 0;
    const def = original.tileDefs && original.tileDefs[row[x] & 255];
    return def ? def[2] : 0;
  }

  function isRoadType(type) {
    return type === 4;
  }

  function rawTileAt(x, y) {
    if (x < 0 || y < 0 || x >= MAP || y >= MAP) return 0;
    const row = original.worldMap && original.worldMap[y];
    return row ? row[x] : 0;
  }

  function resolveRoadStart(pos) {
    if (!pos) return [0, 0];
    if (isRoadType(roadTypeAt(pos[0], pos[1]))) return pos;
    const queue = [[pos[0], pos[1]]];
    const seen = new Set([`${pos[0]},${pos[1]}`]);
    for (let i = 0; i < queue.length; i += 1) {
      const [x, y] = queue[i];
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dx, dy] of dirs) {
        const nx = x + dx;
        const ny = y + dy;
        const key = `${nx},${ny}`;
        if (seen.has(key) || nx < 0 || ny < 0 || nx >= MAP || ny >= MAP) continue;
        if (isRoadType(roadTypeAt(nx, ny))) return [nx, ny];
        seen.add(key);
        queue.push([nx, ny]);
      }
    }
    return pos;
  }

  const game = {
    screen: "title",
    storyPage: 0,
    x: startPos[0],
    y: startPos[1],
    gold: 2000,
    soldiers: 4000,
    stamina: 100,
    maxStamina: 100,
    year: 617,
    monthTick: 0,
    dice: 0,
    diceRolls: [],
    diceCount: 1,
    steps: 0,
    autoWalking: false,
    autoTimer: 0,
    moveAnim: null,
    lastDir: 0,
    selected: 0,
    message: "",
    menu: null,
    menuKind: "normal",
    menuReturn: "map",
    dialog: null,
    cityPanel: null,
    modeStack: [],
    generals: generalSource.map((g) => ({
      id: g[2],
      name: g[0],
      raw: g[1] ? g[1].slice() : null,
      owned: g[1] && g[1][0] === 1
    })),
    cities: citySource.map((c, index) => {
      const pos = originalCityPositions[index] || data.cityPositions[index];
      return {
        id: index,
        name: c[0],
        general: c[1],
        owner: c[2][0],
        population: c[2][1],
        statA: c[2][2],
        statB: c[2][3],
        soldiers: c[2][4],
        loyalty: c[2][5],
        x: pos[0],
        y: pos[1]
      };
    }),
    stratagems: data.stratagems.map((s, index) => ({
      id: index + 1,
      name: s[0],
      raw: s[1].slice(),
      owned: [1, 2, 3, 4, 9].includes(index + 1),
      count: [1, 2, 3, 4, 9].includes(index + 1) ? 1 : 0
    })),
    learned: [0, 0, 0, 0],
    battle: null,
    battleAuto: null,
    pendingBattle: null,
    cityEncounterKey: "",
    cityCombatUsed: false,
    mainGeneralId: 1,
    flags: {
      firstMap: true
    }
  };

  normalizePosition();

  const story = [
    "歪歪猫和皮皮猪乘时空机回到隋唐末年, 却发现天下四分五裂。",
    "二人以西域为据点, 招兵买马, 寻访名将, 誓要平定天下。",
    "胜利条件: 统一全国。初始黄金2000, 兵马4000。"
  ];

  const fixedEvents = new Map([
    ["4,18", { type: "field", name: "麦田", verb: "收粮", stratagem: 3 }],
    ["2,17", { type: "forest", name: "树林", verb: "狩猎", stratagem: 1 }],
    ["5,19", { type: "water", name: "渔场", verb: "捕鱼", stratagem: 2 }],
    ["6,18", { type: "village", name: "村庄" }],
    ["3,16", { type: "school", name: "学堂" }],
    ["11,12", { type: "field", name: "麦田", verb: "收粮", stratagem: 3 }],
    ["15,8", { type: "forest", name: "树林", verb: "狩猎", stratagem: 1 }],
    ["20,17", { type: "water", name: "渔场", verb: "捕鱼", stratagem: 2 }],
    ["18,13", { type: "village", name: "村庄" }],
    ["12,9", { type: "school", name: "学堂" }]
  ]);
  const SAVE_KEY = "waiwai-suitang-save";
  const SAVE_VERSION = 2;
  const MANUAL_TERRAIN_FIXES = {
    "1,0": { source: [2, 0], alpha: 0.45 },
    "2,1": { alpha: 0.35 },
    "4,1": { alpha: 0.35 }
  };

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function rnd(max) {
    return Math.floor(Math.random() * max);
  }

  function eventAt(x, y) {
    const city = adjacentCityAt(x, y);
    if (city) return { type: "city", city };
    const originalEvent = originalEventAt(x, y);
    if (originalEvent) return originalEvent;
    if (!original.worldMap) return fixedEvents.get(`${x},${y}`) || null;
    return null;
  }

  function adjacentCityAt(x, y) {
    const checks = [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]];
    for (const city of game.cities) {
      const footprint = cityFootprintTiles(city);
      for (const [dx, dy] of checks) {
        if (footprint.some((tile) => tile.x === x + dx && tile.y === y + dy)) {
          return city;
        }
      }
    }
    return null;
  }

  function tileTypeAt(x, y) {
    if (x < 0 || y < 0 || x >= MAP || y >= MAP) return 0;
    const row = original.worldMap && original.worldMap[y];
    if (!row) return 0;
    const def = original.tileDefs && original.tileDefs[row[x] & 255];
    return def ? def[2] : 0;
  }

  function isRoadTile(x, y) {
    return isRoadType(tileTypeAt(x, y)) && !isCoveredByCitySprite(x, y);
  }

  function isCoveredByCitySprite(x, y) {
    return cityCoveringTile(x, y) !== null;
  }

  function cityCoveringTile(x, y) {
    for (const city of game.cities) {
      const covered = cityFootprintTiles(city);
      if (covered.some((tile) => tile.x === x && tile.y === y)) return city;
    }
    return null;
  }

  function cityFootprintTiles(city) {
    const sprite = CITY_SPRITES[citySpriteIndex(city)];
    const vertical = cityLongAxisVertical(city);
    const startOffset = sprite.tiles === 3 ? -1 : 0;
    const tiles = [];
    for (let i = 0; i < sprite.tiles; i += 1) {
      const offset = startOffset + i;
      tiles.push({
        x: city.x + (vertical ? 0 : offset),
        y: city.y + (vertical ? offset : 0)
      });
    }
    return tiles.filter((tile) => tile.x >= 0 && tile.y >= 0 && tile.x < MAP && tile.y < MAP);
  }

  function cityLongAxisVertical(city) {
    const horizontalRoads = (isRoadType(tileTypeAt(city.x - 1, city.y)) ? 1 : 0)
      + (isRoadType(tileTypeAt(city.x + 1, city.y)) ? 1 : 0);
    const verticalRoads = (isRoadType(tileTypeAt(city.x, city.y - 1)) ? 1 : 0)
      + (isRoadType(tileTypeAt(city.x, city.y + 1)) ? 1 : 0);
    if (horizontalRoads !== verticalRoads) return horizontalRoads > verticalRoads;
    const rawTile = rawTileAt(city.x, city.y);
    const def = original.tileDefs && original.tileDefs[rawTile & 255];
    return def ? def[1] % 180 !== 0 : false;
  }

  function findNearestWalkable(x, y) {
    if (isRoadTile(x, y)) return [x, y];
    const queue = [[x, y]];
    const seen = new Set([`${x},${y}`]);
    for (let i = 0; i < queue.length; i += 1) {
      const [cx, cy] = queue[i];
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dx, dy] of dirs) {
        const nx = cx + dx;
        const ny = cy + dy;
        const key = `${nx},${ny}`;
        if (seen.has(key) || nx < 0 || ny < 0 || nx >= MAP || ny >= MAP) continue;
        if (isRoadTile(nx, ny)) return [nx, ny];
        seen.add(key);
        queue.push([nx, ny]);
      }
    }
    return [x, y];
  }

  function normalizePosition() {
    const [x, y] = findNearestWalkable(game.x, game.y);
    game.x = x;
    game.y = y;
  }

  function originalEventAt(x, y) {
    const checks = [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]];
    for (const [dx, dy] of checks) {
      const type = tileTypeAt(x + dx, y + dy);
      if (type === 1) return { type: "field", name: "麦田", verb: "收粮", stratagem: 3 };
      if (type === 2) return { type: "forest", name: "树林", verb: "狩猎", stratagem: 1 };
      if (type === 3) return { type: "water", name: "渔场", verb: "捕鱼", stratagem: 2 };
      if (type === 5) return { type: "village", name: "村庄" };
      if (type === 6) return { type: "school", name: "学堂" };
    }
    return null;
  }

  function visualEventAt(x, y) {
    const city = game.cities.find((c) => c.x === x && c.y === y);
    if (city) return { type: "city", city };
    const type = tileTypeAt(x, y);
    if (type === 1) return { type: "field", name: "麦田", verb: "收粮", stratagem: 3 };
    if (type === 2) return { type: "forest", name: "树林", verb: "狩猎", stratagem: 1 };
    if (type === 3) return { type: "water", name: "渔场", verb: "捕鱼", stratagem: 2 };
    if (type === 5) return { type: "village", name: "村庄" };
    if (type === 6) return { type: "school", name: "学堂" };
    if (!original.worldMap) return fixedEvents.get(`${x},${y}`) || null;
    return null;
  }

  function cityTier(city) {
    if (city.population >= 2400000) return 3;
    if (city.population >= 800000) return 2;
    if (city.population >= 100000) return 1;
    return 0;
  }

  function cityPayment(city) {
    return 1 + Math.floor(((city.soldiers * 20 + city.population) * city.statB) / 40000) * Math.floor((cityTier(city) + 4) / 4);
  }

  function cityTax(city, reducePopulation, half) {
    let income = Math.floor((city.soldiers * 10 + city.population + 10000) / 100);
    income = Math.min(income, Math.floor(city.population / 50));
    if (reducePopulation) {
      city.population = Math.max(1000, city.population - income * 10);
    }
    if (half) income = Math.floor(income / 2);
    return income;
  }

  function growCity(city, recruit) {
    let growth = Math.floor((city.statA * 25) / 6);
    if (city.statA < 80) city.statA += 1;
    city.population = Math.min(5000000, city.population + Math.floor((city.population * growth) / 400));
    if (recruit) {
      const limit = city.owner === 1 ? 100000 : 500000;
      city.soldiers = Math.min(limit, city.soldiers + Math.floor((city.population * growth) / 8000) + 1200);
    }
    if (city.loyalty < 100) city.loyalty += 1;
    return Math.floor((city.population + city.soldiers * 5 + 200000) / 300);
  }

  function updateStatus() {
    statusStrip.textContent = `金:${game.gold} 兵:${game.soldiers} 体:${game.stamina}/${game.maxStamina} 年:${game.year} 骰:${game.diceCount} 步:${game.steps}`;
    const screenNames = {
      title: "标题",
      story: "剧情",
      map: "地图",
      menu: "菜单",
      city: "城市",
      dialog: "对话",
      battle: "战斗"
    };
    statusStrip.textContent = `${screenNames[game.screen] || game.screen}  金:${game.gold} 兵:${game.soldiers} 体:${game.stamina}/${game.maxStamina} 年:${game.year} 骰:${game.diceCount} 步:${game.steps} 坐标:${game.x},${game.y}`;
    document.documentElement.dataset.screen = game.screen;
    document.documentElement.dataset.gold = String(game.gold);
    document.documentElement.dataset.soldiers = String(game.soldiers);
    document.documentElement.dataset.stamina = String(game.stamina);
    document.documentElement.dataset.steps = String(game.steps);
    document.documentElement.dataset.dice = String(game.dice);
    document.documentElement.dataset.storyPage = String(game.storyPage);
    document.documentElement.dataset.autoWalking = game.autoWalking ? "1" : "0";
    document.documentElement.dataset.pos = `${game.x},${game.y}`;
    document.documentElement.dataset.message = game.message || "";
    document.documentElement.dataset.battle = game.battle ? `${game.battle.troops[0]}/${game.battle.troops[1]}` : "";
  }

  function diceDots(value) {
    const dots = {
      1: [5],
      2: [1, 9],
      3: [1, 5, 9],
      4: [1, 3, 7, 9],
      5: [1, 3, 5, 7, 9],
      6: [1, 3, 4, 6, 7, 9]
    };
    return dots[value] || [];
  }

  function renderDie(value, pending = false) {
    const dots = diceDots(value || 1).map((pos) => `<span class="die-dot p${pos}"></span>`).join("");
    return `<span class="die-face${pending ? " pending" : ""}">${dots}</span>`;
  }

  function updateDiceOverlay() {
    if (!diceOverlay) return;
    if (game.screen !== "map") {
      diceOverlay.hidden = true;
      diceOverlaySignature = "";
      return;
    }
    const rolls = game.diceRolls.length ? game.diceRolls : Array.from({ length: game.diceCount }, () => 1);
    const pending = !game.diceRolls.length;
    const title = pending ? `已选择 ${game.diceCount} 骰` : `掷出 ${game.dice} 点`;
    const total = pending ? "↓ 掷骰" : `剩余 ${game.steps} 步`;
    const signature = `${game.diceCount}|${game.dice}|${game.steps}|${rolls.join(",")}|${pending}`;
    if (signature === diceOverlaySignature && !diceOverlay.hidden) return;
    diceOverlaySignature = signature;
    diceOverlay.innerHTML = `
      <div class="dice-title">${escapeHtml(title)}</div>
      <div class="dice-row">${rolls.map((value) => renderDie(value, pending)).join("")}</div>
      <div class="dice-total">${escapeHtml(total)}</div>
    `;
    diceOverlay.hidden = false;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    }[ch]));
  }

  function panelActions(confirmText, cancelText, extraClass = "") {
    const extra = extraClass ? ` ${extraClass}` : "";
    const actionButton = (text, kind) => {
      const parts = String(text).split(" ");
      const label = parts.pop() || "";
      const key = parts.join(" ");
      return `<span class="panel-action ${kind}"><span class="panel-key">${escapeHtml(key || label)}</span>${key ? `<span class="panel-label">${escapeHtml(label)}</span>` : ""}</span>`;
    };
    return `
      <div class="panel-actions${extra}">
        ${actionButton(confirmText, "confirm")}
        ${cancelText ? actionButton(cancelText, "cancel") : ""}
      </div>
    `;
  }

  function formatCount(value) {
    const n = Math.max(0, Math.floor(value));
    const wan = Math.floor(n / 10000);
    const qian = Math.floor((n % 10000) / 1000);
    const bai = Math.floor((n % 1000) / 100);
    if (wan > 0) return `${wan}万${qian ? `${qian}千` : ""}`;
    if (qian > 0) return `${qian}千${bai ? `${bai}百` : ""}`;
    if (bai > 0) return `${bai}百`;
    return String(n);
  }

  function originalText(id, variant = 1, values = [], fallback = "") {
    const list = original.stratagemText && original.stratagemText[id];
    const text = list && list[variant];
    if (!text) return fallback;
    return String(text)
      .replace(/\[[A-Z]\]/g, "")
      .replace(/<(\d+)>/g, (match, index) => values[Number(index)] ?? "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function factionName(owner) {
    return ["无归属", "歪歪", "杨广", "李渊", "窦建德"][owner] || "群雄";
  }

  function updateCityOverlay() {
    if (!cityOverlay) return;
    const panel = game.cityPanel;
    if (game.screen !== "city" || !panel) {
      cityOverlay.hidden = true;
      cityOverlay.innerHTML = "";
      return;
    }
    const city = panel.city;
    const title = city.owner === 1
      ? `${city.name}守将${city.general},驻军${formatCount(city.soldiers)},人口${formatCount(city.population)}`
      : `${factionName(city.owner)}的${city.name}守将${city.general},驻军${formatCount(city.soldiers)},人口${formatCount(city.population)}`;
    cityOverlay.hidden = false;
    cityOverlay.innerHTML = `
      <div class="city-title">${escapeHtml(title)}</div>
      <div class="city-options">
        ${panel.items.map((item, index) => `
          <div class="city-option${index === panel.selected ? " selected" : ""}${item.disabled ? " disabled" : ""}">
            <span class="city-radio"></span>
            <span>${escapeHtml(item.label)}</span>
          </div>
        `).join("")}
      </div>
      ${panelActions("←/Enter 确定", "→/ESC 返回", "city-actions")}
    `;
  }

  function updateTextOverlay() {
    if (!textOverlay) return;
    if (game.screen === "title") {
      textOverlay.hidden = false;
      textOverlay.dataset.kind = "title";
      textOverlay.innerHTML = `
        <div class="panel-body">Enter 确认开始 方向键选择菜单</div>
      `;
      return;
    }
    if (game.screen === "story") {
      textOverlay.hidden = false;
      textOverlay.dataset.kind = "story";
      textOverlay.innerHTML = `
        <div class="panel-title">开场</div>
        <div class="panel-body">${escapeHtml(story[game.storyPage])}</div>
        ${panelActions("Enter 继续", "", "single-action")}
      `;
      return;
    }
    if (game.screen === "battle" && game.battle) {
      const b = game.battle;
      textOverlay.hidden = false;
      textOverlay.dataset.kind = "battle";
      textOverlay.innerHTML = `
        <div class="panel-title">攻打${escapeHtml(b.city.name)}</div>
        <div class="panel-body">我军 ${Math.max(0, b.troops[1] - 1)}${b.reserveTroops ? ` 预备${b.reserveTroops}` : ""}
敌军 ${Math.max(0, b.troops[0] - 1)}
士气 ${b.morale[1]}/${b.morale[0]}
${escapeHtml(b.log || "←/Enter 打开战斗菜单")}</div>
        ${panelActions("←/Enter 菜单", "→/ESC 系统")}
      `;
      return;
    }
    if (game.screen === "menu" && game.menu) {
      textOverlay.hidden = false;
      textOverlay.dataset.kind = "menu";
      textOverlay.innerHTML = `
        <div class="panel-title">${escapeHtml(game.menu.title)}</div>
        <div class="panel-options">
          ${game.menu.items.map((item, index) => `
            <div class="panel-option${index === game.selected ? " selected" : ""}${item.disabled ? " disabled" : ""}">
              <span class="panel-radio"></span>
              <span>${escapeHtml(item.label)}</span>
            </div>
          `).join("")}
        </div>
        ${panelActions("←/Enter 确定", "→/ESC 返回")}
      `;
      return;
    }
    if (game.screen === "dialog" && game.dialog) {
      textOverlay.hidden = false;
      textOverlay.dataset.kind = "dialog";
      if (game.dialog.compactControls) {
        textOverlay.innerHTML = `
        <div class="panel-body">${escapeHtml(game.dialog.text)}</div>
        ${panelActions("←/Enter 确认", "→/ESC 取消", "no-options")}
      `;
        return;
      }
      textOverlay.innerHTML = `
        <div class="panel-body">${escapeHtml(game.dialog.text)}</div>
        <div class="panel-options">
          <div class="panel-option selected"><span class="panel-radio"></span><span>${game.dialog.confirm ? "是" : "继续"}</span></div>
          <div class="panel-option"><span class="panel-radio"></span><span>${game.dialog.confirm ? "否" : "取消"}</span></div>
        </div>
        ${panelActions("←/Enter 确定", "→/ESC 返回")}
      `;
      return;
    }
    textOverlay.hidden = true;
    textOverlay.dataset.kind = "";
    textOverlay.innerHTML = "";
  }

  function updateMessageOverlay() {
    if (!messageOverlay) return;
    const hints = {
      map: "←/→选骰  ↓掷骰  ↑情报  Enter菜单  ESC系统",
      menu: "↑/↓选择  ←/Enter确定  →/ESC返回",
      city: "↑/↓选择  ←/Enter确定  →/ESC返回",
      dialog: "←/Enter继续  →/ESC取消",
      battle: "←/Enter战斗菜单  →/ESC系统"
    };
    const text = game.message || hints[game.screen] || "";
    const shouldShow = game.screen === "map";
    if (!shouldShow || !text) {
      messageOverlay.hidden = true;
      messageOverlay.textContent = "";
      return;
    }
    messageOverlay.hidden = false;
    messageOverlay.textContent = text;
  }

  function drawText(text, x, y, color = COLORS.paper) {
    ctx.fillStyle = color;
    ctx.font = "10px SimSun, Microsoft YaHei, monospace";
    ctx.textBaseline = "top";
    ctx.fillText(text, x, y);
  }

  function fitText(text, maxChars) {
    const chars = Array.from(String(text));
    return chars.length > maxChars ? `${chars.slice(0, maxChars - 1).join("")}…` : String(text);
  }

  function wrapText(text, x, y, width, lineHeight, color = COLORS.paper) {
    const chars = Array.from(text);
    let line = "";
    let cy = y;
    for (const ch of chars) {
      const next = line + ch;
      if (ctx.measureText(next).width > width && line) {
        drawText(line, x, cy, color);
        line = ch;
        cy += lineHeight;
      } else {
        line = next;
      }
    }
    if (line) drawText(line, x, cy, color);
    return cy + lineHeight;
  }

  function fillRect(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  }

  function strokeRect(x, y, w, h, color = COLORS.line) {
    ctx.strokeStyle = color;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  function drawPanel(x, y, w, h) {
    fillRect(x, y, w, h, COLORS.paper);
    strokeRect(x, y, w, h, COLORS.ink);
    fillRect(x + 2, y + 2, w - 4, h - 4, "#2b2419");
    strokeRect(x + 2, y + 2, w - 4, h - 4, COLORS.line);
  }

  function drawTile(tile, sx, sy, gx, gy) {
    const manualFix = manualTerrainFix(gx, gy);
    const targetGx = manualFix && manualFix.source ? manualFix.source[0] : gx;
    const targetGy = manualFix && manualFix.source ? manualFix.source[1] : gy;

    const mapRow = original.worldMap && original.worldMap[targetGy];
    const rawTile = mapRow ? mapRow[targetGx] : 0;
    const logicalTile = rawTile & 255;
    const def = original.tileDefs && original.tileDefs[logicalTile];
    if (assets.map.complete && def) {
      const sourceTile = def[0];
      drawOriginalMapTile(sourceTile, def[1], sx, sy, gx, gy);
    } else {
      drawFallbackTile(tile, sx, sy, gx, gy);
    }
  }

  function sourceTileAt(x, y) {
    if (x < 0 || y < 0 || x >= MAP || y >= MAP) return -1;
    const row = original.worldMap && original.worldMap[y];
    if (!row) return -1;
    const def = original.tileDefs && original.tileDefs[row[x] & 255];
    return def ? def[0] : -1;
  }

  function manualTerrainFix(x, y) {
    return MANUAL_TERRAIN_FIXES[`${x},${y}`] || null;
  }

  function terrainSofteningAlpha(sourceTile, gx, gy) {
    const manualFix = manualTerrainFix(gx, gy);
    if (manualFix && Number.isFinite(manualFix.alpha)) return manualFix.alpha;

    if (sourceTile < 0 || sourceTile > 4) return 0;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    let sameFamily = 0;
    let hardNeighbors = 0;
    dirs.forEach(([dx, dy]) => {
      const source = sourceTileAt(gx + dx, gy + dy);
      if (source >= 0 && source <= 4) sameFamily += 1;
      if (source >= 10 || source === 15 || source === 16) hardNeighbors += 1;
    });
    if (sameFamily <= 1) return 0.28;
    if (sameFamily === 2 && hardNeighbors >= 1) return 0.2;
    return 0.08;
  }

  function softenTerrainTile(sourceTile, sx, sy, gx, gy) {
    const alpha = terrainSofteningAlpha(sourceTile, gx, gy);
    if (!alpha) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#788a45";
    ctx.fillRect(sx, sy, TILE, TILE);
    ctx.globalAlpha = Math.min(0.34, alpha + 0.08);
    ctx.fillStyle = "#506638";
    for (let py = 2; py < TILE; py += 5) {
      for (let px = ((gx * 7 + gy * 11 + py) % 5); px < TILE; px += 7) {
        ctx.fillRect(sx + px, sy + py, 1, 1);
      }
    }
    ctx.restore();
  }

  function drawOriginalMapTile(sourceTile, rotation, sx, sy, gx, gy) {
    ctx.save();
    ctx.translate(sx + TILE / 2, sy + TILE / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(assets.map, sourceTile * 24, 0, 24, 24, -TILE / 2, -TILE / 2, TILE, TILE);
    ctx.restore();
    softenTerrainTile(sourceTile, sx, sy, gx, gy);
  }

  function drawVisibleCities(startX, startY, ox, oy) {
    if (!assets.city.complete) return;
    const spriteH = 24;
    for (let yy = 0; yy < VIEW; yy += 1) {
      for (let xx = 0; xx < VIEW; xx += 1) {
        const gx = startX + xx;
        const gy = startY + yy;
        const mapRow = original.worldMap && original.worldMap[gy];
        const rawTile = mapRow ? mapRow[gx] : 0;
        const cityIndex = rawTile >> 24;
        if (!cityIndex) continue;
        const city = game.cities[cityIndex - 1];
        const sprite = CITY_SPRITES[citySpriteIndex(city)];
        const rotation = cityLongAxisVertical(city) ? 90 : 0;
        drawCitySprite(sprite, rotation, ox + xx * TILE, oy + yy * TILE, spriteH);
      }
    }
  }

  function citySpriteIndex(city) {
    if (!city) return 0;
    if (city.population >= 1000000) return 3;
    if (city.population >= 100000) return 2;
    if (city.population >= 30000) return 1;
    return 0;
  }

  function drawCitySprite(sprite, rotation, tileX, tileY, spriteH) {
    const dw = sprite.tiles * TILE;
    const dh = spriteH;
    const cx = tileX + TILE / 2;
    const cy = tileY + TILE / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(assets.city, sprite.sx, 0, sprite.sw, spriteH, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  }

  function drawActor(px, py) {
    if (assets.actor.complete) {
      const frameW = 24;
      const frameH = 36;
      const frame = clamp(game.lastDir, 0, 3);
      ctx.save();
      ctx.beginPath();
      ctx.rect(px, py, TILE, TILE);
      ctx.clip();
      ctx.drawImage(
        assets.actor,
        frame * frameW,
        0,
        frameW,
        frameH,
        px + Math.floor((TILE - ACTOR_W) / 2),
        py + Math.floor((TILE - ACTOR_H) / 2),
        ACTOR_W,
        ACTOR_H
      );
      ctx.restore();
      return;
    }
    fillRect(px + 8, py + 5, 8, 14, "#f1d35e");
    fillRect(px + 9, py + 3, 6, 5, "#efefcf");
    strokeRect(px + 6, py + 3, 12, 18, COLORS.ink);
  }

  function drawFallbackTile(tile, sx, sy, gx, gy) {
    let color = COLORS.grass;
    if ((gx + gy) % 7 === 0) color = "#576f3b";
    if ((gx + gy * 2) % 11 === 0) color = COLORS.road;
    if (gx === 0 || gy === 0 || gx === MAP - 1 || gy === MAP - 1) color = COLORS.water;
    if (tile && tile.type === "field") color = COLORS.field;
    if (tile && tile.type === "forest") color = COLORS.forest;
    if (tile && tile.type === "water") color = COLORS.water;
    if (tile && tile.type === "village") color = COLORS.village;
    if (tile && tile.type === "school") color = COLORS.school;
    if (tile && tile.type === "city") color = tile.city.owner === 1 ? COLORS.cityPlayer : COLORS.cityEnemy;
    fillRect(sx, sy, TILE, TILE, color);
    strokeRect(sx, sy, TILE, TILE, "rgba(0,0,0,0.25)");
  }

  function drawMap() {
    fillRect(0, 0, W, H, COLORS.black);

    const actorPos = actorVisualPosition();
    const startX = clamp(Math.round(actorPos.x) - Math.floor(VIEW / 2), 0, MAP - VIEW);
    const startY = clamp(Math.round(actorPos.y) - Math.floor(VIEW / 2), 0, MAP - VIEW);
    const ox = 4;
    const oy = 4;

    for (let yy = 0; yy < VIEW; yy += 1) {
      for (let xx = 0; xx < VIEW; xx += 1) {
        const gx = startX + xx;
        const gy = startY + yy;
        drawTile(visualEventAt(gx, gy), ox + xx * TILE, oy + yy * TILE, gx, gy);
      }
    }
    drawVisibleCities(startX, startY, ox, oy);

    const px = ox + (actorPos.x - startX) * TILE;
    const py = oy + (actorPos.y - startY) * TILE;
    drawActor(px, py);

  }

  function easeMove(t) {
    return t * t * (3 - 2 * t);
  }

  function actorVisualPosition() {
    const anim = game.moveAnim;
    if (!anim) return { x: game.x, y: game.y };
    const elapsed = performance.now() - anim.startedAt;
    const t = clamp(elapsed / anim.duration, 0, 1);
    const eased = easeMove(t);
    if (t >= 1) {
      game.moveAnim = null;
      return { x: game.x, y: game.y };
    }
    return {
      x: anim.fromX + (anim.toX - anim.fromX) * eased,
      y: anim.fromY + (anim.toY - anim.fromY) * eased
    };
  }

  function drawTitle() {
    fillRect(0, 0, W, H, "#17130f");
    if (assets.title.complete) {
      ctx.drawImage(assets.title, 0, 0);
    } else {
      fillRect(0, 0, W, 30, "#5a2d24");
      fillRect(0, 30, W, 16, "#8d6b33");
      fillRect(0, 46, W, 82, "#2f4b35");
    }
  }

  function drawStory() {
    fillRect(0, 0, W, H, "#15130d");
  }

  function drawMenu(menu) {
    const width = Math.min(menu.width || 92, 118);
    const rowH = 13;
    const height = Math.min(116, 15 + menu.items.length * rowH);
    const x = Math.floor((W - width) / 2);
    const y = Math.max(10, Math.floor((H - height) / 2));
    drawPanel(x, y, width, height);
    drawText(menu.title, x + 8, y + 5, COLORS.gold);
    menu.items.slice(0, Math.floor((height - 16) / rowH)).forEach((item, index) => {
      const iy = y + 18 + index * rowH;
      if (index === game.selected) {
        fillRect(x + 5, iy - 1, width - 10, 12, "#6a4428");
      }
      drawText(`${index === game.selected ? ">" : " "}${fitText(item.label, 12)}`, x + 9, iy, item.disabled ? "#7a7359" : COLORS.paper);
    });
  }

  function drawDialog(dialog) {
    drawPanel(6, 50, 116, 68);
    wrapText(dialog.text, 13, 57, 102, 12);
    if (dialog.confirm) {
      drawText("←是  →否", 42, 105, COLORS.gold);
    } else {
      drawText("←继续  →取消", 30, 105, COLORS.gold);
    }
  }

  function drawBattle() {
    const b = game.battle;
    fillRect(0, 0, W, H, "#18100d");
    fillRect(0, 0, W, 13, "#4c1f19");
    fillRect(8, 22, 42, 38, "#263f2b");
    fillRect(78, 22, 42, 38, "#4c2520");
    if (assets.war.complete) {
      ctx.drawImage(assets.war, 0, 0, 20, 21, 16, 31, 20, 21);
      ctx.drawImage(assets.war, 20, 0, 20, 21, 91, 31, 20, 21);
    } else {
      fillRect(18, 34, 16, 18, "#f1d35e");
      fillRect(92, 31, 15, 21, "#d65d45");
    }
    strokeRect(8, 22, 42, 38, COLORS.line);
    strokeRect(78, 22, 42, 38, COLORS.line);
    if (b) {
      const pW = clamp(Math.floor((b.troops[1] / Math.max(1, b.initialTroops[1])) * 48), 1, 48);
      const eW = clamp(Math.floor((b.troops[0] / Math.max(1, b.initialTroops[0])) * 48), 1, 48);
      fillRect(8, 80, 48, 5, "#302a20");
      fillRect(72, 80, 48, 5, "#302a20");
      fillRect(8, 80, pW, 5, COLORS.ok);
      fillRect(72, 80, eW, 5, COLORS.danger);
    }
  }

  function render() {
    ctx.imageSmoothingEnabled = false;
    if (game.screen === "title") drawTitle();
    if (game.screen === "story") drawStory();
    if (game.screen === "map" || game.screen === "menu" || game.screen === "dialog" || game.screen === "city") drawMap();
    if (game.screen === "battle") drawBattle();
    updateCityOverlay();
    updateTextOverlay();
    updateMessageOverlay();
    updateDiceOverlay();
    updateStatus();
    requestAnimationFrame(render);
  }

  function setDialog(text, onConfirm, confirm = false, options = {}) {
    stopAutoWalk(false);
    game.modeStack.push(game.screen === "dialog" ? "map" : game.screen);
    game.dialog = { text, onConfirm, confirm, ...options };
    game.screen = "dialog";
  }

  function closeDialog() {
    const prev = game.modeStack.pop() || "map";
    game.dialog = null;
    game.screen = prev === "menu" ? "map" : prev;
  }

  function openMenu(title, items, width, kind = "normal") {
    stopAutoWalk(false);
    game.menu = { title, items, width };
    game.menuKind = kind;
    game.menuReturn = game.screen === "menu" ? game.menuReturn : game.screen;
    game.selected = 0;
    game.screen = "menu";
  }

  function closeMenu() {
    const kind = game.menuKind;
    game.menu = null;
    game.menuKind = "normal";
    game.screen = game.menuReturn || "map";
    game.menuReturn = "map";
    if (kind === "cityBattleSelect") game.pendingBattle = null;
  }

  function ownedGenerals() {
    return game.generals.filter((g) => g.owned);
  }

  function mainGeneral() {
    return game.generals.find((g) => g.id === game.mainGeneralId && g.owned) || ownedGenerals()[0] || null;
  }

  function recruitableGenerals() {
    return game.generals.filter((g) => !g.owned && g.raw && g.raw[0] === 0);
  }

  function resourceIncome(event) {
    const resourceIndex = event.stratagem - 1;
    const skill = game.stratagems[event.stratagem - 1];
    const practice = game.learned[resourceIndex] || 0;
    const nearby = countNearbyResource(event.type);
    let base = Math.floor((game.soldiers * practice) / 100);
    base = Math.floor((base + 40000) / 50);
    const roll = Math.floor(base / 3) + rnd(Math.max(1, base));
    return Math.floor((nearby * roll * ((skill ? skill.count : 1) + 4)) / 30) + 180;
  }

  function countNearbyResource(type) {
    const targetType = type === "field" ? 1 : type === "forest" ? 2 : type === "water" ? 3 : 0;
    let count = 0;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    dirs.forEach(([dx, dy]) => {
      if (tileTypeAt(game.x + dx, game.y + dy) === targetType) count += 1;
    });
    return Math.max(1, count);
  }

  function handleEvent() {
    const ev = eventAt(game.x, game.y);
    if (!ev) {
      game.message = "这里是一片荒野。";
      return;
    }
    if (ev.type === "field" || ev.type === "forest" || ev.type === "water") {
      const st = game.stratagems[ev.stratagem - 1];
      const income = resourceIncome(ev);
      setDialog(`你来到一处${ev.name},组织大军${ev.verb}吗(耗体力${st.raw[1]},收入${income}黄金)?`, () => {
        if (game.stamina < st.raw[1]) {
          setDialog("体力不足,无法行动。");
          return;
        }
        game.stamina -= st.raw[1];
        game.gold += income;
        setDialog(`${ev.verb}成功,得到${income}黄金。`);
      }, true, { compactControls: true });
      return;
    }
    if (ev.type === "village") {
      openVillage();
      return;
    }
    if (ev.type === "school") {
      openSchool();
      return;
    }
    if (ev.type === "city") {
      openCity(ev.city);
    }
  }

  function openVillage() {
    const costs = [150, 300, 30, 0];
    const labels = ["陈抟老祖", "达摩祖师", "崂山道士", "村长"];
    openMenu("村庄", labels.map((label, i) => ({
      label: `${label}${costs[i] ? ` ${costs[i]}金` : ""}`,
      action: () => villageAction(i, costs[i])
    })), 102);
  }

  function villageAction(index, cost) {
    closeMenu();
    if (cost > game.gold) {
      setDialog("黄金不足。");
      return;
    }
    if (rnd(4) === 0) {
      setDialog("今日不巧,高人不在家。");
      return;
    }
    game.gold -= cost;
    if (index === 0) {
      const list = recruitableGenerals();
      if (!list.length || rnd(list.length + 4) >= list.length) {
        setDialog("陈抟老祖说: 今天没有遇到合适的英雄。");
        return;
      }
      const g = list[rnd(list.length)];
      g.owned = true;
      g.raw[0] = 1;
      setDialog(`陈抟老祖推荐${g.name}加入麾下。`);
    } else if (index === 1) {
      const candidates = game.stratagems.filter((s) => !s.owned && s.raw[0] > 0);
      const s = candidates[rnd(candidates.length)];
      s.owned = true;
      s.count = 1;
      setDialog(`达摩祖师传授了${s.name}。`);
    } else if (index === 2) {
      game.stamina = game.maxStamina;
      setDialog("崂山道士施法,体力完全恢复。");
    } else {
      const base = Math.floor(game.gold / 3);
      game.gold -= base;
      const add = Math.floor(base / 2) + rnd(Math.max(1, base));
      game.soldiers += add;
      setDialog(`村长介绍了本地的${add}个青年加入部队。你支出征兵费用${base}金。`);
    }
  }

  function openSchool() {
    openMenu("学堂", data.school.map((s) => ({
      label: `${s[0]} ${s[2]}金`,
      disabled: game.gold < s[2],
      action: () => learnAction(s)
    })), 108);
  }

  function learnAction(course) {
    if (game.gold < course[2]) return;
    closeMenu();
    game.gold -= course[2];
    const gain = rnd(4) + 1;
    const owned = ownedGenerals();
    const target = owned[rnd(owned.length + 1)];
    if (target && target.raw) {
      target.raw[course[3]] += gain;
      setDialog(`通过不断学习,${target.name}将军的${course[1]}提高了${gain}点。`);
    } else {
      game.learned[course[3] - 2] += gain;
      setDialog(`通过不断学习,歪歪的${course[1]}提高了${gain}点。`);
    }
  }

  function openCity(city) {
    refreshCityEncounter(city);
    const panel = {
      city,
      selected: 0,
      items: []
    };
    if (city.owner === 1) {
      const tax = cityTax({ ...city }, false, true);
      panel.items = [
        { label: `扩建 ${Math.floor(tax / 3)}金`, action: () => buildCity(city, Math.floor(tax / 3)) },
        { label: `征税 得${tax}金`, action: () => taxCity(city, tax) },
        { label: "征兵", action: () => draftCity(city) },
        { label: "更换将领", action: () => openCityGeneralMenu(city) }
      ];
    } else {
      const pay = cityPayment(city);
      const combatUsed = game.cityCombatUsed;
      panel.items = [
        { label: `交税(${pay}金)`, disabled: game.gold < pay, action: () => payCity(city, pay) },
        { label: combatUsed ? "袭击(本次已行动)" : `袭击(${formatCount(Math.floor(game.soldiers / 6))}兵马)`, disabled: combatUsed || game.soldiers < 2000 || ownedGenerals().length === 0 || city.soldiers <= 100, action: () => raidCity(city) },
        { label: combatUsed ? "攻城(本次已行动)" : `攻城(${formatCount(game.soldiers)}兵马)`, disabled: combatUsed || game.soldiers < 3000 || ownedGenerals().length === 0, action: () => siegeCity(city) }
      ];
    }
    game.cityPanel = panel;
    game.selected = panel.selected;
    game.screen = "city";
  }

  function closeCityPanel() {
    game.cityPanel = null;
    game.screen = "map";
    game.selected = 0;
  }

  function cityEncounterKey(city) {
    return `${city.id}:${game.x},${game.y}`;
  }

  function refreshCityEncounter(city) {
    const key = cityEncounterKey(city);
    if (game.cityEncounterKey !== key) {
      game.cityEncounterKey = key;
      game.cityCombatUsed = false;
    }
  }

  function activateCityPanel() {
    const panel = game.cityPanel;
    if (!panel) return;
    const item = panel.items[panel.selected];
    if (!item || item.disabled) return;
    game.cityPanel = null;
    game.selected = 0;
    game.screen = "map";
    item.action();
  }

  function buildCity(city, cost) {
    if (game.gold < cost) return;
    closeMenu();
    game.gold -= cost;
    const out = growCity(city, false);
    setDialog(`${city.name}扩建完成,城势提升${out}。`);
  }

  function taxCity(city, tax) {
    closeMenu();
    const income = Math.floor(cityTax(city, true, true) / 2);
    game.gold += income;
    setDialog(`${city.name}征税,得到${income}黄金。`);
  }

  function draftCity(city) {
    closeMenu();
    const can = cityTax(city, true, false);
    game.soldiers += can;
    setDialog(`${city.name}强抓壮丁,得到${can}兵马。`);
  }

  function payCity(city, pay) {
    closeMenu();
    game.gold -= pay;
    city.soldiers += pay;
    setDialog(`交纳${pay}黄金后,大军顺利通过${city.name}。`);
  }

  function openCityGeneralMenu(city) {
    const generals = ownedGenerals().filter((general) => general.raw);
    if (!generals.length) {
      setDialog("没有可派驻的将军。");
      return;
    }
    openMenu(`更换${city.name}守将`, generals.map((general) => ({
      label: `${general.name}${city.general === general.name ? " 当前" : ""}`,
      action: () => assignGeneralToCity(general, city)
    })), 128);
  }

  function assignGeneralToCity(general, city) {
    closeMenu();
    city.general = general.name;
    setDialog(`${general.name}已派驻${city.name}。`);
  }

  function raidCity(city) {
    prepareCityBattle(city, true);
  }

  function siegeCity(city) {
    prepareCityBattle(city, false);
  }

  function prepareCityBattle(city, raid) {
    if (game.cityCombatUsed) {
      setDialog("本次到达城市已经交战过,不能再次攻城或袭击。");
      return;
    }
    const generals = ownedGenerals().filter((g) => g.raw);
    if (!generals.length) {
      setDialog("没有可出战的将军。");
      return;
    }
    game.pendingBattle = { city, raid };
    openMenu(raid ? "选择袭击将军" : "选择攻城将军", generals.map((general) => ({
      label: `${general.name} 武${general.raw[2]} 智${general.raw[3]}`,
      action: () => beginCityBattle(general)
    })), 128, "cityBattleSelect");
  }

  function beginCityBattle(general) {
    const pending = game.pendingBattle;
    if (!pending) return;
    game.menu = null;
    game.menuKind = "normal";
    game.menuReturn = "map";
    game.pendingBattle = null;
    game.cityCombatUsed = true;
    startBattle(pending.city, pending.raid, general);
    game.screen = "battle";
    scheduleBattleAuto();
  }

  function generalByName(name) {
    return game.generals.find((item) => item.name === name) || null;
  }

  function generalId(general) {
    return general ? general.id : 0;
  }

  function startBattle(city, raid, attacker = mainGeneral()) {
    const defender = generalByName(city.general);
    const playerTroops = raid ? Math.floor(game.soldiers / 6) : game.soldiers;
    const reserveTroops = raid ? Math.max(0, game.soldiers - playerTroops) : 0;
    game.battle = {
      city,
      raid,
      ids: [generalId(defender), generalId(attacker)],
      generals: [defender, attacker],
      troops: [city.soldiers + 1, playerTroops + 1],
      initialTroops: [city.soldiers + 1, playerTroops + 1],
      reserveTroops,
      morale: [100, 100],
      terrain: [city.loyalty, 0],
      tick: 0,
      rounds: 0,
      escape: false,
      log: `${city.name}守军列阵, ${attacker ? attacker.name : "我军"}出战。`
    };
  }

  function openBattleMenu() {
    openMenu("战斗", [
      { label: "攻击", action: battleAttack },
      { label: "使用计谋", action: openBattleStratagemMenu },
      { label: "撤退", action: retreatBattle }
    ], 96);
  }

  function openBattleStratagemMenu() {
    const items = game.stratagems
      .filter((s) => s.owned && s.raw[0] === 2)
      .map((s) => ({
        label: `${s.name} 体${s.raw[1]}`,
        disabled: game.stamina < s.raw[1],
        action: () => useStratagem(s)
      }));
    if (!items.length) {
      setDialog("尚未掌握战斗计谋。");
      return;
    }
    openMenu("战斗计谋", items, 116);
  }

  function battleAttack() {
    closeMenu();
    clearBattleAuto();
    resolveBattleRound();
    if (game.battle && game.screen === "battle") scheduleBattleAuto();
  }

  function clearBattleAuto() {
    if (game.battleAuto) {
      window.clearTimeout(game.battleAuto);
      game.battleAuto = null;
    }
  }

  function scheduleBattleAuto(delay = 650) {
    clearBattleAuto();
    if (!game.battle || game.screen !== "battle") return;
    game.battleAuto = window.setTimeout(autoBattleStep, delay);
  }

  function autoBattleStep() {
    game.battleAuto = null;
    if (!game.battle || game.screen !== "battle") return;
    resolveBattleRound();
    if (game.battle && game.screen === "battle") scheduleBattleAuto();
  }

  function resolveBattleRound() {
    const b = game.battle;
    if (!b) return;
    const enemyLoss = heroDamage(1) + armyDamage(1);
    const playerLoss = heroDamage(0) + armyDamage(0);
    b.troops[0] = Math.max(0, b.troops[0] - enemyLoss);
    b.troops[1] = Math.max(0, b.troops[1] - playerLoss);
    if (enemyLoss > playerLoss) {
      b.morale[1] = Math.min(150, b.morale[1] + 2);
      b.morale[0] = Math.max(10, b.morale[0] - 2);
    } else if (playerLoss > enemyLoss) {
      b.morale[0] = Math.min(150, b.morale[0] + 2);
      b.morale[1] = Math.max(10, b.morale[1] - 2);
    }
    b.rounds += 1;
    b.log = `我军斩敌${enemyLoss}, 损兵${playerLoss}。`;
    finishBattleIfNeeded();
  }

  function heroDamage(side) {
    const b = game.battle;
    const general = b.generals[side];
    if (!general || !general.raw || general.raw[13] < 10) return 0;
    general.raw[13] -= 10;
    let base = Math.floor((general.raw[2] * (120 - b.terrain[1 - side])) / 120);
    if (base < 10) base = 10;
    return Math.floor(base / 2) + rnd(base);
  }

  function armyDamage(side) {
    const b = game.battle;
    const general = b.generals[side];
    const command = general && general.raw ? general.raw[4] : 60;
    let base = Math.floor((b.troops[side] * command) / 800);
    base = Math.floor((base * (120 - b.terrain[1 - side])) / 120);
    base = Math.floor((base * b.morale[side]) / 80);
    if (base < 20) base = 20;
    return Math.floor(base / 2) + rnd(base);
  }

  function retreatBattle(free = false) {
    closeMenu();
    clearBattleAuto();
    const b = game.battle;
    if (!b) return;
    const loss = free ? 0 : Math.min(b.troops[1] - 1, Math.floor(b.troops[1] / 12) + rnd(300));
    game.soldiers = Math.max(1, b.reserveTroops + b.troops[1] - loss);
    b.city.soldiers = Math.max(100, b.troops[0] - 1);
    game.battle = null;
    game.screen = "map";
    setDialog(free ? "金蝉脱壳成功,大军全身而退。" : `大军撤退,损失兵马${loss}。`);
  }

  function finishBattleIfNeeded() {
    const b = game.battle;
    if (!b) return;
    if (b.troops[1] <= 0 && b.troops[0] <= 0) {
      clearBattleAuto();
      game.soldiers = Math.max(1, b.reserveTroops + Math.floor(b.initialTroops[1] / 20));
      b.city.soldiers = Math.max(100, Math.floor(b.initialTroops[0] / 20));
      game.battle = null;
      game.screen = "map";
      setDialog("双方鏖战一整天不分胜负,各自鸣金收兵。");
    } else if (b.troops[0] <= 0) {
      clearBattleAuto();
      game.soldiers = Math.max(1, b.reserveTroops + b.troops[1] - 1);
      if (b.raid) {
        b.city.soldiers = Math.max(100, Math.floor(b.initialTroops[0] / 4));
        const killed = Math.max(0, b.initialTroops[0] - b.city.soldiers);
        const loot = Math.floor(killed / 5);
        game.gold += loot;
        game.battle = null;
        game.screen = "map";
        setDialog(`奇袭成功,斩杀敌军${killed}人,缴获${loot}黄金。`);
        return;
      }
      b.city.owner = 1;
      b.city.soldiers = Math.max(500, Math.floor(b.initialTroops[0] / 12));
      const gain = cityTax(b.city, false, false);
      game.gold += gain;
      const general = game.generals.find((item) => item.name === b.city.general);
      if (general) general.owned = true;
      const cityName = b.city.name;
      const generalName = b.city.general;
      game.battle = null;
      game.screen = "map";
      setDialog(`攻克${cityName}! 得黄金${gain}, ${generalName}归入麾下。`, checkVictory);
    } else if (b.troops[1] <= 0) {
      clearBattleAuto();
      game.soldiers = Math.max(0, b.reserveTroops);
      b.city.soldiers = Math.max(100, b.troops[0] - 1);
      game.battle = null;
      game.screen = "map";
      setDialog("兵马耗尽,歪歪复国大业失败。");
    } else if (b.rounds > 10) {
      clearBattleAuto();
      game.soldiers = Math.max(1, b.reserveTroops + b.troops[1] - 1);
      b.city.soldiers = Math.max(100, b.troops[0] - 1);
      game.battle = null;
      game.screen = "map";
      setDialog("双方鏖战一整天不分胜负,各自鸣金收兵。");
    }
  }

  function checkVictory() {
    if (game.cities.every((c) => c.owner === 1)) {
      setDialog(`经历千辛万苦,历时${game.year - 617}年,歪歪、皮皮终于统一天下。你赢得了胜利!`);
    }
  }

  function rollDice() {
    if (game.steps > 0) {
      game.message = `还需移动${game.steps}步。`;
      return;
    }
    game.diceRolls = [];
    game.dice = 0;
    for (let i = 0; i < game.diceCount; i += 1) {
      const roll = rnd(6) + 1;
      game.diceRolls.push(roll);
      game.dice += roll;
    }
    game.steps = game.dice;
    game.monthTick += 1;
    if (game.monthTick >= 30) {
      game.monthTick = 0;
      game.year += 1;
      let income = 0;
      let cityTroops = 0;
      let stationedGenerals = 0;
      game.cities.forEach((c) => {
        const out = growCity(c, true);
        if (c.owner === 1) {
          income += out;
          cityTroops += c.soldiers;
          if (c.general) stationedGenerals += 1;
        }
      });
      const generalCount = stationedGenerals + ownedGenerals().length;
      const troopCount = cityTroops + game.soldiers;
      const expense = generalCount * 50 + Math.floor(troopCount / 50);
      game.gold = Math.max(0, game.gold + income - expense);
      game.message = `岁入${income},军饷${expense},掷出${game.dice}点。`;
    } else {
      game.stamina = Math.min(game.maxStamina, game.stamina + 1 + rnd(Math.max(1, 17 - game.dice)) + game.dice);
      game.message = `掷出${game.dice}点。`;
    }
    startAutoWalk();
  }

  function move(dx, dy) {
    if (game.screen !== "map") return;
    if (game.steps <= 0) {
      game.message = "请先掷骰子。";
      return;
    }
    const nx = clamp(game.x + dx, 0, MAP - 1);
    const ny = clamp(game.y + dy, 0, MAP - 1);
    if (!isRoadTile(nx, ny)) {
      stopAutoWalk(false);
      game.message = "此处不可通行,请沿道路行走。";
      return;
    }
    const fromX = game.x;
    const fromY = game.y;
    game.x = nx;
    game.y = ny;
    game.moveAnim = {
      fromX,
      fromY,
      toX: nx,
      toY: ny,
      startedAt: performance.now(),
      duration: MOVE_ANIM_MS
    };
    game.cityEncounterKey = "";
    game.cityCombatUsed = false;
    game.steps -= 1;
    if (game.steps === 0) {
      game.message = "";
      if (game.autoTimer) window.clearTimeout(game.autoTimer);
      game.autoWalking = true;
      game.autoTimer = window.setTimeout(() => {
        game.autoTimer = 0;
        game.autoWalking = false;
        game.moveAnim = null;
        game.dice = 0;
        game.diceRolls = [];
        if (game.screen === "map") handleEvent();
      }, MOVE_ANIM_MS);
    } else {
      game.message = `还可移动${game.steps}步。`;
    }
  }

  function startAutoWalk() {
    stopAutoWalk(false);
    if (game.screen !== "map" || game.steps <= 0) return;
    game.autoWalking = true;
    game.message = `自动行走中,还剩${game.steps}步。`;
    game.autoTimer = window.setTimeout(autoWalkStep, AUTO_WALK_START_MS);
  }

  function stopAutoWalk(clearMessage = true) {
    if (game.autoTimer) {
      window.clearTimeout(game.autoTimer);
      game.autoTimer = 0;
    }
    game.autoWalking = false;
    if (clearMessage && game.screen === "map" && game.steps > 0) {
      game.message = `自动行走暂停,还剩${game.steps}步。`;
    }
  }

  function autoWalkStep() {
    if (game.screen !== "map" || game.steps <= 0) {
      stopAutoWalk(false);
      return;
    }
    const dir = chooseAutoDirection();
    if (!dir) {
      stopAutoWalk(false);
      game.message = "前方无路,请沿道路行走。";
      return;
    }
    game.lastDir = dir.index;
    move(dir.dx, dir.dy);
    if (game.screen === "map" && game.steps > 0) {
      game.message = `自动行走中,还剩${game.steps}步。`;
      game.autoTimer = window.setTimeout(autoWalkStep, MOVE_ANIM_MS + AUTO_WALK_GAP_MS);
    }
  }

  function chooseAutoDirection() {
    const dirs = [
      { index: 0, dx: 1, dy: 0 },
      { index: 1, dx: 0, dy: 1 },
      { index: 2, dx: -1, dy: 0 },
      { index: 3, dx: 0, dy: -1 }
    ];
    const reverse = (game.lastDir + 2) % 4;
    const valid = dirs.filter((dir) => canAutoMove(game.x + dir.dx, game.y + dir.dy));
    const forward = valid.find((dir) => dir.index === game.lastDir);
    const nonReverse = valid.filter((dir) => dir.index !== reverse);
    if (forward && (nonReverse.length <= 1 || rnd(100) < 85)) return forward;
    const pool = nonReverse.length ? nonReverse : valid;
    return pool.length ? pool[rnd(pool.length)] : null;
  }

  function canAutoMove(x, y) {
    return x >= 0 && y >= 0 && x < MAP && y < MAP && isRoadTile(x, y);
  }

  function openGameMenu() {
    openMenu("菜单", [
      { label: "使用计谋", action: openStratagemMenu },
      { label: "选派主将", action: openMainGeneralMenu },
      { label: "选派将军", action: openDispatchGeneralMenu },
      { label: "选择城市", action: openOwnedCityMenu },
      { label: "武将情报", action: openGeneralMenu }
    ], 102);
  }

  function openSystemMenu() {
    openMenu("系统", [
      { label: "查询情报", action: openGeneralMenu },
      { label: "结束游戏", action: () => setDialog("确定结束当前游戏吗?", endGame, true) },
      { label: "保存游戏", action: saveGame },
      { label: "读取游戏", action: loadGame },
      { label: "帮助", action: showHelp },
      { label: "退出", action: () => setDialog("网页原型中请直接关闭页面或返回标题。") }
    ], 104, "system");
  }

  function endGame() {
    clearBattleAuto();
    game.screen = "title";
    game.storyPage = 0;
    game.steps = 0;
    game.autoWalking = false;
    game.moveAnim = null;
    game.dice = 0;
    game.diceRolls = [];
    game.pendingBattle = null;
    game.cityEncounterKey = "";
    game.cityCombatUsed = false;
    game.message = "";
  }

  function saveGame() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(createSaveData()));
      setDialog("游戏已保存。");
    } catch (err) {
      setDialog("保存失败,浏览器可能禁用了本地存储。");
    }
  }

  function createSaveData() {
    return {
      version: SAVE_VERSION,
      savedAt: new Date().toISOString(),
      player: {
        x: game.x,
        y: game.y,
        gold: game.gold,
        soldiers: game.soldiers,
        stamina: game.stamina,
        maxStamina: game.maxStamina,
        year: game.year,
        monthTick: game.monthTick,
        dice: game.dice,
        diceCount: game.diceCount,
        steps: game.steps,
        lastDir: game.lastDir,
        mainGeneralId: game.mainGeneralId
      },
      learned: game.learned.slice(),
      cities: game.cities.map((city) => ({
        id: city.id,
        owner: city.owner,
        population: city.population,
        statA: city.statA,
        statB: city.statB,
        soldiers: city.soldiers,
        loyalty: city.loyalty,
        general: city.general,
        x: city.x,
        y: city.y
      })),
      generals: game.generals.map((general) => ({
        id: general.id,
        owned: !!general.owned,
        raw: general.raw ? general.raw.slice() : null
      })),
      stratagems: game.stratagems.map((stratagem) => ({
        id: stratagem.id,
        owned: !!stratagem.owned,
        count: stratagem.count,
        raw: stratagem.raw.slice()
      })),
      flags: { ...game.flags }
    };
  }

  function loadGame() {
    try {
      const text = localStorage.getItem(SAVE_KEY);
      if (!text) {
        setDialog("没有可读取的存档。");
        return;
      }
      applySaveData(JSON.parse(text));
      setDialog("游戏已读取。");
    } catch (err) {
      setDialog("读取失败,存档数据可能已损坏。");
    }
  }

  function finiteNumber(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function applySaveData(save) {
    if (!save || typeof save !== "object") throw new Error("invalid save");
    const player = save.player || save;
    clearBattleAuto();
    stopAutoWalk(false);
    game.screen = "map";
    game.storyPage = 0;
    game.x = finiteNumber(player.x, game.x);
    game.y = finiteNumber(player.y, game.y);
    game.gold = finiteNumber(player.gold, game.gold);
    game.soldiers = finiteNumber(player.soldiers, game.soldiers);
    game.stamina = finiteNumber(player.stamina, game.stamina);
    game.maxStamina = finiteNumber(player.maxStamina, game.maxStamina);
    game.year = finiteNumber(player.year, game.year);
    game.monthTick = finiteNumber(player.monthTick, game.monthTick);
    game.dice = finiteNumber(player.dice, 0);
    game.diceRolls = [];
    game.diceCount = clamp(finiteNumber(player.diceCount, 1), 1, 2);
    game.steps = Math.max(0, finiteNumber(player.steps, 0));
    game.lastDir = clamp(finiteNumber(player.lastDir, 0), 0, 3);
    game.mainGeneralId = finiteNumber(player.mainGeneralId, game.mainGeneralId);
    if (Array.isArray(save.learned)) {
      game.learned = game.learned.map((value, index) => finiteNumber(save.learned[index], value));
    }
    if (Array.isArray(save.cities)) {
      save.cities.forEach((savedCity, index) => {
        const city = game.cities[index];
        if (!city || !savedCity) return;
        city.owner = finiteNumber(savedCity.owner, city.owner);
        city.population = finiteNumber(savedCity.population, city.population);
        city.statA = finiteNumber(savedCity.statA, city.statA);
        city.statB = finiteNumber(savedCity.statB, city.statB);
        city.soldiers = finiteNumber(savedCity.soldiers, city.soldiers);
        city.loyalty = finiteNumber(savedCity.loyalty, city.loyalty);
        city.general = typeof savedCity.general === "string" ? savedCity.general : city.general;
        city.x = finiteNumber(savedCity.x, city.x);
        city.y = finiteNumber(savedCity.y, city.y);
      });
    }
    if (Array.isArray(save.generals)) {
      save.generals.forEach((savedGeneral, index) => {
        const general = game.generals[index];
        if (!general || !savedGeneral) return;
        general.owned = !!savedGeneral.owned;
        if (Array.isArray(savedGeneral.raw) && general.raw) {
          general.raw = savedGeneral.raw.map((value, rawIndex) => finiteNumber(value, general.raw[rawIndex] || 0));
        }
      });
    }
    if (Array.isArray(save.stratagems)) {
      save.stratagems.forEach((savedStratagem, index) => {
        const stratagem = game.stratagems[index];
        if (!stratagem || !savedStratagem) return;
        stratagem.owned = !!savedStratagem.owned;
        stratagem.count = finiteNumber(savedStratagem.count, stratagem.count);
        if (Array.isArray(savedStratagem.raw)) {
          stratagem.raw = savedStratagem.raw.map((value, rawIndex) => finiteNumber(value, stratagem.raw[rawIndex] || 0));
        }
      });
    }
    if (save.flags && typeof save.flags === "object") game.flags = { ...game.flags, ...save.flags };
    normalizePosition();
    game.autoWalking = false;
    game.autoTimer = 0;
    game.moveAnim = null;
    game.menu = null;
    game.menuKind = "normal";
    game.menuReturn = "map";
    game.dialog = null;
    game.cityPanel = null;
    game.modeStack = [];
    game.battle = null;
    game.pendingBattle = null;
    game.cityEncounterKey = "";
    game.cityCombatUsed = false;
    game.selected = 0;
    game.message = "游戏已读取。";
  }

  function showHelp() {
    setDialog("方向键为主,Enter/ESC兜底。地图: 左右选1/2骰,下键掷骰并自动行走,上键查武将,Enter打开游戏菜单,ESC打开系统菜单。菜单/城市/对话: 上下选择,左键或Enter确定,右键或ESC返回。战斗: 左键或Enter打开战斗菜单,右键或ESC打开系统菜单。");
  }

  function openStratagemMenu() {
    openMenu("计谋", game.stratagems.filter((s) => s.owned && s.raw[0] === 1).map((s) => ({
      label: `${s.name} 体${s.raw[1]}`,
      disabled: game.stamina < s.raw[1],
      action: () => useStratagem(s)
    })), 110);
  }

  function openMainGeneralMenu() {
    const generals = ownedGenerals().filter((general) => general.raw);
    if (!generals.length) {
      setDialog("没有可选派的主将。");
      return;
    }
    openMenu("选派主将", generals.map((general) => ({
      label: `${general.name}${game.mainGeneralId === general.id ? " 当前" : ""}`,
      action: () => {
        closeMenu();
        game.mainGeneralId = general.id;
        setDialog(`${general.name}已成为主将。`);
      }
    })), 120);
  }

  function openDispatchGeneralMenu() {
    const generals = ownedGenerals().filter((general) => general.raw);
    if (!generals.length) {
      setDialog("没有可派遣的将军。");
      return;
    }
    openMenu("选派将军", generals.map((general) => ({
      label: `${general.name} 武${general.raw[2]} 智${general.raw[3]}`,
      action: () => openDispatchCityMenu(general)
    })), 122);
  }

  function openDispatchCityMenu(general) {
    const cities = game.cities.filter((city) => city.owner === 1);
    if (!cities.length) {
      setDialog("尚无可派驻的己方城市。");
      return;
    }
    openMenu(`派驻${general.name}`, cities.map((city) => ({
      label: `${city.name}${city.general === general.name ? " 当前" : ""}`,
      action: () => assignGeneralToCity(general, city)
    })), 122);
  }

  function useStratagem(s) {
    if (game.stamina < s.raw[1]) return;
    closeMenu();
    game.stamina -= s.raw[1];
    if (game.battle && s.raw[0] === 2) {
      useBattleStratagem(s);
    } else if (!game.battle && s.raw[0] === 2) {
      game.stamina += s.raw[1];
      setDialog(`${s.name}须在战斗中使用。`);
    } else if (s.id === 4) {
      const extra = 1 + rnd(6);
      game.steps += extra;
      setDialog(originalText(s.id, 1, ["歪歪", extra], `使用${s.name},额外获得${extra}步。`));
    } else if (s.id === 5) {
      const owned = game.cities.filter((c) => c.owner === 1);
      if (!owned.length) {
        game.stamina += s.raw[1];
        setDialog("没有可转移的己方城市。");
        return;
      }
      const city = owned[rnd(owned.length)];
      [game.x, game.y] = findNearestWalkable(city.x, city.y);
      game.steps = 0;
      setDialog(originalText(s.id, 1, ["歪歪", city.name], `使用${s.name},大军转至${city.name}。`));
    } else if (s.id === 6) {
      const gain = 1 + rnd(4);
      game.maxStamina += gain;
      game.stamina = game.maxStamina;
      setDialog(originalText(s.id, 1, ["歪歪", gain], `使用${s.name},最大体力增加${gain}。`));
    } else if (s.id === 7) {
      const enemy = game.cities.filter((c) => c.owner !== 1 && c.soldiers > 100);
      if (!enemy.length) {
        game.stamina += s.raw[1];
        setDialog("没有可煽动的敌城。");
        return;
      }
      const city = enemy[rnd(enemy.length)];
      const defect = Math.min(city.soldiers - 100, 200 + rnd(Math.max(1, Math.floor(city.soldiers / 8))));
      city.soldiers -= defect;
      city.loyalty = Math.max(10, city.loyalty - 5 - rnd(10));
      game.soldiers += defect;
      setDialog(originalText(s.id, 1, ["歪歪", city.name, defect], `使用${s.name},${city.name}有${defect}兵马倒戈。`));
    } else if (s.id === 8) {
      const enemy = game.cities.filter((c) => c.owner !== 1);
      if (!enemy.length) {
        game.stamina += s.raw[1];
        setDialog("没有可游说的敌城。");
        return;
      }
      const city = enemy[rnd(enemy.length)];
      const drop = 8 + rnd(18);
      if (city.loyalty <= 35 || rnd(100) > city.loyalty + 20) {
        city.owner = 1;
        const general = game.generals.find((item) => item.name === city.general);
        if (general) general.owned = true;
        setDialog(originalText(s.id, 2, ["歪歪", city.name, city.general], `${s.name}奏效,${city.name}归顺。`), checkVictory);
      } else {
        city.loyalty = Math.max(10, city.loyalty - drop);
        setDialog(originalText(s.id, 1, ["歪歪", city.name, city.general, drop], `使用${s.name},${city.name}民心下降${drop}。`));
      }
    } else if (s.id === 9) {
      const gain = 300 + rnd(500);
      const recruits = 200 + rnd(800);
      game.gold += gain;
      game.soldiers += recruits;
      setDialog(originalText(s.id, 1, ["歪歪", gain, recruits], `使用${s.name},得到${gain}黄金和${recruits}兵马。`));
    } else if (s.id === 10) {
      const owned = game.cities.filter((c) => c.owner === 1);
      if (!owned.length) {
        game.stamina += s.raw[1];
        setDialog("没有可建设的己方城市。");
        return;
      }
      const city = owned[rnd(owned.length)];
      const build = 4 + rnd(8);
      city.statA += build;
      city.statB += Math.floor(build / 2);
      city.population += build * 500;
      setDialog(originalText(s.id, 1, ["歪歪", city.name], `使用${s.name},${city.name}建设提升${build}。`));
    } else if (s.id === 11) {
      const enemy = game.cities.filter((c) => c.owner !== 1);
      if (!enemy.length) {
        game.stamina += s.raw[1];
        setDialog("没有可破坏的敌城。");
        return;
      }
      const city = enemy[rnd(enemy.length)];
      const soldierLoss = Math.min(city.soldiers - 100, Math.floor(city.soldiers * 0.18) + rnd(900));
      const populationLoss = Math.min(city.population - 1000, 1000 + rnd(4000));
      city.soldiers -= Math.max(0, soldierLoss);
      city.population -= Math.max(0, populationLoss);
      city.statA = Math.max(1, city.statA - 2 - rnd(5));
      city.statB = Math.max(1, city.statB - 2 - rnd(5));
      city.loyalty = Math.max(10, city.loyalty - 6 - rnd(12));
      setDialog(originalText(s.id, 1, ["歪歪", city.name], `${s.name}震慑${city.name},守军减少${soldierLoss}。`));
    } else if (s.id === 12) {
      game.lastDir = (game.lastDir + 2) % 4;
      setDialog(originalText(s.id, 1, ["歪歪"], `使用${s.name},大军调整方向。`));
    } else {
      setDialog(`${s.name}效果已接入占位版,完整公式待继续反编译补齐。`);
    }
  }

  function useBattleStratagem(s) {
    const b = game.battle;
    if (!b) return;
    const level = s.count || 1;
    const tactician = b.generals[1] && b.generals[1].raw ? b.generals[1].raw : [0, 0, 70, 70, 70, 60, 100, 0, 0, 0, 0, 0, 0, 100];
    const intel = tactician[3];
    if (s.id === 13) {
      let loss = Math.floor(((b.troops[0] + 5000) / 40) * (3 + level) * intel / 300);
      loss = Math.min(b.troops[0], Math.max(1, loss));
      b.troops[0] = Math.max(0, b.troops[0] - loss);
      b.log = originalText(s.id, 1, ["歪歪", loss], `火烧联营成功,敌军损失${loss}。`);
    } else if (s.id === 14) {
      let drop = Math.floor(((3 + level) * intel) / 15);
      drop = 5 + rnd(Math.max(1, drop));
      drop = Math.min(drop, Math.max(0, b.morale[0] - 10));
      b.morale[0] -= drop;
      b.log = originalText(s.id, 1, ["歪歪", drop], `混水摸鱼得手,敌军士气下降${drop}。`);
    } else if (s.id === 15) {
      let gain = Math.floor((intel * (3 + level)) / 15);
      gain = Math.floor(gain / 3) + rnd(Math.max(1, gain));
      b.morale[1] += gain;
      b.log = originalText(s.id, 1, ["歪歪", gain], `背水一战,我军士气提高${gain}。`);
    } else if (s.id === 16) {
      const chanceBase = Math.floor((intel * (3 + level)) / 40);
      if (rnd(chanceBase + 5) <= chanceBase) {
        retreatBattle(true);
        return;
      }
      b.log = originalText(s.id, 2, ["歪歪"], "金蝉脱壳未能成功。");
    } else if (s.id === 17) {
      const target = b.generals[0];
      if (target && target.raw) {
        let loss = Math.floor(target.raw[13] / 3);
        loss = Math.floor((loss * (3 + level)) / 4);
        loss = Math.floor(loss / 3) + rnd(Math.max(1, loss));
        loss = Math.min(loss, target.raw[13]);
        target.raw[13] -= loss;
        b.log = originalText(s.id, 1, ["歪歪", target.name, loss], `擒贼擒王,${target.name}体力下降${loss}。`);
      } else {
        b.log = "敌军无主将,计谋未能奏效。";
      }
    } else if (s.id === 18) {
      let turn = Math.floor(((b.troops[0] + 2000) / 24) * (6 + level) * intel / 700);
      turn = Math.floor(turn / 3) + rnd(Math.max(1, turn));
      turn = Math.min(turn, b.troops[0]);
      b.troops[0] = Math.max(0, b.troops[0] - turn);
      b.troops[1] += turn;
      b.log = originalText(s.id, 1, ["歪歪", turn], `攻心为上动摇敌心,敌军归降${turn}。`);
    }
    finishBattleIfNeeded();
    if (game.battle) setDialog(b.log);
  }

  function openGeneralMenu() {
    const list = ownedGenerals();
    openMenu("武将", list.map((g) => ({
      label: `${g.name} 武${g.raw ? g.raw[2] : "-"} 智${g.raw ? g.raw[3] : "-"}`,
      action: () => setDialog(`${g.name}: 武力${g.raw[2]} 智力${g.raw[3]} 兵法${g.raw[4]} 内政${g.raw[5]}`)
    })), 116);
  }

  function openOwnedCityMenu() {
    const list = game.cities.filter((c) => c.owner === 1);
    openMenu("城市", list.map((c) => ({
      label: `${c.name} 兵${c.soldiers}`,
      action: () => setDialog(`${c.name}: 人口${c.population} 兵${c.soldiers} 民心${c.loyalty}`)
    })), 116);
  }

  function activate() {
    if (game.screen === "title") {
      game.screen = "story";
      return;
    }
    if (game.screen === "story") {
      game.storyPage += 1;
      if (game.storyPage >= story.length) {
        game.screen = "map";
        game.message = "西域起兵,统一全国。";
      }
      return;
    }
    if (game.screen === "dialog") {
      const d = game.dialog;
      closeDialog();
      if (d && d.onConfirm) d.onConfirm();
      return;
    }
    if (game.screen === "menu" && game.menu) {
      const item = game.menu.items[game.selected];
      if (item && !item.disabled) item.action();
      return;
    }
    if (game.screen === "city") {
      activateCityPanel();
      return;
    }
    if (game.screen === "map") openGameMenu();
  }

  function back() {
    if (game.screen === "dialog") {
      closeDialog();
    } else if (game.screen === "menu") {
      closeMenu();
    } else if (game.screen === "city") {
      closeCityPanel();
    }
  }

  function input(key) {
    if (game.screen === "city" && game.cityPanel) {
      if (key === "ArrowUp") game.cityPanel.selected = clamp(game.cityPanel.selected - 1, 0, game.cityPanel.items.length - 1);
      if (key === "ArrowDown") game.cityPanel.selected = clamp(game.cityPanel.selected + 1, 0, game.cityPanel.items.length - 1);
      game.selected = game.cityPanel.selected;
      if (key === "ArrowLeft" || key === "Enter") activateCityPanel();
      if (key === "ArrowRight" || key === "Escape") back();
      return;
    }
    if (game.screen === "menu") {
      if (key === "ArrowUp") game.selected = clamp(game.selected - 1, 0, game.menu.items.length - 1);
      if (key === "ArrowDown") game.selected = clamp(game.selected + 1, 0, game.menu.items.length - 1);
      if (key === "ArrowLeft" || key === "Enter") activate();
      if (key === "ArrowRight" || key === "Escape") back();
      return;
    }
    if (game.screen === "dialog") {
      if (key === "ArrowLeft" || key === "Enter") activate();
      if (key === "ArrowRight" || key === "Escape") back();
      return;
    }
    if (key === "ArrowRight" && game.screen === "battle") {
      openSystemMenu();
      return;
    }
    if (key === "Escape") {
      if (game.screen === "map" || game.screen === "battle") openSystemMenu();
      else back();
      return;
    }
    if (key === "Enter") activate();
    if (game.screen === "battle") {
      if (key === "ArrowLeft" || key === "Enter") openBattleMenu();
      return;
    }
    if (game.screen !== "map") return;
    if (game.autoWalking) {
      return;
    }
    if (key === "ArrowUp") {
      if (game.steps > 0) game.message = "正在按骰点自动行走。";
      else openGeneralMenu();
    }
    if (key === "ArrowDown") {
      if (game.steps > 0) game.message = "正在按骰点自动行走。";
      else rollDice();
    }
    if (key === "ArrowLeft") {
      if (game.steps > 0) game.message = "正在按骰点自动行走。";
      else {
        game.diceCount = 1;
        game.message = "选择1个骰子。";
      }
    }
    if (key === "ArrowRight") {
      if (game.steps > 0) game.message = "正在按骰点自动行走。";
      else {
        game.diceCount = 2;
        game.message = "选择2个骰子。";
      }
    }
  }

  document.addEventListener("keydown", (event) => {
    const keys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "Escape"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    input(event.key);
  });

  let lastDirectButton = null;
  let lastDirectAt = 0;

  function preventButtonDefault(event) {
    if (event.cancelable) event.preventDefault();
  }

  function handleDirectButtonEvent(event) {
    const button = event.currentTarget;
    const now = Date.now();
    preventButtonDefault(event);

    // Some WebViews emit touchstart and pointerdown for the same physical tap.
    if (button === lastDirectButton && now - lastDirectAt < 80) return;
    lastDirectButton = button;
    lastDirectAt = now;
    input(button.dataset.key);
  }

  function handleButtonClick(event) {
    const button = event.currentTarget;
    preventButtonDefault(event);

    // Ignore the delayed compatibility click after touchstart/pointerdown.
    if (button === lastDirectButton && Date.now() - lastDirectAt < 800) return;
    input(button.dataset.key);
  }

  document.querySelectorAll("button[data-key]").forEach((button) => {
    button.addEventListener("touchstart", handleDirectButtonEvent, { passive: false });
    button.addEventListener("pointerdown", handleDirectButtonEvent);
    button.addEventListener("click", handleButtonClick);
  });

  window.__WAIWAI_GAME__ = game;
  render();
})();
