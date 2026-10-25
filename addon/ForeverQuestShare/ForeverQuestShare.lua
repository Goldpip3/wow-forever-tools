--[[
  Forever Quest Share 1.0

  Which of your quests does your group have, and which are they missing?
  Every quest row in the quest log gets a small marker per party member
  (a count in a raid), and the Party Quests panel next to the map lists what
  you can share, what they have that you don't, and what everyone already has.
  "Share missing" sends only the quests somebody lacks, one second apart.

  Where the group's quest data comes from, best first:
    1. Party members who run this add-on send their quest list (prefix FQShare)
       and say which of your quests they already turned in.
    2. Party members who run Questie: Questie already sends its quest log to the
       group; this add-on reads what Questie received, and never writes to it.
    3. What the game answers when you share: "already on that quest",
       "has completed that quest", "not eligible", and so on.

  The only action it takes is the one Blizzard's Share button takes. It never
  accepts, abandons or turns in anything, and it never shares during combat.
]]

local ADDON = ...
local VERSION = '1.0'
local PREFIX = '|cff33ff99Forever Quest Share:|r '
local COMM = 'FQShare'
local PROTO = '1'

local DEFAULTS = {
  panel = true,          -- panel opens with the map
  pips = true,           -- markers on the quest log rows
  minimap = true,
  minimapAngle = 190,
  collapsed = { everyone = true, unshareable = true },
  left = nil, top = nil, -- where the panel sits when the map is closed
}

local SHARE_GAP = 1.0     -- seconds between queued shares
local SEND_GAP = 0.2      -- seconds between add-on message chunks
local RESULT_WINDOW = 0.9 -- a share result this soon after a share belongs to it
local CHUNK = 230         -- add-on messages are capped at 255 bytes
local ROW_H, ROW_GAP = 20, 2
local HEADER_H = 32
local PANEL_W = 320
local PANEL_ROWS = 18
local FLAT = 'Interface\\Buttons\\WHITE8X8'
local FILL = 'Interface\\RaidFrame\\Raid-Bar-Hp-Fill'
local ICON = 'Interface\\Icons\\INV_Misc_GroupNeedMore'
local TEX_CHECK = 'Interface\\RaidFrame\\ReadyCheck-Ready'
local TEX_NO = 'Interface\\RaidFrame\\ReadyCheck-NotReady'
local TEX_WAIT = 'Interface\\RaidFrame\\ReadyCheck-Waiting'

local db
local me                 -- "Name" or "Name-Realm", same form Ambiguate gives senders
local mine = {}          -- questID -> { id, title, level, complete, shareable, zone }
local mineOrder = {}     -- questIDs in quest log order
local members = {}       -- ordered list of group member names (not you)
local memberSet = {}     -- name -> unit token
local inRaid = false
local theirs = {}        -- name -> { [questID] = { title, level, complete, shareable } } from our add-on
local hasAddon = {}      -- name -> version string
local told = {}          -- name -> { [questID] = state } from share results and done replies
local refresh, decorateLog, sendList

-- Helpers -------------------------------------------------------------------

local function IsSecret(v)
  return issecretvalue ~= nil and issecretvalue(v) or false
end

local function say(msg)
  DEFAULT_CHAT_FRAME:AddMessage(PREFIX .. msg)
end

local function hasAtlas(name)
  return C_Texture and C_Texture.GetAtlasInfo and C_Texture.GetAtlasInfo(name) ~= nil
end

local function setAtlas(tex, name, fallback)
  if hasAtlas(name) then tex:SetAtlas(name, false) return true end
  if fallback then tex:SetTexture(fallback) end
  return false
end

local function after(sec, fn)
  if C_Timer and C_Timer.After then C_Timer.After(sec, fn) end
end

local function short(name)
  if not name or IsSecret(name) then return nil end
  if Ambiguate then return Ambiguate(name, 'none') end
  return (name:gsub('%-.*', ''))
end

local function unitKey(unit)
  local name, realm = UnitName(unit)
  if not name or IsSecret(name) or name == UNKNOWNOBJECT then return nil end
  if realm and realm ~= '' and not IsSecret(realm) then name = name .. '-' .. realm end
  return short(name)
end

local function inCombat()
  return (InCombatLockdown and InCombatLockdown()) or (UnitAffectingCombat and UnitAffectingCombat('player'))
end

local function chatLocked()
  return C_ChatInfo and C_ChatInfo.InChatMessagingLockdown and C_ChatInfo.InChatMessagingLockdown() or false
end

local function inBattleground()
  local _, kind = IsInInstance()
  return kind == 'pvp' or kind == 'arena'
end

local function questTitle(id)
  if mine[id] then return mine[id].title end
  for _, list in pairs(theirs) do
    if list[id] and list[id].title then return list[id].title end
  end
  if C_QuestLog and C_QuestLog.GetTitleForQuestID then
    local t = C_QuestLog.GetTitleForQuestID(id)
    if t and not IsSecret(t) and t ~= '' then return t end
  end
  if C_QuestLog and C_QuestLog.GetQuestInfo then
    local t = C_QuestLog.GetQuestInfo(id)
    if t and not IsSecret(t) and t ~= '' then return t end
  end
  if type(QuestieLoader) == 'table' and QuestieLoader.ImportModule then
    local ok, qdb = pcall(QuestieLoader.ImportModule, QuestieLoader, 'QuestieDB')
    if ok and type(qdb) == 'table' and qdb.QueryQuestSingle then
      local ok2, t = pcall(qdb.QueryQuestSingle, id, 'name')
      if ok2 and type(t) == 'string' and t ~= '' then return t end
    end
  end
  return 'Quest #' .. id
end

local function flaggedDone(id)
  if C_QuestLog and C_QuestLog.IsQuestFlaggedCompleted then
    return C_QuestLog.IsQuestFlaggedCompleted(id) and true or false
  end
  if IsQuestFlaggedCompleted then return IsQuestFlaggedCompleted(id) and true or false end
  return false
end

-- Your quest log -------------------------------------------------------------

local function numEntries()
  if C_QuestLog and C_QuestLog.GetNumQuestLogEntries then return C_QuestLog.GetNumQuestLogEntries() end
  if GetNumQuestLogEntries then return GetNumQuestLogEntries() end
  return 0
end

local function entry(i)
  if C_QuestLog and C_QuestLog.GetInfo then
    local info = C_QuestLog.GetInfo(i)
    if not info then return nil end
    return info.title, info.level, info.isHeader, info.questID, info.isHidden or info.isTask
  end
  if GetQuestLogTitle then
    local title, level, _, isHeader, _, _, _, questID = GetQuestLogTitle(i)
    return title, level, isHeader, questID, false
  end
end

local function logIndex(id)
  if C_QuestLog and C_QuestLog.GetLogIndexForQuestID then return C_QuestLog.GetLogIndexForQuestID(id) end
  if GetQuestLogIndexByID then return GetQuestLogIndexByID(id) end
end

