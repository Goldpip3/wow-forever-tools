--[[
  Forever Threat: docked mode.

  Adds a "Threat" choice to the built-in damage meter's type dropdown. When it
  is picked, the damage meter's own row list is hidden and the threat list is
  drawn in the same window, using Blizzard's row template, so the rows are the
  ones the damage meter draws. Picking any damage type again puts the window
  back.

  Nothing here changes what Blizzard's code stores. The window's saved type
  stays whatever damage type it had, so the game never has to load a type it
  does not know. The addon remembers on its own which windows were docked.

  Everything is guarded: if Forever changes the damage meter and a hook stops
  matching, the docked mode turns itself off and the standalone window is
  still there.
]]

local ADDON, ns = ...

local docks = {}        -- session window -> state
local ticker
local TICK = 0.05

local function say(msg) if ns.say then ns.say(msg) end end
local function plain(v) return ns.plain and ns.plain(v) end

local function anyActive()
  for _, state in pairs(docks) do
    if state.active then return true end
  end
  return false
end
ns.dockActive = anyActive

-- Window plumbing ---------------------------------------------------------------

local function part(window, getter)
  local ok, v = pcall(window[getter], window)
  if ok then return v end
end

local function hideBlizzardList(window)
  for _, getter in ipairs({ 'GetScrollBox', 'GetScrollBar', 'GetLocalPlayerEntry' }) do
    local f = part(window, getter)
    if f then pcall(f.Hide, f) end
  end
  local notActive = part(window, 'GetNotActiveFontString')
  if notActive then pcall(notActive.SetText, notActive, nil) end
  local typeName = part(window, 'GetDamageMeterTypeName')
  if typeName then pcall(typeName.SetText, typeName, 'Threat') end
  local session = part(window, 'GetSessionDropdown')
  if session then pcall(session.Hide, session) end
end

local function showBlizzardList(window)
  for _, getter in ipairs({ 'GetScrollBox', 'GetScrollBar' }) do
    local f = part(window, getter)
    if f then pcall(f.Show, f) end
  end
  local session = part(window, 'GetSessionDropdown')
  if session then pcall(session.Show, session) end
  -- Puts the type name and the local player row back the way Blizzard wants them.
  pcall(window.SetDamageMeterType, window, window:GetDamageMeterType())
end

local function overlayFor(window, state)
  if state.overlay then return state.overlay end
  local container = part(window, 'GetMinimizeContainer') or window
  local header = part(window, 'GetHeader')
  local overlay = CreateFrame('Frame', nil, container)
  overlay:SetFrameLevel(container:GetFrameLevel() + 5)
  -- The damage meter's own list sits between these two anchors.
  if header then
    overlay:SetPoint('TOPLEFT', header, 'BOTTOMLEFT', 5, -2)
  else
    overlay:SetPoint('TOPLEFT', 5, -34)
  end
  overlay:SetPoint('BOTTOMRIGHT', -1, 6)
  if overlay.SetClipsChildren then overlay:SetClipsChildren(true) end
  overlay.rows = {}
  state.overlay = overlay
  return overlay
end

local function rowFor(window, state, i)
  local overlay = overlayFor(window, state)
  local row = overlay.rows[i]
  if row then return row end
  local ok, made = pcall(CreateFrame, 'Button', nil, overlay, 'DamageMeterSourceEntryTemplate')
  if not ok or not made then return nil end
  row = made
  row:EnableMouse(true)
  row:SetScript('OnEnter', function(self) if ns.rowTooltip then ns.rowTooltip(self) end end)
  row:SetScript('OnLeave', function() GameTooltip:Hide() end)
  overlay.rows[i] = row
  return row
end

local function setupRow(window, row)
  -- The same calls Blizzard makes on its own rows, so ours take the user's
  -- Edit Mode settings for height, text size, icons, style and opacity.
  pcall(row.SetUseClassColor, row, false)
  pcall(row.SetBarHeight, row, window:GetBarHeight())
  pcall(row.SetTextScale, row, window:GetTextScale())
  pcall(row.SetShowBarIcons, row, window:ShouldShowBarIcons())
  pcall(row.SetStyle, row, window:GetStyle())
  pcall(row.SetNumberDisplayType, row, window:GetNumberDisplayType())
  pcall(row.SetBackgroundAlpha, row, window:GetBackgroundAlpha())
