--[[
  Forever XP 1.0

  Where your experience comes from (kills, quests, everything else), how fast
  it is coming in, and what the mob in front of you is worth before you kill it.

  How it counts. The XP bar is the source of truth: every change in UnitXP is
  added to the total. The chat line "X dies, you gain N experience" and the
  QUEST_TURNED_IN event only say what kind of gain it was. Whatever neither of
  them explains (exploration, mostly) still counts toward XP per hour. This client can hand
  addons "secret" text in combat; when the kill line comes through that way,
  the XP bar change that arrived with it is counted as the kill.

  How it predicts. If you have killed this mob at this level before, solo, it
  shows what it gave you. Otherwise it uses the Classic formula (level
  difference, grey cutoff, elite x2, party split) times a correction it learns
  from your own kills, because Forever's rates are not assumed to be vanilla's.

  Read-only: it watches events and draws text. It sends and clicks nothing.
]]

local ADDON = ...
local VERSION = '1.0'
local PREFIX = '|cff33ff99Forever XP:|r '

local DEFAULTS = {
  shown = true,
  locked = false,
  scale = 1,
  minimized = false,
  width = 280,
  alpha = 0.4,
  scope = 1,                -- 1 this session, 2 this level
  tooltip = true,
  levelTable = true,
  minimap = true,
  minimapAngle = 215,
}

local SCOPES = { 'This session', 'This level' }
local HEADER_H = 32
local ROW_H, ROW_GAP = 16, 2
local FIXED_ROWS = 8
local MOB_ROWS = 0             -- the per-mob list is switched off; Andres did not want it
local TABLE_SPAN = 3           -- the level table runs this many levels either side of yours
local NUM_ROWS = FIXED_ROWS + MOB_ROWS
local RATE_EVERY = 300      -- XP per hour is a reading taken every five minutes, or on the button
local FLAT = 'Interface\\Buttons\\WHITE8X8'
local FILL = 'Interface\\RaidFrame\\Raid-Bar-Hp-Fill'
local ADDON_ICON = 'Interface\\Icons\\INV_Misc_Book_11'

local db, cdb
local frame, header, titleButton, titleText, gear, mm
local rows = {}
local refresh
local SETTINGS

local function IsSecret(v)
  return issecretvalue ~= nil and issecretvalue(v) or false
end

local function plain(v)
  if IsSecret(v) then return nil end
  return v
end

local function say(message)
  DEFAULT_CHAT_FRAME:AddMessage(PREFIX .. message)
end

local function hasAtlas(name)
  return C_Texture and C_Texture.GetAtlasInfo and C_Texture.GetAtlasInfo(name) ~= nil
end

local function setAtlas(tex, name, fallback)
  if hasAtlas(name) then
    tex:SetAtlas(name, false)
    return true
  end
  if fallback then tex:SetTexture(fallback) end
  return false
end

local function commas(n)
  n = math.floor(n + 0.5)
  if BreakUpLargeNumbers then return BreakUpLargeNumbers(n) end
  local s = tostring(n)
  local out = s:reverse():gsub('(%d%d%d)', '%1,'):reverse()
  return (out:gsub('^,', ''))
end

local function short(n)
  if n >= 1e6 then return string.format('%.2fm', n / 1e6) end
  if n >= 1e4 then return string.format('%.1fk', n / 1e3) end
  return commas(n)
end

local function duration(sec)
  if not sec or sec ~= sec or sec == math.huge then return '--' end
  if sec >= 3600 then return string.format('%dh %02dm', sec / 3600, (sec % 3600) / 60) end
  if sec >= 60 then return string.format('%dm', sec / 60) end
  return string.format('%ds', sec)
end

-- The Classic mob XP formula ---------------------------------------------------

local function zeroDifference(level)
  if level <= 7 then return 5 end
  if level <= 9 then return 6 end
  if level <= 11 then return 7 end
  if level <= 15 then return 8 end
  if level <= 19 then return 9 end
  if level <= 29 then return 11 end
  if level <= 39 then return 12 end
  if level <= 44 then return 13 end
  if level <= 49 then return 14 end
  if level <= 54 then return 15 end
  if level <= 59 then return 16 end
  return 17
end

local function grayLevel(level)
  if level <= 5 then return 0 end
  if level <= 39 then return level - math.floor(level / 10) - 5 end
  if level <= 59 then return level - math.floor(level / 5) - 1 end
  return level - 9
end

-- XP for one normal mob, killed solo, no rest.
local function formulaXP(playerLevel, mobLevel)
  if mobLevel <= grayLevel(playerLevel) then return 0 end
  local base = playerLevel * 5 + 45
  if mobLevel >= playerLevel then
    local diff = math.min(mobLevel - playerLevel, 4)
    return math.floor(base * (1 + 0.05 * diff) + 0.5)
  end
  local zd = zeroDifference(playerLevel)
  return math.max(0, math.floor(base * (1 - (playerLevel - mobLevel) / zd) + 0.5))
end

local PARTY_BONUS = { 1, 1, 1.166, 1.3, 1.4 }

-- Counting ---------------------------------------------------------------------

local function newStats()
  return { total = 0, mob = 0, quest = 0, kills = 0, quests = 0, rested = 0, seconds = 0, mobs = {} }
end

local session = newStats()
local sessionStart
local lastXP, lastMax, lastLevel
local recentKills = {}      -- last ten kill amounts, for "kills to level"
local lastKill              -- { name, amount, rested }
local labels, deltas = {}, {}
local seen = {}             -- mob name -> { level, elite, mixed }
local resolveQueued = false
local trace = 'not entered yet'
local entered, resumed = false, false
local rate, rateAt          -- the last XP per hour reading and when it was taken
local shownRows = FIXED_ROWS

local function levelStats()
  local level = plain(UnitLevel('player')) or 0
  -- Right after a cold login the game can report level 0 for a moment. That is
  -- not a level change, and treating it as one wiped the level's numbers.
  if type(cdb.level) == 'table' and (level < 1 or (cdb.level.level or 0) < 1) then
    if level >= 1 then cdb.level.level = level end
    return cdb.level
  end
  if type(cdb.level) ~= 'table' or cdb.level.level ~= level then
    -- The level just finished goes into the history that /fxp export reads.
    local old = cdb.level
    if type(old) == 'table' and type(old.level) == 'number' and old.level > 0 and old.level < level
      and ((old.total or 0) > 0 or (old.mob or 0) > 0 or (old.quest or 0) > 0) then
      old.seconds = (old.seconds or 0) + (GetTime() - (cdb.levelClock or GetTime()))
      old.finished = date and date('%Y-%m-%d %H:%M') or nil
      old.mobs = nil
      if type(cdb.history) ~= 'table' then cdb.history = {} end
      cdb.history[old.level] = old
    end
    cdb.level = newStats()
    cdb.level.level = level
    -- Started watching partway through this level (first install, or a level
    -- played without the addon), so its totals do not cover the whole level.
    local xp = plain(UnitXP('player'))
    cdb.level.partial = (lastLevel == level and xp and xp > 0) or nil
    cdb.levelClock = GetTime()
  end
  return cdb.level
end

local function credit(field, amount, countField)
  local perLevel = levelStats()
  -- A kill or turn-in that caused a level-up can be reported after the level
  -- number has already changed. It belongs to the level it finished.
  if field ~= 'total' and lastLevel and perLevel.level > lastLevel
    and type(cdb.history) == 'table' and cdb.history[lastLevel] then
    perLevel = cdb.history[lastLevel]
  end
  for _, s in ipairs({ session, perLevel }) do
    s[field] = (s[field] or 0) + amount
    if countField then s[countField] = (s[countField] or 0) + 1 end
  end
end

local function isElite(unit)
  local c = plain(UnitClassification(unit))
  return c == 'elite' or c == 'rareelite' or c == 'worldboss'
end

local function remember(unit)
  local ok = pcall(function()
    if not UnitExists(unit) or not UnitCanAttack('player', unit) then return end
    if UnitIsPlayer(unit) or UnitPlayerControlled(unit) then return end
    local name, level = plain(UnitName(unit)), plain(UnitLevel(unit))
    if not name or not level or level < 1 then return end
    local s = seen[name]
    if not s then
      seen[name] = { level = level, elite = isElite(unit) }
    elseif s.level ~= level then
      s.mixed = true
      s.level = level
    end
  end)
  return ok
end

-- Which level was the mob that just died? The chat line only gives its name.
local function killedLevel(name)
  local level, elite, tapDenied
  pcall(function()
    if UnitExists('target') and UnitIsDead('target') and plain(UnitName('target')) == name then
      level = plain(UnitLevel('target'))
      elite = isElite('target')
    end
  end)
  if not level then
    local s = seen[name]
    if s and not s.mixed then level, elite = s.level, s.elite end
  end
  if level and level < 1 then level = nil end
  return level, elite
end