local function selectedQuest()
  if C_QuestLog and C_QuestLog.GetSelectedQuest then return 'id', C_QuestLog.GetSelectedQuest() end
  if GetQuestLogSelection then return 'index', GetQuestLogSelection() end
end

local function restoreSelection(kind, value)
  if not kind or not value then return end
  if kind == 'id' and C_QuestLog.SetSelectedQuest then C_QuestLog.SetSelectedQuest(value)
  elseif kind == 'index' and SelectQuestLogEntry then SelectQuestLogEntry(value) end
end

local function selectQuest(id, index)
  if C_QuestLog and C_QuestLog.SetSelectedQuest then C_QuestLog.SetSelectedQuest(id)
  elseif SelectQuestLogEntry then SelectQuestLogEntry(index) end
end

local function pushable(id, index)
  if C_QuestLog and C_QuestLog.IsPushableQuest then return C_QuestLog.IsPushableQuest(id) and true or false end
  if GetQuestLogPushable and SelectQuestLogEntry then
    SelectQuestLogEntry(index)
    return GetQuestLogPushable() and true or false
  end
  return false
end

local function complete(id)
  if C_QuestLog and C_QuestLog.IsComplete then return C_QuestLog.IsComplete(id) and true or false end
  if C_QuestLog and C_QuestLog.ReadyForTurnIn then return C_QuestLog.ReadyForTurnIn(id) and true or false end
  return false
end