end

-- Drawing -----------------------------------------------------------------------

local function drawRow(window, row, e, rank, isNext, topValue)
  row.entry = e

  -- Fields the template's own update functions read.
  row.sourceName = nil
  row.index = rank
  row.classFilename = (not e.isPet and e.class) or ''
  row.specIconID = 0
  row.isCreature = e.isPet and true or false
  row.classification = nil
  row.suppressIcon = false
  row.deathRecapID = nil
  row.isLocalPlayer = e.isPlayer
  pcall(row.UpdateIcon, row)

  local pct = plain(e.raw)
  if e.tanking then
    pct = 100
  elseif e.aggroOnly then
    pct = 100
  elseif pct == nil then
    pct = topValue > 0 and (e.value or 0) / topValue * 100 or 0
  end
  if not ns.IsSecret(pct) then pct = math.floor(pct + 0.5) end
  row.value = pct
  row.maxValue = 100
  pcall(row.UpdateStatusBar, row)

  local r, g, b = ns.rowColor(e, isNext)
  pcall(row.SetStatusBarColor, row, CreateColor(r, g, b))

  local name = row:GetName()
  if e.name == nil then
    name:SetText(rank .. '. ?')
  elseif ns.IsSecret(e.name) then
    pcall(name.SetText, name, e.name)
  else
    name:SetText(rank .. '. ' .. e.name)
  end

  local value = row:GetValue()
  if e.secret then
    if not pcall(value.SetFormattedText, value, '%d%%', e.scaled) then value:SetText('') end
  elseif e.aggroOnly then
    value:SetText('')
  else
    local mode = plain(window:GetNumberDisplayType())
    if Enum and Enum.DamageMeterNumbers and mode == Enum.DamageMeterNumbers.Minimal then
      value:SetText(ns.short(e.value or 0))
    else
      value:SetFormattedText('%s (%d%%)', ns.short(e.value or 0), pct)
    end
  end
  row:Show()
end

local function refreshDock(window, state)
  if not state.active or not window:IsShown() then return end
  hideBlizzardList(window)

  local mob
  if ns.isTest() then ns.collectTest() else mob = ns.collect() end
  local entries = ns.entries

  local timer = part(window, 'GetSessionTimerFontString')
  if timer then
    if ns.isTest() then
      timer:SetText('Test bars')
    elseif mob then
      pcall(timer.SetText, timer, UnitName(mob))
    else
      timer:SetText('')
    end
  end

  local overlay = overlayFor(window, state)
  local h = window:GetBarHeight() or 20
  local gap = window:GetBarSpacing() or 4
  local space = overlay:GetHeight() + gap
  local max = math.floor(space / (h + gap))
  if max < 1 then max = 1 end
  local shown = #entries < max and #entries or max

  local topValue = 0
  local mine
  for i, e in ipairs(entries) do
    if not e.secret and e.value and e.value > topValue then topValue = e.value end
    if e.isPlayer and not mine then mine = i end
  end

  local nextUp
  local someoneTanking = false
  for _, e in ipairs(entries) do
    if e.tanking then someoneTanking = true break end
  end
  if someoneTanking then
    for i, e in ipairs(entries) do
      if not e.tanking and not e.aggroOnly and not e.secret then nextUp = i break end
    end
  end

  for i = 1, shown do
    local index = i
    if mine and i == shown and mine > index then index = mine end
    local row = rowFor(window, state, i)
    if not row then return end
    if not row.docked then
      setupRow(window, row)
      row.docked = true
    end
    row:ClearAllPoints()
    row:SetPoint('TOPLEFT', overlay, 'TOPLEFT', 0, -((i - 1) * (h + gap)))
    row:SetPoint('RIGHT', overlay, 'RIGHT', 0, 0)
    drawRow(window, row, entries[index], index, index == nextUp, topValue)
  end
  for i = shown + 1, #overlay.rows do
    overlay.rows[i].entry = nil
    overlay.rows[i]:Hide()
  end

  local notActive = part(window, 'GetNotActiveFontString')
  if notActive then
    if #entries > 0 then
      notActive:SetText(nil)
    elseif mob then
      notActive:SetText('Nothing has threat on it yet.')
    else
      notActive:SetText('Target a mob to see who has threat on it.')
    end
  end
end