-- XP buffs (the 5% food and anything like it). Found by reading the player's
-- buffs and looking for one whose description talks about experience and a
-- percent. Learned values are stored as if no buff were on, and predictions
-- are multiplied by whatever is on right now. In combat the game may hide the
-- buff list; then the last plain reading stands.
local buffMult, buffNames = 1, {}

local function spellText(spellId)
  local ok, text
  if C_Spell and C_Spell.GetSpellDescription then
    ok, text = pcall(C_Spell.GetSpellDescription, spellId)
  elseif GetSpellDescription then
    ok, text = pcall(GetSpellDescription, spellId)
  end
  text = ok and plain(text) or nil
  return type(text) == 'string' and text or nil
end

-- The words on the buff itself, which is where "Experience gained from kills
-- increased by 5%" lives. The spell's own description is often empty for a
-- food buff, so the buff's tooltip is read first, three different ways.
local scanTip
local buffSeen = {}

local function auraText(index, spellId)
  local parts = {}
  local function addLines(data)
    if type(data) ~= 'table' or type(data.lines) ~= 'table' then return end
    for _, line in ipairs(data.lines) do
      local text = plain(line.leftText)
      if type(text) == 'string' then parts[#parts + 1] = text end
    end
  end
  if C_TooltipInfo then
    for _, fn in ipairs({ C_TooltipInfo.GetUnitBuff, C_TooltipInfo.GetUnitAura }) do
      if fn and #parts == 0 then
        local ok, data = pcall(fn, 'player', index, 'HELPFUL')
        if ok then addLines(data) end
      end
    end
  end
  if #parts == 0 then
    pcall(function()
      scanTip = scanTip or CreateFrame('GameTooltip', 'ForeverXPScanTip', nil, 'GameTooltipTemplate')
      scanTip:SetOwner(WorldFrame or UIParent, 'ANCHOR_NONE')
      scanTip:ClearLines()
      if scanTip.SetUnitBuff then scanTip:SetUnitBuff('player', index) else scanTip:SetUnitAura('player', index, 'HELPFUL') end
      for k = 1, scanTip:NumLines() do
        local fs = _G['ForeverXPScanTipTextLeft' .. k]
        local text = fs and plain(fs:GetText())
        if type(text) == 'string' then parts[#parts + 1] = text end
      end
    end)
  end
  if spellId then
    local text = spellText(spellId)
    if text then parts[#parts + 1] = text end
  end
  return table.concat(parts, ' ')
end

local function xpPercent(text)
  text = text:lower():gsub('%s+', ' ')
  if not text:find('experience') then return nil end
  return tonumber(text:match('experience.-(%d+)%%') or text:match('(%d+)%%.-experience'))
end

local function scanBuffs()
  local total, names = 0, {}
  local seenNow = {}
  for i = 1, 40 do
    local name, spellId
    if C_UnitAuras and C_UnitAuras.GetAuraDataByIndex then
      local ok, aura = pcall(C_UnitAuras.GetAuraDataByIndex, 'player', i, 'HELPFUL')
      if not ok or not aura then break end
      name, spellId = aura.name, aura.spellId
    elseif UnitBuff then
      local n, _, _, _, _, _, _, _, _, id = UnitBuff('player', i)
      if not n then break end
      name, spellId = n, id
    else
      break
    end
    if IsSecret(name) or IsSecret(spellId) then return end   -- hidden: keep the last reading
    -- The buff's own words decide. A Well Fed without the experience line is
    -- not an XP buff, whatever its name. A name taught by hand only counts when
    -- the game gave no words to read at all.
    local text = auraText(i, spellId)
    local pct = xpPercent(text)
    if not pct and text == '' and name then pct = db.xpBuffs[name] end
    seenNow[#seenNow + 1] = string.format('%s [%s]', tostring(name), text ~= '' and text:sub(1, 60) or 'no text readable')
    if pct and pct > 0 and pct <= 300 then
      total = total + pct
      names[#names + 1] = string.format('%s +%d%%', tostring(name), pct)
    end
  end
  buffMult, buffNames, buffSeen = 1 + total / 100, names, seenNow
end

local function learn(name, base)
  if IsInGroup() or base <= 0 then return end
  base = math.floor(base / buffMult * 100 + 0.5) / 100   -- stored as if no XP buff were on
  local playerLevel = lastLevel or plain(UnitLevel('player'))
  local mobLevel, elite = killedLevel(name)
  if not playerLevel or not mobLevel then return end

  db.learned[name] = db.learned[name] or {}
  db.learned[name][mobLevel .. ':' .. playerLevel] = base
  if not elite then
    -- What a plain mob of this level gave at this level, for the level table.
    db.byLevel = db.byLevel or {}
    db.byLevel[playerLevel .. ':' .. mobLevel] = base
  end

  local expected = formulaXP(playerLevel, mobLevel) * (elite and 2 or 1)
  if expected > 0 then
    local ratio = base / expected
    if ratio > 0.2 and ratio < 20 then
      db.calib = db.calib and (db.calib * 0.8 + ratio * 0.2) or ratio
      db.calibN = (db.calibN or 0) + 1
    end
  end
end

local function addKill(name, amount, rested, mobLevel)
  credit('mob', amount, 'kills')
  if rested and rested > 0 then credit('rested', rested) end
  recentKills[#recentKills + 1] = amount
  if #recentKills > 10 then table.remove(recentKills, 1) end
  lastKill = { name = name, amount = amount, rested = rested or 0 }
  if cdb then cdb.lastKill = lastKill end

  -- The per-mob counter: one line per mob name and level.
  local level = mobLevel
  local key = name .. ':' .. (level or '?')
  for _, s in ipairs({ session, levelStats() }) do
    s.mobs = s.mobs or {}
    local m = s.mobs[key]
    if not m then
      m = { name = name, level = level, kills = 0, xp = 0 }
      s.mobs[key] = m
    end
    m.kills = m.kills + 1
    m.xp = m.xp + amount
    m.each = amount - (rested or 0)
    m.at = GetTime()
  end
end

-- Pair each label (a kill line, a quest turn-in) with the XP bar change that
-- came with it. A kill whose chat line was hidden takes its amount from there.
local function resolve()
  resolveQueued = false
  local now = GetTime()
  local function claim(label, exact)
    local best
    for _, d in ipairs(deltas) do
      if not d.claimed and math.abs(d.t - label.t) <= 2 and (not exact or d.amount == label.amount) then
        if not best or math.abs(d.t - label.t) < math.abs(best.t - label.t) then best = d end
      end
    end
    if best then best.claimed = true end
    return best
  end
  for _, l in ipairs(labels) do
    if not l.done and l.amount then
      l.done = true
      if not claim(l, true) then claim(l, false) end
    end
  end
  for _, l in ipairs(labels) do
    if not l.done and now - l.t >= 0.4 then
      l.done = true
      local d = claim(l, false)
      if d then addKill('A kill (amount hidden in chat)', d.amount, 0) end
    end
  end
  for i = #labels, 1, -1 do if now - labels[i].t > 10 then table.remove(labels, i) end end
  for i = #deltas, 1, -1 do if now - deltas[i].t > 10 then table.remove(deltas, i) end end
  if refresh then refresh() end
end

local function queueResolve()
  if resolveQueued then return end
  resolveQueued = true
  C_Timer.After(0.5, resolve)
end

-- "%s dies, you gain %d experience." turned into a Lua pattern, so the mob's
-- name and the amount come out whatever language the client is in.
local killPattern
local function buildKillPattern()
  local s = COMBATLOG_XPGAIN_FIRSTPERSON or '%s dies, you gain %d experience.'
  s = s:gsub('%.$', '')
  s = s:gsub('%%%d?%$?s', '\1'):gsub('%%%d?%$?d', '\2')
  s = s:gsub('([%(%)%.%+%-%*%?%[%]%^%$%%])', '%%%1')
  s = s:gsub('\1', '(.-)'):gsub('\2', '(%%d+)')
  killPattern = '^' .. s
end

local function onXPChat(text)
  if IsSecret(text) then
    labels[#labels + 1] = { t = GetTime(), kind = 'mob' }
    queueResolve()
    return
  end
  if type(text) ~= 'string' then return end
  if not killPattern then buildKillPattern() end
  local name, amount = text:match(killPattern)
  amount = tonumber(amount)
  if not name or name == '' or not amount then return end   -- quest and exploration lines carry no name
  -- "(+62 exp Rested bonus)": the amount above already includes it.
  local rested = 0
  local bonus, kind = text:match('%(%+(%d+) [^%)]-(%a+) bonus%)')
  if bonus and kind and kind:lower() == 'rested' then rested = tonumber(bonus) or 0 end

  addKill(name, amount, rested, (killedLevel(name)))
  pcall(learn, name, amount - rested)
  labels[#labels + 1] = { t = GetTime(), kind = 'mob', amount = amount, done = false }
  queueResolve()
end

local function onQuestTurnedIn(_, xpReward)
  xpReward = tonumber(plain(xpReward))
  if not xpReward or xpReward <= 0 then return end
  credit('quest', xpReward, 'quests')
  labels[#labels + 1] = { t = GetTime(), kind = 'quest', amount = xpReward, done = false }
  queueResolve()
end

local function onXPUpdate()
  local xp, max, level = plain(UnitXP('player')), plain(UnitXPMax('player')), plain(UnitLevel('player'))
  if not (xp and max and level) then return end   -- hidden right now; the next plain read catches up
  if level < 1 or max <= 0 then return end          -- not loaded yet, just after a cold login
  if lastXP then
    local delta = xp - lastXP
    if level > lastLevel or delta < 0 then delta = (lastMax - lastXP) + xp end
    if delta > 0 then
      local old = type(cdb.level) == 'table' and cdb.level.level == lastLevel and cdb.level
        or (type(cdb.history) == 'table' and cdb.history[lastLevel])
      if level > lastLevel and old then
        -- The part of this gain that finished the old level belongs to it.
        local finishing = math.min(delta, math.max(0, lastMax - lastXP))
        old.total = (old.total or 0) + finishing
        session.total = session.total + finishing
        delta = delta - finishing
        lastLevel = level
        levelStats()
      end
      credit('total', delta)
      deltas[#deltas + 1] = { t = GetTime(), amount = delta }
      queueResolve()
    end
  end
  lastXP, lastMax, lastLevel = xp, max, level
  levelStats()
end

-- Quests waiting to be handed in ---------------------------------------------

-- Walks the quest log with whichever API this client has. A quest counts when
-- the game marks it complete, or when it has no objectives at all (a delivery
-- or "speak with" quest is ready the moment you hold it).
local function scanQuests()
  local ready = { count = 0, xp = 0, unknown = 0 }
  local function add(questID, index)
    ready.count = ready.count + 1
    local xp
    if questID and GetQuestLogRewardXP then
      local ok, v = pcall(GetQuestLogRewardXP, questID)
      xp = ok and tonumber(plain(v)) or nil
    end
    if xp and xp > 0 then ready.xp = ready.xp + xp else ready.unknown = ready.unknown + 1 end
  end

  if C_QuestLog and C_QuestLog.GetNumQuestLogEntries and C_QuestLog.GetInfo then
    for i = 1, C_QuestLog.GetNumQuestLogEntries() do
      local info = C_QuestLog.GetInfo(i)
      if info and not info.isHeader and not info.isHidden and info.questID then
        local id = info.questID
        local done = (C_QuestLog.ReadyForTurnIn and C_QuestLog.ReadyForTurnIn(id))
          or (C_QuestLog.IsComplete and C_QuestLog.IsComplete(id))
        if not done and C_QuestLog.GetQuestObjectives and not (C_QuestLog.IsFailed and C_QuestLog.IsFailed(id)) then
          local objectives = C_QuestLog.GetQuestObjectives(id)
          done = type(objectives) == 'table' and #objectives == 0
        end
        if done then add(id, i) end
      end
    end
  elseif GetNumQuestLogEntries and GetQuestLogTitle then
    for i = 1, GetNumQuestLogEntries() do
      local _, _, _, isHeader, _, isComplete, _, questID = GetQuestLogTitle(i)
      if not isHeader then
        local done = isComplete == 1 or isComplete == true
        if not done and isComplete == nil and GetNumQuestLeaderBoards and GetNumQuestLeaderBoards(i) == 0 then
          done = true
        end
        if done then add(questID, i) end
      end
    end
  end
  frame.ready = ready
end

-- Prediction -------------------------------------------------------------------

local function atMaxLevel()
  local level = plain(UnitLevel('player'))
  local cap = GetMaxPlayerLevel and plain(GetMaxPlayerLevel()) or 60
  if IsXPUserDisabled and IsXPUserDisabled() then return true end
  return level and cap and level >= cap
end

-- Returns nil when the unit is not something that gives XP, otherwise
-- { xp, rested, approx, known, note }.
local function predict(unit)
  if not UnitExists(unit) or not UnitCanAttack('player', unit) then return nil end
  if UnitIsPlayer(unit) or UnitPlayerControlled(unit) or UnitIsDead(unit) then return nil end
  local playerLevel, mobLevel = plain(UnitLevel('player')), plain(UnitLevel(unit))
  local name = plain(UnitName(unit))
  if not playerLevel or not mobLevel then return nil end
  if atMaxLevel() then return { xp = 0, rested = 0, note = 'max level' } end

  local p = { xp = 0, rested = 0 }
  if UnitIsTapDenied and plain(UnitIsTapDenied(unit)) then
    p.note = 'tagged by someone else'
    return p
  end
  if mobLevel < 1 then
    -- Skull: the game will not say its level. Treat it as the cap of the formula.
    mobLevel, p.approx = playerLevel + 10, true
  end
  if UnitIsTrivial and plain(UnitIsTrivial(unit)) then
    p.note = 'grey'
    return p
  end

  local grouped = IsInGroup()
  local known = not grouped and name and db.learned[name] and db.learned[name][mobLevel .. ':' .. playerLevel]
  local xp
  if known then
    xp, p.known = known, true
  else
    local calcLevel, sum, n = playerLevel, playerLevel, 1
    if grouped and not IsInRaid() then
      for i = 1, GetNumGroupMembers() - 1 do
        local l = plain(UnitLevel('party' .. i))
        if l and l > 0 then
          sum, n = sum + l, n + 1
          if l > calcLevel then calcLevel = l end
        end
      end
    end
    xp = formulaXP(calcLevel, mobLevel)
    if isElite(unit) then xp = xp * 2 end
    if (db.calibN or 0) >= 3 and db.calib then xp = xp * db.calib else p.approx = true end
    if grouped then
      p.approx = true
      if IsInRaid() then
        p.note = 'raid, less than this'
      else
        xp = xp * playerLevel / sum * (PARTY_BONUS[n] or 1.4)
      end
    end
    if xp == 0 then p.note = 'grey' end
  end
  p.xp = math.floor(xp * buffMult + 0.5)

  local pool = plain(GetXPExhaustion and GetXPExhaustion() or nil)
  if pool and pool > 0 then p.rested = math.min(p.xp, pool) end
  return p
end

local function predictionText(p, long)
  if p.note and p.xp == 0 then return p.note == 'grey' and 'grey, no XP' or p.note end
  local total = p.xp + p.rested
  local text = (p.approx and '~' or '') .. commas(total)
  if long then
    text = text .. ' XP'
    if p.rested > 0 then text = text .. string.format(' (%s rested)', commas(p.rested)) end
  end
  if lastXP and lastMax and lastMax > 0 and total > 0 then
    text = text .. string.format('  %.1f%%', total / lastMax * 100)
    text = text .. string.format('  %d kills', math.ceil((lastMax - lastXP) / total))
  end
  if p.note then text = text .. ' (' .. p.note .. ')' end
  return text
end

local function tooltipLine(tooltip)
  if not db or not db.tooltip or tooltip ~= GameTooltip then return end
  pcall(function()
    local unit = 'mouseover'
    if tooltip.GetUnit then
      local _, u = tooltip:GetUnit()
      u = plain(u)
      if u then unit = u end
    end
    remember(unit)
    local p = predict(unit)
    if not p then return end
    tooltip:AddDoubleLine('Experience', predictionText(p, true), 0.6, 0.5, 1, 1, 1, 1)
    tooltip:Show()
  end)
end

-- A small menu of our own -------------------------------------------------------

local menu, catcher
local menuLines = {}

local function buildMenu()
  catcher = CreateFrame('Button', nil, UIParent)
  catcher:SetAllPoints(UIParent)
  catcher:SetFrameStrata('FULLSCREEN')
  catcher:RegisterForClicks('AnyUp')
  catcher:SetScript('OnClick', function() menu:Hide() end)
  catcher:Hide()

  menu = CreateFrame('Frame', 'ForeverXPMenu', UIParent, BackdropTemplateMixin and 'BackdropTemplate' or nil)
  menu:SetFrameStrata('FULLSCREEN_DIALOG')
  menu:SetClampedToScreen(true)
  if menu.SetBackdrop then
    menu:SetBackdrop({
      bgFile = FLAT, edgeFile = 'Interface\\Tooltips\\UI-Tooltip-Border',
      edgeSize = 12, insets = { left = 3, right = 3, top = 3, bottom = 3 },
    })
    menu:SetBackdropColor(0, 0, 0, 0.92)
    menu:SetBackdropBorderColor(0.45, 0.45, 0.5, 1)
  end
  menu:SetScript('OnHide', function() catcher:Hide() end)
  menu:Hide()
  if UISpecialFrames then table.insert(UISpecialFrames, 'ForeverXPMenu') end
end

local function menuLine(i)
  local line = menuLines[i]
  if line then return line end
  line = CreateFrame('Button', nil, menu)
  line:SetHeight(18)
  line:SetPoint('TOPLEFT', 8, -8 - (i - 1) * 18)
  line:SetPoint('RIGHT', -8, 0)
  line.check = line:CreateTexture(nil, 'ARTWORK')
  line.check:SetTexture('Interface\\Buttons\\UI-CheckBox-Check')
  line.check:SetSize(16, 16)
  line.check:SetPoint('LEFT')
  line.text = line:CreateFontString(nil, 'OVERLAY', 'GameFontHighlightSmall')
  line.text:SetPoint('LEFT', 20, 0)
  local hl = line:CreateTexture(nil, 'HIGHLIGHT')
  hl:SetAllPoints()
  hl:SetTexture(FLAT)
  hl:SetVertexColor(1, 1, 1, 0.12)
  menuLines[i] = line
  return line
end

local function showMenu(anchor, items)
  if not menu then buildMenu() end
  if menu:IsShown() and menu.anchor == anchor then menu:Hide() return end
  menu.anchor = anchor

  local function fill()
    local width = 120
    for i, item in ipairs(items) do
      local line = menuLine(i)
      line.text:SetText(type(item.text) == 'function' and item.text() or item.text)
      if item.title then
        line.text:SetTextColor(1, 0.82, 0)
        line:Disable()
      else
        line.text:SetTextColor(1, 1, 1)
        line:Enable()
      end
      if item.checked and item.checked() then line.check:Show() else line.check:Hide() end
      line:SetScript('OnClick', function()
        item.click()
        if item.close then menu:Hide() else fill() end
      end)
      line:Show()
      local w = line.text:GetStringWidth() + 44
      if w > width then width = w end
    end
    for i = #items + 1, #menuLines do menuLines[i]:Hide() end
    menu:SetSize(width, #items * 18 + 16)
  end

  fill()
  menu:ClearAllPoints()
  menu:SetPoint('TOPLEFT', anchor, 'BOTTOMLEFT', 0, -2)
  catcher:Show()
  menu:Show()
end

-- Drawing ----------------------------------------------------------------------

local function buildRow(i, parent, top, store)
  parent = parent or frame
  local row = CreateFrame('Frame', nil, parent == frame and frame.body or parent)
  row:SetHeight(ROW_H)
  row:SetPoint('TOPLEFT', parent, 'TOPLEFT', 6, -((top or (HEADER_H + 5)) + (i - 1) * (ROW_H + ROW_GAP)))
  row:SetPoint('RIGHT', parent, 'RIGHT', -6, 0)

  row.bar = CreateFrame('StatusBar', nil, row)
  row.bar:SetAllPoints()
  if hasAtlas('UI-HUD-CoolDownManager-Bar') then
    row.bar:SetStatusBarTexture('UI-HUD-CoolDownManager-Bar')
  else
    row.bar:SetStatusBarTexture(FILL)
  end
  row.bar:SetMinMaxValues(0, 100)
  row.bar:SetValue(0)

  row.bg = row.bar:CreateTexture(nil, 'BACKGROUND')
  row.bg:SetPoint('TOPLEFT', -2, 2)
  row.bg:SetPoint('BOTTOMRIGHT', 2, -2)
  if not setAtlas(row.bg, 'ui-damagemeters-bar-shadowbg', FLAT) then
    row.bg:SetVertexColor(0, 0, 0, 0.45)
  end

  local font = NumberFontNormal and 'NumberFontNormal' or 'GameFontHighlightSmall'
  row.left = row.bar:CreateFontString(nil, 'OVERLAY', font)
  row.left:SetPoint('LEFT', 4, 0)
  row.left:SetJustifyH('LEFT')
  row.left:SetWordWrap(false)
  row.right = row.bar:CreateFontString(nil, 'OVERLAY', font)
  row.right:SetPoint('RIGHT', -4, 0)
  row.right:SetJustifyH('RIGHT')
  row.left:SetPoint('RIGHT', row.right, 'LEFT', -6, 0)
  for _, fs in ipairs({ row.left, row.right }) do
    local file, size, flags = fs:GetFont()
    if file and size then fs:SetFont(file, size * 0.9, flags) end
  end
  (store or rows)[i] = row
  return row
end

local function setRow(i, left, right, pct, r, g, b)
  local row = rows[i]
  row.left:SetText(left or '')
  row.right:SetText(right or '')
  row.bar:SetValue(pct or 0)
  row.bar:SetStatusBarColor(r or 0.16, g or 0.16, b or 0.16)
end

-- The level table: what a plain mob of each level near yours gives, and how
-- many of them it takes to finish the level. A figure you have actually seen
-- at this level is used as is; the rest come from the formula and carry a "~".
local levelRows = {}

local function killsNeeded(toGo, xp, pool)
  if xp <= 0 then return nil end
  local kills = 0
  while toGo > 0 and kills < 5000 do
    local bonus = math.min(xp, pool)
    pool = pool - bonus
    toGo = toGo - xp - bonus
    kills = kills + 1
  end
  return kills
end

local function difficultyColor(diff, grey)
  if grey then return 0.55, 0.55, 0.55 end
  if diff >= 5 then return 1, 0.1, 0.1 end
  if diff >= 3 then return 1, 0.5, 0.25 end
  if diff >= -2 then return 1, 1, 0 end
  return 0.25, 0.75, 0.25
end

local function drawLevelTable()
  local panel = frame.levelPanel
  if not panel or not panel:IsShown() then return end
  local playerLevel = lastLevel or plain(UnitLevel('player'))
  if not playerLevel then return end
  local toGo = (lastXP and lastMax) and (lastMax - lastXP) or nil
  local pool = plain(GetXPExhaustion and GetXPExhaustion() or nil) or 0
  local calibrated = (db.calibN or 0) >= 3 and db.calib
  local capped = atMaxLevel()

  if buffMult > 1 then
    panel.title:SetText(string.format('XP per kill and kills to level (+%d%% buff on)', (buffMult - 1) * 100 + 0.5))
  else
    panel.title:SetText('XP per kill and kills to level, by mob level')
  end

  local lines, best = {}, 1
  for diff = TABLE_SPAN, -TABLE_SPAN, -1 do
    local mobLevel = playerLevel + diff
    if mobLevel >= 1 then
      local seenXP = db.byLevel and db.byLevel[playerLevel .. ':' .. mobLevel]
      local xp = (seenXP or formulaXP(playerLevel, mobLevel) * (calibrated or 1)) * buffMult
      xp = math.floor(xp + 0.5)
      if xp > best then best = xp end
      lines[#lines + 1] = { level = mobLevel, diff = diff, xp = xp, approx = not seenXP }
    end
  end
  for i = 1, TABLE_SPAN * 2 + 1 do
    local row, l = levelRows[i], lines[i]
    if l then
      local left = 'Level ' .. l.level .. (l.diff == 0 and '  (your level)' or '')
      local right
      if capped then
        right = 'max level'
      elseif l.xp <= 0 then
        right = 'grey, no XP'
      else
        local kills = toGo and killsNeeded(toGo, l.xp, pool)
        right = string.format('%s%s XP    %s kills', l.approx and '~' or '', commas(l.xp), kills and commas(kills) or '--')
      end
      row.left:SetText(left)
      row.left:SetTextColor(difficultyColor(l.diff, l.xp <= 0))
      row.right:SetText(right)
      row.bar:SetValue(l.xp / best * 100)
      row.bar:SetStatusBarColor(0.22, 0.22, 0.22)
      row:Show()
    else
      row:Hide()
    end
  end
end

local function targetUnit()
  for _, unit in ipairs({ 'target', 'mouseover' }) do
    local ok, p = pcall(predict, unit)
    if ok and p then return unit, p end
  end
end

refresh = function()
  if not frame or not frame:IsShown() or db.minimized then return end
  local s = db.scope == 2 and levelStats() or session
  local now = GetTime()

  -- 1. The level itself. If the game is hiding XP, the bar can still be fed.
  local xp, max = UnitXP('player'), UnitXPMax('player')
  local level = plain(UnitLevel('player')) or 0
  local pool = plain(GetXPExhaustion and GetXPExhaustion() or nil)
  local r, g, b = 0.58, 0, 0.55
  if pool and pool > 0 then r, g, b = 0, 0.39, 0.88 end
  if IsSecret(xp) or IsSecret(max) then
    rows[1].bar:SetMinMaxValues(0, max)
    rows[1].bar:SetValue(xp)
    rows[1].bar:SetStatusBarColor(r, g, b)
    rows[1].left:SetText('Level ' .. level)
    rows[1].right:SetText('hidden in combat')
  else
    rows[1].bar:SetMinMaxValues(0, 100)
    local pct = max > 0 and xp / max * 100 or 0
    local right = string.format('%s / %s  %d%%', commas(xp), commas(max), pct)
    setRow(1, 'Level ' .. level, right, pct, r, g, b)
  end

  -- 2-3. Where it came from.
  local whole = math.max(s.mob + s.quest, 1)
  local function share(v) return v / whole * 100 end
  setRow(2, string.format('Kills (%d)', s.kills), string.format('%s  %d%%', short(s.mob), share(s.mob)), share(s.mob), 0.70, 0.22, 0.18)
  setRow(3, string.format('Quests (%d)', s.quests), string.format('%s  %d%%', short(s.quest), share(s.quest)), share(s.quest), 0.85, 0.62, 0.08)

  -- 4. Quests finished but not handed in: how many, what they pay, and where
  -- on the level bar handing them all in would leave you.
  local rdy = frame.ready or { count = 0, xp = 0, unknown = 0 }
  local rightText, after = '--', 0
  if rdy.count > 0 then
    if rdy.xp > 0 and lastXP and lastMax and lastMax > 0 then
      local sum = lastXP + rdy.xp
      if sum >= lastMax then
        after = 100
        rightText = string.format('%s  levels you, +%s', short(rdy.xp), short(sum - lastMax))
      else
        after = sum / lastMax * 100
        rightText = string.format('%s  takes you to %d%%', short(rdy.xp), after)
      end
    elseif rdy.xp > 0 then
      rightText = short(rdy.xp)
    else
      rightText = 'XP not given by the game'
    end
    if rdy.xp > 0 and rdy.unknown > 0 then rightText = rightText .. '+' end
  end
  setRow(4, string.format('Ready to turn in (%d)', rdy.count), rightText, after, 0.20, 0.45, 0.30)

  -- 5-6. Pace. The rate is a reading, retaken every five minutes or when the
  -- button on the row is clicked, so it does not jump around after every kill.
  if frame.rateDirty or (rateAt and now - rateAt >= RATE_EVERY) or (not rateAt and s.total > 0) then
    frame.rateDirty = false
    local seconds = db.scope == 2 and (s.seconds + (now - (cdb.levelClock or now))) or (now - sessionStart)
    local gained = math.max(s.total, s.mob + s.quest)
    rate = seconds > 5 and gained / seconds * 3600 or 0
    rateAt = now
  end
  local perHour = rate or 0
  local age = rateAt and math.floor((now - rateAt) / 60) or 0
  setRow(5, age > 0 and string.format('XP per hour (%dm ago)', age) or 'XP per hour', perHour > 0 and short(perHour) or '--')
  local toGo = (lastXP and lastMax) and (lastMax - lastXP) or nil
  local eta = (toGo and perHour > 0) and duration(toGo / perHour * 3600) or '--'
  local avg = 0
  for _, a in ipairs(recentKills) do avg = avg + a end
  avg = #recentKills > 0 and avg / #recentKills or 0
  if toGo and avg > 0 then eta = eta .. string.format('  %d kills', math.ceil(toGo / avg)) end
  setRow(6, 'To level', atMaxLevel() and 'max level' or eta)

  -- 7. Last kill.
  if lastKill then
    local right = '+' .. commas(lastKill.amount)
    if lastKill.rested > 0 then right = right .. string.format(' (%s rested)', commas(lastKill.rested)) end
    setRow(7, 'Last kill: ' .. lastKill.name, right)
  else
    setRow(7, 'Last kill', '--')
  end

  -- 8. What the mob in front of you is worth.
  local unit, p = targetUnit()
  if unit then
    remember(unit)
    local name = plain(UnitName(unit)) or 'Target'
    local mobLevel = plain(UnitLevel(unit))
    local tag = mobLevel and (mobLevel < 1 and '??' or tostring(mobLevel)) or '?'
    setRow(8, string.format('%s (%s)', name, tag), predictionText(p, false))
    rows[8].left:SetTextColor(1, 0.82, 0)
  else
    setRow(8, 'Target a mob', 'to see its XP')
    rows[8].left:SetTextColor(0.6, 0.6, 0.6)
  end

  drawLevelTable()

  -- 9 on. The counter: each mob and level killed, what one gives, how many.
  local list = {}
  for _, m in pairs(s.mobs or {}) do list[#list + 1] = m end
  table.sort(list, function(a, b)
    if a.xp ~= b.xp then return a.xp > b.xp end
    return a.name < b.name
  end)
  local top = list[1] and list[1].xp or 1
  local count = math.min(#list, MOB_ROWS)
  for i = 1, MOB_ROWS do
    local row, m = rows[FIXED_ROWS + i], list[i]
    if m then
      local left = m.level and string.format('%s (%d)', m.name, m.level) or m.name
      setRow(FIXED_ROWS + i, left, string.format('%s each  x%d', commas(m.each or 0), m.kills), m.xp / top * 100, 0.30, 0.30, 0.30)
      row:Show()
    else
      row:Hide()
    end
  end
  if FIXED_ROWS + count ~= shownRows then
    shownRows = FIXED_ROWS + count
    frame:SetHeight(HEADER_H + 5 + shownRows * (ROW_H + ROW_GAP) + 4)
  end
end

-- Window -----------------------------------------------------------------------

local function num(v)
  return type(v) == 'number' and not IsSecret(v)
end

local function placeFrame()
  if not (num(db.left) and num(db.top)) then return false end
  local scale = db.scale or 1
  frame:ClearAllPoints()
  frame:SetPoint('TOPLEFT', UIParent, 'BOTTOMLEFT', db.left / scale, db.top / scale)
  return true
end

local function savePlace()
  local left, top, scale = frame:GetLeft(), frame:GetTop(), frame:GetScale()
  if not (num(left) and num(top)) then return end
  if not num(scale) then scale = db.scale or 1 end
  db.left, db.top = left * scale, top * scale
  placeFrame()
end

local function fullHeight()
  return HEADER_H + 5 + shownRows * (ROW_H + ROW_GAP) + 4
end

local function applyLook()
  frame:SetScale(db.scale)
  frame:SetSize(db.width, db.minimized and HEADER_H or fullHeight())
  placeFrame()
  frame.bg:SetAlpha(db.alpha)
  if frame.levelPanel then frame.levelPanel.bg:SetAlpha(db.alpha) end
  titleText:SetText('Experience: ' .. SCOPES[db.scope]:lower())
  titleButton:SetWidth(titleText:GetStringWidth() + 20)
  frame.body:SetShown(not db.minimized)
  if frame.levelPanel then frame.levelPanel:SetShown(db.levelTable) end
  frame.setMinimizeArt()
  frame:SetShown(db.shown)
end

local function updateMinimap()
  if not mm then return end
  if db.minimap then
    local a = math.rad(db.minimapAngle)
    local r = Minimap:GetWidth() / 2 + 8
    mm:ClearAllPoints()
    mm:SetPoint('CENTER', Minimap, 'CENTER', math.cos(a) * r, math.sin(a) * r)
    mm:Show()
  else
    mm:Hide()
  end
end

local function startMove(_, button)
  if button and button ~= 'LeftButton' then return end
  if db.locked then return end
  frame.moving = true
  frame:StartMoving()
end

local function stopMove()
  if not frame.moving then return end
  frame:StopMovingOrSizing()
  if frame.SetUserPlaced then pcall(frame.SetUserPlaced, frame, true) end
  frame.moving = false
  savePlace()
end

-- The session lives in the per-character saved table, so a /reload picks it
-- back up. It starts over only on a real login or when you clear it.
local function startSession()
  session = newStats()
  sessionStart = GetTime()
  rate, rateAt = nil, nil
  recentKills = {}
  lastKill = nil
  cdb.session, cdb.sessionStart = session, sessionStart
  cdb.recentKills, cdb.lastKill = recentKills, nil
end

local function resetSession()
  startSession()
  say('session numbers cleared.')
end

local function toggle(key)
  return function() db[key] = not db[key] applyLook() updateMinimap() refresh() end
end

local function checked(key)
  return function() return db[key] end
end

local function cycle(key, values)
  return function()
    local at = 1
    for i, v in ipairs(values) do if math.abs(v - db[key]) < 0.001 then at = i end end
    db[key] = values[at % #values + 1]
    applyLook()
  end
end

-- Level history and export -------------------------------------------------------
-- An addon cannot write a file you could open, so the export is a box of
-- tab-separated text: select all, copy, paste into Excel and it lands in columns.

local function historyRows()
  local out = {}
  for _, h in pairs(type(cdb.history) == 'table' and cdb.history or {}) do
    if type(h) == 'table' and type(h.level) == 'number' then out[#out + 1] = h end
  end
  local current = levelStats()
  local copy = {}
  for k, v in pairs(current) do copy[k] = v end
  copy.seconds = (current.seconds or 0) + (GetTime() - (cdb.levelClock or GetTime()))
  copy.inProgress = true
  out[#out + 1] = copy
  table.sort(out, function(a, b) return a.level < b.level end)
  return out
end

local function shares(h)
  local total = math.max(h.total or 0, (h.mob or 0) + (h.quest or 0))
  if total <= 0 then return 0, 0, 0, 0, 0 end
  local other = math.max(0, total - (h.mob or 0) - (h.quest or 0))
  return total, (h.mob or 0) / total * 100, (h.quest or 0) / total * 100, other / total * 100, other
end

local function exportText()
  local lines = { table.concat({
    'Level', 'To level', 'XP tracked', 'Kill XP', 'Kill %', 'Quest XP', 'Quest %', 'Other XP', 'Other %',
    'Kills', 'Quests turned in', 'Rested bonus XP', 'Minutes played', 'XP per hour', 'Finished', 'Note',
  }, '\t') }
  for _, h in ipairs(historyRows()) do
    local total, mobPct, questPct, otherPct, other = shares(h)
    local minutes = (h.seconds or 0) / 60
    local note = h.inProgress and 'in progress' or ''
    if h.partial then note = note .. (note ~= '' and ', ' or '') .. 'tracking started partway through' end
    lines[#lines + 1] = table.concat({
      h.level, h.level + 1, total, h.mob or 0, string.format('%.1f', mobPct), h.quest or 0, string.format('%.1f', questPct),
      other, string.format('%.1f', otherPct), h.kills or 0, h.quests or 0, h.rested or 0,
      string.format('%.0f', minutes), minutes > 0 and string.format('%.0f', total / minutes * 60) or 0,
      h.finished or '', note,
    }, '\t')
  end
  return table.concat(lines, '\n')
end

-- The same table as comma-separated text. It is kept in the per-character
-- saved file, which the game writes on logout or /reload; the "ForeverXP
-- Export" script outside the game turns that into a .csv Excel opens.
local function csvText()
  local text = exportText():gsub(',', ';'):gsub('\t', ',')
  return text
end

local function exportToFile()
  cdb.exportCSV = csvText()
  cdb.exportAt = date and date('%Y-%m-%d %H:%M:%S') or nil
  say('levels saved. Reloading so the game writes them to disk; then run "ForeverXP Export" on your PC.')
  ReloadUI()
end

local exportFrame
local function showExport()
  if not exportFrame then
    local f = CreateFrame('Frame', 'ForeverXPExport', UIParent, BackdropTemplateMixin and 'BackdropTemplate' or nil)
    exportFrame = f
    f:SetSize(620, 320)
    f:SetPoint('CENTER')
    f:SetFrameStrata('DIALOG')
    f:EnableMouse(true)
    f:SetMovable(true)
    f:SetScript('OnMouseDown', function(self) self:StartMoving() end)
    f:SetScript('OnMouseUp', function(self) self:StopMovingOrSizing() end)
    if f.SetBackdrop then
      f:SetBackdrop({
        bgFile = FLAT, edgeFile = 'Interface\\Tooltips\\UI-Tooltip-Border',
        edgeSize = 12, insets = { left = 3, right = 3, top = 3, bottom = 3 },
      })
      f:SetBackdropColor(0, 0, 0, 0.92)
      f:SetBackdropBorderColor(0.45, 0.45, 0.5, 1)
    end
    if UISpecialFrames then table.insert(UISpecialFrames, 'ForeverXPExport') end

    f.title = f:CreateFontString(nil, 'OVERLAY', 'GameFontNormal')
    f.title:SetPoint('TOPLEFT', 12, -10)
    f.title:SetText('Forever XP: levels. Ctrl+A, Ctrl+C, then paste into Excel.')

    local close = CreateFrame('Button', nil, f, 'UIPanelCloseButton')
    close:SetPoint('TOPRIGHT', -2, -2)

    local scrollFrame = CreateFrame('ScrollFrame', nil, f)
    scrollFrame:SetPoint('TOPLEFT', 12, -32)
    scrollFrame:SetPoint('BOTTOMRIGHT', -12, 12)
    scrollFrame:EnableMouseWheel(true)
    scrollFrame:SetScript('OnMouseWheel', function(self, delta)
      local max = self:GetVerticalScrollRange() or 0
      self:SetVerticalScroll(math.max(0, math.min(max, self:GetVerticalScroll() - delta * 30)))
    end)

    local box = CreateFrame('EditBox', nil, scrollFrame)
    f.box = box
    box:SetMultiLine(true)
    box:SetAutoFocus(false)
    box:SetFontObject(ChatFontNormal or GameFontHighlightSmall)
    box:SetWidth(590)
    box:SetScript('OnEscapePressed', function() f:Hide() end)
    -- Typing in the box would spoil the copy, so any edit puts the text back.
    box:SetScript('OnTextChanged', function(self, byUser)
      if byUser and f.text then self:SetText(f.text) self:HighlightText() end
    end)
    scrollFrame:SetScrollChild(box)
  end
  exportFrame.text = exportText()
  exportFrame.box:SetText(exportFrame.text)
  exportFrame:Show()
  exportFrame.box:SetFocus()
  exportFrame.box:HighlightText()
end

local function printLevels()
  local rowsOut = historyRows()
  say('levels on record:')
  for _, h in ipairs(rowsOut) do
    local total, mobPct, questPct, otherPct = shares(h)
    local line = string.format('  Level %d to %d: %d%% mobs, %d%% quests', h.level, h.level + 1, mobPct + 0.5, questPct + 0.5)
    if otherPct >= 1 then line = line .. string.format(', %d%% other', otherPct + 0.5) end
    line = line .. string.format('. %s XP in %s.', commas(total), duration(h.seconds or 0))
    if h.inProgress then line = line .. ' In progress.' end
    if h.partial then line = line .. ' Tracking started partway through.' end
    say(line)
  end
end

SETTINGS = {
  { text = 'Forever XP ' .. VERSION, title = true },
  { text = 'Lock window', checked = checked('locked'), click = toggle('locked') },
  { text = 'Level table under the window', checked = checked('levelTable'), click = toggle('levelTable') },
  { text = 'XP line on mob tooltips', checked = checked('tooltip'), click = toggle('tooltip') },
  { text = 'Minimap button', checked = checked('minimap'), click = toggle('minimap') },
  { text = function() return string.format('Scale: %d%%', db.scale * 100) end, click = cycle('scale', { 0.8, 0.9, 1, 1.1, 1.25, 1.5 }) },
  { text = function() return string.format('Background: %d%%', db.alpha * 100) end, click = cycle('alpha', { 0, 0.2, 0.4, 0.6, 0.8, 1 }) },
  { text = 'Export to Excel (reloads the UI)', click = function() exportToFile() end, close = true },
  { text = 'Clear session numbers', click = function() resetSession() refresh() end, close = true },
  { text = 'Forget learned mob values', click = function()
      db.learned, db.calib, db.calibN = {}, nil, 0
      say('learned mob values cleared.')
    end, close = true },
}

local function scopeMenu()
  local items = { { text = 'Show numbers for', title = true } }
  for i, label in ipairs(SCOPES) do
    items[#items + 1] = {
      text = label, close = true,
      checked = function() return db.scope == i end,
      click = function() db.scope = i frame.rateDirty = true applyLook() refresh() end,
    }
  end
  return items
end

local function buildFrame()
  frame = frame or CreateFrame('Frame', 'ForeverXPFrame', UIParent)
  local restored = frame:GetNumPoints() > 0
  if not placeFrame() and not restored then
    frame:SetPoint('CENTER', UIParent, 'CENTER', 0, -120)
  end
  frame:SetFrameStrata('MEDIUM')
  frame:SetClampedToScreen(true)
  frame:SetMovable(true)
  if frame.SetUserPlaced then pcall(frame.SetUserPlaced, frame, true) end
  frame:EnableMouse(true)
  frame:SetScript('OnMouseDown', startMove)
  frame:SetScript('OnMouseUp', stopMove)
  frame:SetScript('OnHide', stopMove)

  frame.body = CreateFrame('Frame', nil, frame)
  frame.body:SetAllPoints()
  frame.bg = frame.body:CreateTexture(nil, 'BACKGROUND')
  frame.bg:SetAllPoints()
  if not setAtlas(frame.bg, 'damagemeters-background') then
    frame.bg:SetColorTexture(0, 0, 0, 1)
  end

  header = CreateFrame('Frame', nil, frame)
  header:SetPoint('TOPLEFT')
  header:SetPoint('TOPRIGHT')
  header:SetHeight(HEADER_H)
  header:EnableMouse(true)
  header:SetScript('OnMouseDown', startMove)
  header:SetScript('OnMouseUp', stopMove)
  header.bg = header:CreateTexture(nil, 'BACKGROUND', nil, 1)
  header.bg:SetAllPoints()
  if not setAtlas(header.bg, 'ui-damagemeters-header-bar', FLAT) then
    header.bg:SetColorTexture(0.12, 0.12, 0.14, 0.95)
  end

  local minimize = CreateFrame('Button', nil, header)
  minimize:SetSize(18, 19)
  minimize:SetPoint('TOPRIGHT', -3, -5)
  frame.setMinimizeArt = function()
    local kind = db.minimized and 'expand' or 'collapse'
    if hasAtlas('ui-questtrackerbutton-' .. kind .. '-all') then
      minimize:SetNormalAtlas('ui-questtrackerbutton-' .. kind .. '-all')
    else
      minimize:SetNormalTexture(db.minimized and 'Interface\\Buttons\\UI-PlusButton-Up' or 'Interface\\Buttons\\UI-MinusButton-Up')
    end
  end
  minimize:SetScript('OnClick', function()
    db.minimized = not db.minimized
    applyLook()
    refresh()
  end)

  gear = CreateFrame('Button', nil, header)
  gear:SetSize(22, 22)
  gear:SetPoint('RIGHT', minimize, 'LEFT', -2, -1)
  if hasAtlas('common-dropdown-a-button-settings-shadowless') then
    gear:SetNormalAtlas('common-dropdown-a-button-settings-shadowless')
  else
    gear:SetNormalTexture('Interface\\Buttons\\UI-OptionsButton')
  end
  gear:SetScript('OnClick', function(self) showMenu(self, SETTINGS) end)

  titleButton = CreateFrame('Button', nil, header)
  titleButton:SetPoint('LEFT', 8, 0)
  titleButton:SetHeight(HEADER_H - 8)
  titleText = titleButton:CreateFontString(nil, 'OVERLAY', 'GameFontNormal')
  titleText:SetPoint('LEFT')
  titleButton:SetScript('OnClick', function(self) showMenu(self, scopeMenu()) end)
  titleButton:SetScript('OnEnter', function(self)
    GameTooltip:SetOwner(self, 'ANCHOR_TOP')
    GameTooltip:AddLine('Click to switch between this session and this level.', 1, 1, 1)
    GameTooltip:Show()
  end)
  titleButton:SetScript('OnLeave', function() GameTooltip:Hide() end)

  for i = 1, NUM_ROWS do buildRow(i) end
  for i = FIXED_ROWS + 1, NUM_ROWS do rows[i]:Hide() end

  -- The level table, a second box hanging under the window.
  local panel = CreateFrame('Frame', nil, frame.body)
  frame.levelPanel = panel
  panel:SetPoint('TOPLEFT', frame, 'BOTTOMLEFT', 0, -3)
  panel:SetPoint('TOPRIGHT', frame, 'BOTTOMRIGHT', 0, -3)
  panel:SetHeight(22 + (TABLE_SPAN * 2 + 1) * (ROW_H + ROW_GAP) + 4)
  panel:EnableMouse(true)
  panel:SetScript('OnMouseDown', startMove)
  panel:SetScript('OnMouseUp', stopMove)
  panel.bg = panel:CreateTexture(nil, 'BACKGROUND')
  panel.bg:SetAllPoints()
  if not setAtlas(panel.bg, 'damagemeters-background') then
    panel.bg:SetColorTexture(0, 0, 0, 1)
  end
  panel.title = panel:CreateFontString(nil, 'OVERLAY', 'GameFontNormalSmall')
  panel.title:SetPoint('TOPLEFT', 8, -6)
  panel.title:SetText('XP per kill and kills to level, by mob level')
  for i = 1, TABLE_SPAN * 2 + 1 do buildRow(i, panel, 22, levelRows) end

  -- The button that retakes the XP per hour reading now.
  local again = CreateFrame('Button', nil, rows[5])
  again:SetSize(14, 14)
  again:SetPoint('RIGHT', -2, 0)
  again:SetFrameLevel(rows[5].bar:GetFrameLevel() + 2)
  again:SetNormalTexture('Interface\\Buttons\\UI-RefreshButton')
  again:SetHighlightTexture('Interface\\Buttons\\UI-RefreshButton', 'ADD')
  again:SetScript('OnClick', function()
    frame.rateDirty = true
    refresh()
  end)
  again:SetScript('OnEnter', function(self)
    GameTooltip:SetOwner(self, 'ANCHOR_RIGHT')
    GameTooltip:AddLine('Update XP per hour now', 1, 1, 1)
    GameTooltip:AddLine('It updates by itself every 5 minutes.', 0.7, 0.7, 0.7)
    GameTooltip:Show()
  end)
  again:SetScript('OnLeave', function() GameTooltip:Hide() end)
  rows[5].right:ClearAllPoints()
  rows[5].right:SetPoint('RIGHT', -20, 0)
  applyLook()
end

local function toggleWindow()
  db.shown = not db.shown
  applyLook()
  refresh()
end

local function buildMinimapButton()
  mm = CreateFrame('Button', 'ForeverXPMinimapButton', Minimap)
  mm:SetSize(31, 31)
  mm:SetFrameStrata('MEDIUM')
  mm:SetFrameLevel(8)
  mm:RegisterForClicks('LeftButtonUp', 'RightButtonUp')
  mm:RegisterForDrag('LeftButton')
  mm:SetHighlightTexture('Interface\\Minimap\\UI-Minimap-ZoomButton-Highlight')

  local back = mm:CreateTexture(nil, 'BACKGROUND')
  back:SetTexture('Interface\\Minimap\\UI-Minimap-Background')
  back:SetSize(20, 20)
  back:SetPoint('TOPLEFT', 7, -5)

  local icon = mm:CreateTexture(nil, 'ARTWORK')
  icon:SetTexture(ADDON_ICON)
  icon:SetSize(18, 18)
  icon:SetPoint('TOPLEFT', 7, -6)
  icon:SetTexCoord(0.08, 0.92, 0.08, 0.92)
  if mm.CreateMaskTexture then
    local mask = mm:CreateMaskTexture()
    mask:SetTexture('Interface\\CharacterFrame\\TempPortraitAlphaMask', 'CLAMPTOBLACKADDITIVE', 'CLAMPTOBLACKADDITIVE')
    mask:SetAllPoints(icon)
    icon:AddMaskTexture(mask)
  end

  local ring = mm:CreateTexture(nil, 'OVERLAY')
  ring:SetTexture('Interface\\Minimap\\MiniMap-TrackingBorder')
  ring:SetSize(53, 53)
  ring:SetPoint('TOPLEFT')

  mm:SetScript('OnDragStart', function(self)
    self:SetScript('OnUpdate', function()
      local mx, my = Minimap:GetCenter()
      local cx, cy = GetCursorPosition()
      local s = Minimap:GetEffectiveScale()
      db.minimapAngle = math.deg(math.atan2(cy / s - my, cx / s - mx))
      updateMinimap()
    end)
  end)
  mm:SetScript('OnDragStop', function(self) self:SetScript('OnUpdate', nil) end)
  mm:SetScript('OnClick', function(self, button)
    if button == 'RightButton' then showMenu(self, SETTINGS) else toggleWindow() end
  end)
  mm:SetScript('OnEnter', function(self)
    GameTooltip:SetOwner(self, 'ANCHOR_LEFT')
    GameTooltip:AddLine('Forever XP')
    GameTooltip:AddLine('Left-click: show or hide the window', 1, 1, 1)
    GameTooltip:AddLine('Right-click: settings', 1, 1, 1)
    GameTooltip:AddLine('Drag: move this button', 1, 1, 1)
    GameTooltip:Show()
  end)
  mm:SetScript('OnLeave', function() GameTooltip:Hide() end)
  updateMinimap()
end

-- Slash ------------------------------------------------------------------------

local function slash(msg)
  local raw = msg or ''
  msg = (msg or ''):lower():match('^%s*(.-)%s*$')
  if msg == '' or msg == 'toggle' then
    toggleWindow()
  elseif msg == 'reset' then
    resetSession()
    refresh()
  elseif msg == 'lock' then
    db.locked = not db.locked
    say(db.locked and 'window locked.' or 'window unlocked.')
  elseif msg == 'center' then
    db.left, db.top = nil, nil
    frame:ClearAllPoints()
    frame:SetPoint('CENTER')
    savePlace()
  elseif msg == 'export' then
    exportToFile()
  elseif msg == 'copy' then
    showExport()
  elseif msg == 'levels' then
    printLevels()
  elseif msg:match('^buff') then
    -- /fxp buff            what it sees right now
    -- /fxp buff Name 5     teach it a buff it did not spot by itself (0 forgets it)
    local name, pct = raw:match('^%s*%a+%s+(.-)%s+(%d+)%s*$')
    if name and name ~= '' then
      pct = tonumber(pct)
      db.xpBuffs[name] = pct > 0 and pct or nil
      say(pct > 0 and string.format('counting "%s" as +%d%% XP while it is on you.', name, pct) or ('forgot "' .. name .. '".'))
    end
    pcall(scanBuffs)
    say(#buffNames > 0 and ('XP buffs on you: ' .. table.concat(buffNames, ', ') .. '.') or 'no XP buff found on you right now.')
    if #buffNames == 0 then
      say(#buffSeen > 0 and 'buffs it could read:' or 'it could not read any of your buffs.')
      for _, line in ipairs(buffSeen) do say('  ' .. line) end
    end
    refresh()
  elseif msg == 'debug' then
    local n = 0
    for _ in pairs(db.learned) do n = n + 1 end
    say(string.format('character saved data arrived: %s. Mobs learned: %d. Correction: %s from %d kills.',
      tostring(db.arrived), n, db.calib and string.format('x%.2f', db.calib) or 'none yet', db.calibN or 0))
    say('this load was a ' .. trace .. '.')
    say(string.format('session: total %d, kills %d, quests %d. XP chat pattern: %s',
      session.total, session.mob, session.quest, tostring(killPattern)))
  else
    say('/fxp shows or hides the window. Also: levels, export, copy, reset, lock, center, buff, debug.')
  end
end

-- Boot -------------------------------------------------------------------------

-- Made at file load so the game's own layout file can put the window back,
-- for clients where saved settings do not come back to the addon.
frame = CreateFrame('Frame', 'ForeverXPFrame', UIParent)
frame:SetSize(DEFAULTS.width, 180)
frame:SetMovable(true)
if frame.SetUserPlaced then pcall(frame.SetUserPlaced, frame, true) end
frame:Hide()

local driver = CreateFrame('Frame')
driver:RegisterEvent('PLAYER_LOGIN')
driver:RegisterEvent('PLAYER_LOGOUT')
driver:SetScript('OnEvent', function(self, event, ...)
  if event == 'PLAYER_LOGOUT' then
    if frame and db then savePlace() end
    if cdb then
      cdb.logoutAt = GetTime()
      -- Kept current on every logout and reload, so the export script always has fresh data.
      pcall(function() cdb.exportCSV = csvText() cdb.exportAt = date and date('%Y-%m-%d %H:%M:%S') or nil end)
    end
    if cdb and cdb.level then
      cdb.level.seconds = cdb.level.seconds + (GetTime() - (cdb.levelClock or GetTime()))
      cdb.levelClock = nil
    end
    return
  end

  if event == 'PLAYER_LOGIN' then
    -- This client writes the account-wide saved file but never hands it back
    -- (seen with Forever Threat too, and in ForeverXP's own files). The
    -- per-character file does come back, so settings and learned mob values
    -- live inside it, and the account-wide table is only used if it ever arrives.
    local charArrived = type(ForeverXPCharDB) == 'table'
    if not charArrived then ForeverXPCharDB = {} end
    cdb = ForeverXPCharDB
    if type(cdb.settings) ~= 'table' then
      cdb.settings = type(ForeverXPDB) == 'table' and ForeverXPDB or {}
    end
    db = cdb.settings
    ForeverXPDB = db
    db.arrived = charArrived
    for k, v in pairs(DEFAULTS) do
      if db[k] == nil then db[k] = v end
    end
    if type(db.learned) ~= 'table' then db.learned = {} end
    if type(db.xpBuffs) ~= 'table' then db.xpBuffs = {} end
    if (db.v or 1) < 2 then
      -- Values learned before XP buffs were told apart may have the 5% baked in.
      db.learned, db.byLevel, db.calib, db.calibN = {}, {}, nil, 0
      db.v = 2
    end
    pcall(scanBuffs)

    -- Pick the saved session back up for now. The first PLAYER_ENTERING_WORLD
    -- says whether this is a login or a reload, and a login starts it over.
    local now = GetTime()
    if type(cdb.session) == 'table' and type(cdb.sessionStart) == 'number' and cdb.sessionStart <= now then
      session, sessionStart = cdb.session, cdb.sessionStart
      for k, v in pairs(newStats()) do
        if session[k] == nil then session[k] = v end
      end
      recentKills = type(cdb.recentKills) == 'table' and cdb.recentKills or {}
      cdb.recentKills = recentKills
      lastKill = type(cdb.lastKill) == 'table' and cdb.lastKill or nil
      resumed = true
    else
      startSession()
    end
    cdb.levelClock = now
    onXPUpdate()

    buildFrame()
    buildMinimapButton()
    SLASH_FOREVERXP1 = '/fxp'
    SLASH_FOREVERXP2 = '/foreverxp'
    SlashCmdList.FOREVERXP = slash

    for _, e in ipairs({
      'PLAYER_XP_UPDATE', 'PLAYER_LEVEL_UP', 'CHAT_MSG_COMBAT_XP_GAIN', 'QUEST_TURNED_IN',
      'QUEST_LOG_UPDATE', 'QUEST_ACCEPTED', 'QUEST_REMOVED',
      'PLAYER_TARGET_CHANGED', 'UPDATE_MOUSEOVER_UNIT', 'UPDATE_EXHAUSTION',
      'UNIT_AURA', 'PLAYER_REGEN_ENABLED', 'GROUP_ROSTER_UPDATE', 'PLAYER_ENTERING_WORLD', 'NAME_PLATE_UNIT_ADDED',
    }) do
      pcall(self.RegisterEvent, self, e)
    end

    -- The line on mob tooltips. Newer clients use the tooltip data processor.
    local hooked = false
    if TooltipDataProcessor and TooltipDataProcessor.AddTooltipPostCall and Enum and Enum.TooltipDataType then
      hooked = pcall(TooltipDataProcessor.AddTooltipPostCall, Enum.TooltipDataType.Unit, tooltipLine)
    end
    if not hooked and GameTooltip:HasScript('OnTooltipSetUnit') then
      GameTooltip:HookScript('OnTooltipSetUnit', tooltipLine)
    end

    local since = 0
    self:SetScript('OnUpdate', function(_, elapsed)
      since = since + elapsed
      if since < 0.5 then return end
      since = 0
      if frame.moving and IsMouseButtonDown and not IsMouseButtonDown('LeftButton') then stopMove() end
      local ok, err = pcall(refresh)
      if not ok and not self.complained then
        self.complained = true
        say('display error: ' .. tostring(err))
      end
    end)

    pcall(scanQuests)
    say(VERSION .. ' loaded. Minimap button or /fxp.')
    return
  end

  if not db then return end
  if event == 'PLAYER_ENTERING_WORLD' and not entered then
    entered = true
    local isLogin, isReload = ...
    isLogin, isReload = plain(isLogin), plain(isReload)
    if isLogin == nil and isReload == nil then
      -- Older event without the flags: a reload comes back within seconds.
      isLogin = not (type(cdb.logoutAt) == 'number' and GetTime() >= cdb.logoutAt and GetTime() - cdb.logoutAt < 60)
    end
    if isLogin and resumed then startSession() end
    -- One-time repair for Andres's character: the cold-login bug above wiped
    -- level 10's numbers on 2026-09-21. These are the totals from the game's
    -- backup of the saved file. Safe to delete once he is past level 10.
    pcall(function()
      local name = plain(UnitName('player'))
      local l = cdb.level
      if cdb.restored1 or type(name) ~= 'string' or not name:match('^Gold.?Pipe$') then return end
      if type(l) ~= 'table' or l.level ~= 10 then return end
      cdb.restored1 = true
      l.total, l.mob, l.kills = l.total + 4849, l.mob + 2214, l.kills + 26
      l.quest, l.quests, l.seconds = l.quest + 2260, l.quests + 7, (l.seconds or 0) + 3299
    end)
    trace = (isLogin and 'login' or 'reload') .. (resumed and ', had a saved session' or ', no saved session')
  end
  if event == 'CHAT_MSG_COMBAT_XP_GAIN' then
    pcall(onXPChat, (...))
  elseif event == 'QUEST_TURNED_IN' then
    pcall(onQuestTurnedIn, ...)
  elseif event == 'PLAYER_XP_UPDATE' or event == 'PLAYER_LEVEL_UP' or event == 'PLAYER_ENTERING_WORLD' then
    pcall(onXPUpdate)
  elseif event == 'QUEST_LOG_UPDATE' or event == 'QUEST_ACCEPTED' or event == 'QUEST_REMOVED' then
    pcall(scanQuests)
  elseif event == 'UNIT_AURA' or event == 'PLAYER_REGEN_ENABLED' then
    if event ~= 'UNIT_AURA' or plain((...)) == 'player' then pcall(scanBuffs) end
  elseif event == 'PLAYER_TARGET_CHANGED' then
    remember('target')
  elseif event == 'UPDATE_MOUSEOVER_UNIT' then
    remember('mouseover')
  elseif event == 'NAME_PLATE_UNIT_ADDED' then
    local unit = plain((...))
    if unit then remember(unit) end
  end
  pcall(refresh)
end)