local function scanMine()
  wipe(mine)
  wipe(mineOrder)
  local kind, sel = selectedQuest()
  local zone
  for i = 1, numEntries() do
    local title, level, isHeader, id, hidden = entry(i)
    if isHeader then
      zone = title
    elseif id and id > 0 and not hidden and title and not IsSecret(title) then
      mine[id] = {
        id = id, title = title, level = level or 0, zone = zone,
        complete = complete(id), shareable = pushable(id, i),
      }
      mineOrder[#mineOrder + 1] = id
    end
  end
  if not (C_QuestLog and C_QuestLog.IsPushableQuest) then restoreSelection(kind, sel) end
end

-- Questie's party data (read only) --------------------------------------------

local questieComms
local function questie()
  if questieComms == false then return nil end
  if questieComms then return questieComms end
  if type(QuestieLoader) == 'table' and QuestieLoader.ImportModule then
    local ok, mod = pcall(QuestieLoader.ImportModule, QuestieLoader, 'QuestieComms')
    if ok and type(mod) == 'table' then questieComms = mod return mod end
  end
  return nil
end

-- name -> { [questID] = true } for group members Questie has heard from
local function questieLogs()
  local out = {}
  local qc = questie()
  local logs = qc and qc.remoteQuestLogs
  if type(logs) ~= 'table' then return out end
  for id, players in pairs(logs) do
    if type(id) == 'number' and type(players) == 'table' then
      for name in pairs(players) do
        local n = type(name) == 'string' and short(name)
        if n and memberSet[n] then
          out[n] = out[n] or {}
          out[n][id] = true
        end
      end
    end
  end
  return out
end

-- Group state ------------------------------------------------------------------
-- has, done, lacks, cant, full, far, busy, or nil (unknown)

local STATE_TEXT = {
  has = 'has it', done = 'already turned it in', lacks = "doesn't have it",
  cant = "can't take it", full = 'quest log is full', far = 'too far away',
  busy = 'was busy', declined = 'declined it', unknown = 'no data yet',
}

local qLogs = {}

local function stateOf(name, id)
  local t = told[name] and told[name][id]
  if t == 'done' or t == 'cant' then return t end
  local list = theirs[name]
  if list then
    if list[id] then return 'has' end
    if t then return t end
    return 'lacks'
  end
  local ql = qLogs[name]
  if ql then
    if ql[id] then return 'has' end
    if t then return t end
    -- In a raid Questie only sends group quests, so absence proves nothing there.
    if not inRaid then return 'lacks' end
  end
  return t
end

local function source(name)
  if hasAddon[name] then return 'add-on' end
  if qLogs[name] then return 'Questie' end
  if told[name] and next(told[name]) then return 'share replies' end
  return 'no data'
end

local function isShareTarget(id)
  local q = mine[id]
  if not q or not q.shareable or #members == 0 then return false end
  for _, name in ipairs(members) do
    local s = stateOf(name, id)
    if s ~= 'has' and s ~= 'done' and s ~= 'cant' then return true end
  end
  return false
end

local function readRoster()
  local old = memberSet
  members, memberSet = {}, {}
  inRaid = IsInRaid and IsInRaid() or false
  local fresh = false
  if inBattleground() then return false end
  if inRaid then
    for i = 1, (GetNumGroupMembers and GetNumGroupMembers() or 0) do
      local unit = 'raid' .. i
      if not UnitIsUnit(unit, 'player') then
        local n = unitKey(unit)
        if n then members[#members + 1] = n memberSet[n] = unit end
      end
    end
  else
    for i = 1, 4 do
      local unit = 'party' .. i
      if UnitExists(unit) then
        local n = unitKey(unit)
        if n then members[#members + 1] = n memberSet[n] = unit end
      end
    end
  end
  for n in pairs(memberSet) do if not old[n] then fresh = true end end
  for n in pairs(theirs) do if not memberSet[n] then theirs[n] = nil hasAddon[n] = nil end end
  for n in pairs(told) do if not memberSet[n] then told[n] = nil end end
  return fresh
end

local function refreshQuestie()
  qLogs = questieLogs()
end

-- Add-on messages --------------------------------------------------------------

local outbox = {}
local sending = false

local function channel()
  if inBattleground() then return nil end
  if LE_PARTY_CATEGORY_INSTANCE and IsInGroup and IsInGroup(LE_PARTY_CATEGORY_INSTANCE)
     and not IsInGroup(LE_PARTY_CATEGORY_HOME) then
    return 'INSTANCE_CHAT'
  end
  if IsInRaid and IsInRaid() then return 'RAID' end
  if IsInGroup and IsInGroup() then return 'PARTY' end
  return nil
end

local lastSendResult
local function pump()
  if #outbox == 0 then sending = false return end
  if chatLocked() then after(5, pump) return end
  local m = table.remove(outbox, 1)
  local ok, res
  if m.target then
    ok, res = pcall(C_ChatInfo.SendAddonMessage, COMM, m.text, 'WHISPER', m.target)
  else
    local ch = channel()
    if ch then ok, res = pcall(C_ChatInfo.SendAddonMessage, COMM, m.text, ch) end
  end
  lastSendResult = ok and tostring(res) or ('error: ' .. tostring(res))
  after(SEND_GAP, pump)
end

local function send(text, target)
  if not (C_ChatInfo and C_ChatInfo.SendAddonMessage) then return end
  if not target and not channel() then return end
  outbox[#outbox + 1] = { text = text, target = target }
  if not sending then sending = true pump() end
end

local function clean(s)
  return (tostring(s or ''):gsub('[|%^;]', ''))
end

local listSeq = 0
local listPending = false

function sendList()
  listPending = false
  if not channel() then return end
  scanMine()
  listSeq = (listSeq % 999) + 1
  local parts, cur = {}, ''
  for _, id in ipairs(mineOrder) do
    local q = mine[id]
    local e = id .. '^' .. (q.level or 0) .. '^' .. (q.complete and 'c' or '') .. (q.shareable and 's' or '')
      .. '^' .. clean(q.title):sub(1, 60)
    if #cur > 0 and #cur + #e + 1 > CHUNK then parts[#parts + 1] = cur cur = '' end
    cur = (#cur > 0) and (cur .. ';' .. e) or e
  end
  parts[#parts + 1] = cur
  for n, p in ipairs(parts) do
    send('L|' .. listSeq .. '|' .. n .. '/' .. #parts .. '|' .. p)
  end
end

local function queueList(delay)
  if listPending then return end
  listPending = true
  after(delay or (inRaid and 5 or 2), sendList)
end

local incoming = {}      -- name -> { seq, parts, total }

local function onList(name, seq, n, total, payload)
  local box = incoming[name]
  if not box or box.seq ~= seq then box = { seq = seq, parts = {}, total = total } incoming[name] = box end
  box.parts[n] = payload
  for i = 1, box.total do if box.parts[i] == nil then return end end
  incoming[name] = nil
  local list = {}
  for i = 1, box.total do
    for e in box.parts[i]:gmatch('[^;]+') do
      local id, lvl, flags, title = e:match('^(%d+)%^(%d*)%^(%a*)%^(.*)$')
      id = tonumber(id)
      if id then
        list[id] = { title = title ~= '' and title or nil, level = tonumber(lvl) or 0,
          complete = flags:find('c') ~= nil, shareable = flags:find('s') ~= nil }
      end
    end
  end
  theirs[name] = list
  -- Tell them which of their quests we already turned in, so they skip us.
  local done = {}
  for id in pairs(list) do if not mine[id] and flaggedDone(id) then done[#done + 1] = id end end
  if #done > 0 then
    local text = 'D|' .. table.concat(done, ',')
    if #text > 250 then text = text:sub(1, 250):gsub(',%d*$', '') end
    send(text, name)
  end
  refresh()
end

local toast

local function onComm(prefix, text, _, sender)
  if prefix ~= COMM or IsSecret(text) or IsSecret(sender) then return end
  local name = short(sender)
  if not name or name == me then return end
  local kind = text:sub(1, 1)
  if kind == 'H' then
    local proto, ver = text:match('^H|(%d+)|(.*)$')
    if proto ~= PROTO then return end
    hasAddon[name] = ver
    queueList(0.5)
  elseif kind == 'L' then
    local seq, n, total, payload = text:match('^L|(%d+)|(%d+)/(%d+)|(.*)$')
    if seq then
      hasAddon[name] = hasAddon[name] or '?'
      onList(name, tonumber(seq), tonumber(n), tonumber(total), payload)
    end
  elseif kind == 'D' then
    told[name] = told[name] or {}
    for id in text:sub(3):gmatch('%d+') do told[name][tonumber(id)] = 'done' end
    refresh()
  elseif kind == 'R' then
    local id = tonumber(text:match('^R|(%d+)'))
    if id and toast then toast(name, id) end
  end
end

-- Sharing ----------------------------------------------------------------------

local queue = {}
local sharing = false
local clickMode = false  -- set if the game refuses shares that don't come from a click
local lastPush = { id = nil, t = 0 }
local stats = {}
local shareNext

local function push(id)
  local index = logIndex(id)
  if not index or index < 1 then return false end
  local kind, sel = selectedQuest()
  selectQuest(id, index)
  lastPush.id, lastPush.t = id, GetTime()
  local ok, err = pcall(QuestLogPushQuest, index)
  restoreSelection(kind, sel)
  if not ok then say('Share failed: ' .. tostring(err)) return false end
  return true
end

local function finish(cancelled)
  sharing = false
  wipe(queue)
  local msg = (cancelled and 'Stopped. ' or '') .. 'Shared ' .. (stats.sent or 0) .. ' quest'
    .. ((stats.sent == 1) and '' or 's') .. '.'
  if (stats.skipped or 0) > 0 then msg = msg .. ' Skipped ' .. stats.skipped .. ' (already have it or done).' end
  if (stats.unshareable or 0) > 0 then msg = msg .. ' ' .. stats.unshareable .. " can't be shared." end
  say(msg)
  refresh()
end

function shareNext(fromClick)
  if not sharing then return end
  if #queue == 0 then finish() return end
  if clickMode and not fromClick then refresh() return end
  if inCombat() then after(1, shareNext) refresh() return end
  local id = table.remove(queue, 1)
  if isShareTarget(id) then
    if push(id) then stats.sent = (stats.sent or 0) + 1 end
  else
    stats.skipped = (stats.skipped or 0) + 1
  end
  refresh()
  if #queue == 0 then after(SHARE_GAP, function() if sharing then finish() end end) return end
  if not clickMode then after(SHARE_GAP, shareNext) end
end

local function shareMissing(fromClick)
  if sharing then
    if clickMode and #queue > 0 then shareNext(true) return end
    finish(true)
    return
  end
  if #members == 0 then say('You are not in a group.') return end
  scanMine()
  refreshQuestie()
  wipe(queue)
  stats = { sent = 0, skipped = 0, unshareable = 0 }
  for _, id in ipairs(mineOrder) do
    if not mine[id].shareable then stats.unshareable = stats.unshareable + 1
    elseif isShareTarget(id) then queue[#queue + 1] = id
    else stats.skipped = stats.skipped + 1 end
  end
  if #queue == 0 then
    say('Nothing to share: everyone has your shareable quests or already did them.')
    return
  end
  sharing = true
  shareNext(true)
end

local function shareOne(id)
  if #members == 0 then say('You are not in a group.') return end
  if inCombat() then say("Can't share in combat.") return end
  push(id)
end

-- Share results from system chat. Patterns come from the game's own strings.
local RESULTS = {
  { 'ERR_QUEST_PUSH_ONQUEST_S', 'has' },
  { 'ERR_QUEST_PUSH_ALREADY_DONE_S', 'done' },
  { 'ERR_QUEST_PUSH_INVALID_S', 'cant' },
  { 'ERR_QUEST_PUSH_INVALID_TO_RECIPIENT_S', 'cant' },
  { 'ERR_QUEST_PUSH_LOW_LEVEL_S', 'cant' },
  { 'ERR_QUEST_PUSH_HIGH_LEVEL_S', 'cant' },
  { 'ERR_QUEST_PUSH_CLASS_S', 'cant' },
  { 'ERR_QUEST_PUSH_RACE_S', 'cant' },
  { 'ERR_QUEST_PUSH_EXPANSION_S', 'cant' },
  { 'ERR_QUEST_PUSH_NOT_ALLOWED_S', 'cant' },
  { 'ERR_QUEST_PUSH_LOG_FULL_S', 'full' },
  { 'ERR_QUEST_PUSH_TOO_FAR_S', 'far' },
  { 'ERR_QUEST_PUSH_BUSY_S', 'busy' },
  { 'ERR_QUEST_PUSH_DECLINED_S', 'declined', true },
  { 'ERR_QUEST_PUSH_ACCEPTED_S', 'accepted', true },
  { 'ERR_QUEST_PUSH_SUCCESS_S', 'sent' },
}
local patterns = {}

local function toPattern(fmt)
  local p = fmt:gsub('([%(%)%.%%%+%-%*%?%[%]%^%$])', '%%%1')
  p = p:gsub('%%%%%d%%%$s', '(.+)'):gsub('%%%%s', '(.+)')
  return '^' .. p .. '$'
end

local function buildPatterns()
  wipe(patterns)
  for _, r in ipairs(RESULTS) do
    local fmt = _G[r[1]]
    if type(fmt) == 'string' and not IsSecret(fmt) then
      patterns[#patterns + 1] = { pattern = toPattern(fmt), state = r[2], late = r[3], global = r[1] }
    end
  end
end

local reached = {}  -- name -> true once a "Sharing quest with X" line named them

local function onSystem(text)
  if not text or IsSecret(text) then return end
  for _, p in ipairs(patterns) do
    local who = text:match(p.pattern)
    if who then
      who = short(who)
      if p.state == 'sent' then reached[who] = true return end
      if p.late then return end  -- accept/decline come later and don't name the quest
      if lastPush.id and GetTime() - lastPush.t <= RESULT_WINDOW then
        told[who] = told[who] or {}
        told[who][lastPush.id] = p.state
        refresh()
      end
      return
    end
  end
end

-- Ask toast (someone wants one of your quests) ---------------------------------

local toastFrame
function toast(from, id)
  local q = mine[id]
  if not q or not q.shareable then return end
  if not toastFrame then
    local f = CreateFrame('Frame', 'ForeverQuestShareToast', UIParent, BackdropTemplateMixin and 'BackdropTemplate' or nil)
    f:SetSize(320, 58)
    f:SetPoint('TOP', UIParent, 'TOP', 0, -140)
    f:SetFrameStrata('DIALOG')
    f.bg = f:CreateTexture(nil, 'BACKGROUND')
    f.bg:SetAllPoints()
    if not setAtlas(f.bg, 'damagemeters-background') then f.bg:SetColorTexture(0, 0, 0, 0.85) end
    f.text = f:CreateFontString(nil, 'OVERLAY', 'GameFontHighlight')
    f.text:SetPoint('TOPLEFT', 10, -8)
    f.text:SetPoint('TOPRIGHT', -10, -8)
    f.text:SetJustifyH('LEFT')
    f.share = CreateFrame('Button', nil, f, 'UIPanelButtonTemplate')
    f.share:SetSize(80, 20)
    f.share:SetPoint('BOTTOMRIGHT', -92, 8)
    f.share:SetText('Share')
    f.share:SetScript('OnClick', function() shareOne(f.questID) f:Hide() end)
    f.close = CreateFrame('Button', nil, f, 'UIPanelButtonTemplate')
    f.close:SetSize(80, 20)
    f.close:SetPoint('BOTTOMRIGHT', -8, 8)
    f.close:SetText('Not now')
    f.close:SetScript('OnClick', function() f:Hide() end)
    toastFrame = f
  end
  toastFrame.questID = id
  toastFrame.text:SetText('|cffffd100' .. from .. '|r wants |cffffffff' .. q.title .. '|r')
  toastFrame:Show()
  local shownAt = GetTime()
  toastFrame.shownAt = shownAt
  after(30, function() if toastFrame.shownAt == shownAt then toastFrame:Hide() end end)
end

local function ask(owner, id)
  if not hasAddon[owner] then return end
  send('R|' .. id, owner)
  say('Asked ' .. owner .. ' to share ' .. questTitle(id) .. '.')
end

-- Party Quests panel -------------------------------------------------------------

local panel, rows, offset = nil, {}, 0
local floating = false   -- panel opened from the minimap or /fqs while the map is closed
local lines = {}

local function stateColor(s)
  if s == 'has' then return '|cff33ff33' end
  if s == 'done' then return '|cffffd100' end
  if s == 'cant' then return '|cffff4040' end
  if s == 'lacks' then return '|cffbbbbbb' end
  return '|cff777777'
end

local function namesWith(id, want)
  local out = {}
  for _, n in ipairs(members) do
    local s = stateOf(n, id)
    if want(s) then out[#out + 1] = n end
  end
  return out
end

local function missingOf(id)
  return namesWith(id, function(s) return s ~= 'has' and s ~= 'done' and s ~= 'cant' end)
end

local function whoText(list, id)
  if inRaid then return #list .. ' of ' .. #members end
  local out = {}
  for _, n in ipairs(list) do
    if stateOf(n, id) == nil then out[#out + 1] = '|cff777777' .. n .. '?|r' else out[#out + 1] = n end
  end
  return table.concat(out, ', ')
end

local function buildLines()
  wipe(lines)
  local canShare, everyone, unshareable, theirsOnly = {}, {}, {}, {}
  for _, id in ipairs(mineOrder) do
    local q = mine[id]
    if not q.shareable then unshareable[#unshareable + 1] = id
    elseif #members > 0 and isShareTarget(id) then canShare[#canShare + 1] = id
    else everyone[#everyone + 1] = id end
  end
  local seen = {}
  for _, n in ipairs(members) do
    local list = theirs[n] or qLogs[n]
    if list then
      for id in pairs(list) do
        if not mine[id] then
          if not seen[id] then seen[id] = {} theirsOnly[#theirsOnly + 1] = id end
          table.insert(seen[id], n)
        end
      end
    end
  end
  table.sort(theirsOnly, function(a, b) return questTitle(a) < questTitle(b) end)

  local function section(key, label, ids, make)
    lines[#lines + 1] = { header = true, key = key, text = label .. ' (' .. #ids .. ')' }
    if db.collapsed[key] then return end
    for _, id in ipairs(ids) do lines[#lines + 1] = make(id) end
  end

  section('share', 'You can share', canShare, function(id)
    local miss = missingOf(id)
    return { id = id, left = mine[id].title, right = (inRaid and 'missing ' or '') .. whoText(miss, id),
      button = 'Share', tip = 'share' }
  end)
  section('theirs', "They have, you don't", theirsOnly, function(id)
    local owners = seen[id]
    local askable
    for _, n in ipairs(owners) do if hasAddon[n] then askable = n break end end
    return { id = id, left = questTitle(id), right = inRaid and (#owners .. ' have it') or table.concat(owners, ', '),
      button = askable and 'Ask' or nil, owner = askable, tip = 'theirs', owners = owners }
  end)
  section('everyone', #members > 0 and 'Everyone has or did it' or 'Your shareable quests', everyone, function(id)
    return { id = id, left = mine[id].title, right = '', tip = 'share' }
  end)
  section('unshareable', "Can't be shared", unshareable, function(id)
    return { id = id, left = mine[id].title, right = '', tip = 'share' }
  end)
end

-- What the tooltip says about one member and one quest, including whether
-- they completed it. "Completed" is only knowable when the member runs this
-- add-on (their client checks its own history) or a share bounced with
-- "has completed that quest"; the game gives no other way to read it.
local function stateText(name, id)
  local s = stateOf(name, id)
  if s == 'done' then return 'completed it', 1, 0.82, 0 end
  if s == 'has' then return 'has it, not turned in yet', 0.2, 1, 0.2 end
  if s == 'cant' then return "can't take it", 1, 0.25, 0.25 end
  if s == 'lacks' then
    if hasAddon[name] then return "doesn't have it, never completed it", 0.85, 0.85, 0.85 end
    return "doesn't have it, completed: unknown", 0.6, 0.6, 0.6
  end
  if s and STATE_TEXT[s] then return STATE_TEXT[s], 0.8, 0.8, 0.8 end
  if hasAddon[name] then return 'waiting for their quest list', 0.5, 0.5, 0.5 end
  return 'no data, completed: unknown', 0.5, 0.5, 0.5
end

local function memberTooltip(id)
  local missing = false
  for _, n in ipairs(members) do
    local text, r, g, b = stateText(n, id)
    GameTooltip:AddDoubleLine(n, text, 1, 1, 1, r, g, b)
    if not hasAddon[n] then missing = true end
  end
  if missing then
    GameTooltip:AddLine('Completed quests show only for party members running Forever Quest Share.', 0.6, 0.6, 0.6, true)
  end
end

local function buildRow(i)
  local row = CreateFrame('Frame', nil, panel.list)
  row:SetHeight(ROW_H)
  row:SetPoint('TOPLEFT', panel.list, 'TOPLEFT', 0, -((i - 1) * (ROW_H + ROW_GAP)))
  row:SetPoint('RIGHT', panel.list, 'RIGHT', 0, 0)
  row:EnableMouse(true)

  row.bar = CreateFrame('StatusBar', nil, row)
  row.bar:SetAllPoints()
  if hasAtlas('UI-HUD-CoolDownManager-Bar') then row.bar:SetStatusBarTexture('UI-HUD-CoolDownManager-Bar')
  else row.bar:SetStatusBarTexture(FILL) end
  row.bar:SetMinMaxValues(0, 1)
  row.bar:SetValue(1)
  row.bg = row.bar:CreateTexture(nil, 'BACKGROUND')
  row.bg:SetPoint('TOPLEFT', -2, 2)
  row.bg:SetPoint('BOTTOMRIGHT', 2, -2)
  if not setAtlas(row.bg, 'ui-damagemeters-bar-shadowbg', FLAT) then row.bg:SetVertexColor(0, 0, 0, 0.45) end

  row.btn = CreateFrame('Button', nil, row, 'UIPanelButtonTemplate')
  row.btn:SetSize(46, ROW_H - 2)
  row.btn:SetFrameLevel(row.bar:GetFrameLevel() + 2)
  row.btn:SetPoint('RIGHT', -1, 0)
  local bf = row.btn:GetFontString()
  if bf then local f, s, fl = bf:GetFont() if f and s then bf:SetFont(f, s * 0.85, fl) end end

  local font = NumberFontNormal and 'NumberFontNormal' or 'GameFontHighlightSmall'
  row.left = row.bar:CreateFontString(nil, 'OVERLAY', font)
  row.left:SetPoint('LEFT', 4, 0)
  row.left:SetJustifyH('LEFT')
  row.left:SetWordWrap(false)
  row.right = row.bar:CreateFontString(nil, 'OVERLAY', font)
  row.right:SetJustifyH('RIGHT')
  row.right:SetWordWrap(false)
  row.left:SetPoint('RIGHT', row.right, 'LEFT', -6, 0)
  for _, fs in ipairs({ row.left, row.right }) do
    local f, s, fl = fs:GetFont()
    if f and s then fs:SetFont(f, s * 0.9, fl) end
  end

  row:SetScript('OnMouseUp', function(self)
    local line = self.line
    if line and line.header then
      db.collapsed[line.key] = not db.collapsed[line.key]
      refresh()
    end
  end)
  row:SetScript('OnEnter', function(self)
    local line = self.line
    if not line or line.header then return end
    GameTooltip:SetOwner(self, 'ANCHOR_RIGHT')
    GameTooltip:AddLine(questTitle(line.id), 1, 0.82, 0)
    if line.tip == 'theirs' then
      GameTooltip:AddLine('Has it: ' .. table.concat(line.owners, ', '), 1, 1, 1, true)
      if not line.owner then GameTooltip:AddLine('Ask needs someone with it to run Forever Quest Share.', 0.7, 0.7, 0.7, true) end
    else
      memberTooltip(line.id)
    end
    GameTooltip:Show()
  end)
  row:SetScript('OnLeave', function() GameTooltip:Hide() end)
  row.btn:SetScript('OnClick', function(self)
    local line = self:GetParent().line
    if not line then return end
    if line.button == 'Share' then shareOne(line.id)
    elseif line.button == 'Ask' then ask(line.owner, line.id) end
  end)
  rows[i] = row
  return row
end

local function drawRows()
  local maxOff = math.max(0, #lines - PANEL_ROWS)
  if offset > maxOff then offset = maxOff end
  for i = 1, PANEL_ROWS do
    local row = rows[i]
    local line = lines[i + offset]
    row.line = line
    if not line then row:Hide()
    else
      row:Show()
      if line.header then
        row.left:SetText((db.collapsed[line.key] and '+ ' or '- ') .. line.text)
        row.left:SetTextColor(1, 0.82, 0)
        row.right:SetText('')
        row.bar:SetStatusBarColor(0.08, 0.08, 0.08)
        row.btn:Hide()
      else
        local q = mine[line.id]
        local lvl = q and q.level or (line.owners and theirs[line.owners[1]] and theirs[line.owners[1]][line.id]
          and theirs[line.owners[1]][line.id].level)
        row.left:SetText((lvl and lvl > 0 and ('[' .. lvl .. '] ') or '') .. line.left)
        row.left:SetTextColor(1, 1, 1)
        row.right:SetText(line.right or '')
        row.right:SetTextColor(0.75, 0.75, 0.75)
        row.bar:SetStatusBarColor(0.16, 0.16, 0.16)
        if line.button then
          row.btn:SetText(line.button)
          row.btn:Show()
          row.btn:SetEnabled(not inCombat())
          row.right:SetPoint('RIGHT', row.btn, 'LEFT', -4, 0)
        else
          row.btn:Hide()
          row.right:SetPoint('RIGHT', row, 'RIGHT', -4, 0)
        end
      end
    end
  end
end

local function memberLine()
  if #members == 0 then return 'Not in a group.' end
  if inRaid then
    local a, q, n = 0, 0, 0
    for _, m in ipairs(members) do
      local s = source(m)
      if s == 'add-on' then a = a + 1 elseif s == 'Questie' then q = q + 1 else n = n + 1 end
    end
    return ('Raid of %d: %d with this add-on, %d via Questie, %d no data'):format(#members + 1, a, q, n)
  end
  local out = {}
  for _, m in ipairs(members) do out[#out + 1] = m .. ' |cff888888(' .. source(m) .. ')|r' end
  return table.concat(out, '   ')
end

local function shareButtonText()
  if sharing then
    if clickMode then return 'Share next (' .. #queue .. ' left)' end
    return 'Sharing... ' .. #queue .. ' left (click to stop)'
  end
  local n = 0
  for _, id in ipairs(mineOrder) do if isShareTarget(id) then n = n + 1 end end
  return 'Share missing (' .. n .. ')'
end

local function placePanel()
  if not panel then return end
  panel:ClearAllPoints()
  if WorldMapFrame and WorldMapFrame:IsShown() then
    panel:SetPoint('TOPLEFT', WorldMapFrame, 'TOPRIGHT', 36, 0)
    panel:SetFrameStrata(WorldMapFrame:GetFrameStrata())
    panel:SetFrameLevel(WorldMapFrame:GetFrameLevel() + 20)
  elseif db.left and db.top then
    panel:SetFrameStrata('HIGH')
    panel:SetPoint('TOPLEFT', UIParent, 'BOTTOMLEFT', db.left, db.top)
  else
    panel:SetFrameStrata('HIGH')
    panel:SetPoint('RIGHT', UIParent, 'RIGHT', -40, 60)
  end
end

local function buildPanel()
  panel = CreateFrame('Frame', 'ForeverQuestSharePanel', UIParent)
  panel:SetSize(PANEL_W, HEADER_H + 26 + 18 + PANEL_ROWS * (ROW_H + ROW_GAP) + 8)
  panel:SetFrameStrata('HIGH')
  panel:SetClampedToScreen(true)
  panel:SetMovable(true)
  panel:EnableMouse(true)
  panel:Hide()
  panel.bg = panel:CreateTexture(nil, 'BACKGROUND')
  panel.bg:SetAllPoints()
  if not setAtlas(panel.bg, 'damagemeters-background') then panel.bg:SetColorTexture(0, 0, 0, 0.85) end

  local header = CreateFrame('Frame', nil, panel)
  header:SetPoint('TOPLEFT')
  header:SetPoint('TOPRIGHT')
  header:SetHeight(HEADER_H)
  header:EnableMouse(true)
  header.bg = header:CreateTexture(nil, 'BACKGROUND', nil, 1)
  header.bg:SetAllPoints()
  if not setAtlas(header.bg, 'ui-damagemeters-header-bar', FLAT) then header.bg:SetColorTexture(0.12, 0.12, 0.14, 0.95) end
  header:SetScript('OnMouseDown', function(_, button)
    if button == 'LeftButton' and not (WorldMapFrame and WorldMapFrame:IsShown()) then panel:StartMoving() end
  end)
  header:SetScript('OnMouseUp', function()
    panel:StopMovingOrSizing()
    if not (WorldMapFrame and WorldMapFrame:IsShown()) then
      db.left, db.top = panel:GetLeft(), panel:GetTop()
    end
  end)
  local title = header:CreateFontString(nil, 'OVERLAY', 'GameFontNormal')
  title:SetPoint('LEFT', 10, 0)
  title:SetText('Party Quests')

  local close = CreateFrame('Button', nil, header)
  close:SetSize(18, 18)
  close:SetPoint('TOPRIGHT', -5, -6)
  if hasAtlas('uitools-icon-close') then close:SetNormalAtlas('uitools-icon-close')
  else close:SetNormalTexture('Interface\\Buttons\\UI-Panel-MinimizeButton-Up') end
  close:SetScript('OnClick', function() db.panel = false panel:Hide() end)

  panel.share = CreateFrame('Button', nil, panel, 'UIPanelButtonTemplate')
  panel.share:SetHeight(22)
  panel.share:SetPoint('TOPLEFT', header, 'BOTTOMLEFT', 6, -2)
  panel.share:SetPoint('TOPRIGHT', header, 'BOTTOMRIGHT', -6, -2)
  panel.share:SetScript('OnClick', function() shareMissing(true) end)

  panel.who = panel:CreateFontString(nil, 'OVERLAY', 'GameFontHighlightSmall')
  panel.who:SetPoint('TOPLEFT', panel.share, 'BOTTOMLEFT', 2, -3)
  panel.who:SetPoint('TOPRIGHT', panel.share, 'BOTTOMRIGHT', -2, -3)
  panel.who:SetJustifyH('LEFT')
  panel.who:SetWordWrap(false)

  panel.list = CreateFrame('Frame', nil, panel)
  panel.list:SetPoint('TOPLEFT', panel.share, 'BOTTOMLEFT', 0, -18)
  panel.list:SetPoint('BOTTOMRIGHT', panel, 'BOTTOMRIGHT', -6, 6)
  panel:EnableMouseWheel(true)
  panel:SetScript('OnMouseWheel', function(_, delta)
    offset = math.max(0, offset - delta * 3)
    drawRows()
  end)
  for i = 1, PANEL_ROWS do buildRow(i) end
  panel:SetScript('OnShow', placePanel)
end

-- Markers on the quest log rows ----------------------------------------------------

local PIP = 12
local hooked = {}

local function pipTexture(tex, s)
  tex:SetDesaturated(false)
  tex:SetVertexColor(1, 1, 1, 1)
  tex:SetAlpha(1)
  if s == 'has' then tex:SetTexture(TEX_CHECK)
  elseif s == 'done' then tex:SetTexture(TEX_CHECK) tex:SetDesaturated(true) tex:SetVertexColor(1, 0.82, 0.1, 1)
  elseif s == 'cant' then tex:SetTexture(TEX_NO)
  elseif s == 'lacks' or s == 'far' or s == 'busy' or s == 'full' or s == 'declined' then
    tex:SetTexture(FLAT) tex:SetVertexColor(0.7, 0.7, 0.7, 1)
  else tex:SetTexture(TEX_WAIT) tex:SetAlpha(0.35) end
end

local function titleTooltip(button)
  local id = button.questID
  if not db.pips or not id or not mine[id] or #members == 0 then return end
  if not GameTooltip:IsOwned(button) then GameTooltip:SetOwner(button, 'ANCHOR_RIGHT') end
  GameTooltip:AddLine(' ')
  GameTooltip:AddLine(inRaid and 'Your raid' or 'Your party', 0.2, 1, 0.6)
  if inRaid then
    local groups = {}
    for _, n in ipairs(members) do
      local text = stateText(n, id)
      groups[text] = groups[text] or {}
      table.insert(groups[text], n)
    end
    for text, names in pairs(groups) do
      GameTooltip:AddLine(text .. ': ' .. table.concat(names, ', '), 1, 1, 1, true)
    end
  else
    memberTooltip(id)
  end
  GameTooltip:Show()
end

local function decorate(button)
  local id = button.questID
  local holder = button.fqsPips
  if not db.pips or not id or not mine[id] or #members == 0 then
    if holder then holder:Hide() end
    return
  end
  if not holder then
    holder = CreateFrame('Frame', nil, button)
    holder:SetSize(4 * (PIP + 1), PIP)
    holder:SetPoint('RIGHT', button, 'RIGHT', -26, 0)
    holder:SetFrameLevel(button:GetFrameLevel() + 5)
    holder.tex = {}
    for i = 1, 4 do
      local t = holder:CreateTexture(nil, 'OVERLAY')
      t:SetSize(PIP, PIP)
      t:SetPoint('RIGHT', holder, 'RIGHT', -((4 - i) * (PIP + 1)), 0)
      holder.tex[i] = t
    end
    holder.count = holder:CreateFontString(nil, 'OVERLAY', 'GameFontHighlightSmall')
    holder.count:SetPoint('RIGHT')
    button.fqsPips = holder
  end
  if not hooked[button] and button.HookScript then
    hooked[button] = true
    button:HookScript('OnEnter', titleTooltip)
  end
  holder:Show()
  if inRaid then
    for i = 1, 4 do holder.tex[i]:Hide() end
    local have = #namesWith(id, function(s) return s == 'has' or s == 'done' end)
    local color = (have == #members) and '|cff33ff33' or '|cffcccccc'
    holder.count:SetText(color .. have .. '/' .. #members .. '|r')
    holder.count:Show()
  else
    holder.count:Hide()
    local n = #members
    for i = 1, 4 do
      local t = holder.tex[i]
      local name = members[i - (4 - n)]
      if name and i > 4 - n then
        local s = stateOf(name, id)
        pipTexture(t, s)
        if s == 'lacks' or s == 'far' or s == 'busy' or s == 'full' or s == 'declined' then
          t:SetSize(PIP - 4, 2)
        else
          t:SetSize(PIP, PIP)
        end
        t:Show()
      else
        t:Hide()
      end
    end
  end
end

local logFound = false
function decorateLog()
  local pool = QuestScrollFrame and QuestScrollFrame.titleFramePool
  if not pool or not pool.EnumerateActive then return end
  logFound = true
  for button in pool:EnumerateActive() do
    local ok = pcall(decorate, button)
    if not ok then break end
  end
end

-- Map tab button ---------------------------------------------------------------------

local tab
local function buildTab()
  if tab or not WorldMapFrame then return end
  tab = CreateFrame('Button', 'ForeverQuestShareMapTab', WorldMapFrame)
  tab:SetSize(32, 32)
  tab:SetPoint('TOPLEFT', WorldMapFrame, 'TOPRIGHT', 2, -40)
  tab:SetFrameStrata('HIGH')
  local icon = tab:CreateTexture(nil, 'ARTWORK')
  icon:SetAllPoints()
  icon:SetTexture(ICON)
  icon:SetTexCoord(0.08, 0.92, 0.08, 0.92)
  tab:SetHighlightTexture('Interface\\Buttons\\ButtonHilight-Square', 'ADD')
  tab:SetScript('OnClick', function()
    db.panel = not db.panel
    refresh()
  end)
  tab:SetScript('OnEnter', function(self)
    GameTooltip:SetOwner(self, 'ANCHOR_RIGHT')
    GameTooltip:AddLine('Party Quests')
    GameTooltip:AddLine('Show which quests your group has, and share the missing ones.', 1, 1, 1, true)
    GameTooltip:Show()
  end)
  tab:SetScript('OnLeave', function() GameTooltip:Hide() end)
  WorldMapFrame:HookScript('OnShow', function() refresh() end)
  WorldMapFrame:HookScript('OnHide', function() floating = false refresh() end)
end

-- Refresh ------------------------------------------------------------------------------

local refreshPending = false

local function doRefresh()
  refreshPending = false
  if not db then return end
  refreshQuestie()
  if panel then
    local mapOpen = WorldMapFrame and WorldMapFrame:IsShown()
    if tab then tab:SetShown(mapOpen and true or false) end
    local want = db.panel and (mapOpen or floating)
    if want then
      if not panel:IsShown() then panel:Show() end
      placePanel()
      buildLines()
      panel.share:SetText(shareButtonText())
      panel.share:SetEnabled(#members > 0 and not inCombat())
      panel.who:SetText(memberLine())
      drawRows()
    else
      panel:Hide()
    end
  end
  if QuestScrollFrame and QuestScrollFrame:IsVisible() then decorateLog() end
end

function refresh()
  if refreshPending then return end
  refreshPending = true
  after(0.1, doRefresh)
end

local function togglePanel()
  local mapOpen = WorldMapFrame and WorldMapFrame:IsShown()
  if mapOpen then
    db.panel = not db.panel
  else
    floating = not (panel and panel:IsShown())
    if floating then db.panel = true end
  end
  refresh()
end

-- Minimap button ---------------------------------------------------------------------------

local mm
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

local function buildMinimapButton()
  mm = CreateFrame('Button', 'ForeverQuestShareMinimapButton', Minimap)
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
  icon:SetTexture(ICON)
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
  mm:SetScript('OnClick', function(_, button)
    if button == 'RightButton' then shareMissing(true) else togglePanel() end
  end)
  mm:SetScript('OnEnter', function(self)
    GameTooltip:SetOwner(self, 'ANCHOR_LEFT')
    GameTooltip:AddLine('Forever Quest Share')
    GameTooltip:AddLine('Left-click: Party Quests panel', 1, 1, 1)
    GameTooltip:AddLine('Right-click: ' .. shareButtonText(), 1, 1, 1)
    GameTooltip:AddLine('Drag: move this button', 1, 1, 1)
    GameTooltip:Show()
  end)
  mm:SetScript('OnLeave', function() GameTooltip:Hide() end)
  updateMinimap()
end

-- Debug --------------------------------------------------------------------------------------

local function yes(v) return v and '|cff33ff33yes|r' or '|cffff4040no|r' end

local function debug()
  scanMine()
  refreshQuestie()
  local _, _, _, build = GetBuildInfo()
  say('debug, interface ' .. tostring(build))
  say('C_QuestLog.GetInfo ' .. yes(C_QuestLog and C_QuestLog.GetInfo) .. ', GetQuestLogTitle ' .. yes(GetQuestLogTitle))
  say('IsPushableQuest ' .. yes(C_QuestLog and C_QuestLog.IsPushableQuest) .. ', GetQuestLogPushable ' .. yes(GetQuestLogPushable)
    .. ', QuestLogPushQuest ' .. yes(QuestLogPushQuest))
  say('GetLogIndexForQuestID ' .. yes(C_QuestLog and C_QuestLog.GetLogIndexForQuestID)
    .. ', IsQuestFlaggedCompleted ' .. yes((C_QuestLog and C_QuestLog.IsQuestFlaggedCompleted) or IsQuestFlaggedCompleted))
  local sh = 0
  for _, id in ipairs(mineOrder) do if mine[id].shareable then sh = sh + 1 end end
  say(('Quest log: %d entries, %d quests read, %d shareable'):format(numEntries(), #mineOrder, sh))
  say('Quest log rows found: ' .. yes(QuestScrollFrame and QuestScrollFrame.titleFramePool)
    .. ' (QuestLogQuests_Update ' .. yes(QuestLogQuests_Update) .. ', decorated ' .. yes(logFound) .. ')')
  say(('Share result strings found: %d of %d'):format(#patterns, #RESULTS))
  say('Add-on messages: ' .. yes(C_ChatInfo and C_ChatInfo.SendAddonMessage) .. ', chat lockdown ' .. tostring(chatLocked())
    .. ', channel ' .. tostring(channel()) .. ', last send result ' .. tostring(lastSendResult))
  local qc = questie()
  local qn = 0
  for _ in pairs(qLogs) do qn = qn + 1 end
  say('Questie party data: ' .. yes(qc) .. ', members heard from: ' .. qn)
  say('Timed shares: ' .. (clickMode and '|cffff4040blocked, one share per click|r' or 'allowed so far'))
  for _, n in ipairs(members) do
    local c = 0
    for _, id in ipairs(mineOrder) do if stateOf(n, id) then c = c + 1 end end
    say(('  %s: %s, knows %d of your %d quests%s'):format(n, source(n), c, #mineOrder,
      reached[n] and ', a share reached them' or ''))
  end
end

-- Events --------------------------------------------------------------------------------------

local ev = CreateFrame('Frame')

local function onBlocked(addon, func)
  if addon ~= ADDON then return end
  say('The game blocked ' .. tostring(func) .. '.')
  if tostring(func):find('QuestLogPushQuest') and sharing then
    clickMode = true
    say('Timed shares are not allowed here, so the button now shares one quest per click.')
    if lastPush.id then table.insert(queue, 1, lastPush.id) stats.sent = math.max(0, (stats.sent or 1) - 1) end
    refresh()
  end
end

local function init()
  ForeverQuestShareDB = type(ForeverQuestShareDB) == 'table' and ForeverQuestShareDB or {}
  db = ForeverQuestShareDB
  for k, v in pairs(DEFAULTS) do
    if db[k] == nil then
      if type(v) == 'table' then
        db[k] = {}
        for kk, vv in pairs(v) do db[k][kk] = vv end
      else
        db[k] = v
      end
    end
  end
  me = unitKey('player')
  if C_ChatInfo and C_ChatInfo.RegisterAddonMessagePrefix then pcall(C_ChatInfo.RegisterAddonMessagePrefix, COMM) end
  buildPatterns()
  scanMine()
  readRoster()
  pcall(buildPanel)
  pcall(buildTab)
  pcall(buildMinimapButton)
  if QuestLogQuests_Update then pcall(hooksecurefunc, 'QuestLogQuests_Update', decorateLog) end
  for _, e in ipairs({ 'GROUP_ROSTER_UPDATE', 'QUEST_LOG_UPDATE', 'QUEST_ACCEPTED', 'QUEST_REMOVED',
    'QUEST_TURNED_IN', 'CHAT_MSG_ADDON', 'CHAT_MSG_SYSTEM', 'PLAYER_REGEN_ENABLED', 'PLAYER_REGEN_DISABLED',
    'ADDON_ACTION_BLOCKED', 'ADDON_ACTION_FORBIDDEN', 'PLAYER_ENTERING_WORLD' }) do
    pcall(ev.RegisterEvent, ev, e)
  end
  if channel() then send('H|' .. PROTO .. '|' .. VERSION) queueList() end
  refresh()
end

local logDirty = false
ev:SetScript('OnEvent', function(_, event, ...)
  if event == 'PLAYER_LOGIN' then
    local ok, err = pcall(init)
    if not ok then say('failed to start: ' .. tostring(err)) end
    return
  end
  if not db then return end
  if event == 'CHAT_MSG_ADDON' then onComm(...)
  elseif event == 'CHAT_MSG_SYSTEM' then onSystem(...)
  elseif event == 'GROUP_ROSTER_UPDATE' or event == 'PLAYER_ENTERING_WORLD' then
    local fresh = readRoster()
    if fresh and channel() then send('H|' .. PROTO .. '|' .. VERSION) queueList() end
    refresh()
  elseif event == 'QUEST_LOG_UPDATE' then
    -- Fires often; rescan at most twice a second, and only tell the group when the list changed.
    if not logDirty then
      logDirty = true
      after(0.5, function()
        logDirty = false
        local before = table.concat(mineOrder, ',')
        local doneBefore = {}
        for id, q in pairs(mine) do doneBefore[id] = q.complete end
        scanMine()
        local changed = table.concat(mineOrder, ',') ~= before
        for id, q in pairs(mine) do if doneBefore[id] ~= q.complete then changed = true end end
        if changed and channel() then queueList() end
        refresh()
      end)
    end
  elseif event == 'QUEST_ACCEPTED' or event == 'QUEST_REMOVED' or event == 'QUEST_TURNED_IN' then
    -- A turn-in tells the group you completed it, so their markers go gold
    -- even though the quest also left your list.
    local id = ...
    if event == 'QUEST_TURNED_IN' and tonumber(id) and channel() then send('D|' .. id) end
    scanMine()
    if channel() then queueList() end
    refresh()
  elseif event == 'ADDON_ACTION_BLOCKED' or event == 'ADDON_ACTION_FORBIDDEN' then onBlocked(...)
  else
    refresh()
  end
end)
ev:RegisterEvent('PLAYER_LOGIN')

-- Slash -----------------------------------------------------------------------------------------

SLASH_FOREVERQUESTSHARE1 = '/fqs'
SlashCmdList.FOREVERQUESTSHARE = function(msg)
  msg = (msg or ''):lower():gsub('^%s+', ''):gsub('%s+$', '')
  if msg == 'share' then shareMissing(true)
  elseif msg == 'debug' then debug()
  elseif msg == 'pips' then
    db.pips = not db.pips
    say('Quest log markers ' .. (db.pips and 'on.' or 'off.'))
    decorateLog()
  elseif msg == 'minimap' then
    db.minimap = not db.minimap
    updateMinimap()
  elseif msg == 'send' then
    sendList()
    say('Quest list sent to the group.')
  elseif msg == 'help' then
    say('/fqs  panel   /fqs share  share missing   /fqs pips  quest log markers on/off')
    say('/fqs minimap  minimap button on/off   /fqs send  resend your list   /fqs debug')
  else
    togglePanel()
  end
end