-- Switching ---------------------------------------------------------------------

local function remember()
  local db = ns.db
  if not db then return end
  db.docked = db.docked or {}
  for window, state in pairs(docks) do
    local ok, index = pcall(window.GetSessionWindowIndex, window)
    if ok and index then db.docked[index] = state.active or nil end
  end
end

local function setDocked(window, on)
  local state = docks[window]
  if not state then return end
  if on and not state.active then
    state.active = true
    hideBlizzardList(window)
    refreshDock(window, state)
  elseif not on and state.active then
    state.active = false
    if state.overlay then
      for _, row in ipairs(state.overlay.rows) do row:Hide() end
    end
    local timer = part(window, 'GetSessionTimerFontString')
    if timer then timer:SetText('') end
    showBlizzardList(window)
  end
  remember()
  if ns.refresh then ns.refresh() end
end

local function attach(window)
  if docks[window] then return end
  local state = { active = false }
  docks[window] = state

  -- After any of Blizzard's own refreshes, put the threat list back on top.
  hooksecurefunc(window, 'Refresh', function(w)
    local st = docks[w]
    if st and st.active then hideBlizzardList(w) end
  end)
  -- Picking a damage type from the menu ends docked mode for that window.
  hooksecurefunc(window, 'SetDamageMeterType', function(w)
    local st = docks[w]
    if st and st.active and not st.switching then setDocked(w, false) end
  end)
  -- Bar height, text size and the rest come from Edit Mode; redo our rows.
  for _, m in ipairs({ 'SetBarHeight', 'SetTextScale', 'SetShowBarIcons', 'SetStyle',
    'SetNumberDisplayType', 'SetBackgroundAlpha', 'SetBarSpacing' }) do
    if type(window[m]) == 'function' then
      hooksecurefunc(window, m, function(w)
        local st = docks[w]
        if st and st.overlay then
          for _, row in ipairs(st.overlay.rows) do row.docked = false end
        end
      end)
    end
  end

  local db = ns.db
  local ok, index = pcall(window.GetSessionWindowIndex, window)
  if db and db.docked and ok and index and db.docked[index] then
    setDocked(window, true)
  end
end

local function addMenuEntry()
  if not (Menu and Menu.ModifyMenu) then return false end
  Menu.ModifyMenu('MENU_DAMAGE_METER_WINDOW_TRACKED_TYPE', function(owner, rootDescription, contextData)
    local ok, err = pcall(function()
      local window = owner and owner:GetParent()
      if not window or not docks[window] then return end
      -- One plain line at the bottom of the menu, no submenu.
      if rootDescription.CreateDivider then rootDescription:CreateDivider() end
      rootDescription:CreateRadio('Threat',
        function() return docks[window].active end,
        function() setDocked(window, true) end)
    end)
    if not ok then say('menu error: ' .. tostring(err)) end
  end)
  return true
end

function ns.toggleDock()
  local meter = _G.DamageMeter
  if not meter or not meter.GetPrimarySessionWindow then
    say('the damage meter is not loaded, so there is nothing to dock to.')
    return
  end
  local window = meter:GetPrimarySessionWindow()
  if not window then
    say('the damage meter has no window open.')
    return
  end
  if not docks[window] then attach(window) end
  setDocked(window, not docks[window].active)
  say(docks[window].active and 'threat is showing in the damage meter. Pick a damage type there to switch back.'
    or 'threat is back in its own window.')
end

-- Boot ----------------------------------------------------------------------------

local boot = CreateFrame('Frame')
boot:RegisterEvent('PLAYER_LOGIN')
boot:SetScript('OnEvent', function(self)
  self:UnregisterAllEvents()
  local meter = _G.DamageMeter
  if not meter or not meter.ForEachSessionWindow then return end
  if not addMenuEntry() then return end

  meter:ForEachSessionWindow(attach)
  hooksecurefunc(meter, 'SetupSessionWindow', function(m, index, windowData)
    if windowData and windowData.sessionWindow then attach(windowData.sessionWindow) end
  end)

  local since = 0
  ticker = CreateFrame('Frame')
  ticker:SetScript('OnUpdate', function(_, elapsed)
    since = since + elapsed
    if since < TICK then return end
    since = 0
    for window, state in pairs(docks) do
      if state.active then refreshDock(window, state) end
    end
  end)
end)
