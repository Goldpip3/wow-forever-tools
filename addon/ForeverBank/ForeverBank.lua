-- Forever Bank
-- Remembers what is in your bank each time you open it, and shows that
-- snapshot anywhere in a window built like the game's own bag frame. Display only: it never moves,
-- uses, buys or sells anything.

local ADDON = ...
local VERSION = '1.0'

-- Same numbers as Blizzard's ContainerFrame: 37px buttons 5px apart, 8px left
-- and 7px right of the grid, search row under the title bar, coin bar below.
local SIZE, SPACING = 37, 5
local PAD_LEFT, PAD_RIGHT = 8, 7
local TOP, BOTTOM = 64, 30
local ICON = 'Interface\\Icons\\INV_Misc_Bag_07'

local defaults = {
  columns = 10,
  scale = 1,
  alpha = 0.5,
  showMinimap = true,
  minimapAngle = 200,
  chars = {},
}

local db, snap, charKey
local bankOpen = false
local frame, minimapButton
local buttons = {}
local searchText = ''
local scanQueued = false
local lastScanInfo = 'never scanned this session'

local function say(msg)
  DEFAULT_CHAT_FRAME:AddMessage('|cffffd200Forever Bank:|r ' .. tostring(msg))
end

---------------------------------------------------------------------------
-- Container API (new C_Container table, old globals as fallback)
---------------------------------------------------------------------------

local function numSlots(bag)
  local fn = (C_Container and C_Container.GetContainerNumSlots) or GetContainerNumSlots
  if not fn then return 0 end
  local ok, n = pcall(fn, bag)
  if ok and type(n) == 'number' then return n end
  return 0
end

local function slotInfo(bag, slot)
  if C_Container and C_Container.GetContainerItemInfo then
    local ok, info = pcall(C_Container.GetContainerItemInfo, bag, slot)
    if ok and type(info) == 'table' then
      return info.iconFileID, info.stackCount, info.quality, info.hyperlink, info.itemID
    end
    return nil
  end
  if GetContainerItemInfo then
    local ok, icon, count, _, quality, _, _, link, _, _, itemID = pcall(GetContainerItemInfo, bag, slot)
    if ok then return icon, count, quality, link, itemID end
  end
  return nil
end

-- Every container id that belongs to the character's bank on this client.
-- Classic has the main bank (-1) plus bank bag slots; the Midnight engine
-- uses character bank tabs. Ask the client which it has.
local function bankBags()
  local list, seen = {}, {}
  local function add(id)
    if type(id) == 'number' and not seen[id] then
      seen[id] = true
      list[#list + 1] = id
    end
  end
  local E = Enum and Enum.BagIndex
  if E then
    add(E.Bank)
    for i = 1, 7 do add(E['BankBag_' .. i]) end
    for i = 1, 6 do add(E['CharacterBankTab_' .. i]) end
  end
  if #list == 0 then
    add(BANK_CONTAINER or -1)
    local first = (NUM_BAG_SLOTS or 4) + 1
    for i = first, first + (NUM_BANKBAGSLOTS or 6) - 1 do add(i) end
  end
  return list
end

---------------------------------------------------------------------------
-- Scanning (only while the bank is open)
---------------------------------------------------------------------------

local refresh -- forward

local function scan()
  scanQueued = false
  if not bankOpen or not db then return end
  local bags, total, filled = {}, 0, 0
  for _, bag in ipairs(bankBags()) do
    local n = numSlots(bag)
    if n > 0 then
      local slots = {}
      for slot = 1, n do
        local icon, count, quality, link, itemID = slotInfo(bag, slot)
        if icon or link then
          slots[slot] = { icon = icon, count = count or 1, quality = quality, link = link, id = itemID }
          filled = filled + 1
        else
          slots[slot] = false
        end
      end
      bags[#bags + 1] = { id = bag, size = n, slots = slots }
      total = total + n
    end
  end
  lastScanInfo = ('%d slots, %d items, %d containers'):format(total, filled, #bags)
  if total == 0 then return end -- bank data not ready; keep the old snapshot
  snap = { time = time(), bags = bags, total = total, filled = filled }
  db.chars[charKey] = snap
  if frame and frame:IsShown() then refresh() end
end

local function queueScan()
  if scanQueued or not bankOpen then return end
  scanQueued = true
  if C_Timer and C_Timer.After then
    C_Timer.After(0.15, scan)
  else
    scan()
  end
end

---------------------------------------------------------------------------
-- Item buttons
---------------------------------------------------------------------------

local function itemName(link)
  if type(link) ~= 'string' then return '' end
  return (link:match('%[(.-)%]') or ''):lower()
end

local function buttonEnter(self)
  local item = self.item
  if not item or not item.link then return end
  GameTooltip:SetOwner(self, 'ANCHOR_RIGHT')
  local ok = pcall(GameTooltip.SetHyperlink, GameTooltip, item.link)
  if ok then GameTooltip:Show() else GameTooltip:Hide() end
end

local function buttonLeave()
  GameTooltip:Hide()
end

local function buttonClick(self)
  local item = self.item
  if item and item.link and IsModifiedClick and HandleModifiedItemClick then
    pcall(HandleModifiedItemClick, item.link)
  end
end

local function hasAtlas(name)
  if not (C_Texture and C_Texture.GetAtlasInfo) then return false end
  local ok, info = pcall(C_Texture.GetAtlasInfo, name)
  return ok and info ~= nil
end

-- Uses the game's own ItemButton (same widget the bags use) so borders,
-- counts and search dimming look native. Falls back to a plain button.
local function makeButton(parent)
  local ok, b = pcall(CreateFrame, 'ItemButton', nil, parent)
  if not ok or not b then
    b = CreateFrame('Button', nil, parent)
    b.plain = true
    b.icon = b:CreateTexture(nil, 'BORDER')
    b.icon:SetAllPoints()
    b.slotFrame = b:CreateTexture(nil, 'ARTWORK')
    b.slotFrame:SetTexture('Interface\\Buttons\\UI-Quickslot2')
    b.slotFrame:SetSize(64, 64)
    b.slotFrame:SetPoint('CENTER', 0, -1)
    b.glow = b:CreateTexture(nil, 'OVERLAY')
    b.glow:SetTexture('Interface\\Buttons\\UI-ActionButton-Border')
    b.glow:SetBlendMode('ADD')
    b.glow:SetSize(67, 67)
    b.glow:SetPoint('CENTER')
    b.glow:Hide()
    b.count = b:CreateFontString(nil, 'OVERLAY', 'NumberFontNormal')
    b.count:SetPoint('BOTTOMRIGHT', -5, 2)
    b:SetHighlightTexture('Interface\\Buttons\\ButtonHilight-Square', 'ADD')
  end
  b:SetSize(SIZE, SIZE)

  b.bg = b:CreateTexture(nil, 'BACKGROUND', nil, -1)
  b.bg:SetAllPoints()
  if hasAtlas('bags-item-slot64') then
    b.bg:SetAtlas('bags-item-slot64')
  else
    b.bg:SetTexture('Interface\\PaperDoll\\UI-Backpack-EmptySlot')
  end

  b:RegisterForClicks('LeftButtonUp', 'RightButtonUp')
  b:SetScript('OnEnter', buttonEnter)
  b:SetScript('OnLeave', buttonLeave)
  b:SetScript('OnClick', buttonClick)
  return b
end

local function paintButton(b, item)
  b.item = item or nil
  local match = true
  if searchText ~= '' then
    match = item and itemName(item.link):find(searchText, 1, true) and true or false
  end

  if b.plain then
    if item then
      b.icon:SetTexture(item.icon or 'Interface\\Icons\\INV_Misc_QuestionMark')
      b.icon:Show()
      b.count:SetText((item.count or 1) > 1 and item.count or '')
      local q = item.quality
      if type(q) == 'number' and q > 1 and GetItemQualityColor then
        local r, g, bl = GetItemQualityColor(q)
        b.glow:SetVertexColor(r, g, bl, 0.5)
        b.glow:Show()
      else
        b.glow:Hide()
      end
    else
      b.icon:Hide()
      b.count:SetText('')
      b.glow:Hide()
    end
    b:SetAlpha(match and 1 or 0.3)
    return
  end

  local icon = item and (item.icon or 'Interface\\Icons\\INV_Misc_QuestionMark') or nil
  if SetItemButtonTexture then pcall(SetItemButtonTexture, b, icon) end
  if SetItemButtonCount then pcall(SetItemButtonCount, b, item and item.count or 0) end
  if SetItemButtonQuality then
    pcall(SetItemButtonQuality, b, item and item.quality or nil, item and item.link or nil)
  end
  if b.SetMatchesSearch then
    pcall(b.SetMatchesSearch, b, match)
  else
    b:SetAlpha(match and 1 or 0.3)
  end
end

---------------------------------------------------------------------------
-- Window
---------------------------------------------------------------------------

local function ago(t)
  local s = time() - (t or 0)
  if s < 90 then return 'just now' end
  if s < 3600 then return ('%d min ago'):format(s / 60) end
  if s < 86400 then return ('%d hr ago'):format(s / 3600) end
  return ('%d days ago'):format(s / 86400)
end

refresh = function()
  if not frame then return end
  local cols = math.max(4, math.min(24, db.columns or 10))
  local n = 0
  if snap and snap.bags then
    for _, bag in ipairs(snap.bags) do
      for slot = 1, bag.size or 0 do
        n = n + 1
        local b = buttons[n]
        if not b then
          b = makeButton(frame)
          buttons[n] = b
        end
        local col = (n - 1) % cols
        local row = math.floor((n - 1) / cols)
        b:ClearAllPoints()
        b:SetPoint('TOPLEFT', frame, 'TOPLEFT', PAD_LEFT + col * (SIZE + SPACING), -(TOP + row * (SIZE + SPACING)))
        paintButton(b, bag.slots and bag.slots[slot] or nil)
        b:Show()
      end
    end
  end
  for i = n + 1, #buttons do buttons[i]:Hide() end

  local rows = math.max(1, math.ceil(n / cols))
  local width = PAD_LEFT + cols * (SIZE + SPACING) - SPACING + PAD_RIGHT
  local height = TOP + rows * (SIZE + SPACING) - SPACING + BOTTOM
  frame:SetSize(width, n > 0 and height or TOP + 70 + BOTTOM)

  if n == 0 then
    frame.empty:Show()
    frame.status:SetText('')
  else
    frame.empty:Hide()
    local free = (snap.total or n) - (snap.filled or 0)
    if bankOpen then
      frame.status:SetText(('%d/%d free  |cff40ff40live|r'):format(free, snap.total or n))
    else
      frame.status:SetText(('%d/%d free  |cff999999seen %s|r'):format(free, snap.total or n, ago(snap.time)))
    end
  end
  if GetMoney and GetCoinTextureString then
    frame.money:SetText(GetCoinTextureString(GetMoney()))
  end
end

local function savePosition()
  if not frame or not db then return end
  local left, top = frame:GetLeft(), frame:GetTop()
  if left and top then
    db.left, db.top = left, top
  end
end

-- The window is the same template the bags use (PortraitFrameFlatTemplate),
-- so it picks up whatever art this client ships. Older templates, then a
-- plain dark panel, are the fallbacks.
local function createWindow()
  for _, template in ipairs({ 'PortraitFrameFlatTemplate', 'PortraitFrameTemplate', 'ButtonFrameTemplate' }) do
    local ok, f = pcall(CreateFrame, 'Frame', 'ForeverBankFrame', UIParent, template)
    if ok and f then return f, true end
  end
  local f = CreateFrame('Frame', 'ForeverBankFrame', UIParent, BackdropTemplateMixin and 'BackdropTemplate' or nil)
  if f.SetBackdrop then
    f:SetBackdrop({
      bgFile = 'Interface\\ChatFrame\\ChatFrameBackground',
      edgeFile = 'Interface\\Tooltips\\UI-Tooltip-Border',
      edgeSize = 16, tile = true, tileSize = 16,
      insets = { left = 4, right = 4, top = 4, bottom = 4 },
    })
    f:SetBackdropColor(0, 0, 0, 0.8)
  end
  return f, false
end

local function buildFrame()
  if frame then return end
  local native
  frame, native = createWindow()
  frame:SetFrameStrata('MEDIUM')
  frame:SetToplevel(true)
  frame:SetClampedToScreen(true)
  frame:SetMovable(true)
  frame:EnableMouse(true)
  frame:SetScale(db.scale or 1)

  local title = (UnitName('player') or 'Your') .. "'s Bank"
  if native then
    if frame.SetTitle then
      pcall(frame.SetTitle, frame, title)
    elseif frame.TitleText then
      frame.TitleText:SetText(title)
    end
    if frame.SetPortraitToAsset then
      pcall(frame.SetPortraitToAsset, frame, ICON)
    elseif frame.portrait then
      frame.portrait:SetTexture(ICON)
    end
    if ButtonFrameTemplate_HideButtonBar and frame.Inset then
      pcall(ButtonFrameTemplate_HideButtonBar, frame)
      frame.Inset:Hide()
    end
  else
    local text = frame:CreateFontString(nil, 'ARTWORK', 'GameFontNormal')
    text:SetPoint('TOP', 0, -8)
    text:SetText(title)
    local close = CreateFrame('Button', nil, frame, 'UIPanelCloseButton')
    close:SetPoint('TOPRIGHT', -2, -2)
  end

  if db.left and db.top then
    frame:SetPoint('TOPLEFT', UIParent, 'BOTTOMLEFT', db.left, db.top)
  else
    frame:SetPoint('CENTER', -250, 50)
  end

  -- drag by the body or the title bar
  local function startMove() frame:StartMoving() end
  local function stopMove() frame:StopMovingOrSizing() savePosition() end
  frame:SetScript('OnMouseDown', function(_, button) if button == 'LeftButton' then startMove() end end)
  frame:SetScript('OnMouseUp', stopMove)
  if frame.TitleContainer then
    frame.TitleContainer:EnableMouse(true)
    frame.TitleContainer:SetScript('OnMouseDown', startMove)
    frame.TitleContainer:SetScript('OnMouseUp', stopMove)
  end
  frame:SetScript('OnHide', stopMove)
  frame:SetScript('OnShow', function()
    if PlaySound and SOUNDKIT and SOUNDKIT.IG_BACKPACK_OPEN then PlaySound(SOUNDKIT.IG_BACKPACK_OPEN) end
    refresh()
  end)

  -- search box, where the backpack has its own (TOPLEFT 42,-37)
  local ok, search = pcall(CreateFrame, 'EditBox', 'ForeverBankSearch', frame, 'SearchBoxTemplate')
  if not ok or not search then
    ok, search = pcall(CreateFrame, 'EditBox', 'ForeverBankSearch', frame, 'InputBoxTemplate')
  end
  if ok and search then
    search:SetSize(130, 18)
    search:SetPoint('TOPLEFT', 62, -37)
    search:SetAutoFocus(false)
    if search.SetMaxLetters then search:SetMaxLetters(30) end
    search:HookScript('OnTextChanged', function(self)
      searchText = (self:GetText() or ''):lower()
      refresh()
    end)
    search:HookScript('OnEscapePressed', function(self) self:SetText('') self:ClearFocus() end)
    search:HookScript('OnEnterPressed', function(self) self:ClearFocus() end)
    frame.search = search
  end

  -- coin bar along the bottom, like the backpack's
  local bar = CreateFrame('Frame', nil, frame)
  bar:SetHeight(17)
  bar:SetPoint('BOTTOMLEFT', PAD_LEFT, 8)
  bar:SetPoint('BOTTOMRIGHT', -PAD_RIGHT, 8)
  if hasAtlas('common-coinbox-left') then
    local l = bar:CreateTexture(nil, 'BACKGROUND')
    l:SetSize(8, 17) l:SetPoint('LEFT') l:SetAtlas('common-coinbox-left')
    local r = bar:CreateTexture(nil, 'BACKGROUND')
    r:SetSize(8, 17) r:SetPoint('RIGHT') r:SetAtlas('common-coinbox-right')
    local m = bar:CreateTexture(nil, 'BACKGROUND')
    m:SetPoint('TOPLEFT', l, 'TOPRIGHT') m:SetPoint('BOTTOMRIGHT', r, 'BOTTOMLEFT')
    m:SetAtlas('_common-coinbox-center')
  else
    local m = bar:CreateTexture(nil, 'BACKGROUND')
    m:SetAllPoints()
    m:SetColorTexture(0, 0, 0, 0.5)
  end

  frame.status = bar:CreateFontString(nil, 'ARTWORK', 'GameFontHighlightSmall')
  frame.status:SetPoint('LEFT', 8, 0)

  frame.money = bar:CreateFontString(nil, 'ARTWORK', 'GameFontHighlightSmall')
  frame.money:SetPoint('RIGHT', -6, 0)

  frame.empty = frame:CreateFontString(nil, 'ARTWORK', 'GameFontDisable')
  frame.empty:SetPoint('CENTER', 0, -14)
  frame.empty:SetWidth(360)
  frame.empty:SetText('Nothing recorded yet.\nOpen your bank once and it will be remembered.')

  tinsert(UISpecialFrames, 'ForeverBankFrame')
  frame:Hide()
end

local function toggle()
  buildFrame()
  if frame:IsShown() then frame:Hide() else frame:Show() end
end

---------------------------------------------------------------------------
-- Minimap button
---------------------------------------------------------------------------

local function placeMinimapButton()
  if not minimapButton then return end
  local a = math.rad(db.minimapAngle or 200)
  local r = (Minimap:GetWidth() / 2) + 5
  minimapButton:ClearAllPoints()
  minimapButton:SetPoint('CENTER', Minimap, 'CENTER', math.cos(a) * r, math.sin(a) * r)
end

local function buildMinimapButton()
  if minimapButton or not Minimap then return end
  local b = CreateFrame('Button', 'ForeverBankMinimapButton', Minimap)
  b:SetSize(31, 31)
  b:SetFrameStrata('MEDIUM')
  b:SetFrameLevel(8)
  b:RegisterForClicks('LeftButtonUp', 'RightButtonUp')
  b:RegisterForDrag('LeftButton')
  b:SetHighlightTexture('Interface\\Minimap\\UI-Minimap-ZoomButton-Highlight')

  local bg = b:CreateTexture(nil, 'BACKGROUND')
  bg:SetSize(20, 20)
  bg:SetPoint('TOPLEFT', 7, -5)
  bg:SetTexture('Interface\\Minimap\\UI-Minimap-Background')

  local icon = b:CreateTexture(nil, 'ARTWORK')
  icon:SetSize(18, 18)
  icon:SetPoint('TOPLEFT', 7, -6)
  icon:SetTexture('Interface\\Icons\\INV_Misc_Bag_07')
  icon:SetTexCoord(0.07, 0.93, 0.07, 0.93)

  local ring = b:CreateTexture(nil, 'OVERLAY')
  ring:SetSize(53, 53)
  ring:SetPoint('TOPLEFT')
  ring:SetTexture('Interface\\Minimap\\MiniMap-TrackingBorder')

  b:SetScript('OnClick', toggle)
  b:SetScript('OnDragStart', function(self)
    self:SetScript('OnUpdate', function()
      local mx, my = Minimap:GetCenter()
      local cx, cy = GetCursorPosition()
      local s = Minimap:GetEffectiveScale()
      db.minimapAngle = math.deg(math.atan2(cy / s - my, cx / s - mx))
      placeMinimapButton()
    end)
  end)
  b:SetScript('OnDragStop', function(self) self:SetScript('OnUpdate', nil) end)
  b:SetScript('OnEnter', function(self)
    GameTooltip:SetOwner(self, 'ANCHOR_LEFT')
    GameTooltip:AddLine('Forever Bank')
    GameTooltip:AddLine('Click to show your bank.', 1, 1, 1)
    GameTooltip:AddLine('Drag to move this button.', 1, 1, 1)
    GameTooltip:Show()
  end)
  b:SetScript('OnLeave', function() GameTooltip:Hide() end)

  minimapButton = b
  placeMinimapButton()
  b:SetShown(db.showMinimap ~= false)
end

---------------------------------------------------------------------------
-- Button on the backpack, left of its search box
---------------------------------------------------------------------------

local bagButton

local function buildBagButton()
  if bagButton or not BagItemSearchBox then return end
  -- Child of the search box, so it follows it between the backpack and the
  -- combined bag and shows and hides with it.
  local b = CreateFrame('Button', 'ForeverBankBagButton', BagItemSearchBox)
  b:SetSize(22, 22)
  b:SetPoint('RIGHT', BagItemSearchBox, 'LEFT', -9, 0)

  local icon = b:CreateTexture(nil, 'ARTWORK')
  icon:SetAllPoints()
  icon:SetTexture(ICON)
  icon:SetTexCoord(0.07, 0.93, 0.07, 0.93)

  local edge = b:CreateTexture(nil, 'OVERLAY')
  edge:SetPoint('TOPLEFT', -1, 1)
  edge:SetPoint('BOTTOMRIGHT', 1, -1)
  if hasAtlas('UI-HUD-ActionBar-IconFrame') then
    edge:SetAtlas('UI-HUD-ActionBar-IconFrame')
  else
    edge:SetTexture('Interface\\Buttons\\UI-Quickslot2')
    edge:SetTexCoord(0.2, 0.8, 0.2, 0.8)
  end

  b:SetHighlightTexture('Interface\\Buttons\\ButtonHilight-Square', 'ADD')
  b:SetScript('OnMouseDown', function() icon:SetPoint('TOPLEFT', 1, -1) icon:SetPoint('BOTTOMRIGHT', 1, -1) end)
  b:SetScript('OnMouseUp', function() icon:SetAllPoints() end)
  b:SetScript('OnEnter', function(self)
    GameTooltip:SetOwner(self, 'ANCHOR_RIGHT')
    GameTooltip:AddLine('Bank')
    GameTooltip:AddLine('Show what was in your bank the last time you visited it.', 1, 1, 1, true)
    GameTooltip:Show()
  end)
  b:SetScript('OnClick', toggle)
  b:SetScript('OnLeave', function() GameTooltip:Hide() end)
  bagButton = b
end

---------------------------------------------------------------------------
-- Slash command
---------------------------------------------------------------------------

local function slash(msg)
  msg = (msg or ''):lower()
  local cmd, arg = msg:match('^(%S*)%s*(.-)$')
  if cmd == '' then
    toggle()
  elseif cmd == 'cols' or cmd == 'columns' then
    local n = tonumber(arg)
    if n then
      db.columns = math.max(4, math.min(24, math.floor(n)))
      buildFrame() refresh()
      say('columns set to ' .. db.columns)
    else
      say('usage: /fbank cols 4-24')
    end
  elseif cmd == 'scale' then
    local n = tonumber(arg)
    if n then
      db.scale = math.max(0.5, math.min(2, n))
      buildFrame() frame:SetScale(db.scale)
      say('scale set to ' .. db.scale)
    else
      say('usage: /fbank scale 0.5-2')
    end
  elseif cmd == 'minimap' then
    db.showMinimap = not (db.showMinimap ~= false)
    if minimapButton then minimapButton:SetShown(db.showMinimap) end
    say('minimap button ' .. (db.showMinimap and 'shown' or 'hidden'))
  elseif cmd == 'debug' then
    local ids = {}
    for _, bag in ipairs(bankBags()) do ids[#ids + 1] = bag .. '=' .. numSlots(bag) end
    say('v' .. VERSION .. '  bank open: ' .. tostring(bankOpen))
    say('containers (id=slots): ' .. table.concat(ids, ' '))
    say('last scan: ' .. lastScanInfo)
    say('saved snapshot: ' .. (snap and (snap.filled .. ' items, ' .. ago(snap.time)) or 'none')
      .. '  loaded from disk: ' .. tostring(FOREVERBANK_LOADED_FROM_DISK))
  else
    say('/fbank  show or hide  |  cols N  |  scale N  |  minimap  |  debug')
  end
end

---------------------------------------------------------------------------
-- Events
---------------------------------------------------------------------------

local function adoptSaved()
  -- One account-wide table, bank contents keyed by character. The Forever
  -- beta client does not load SavedVariables itself; the TOC loads the saved
  -- file through the ForeverSV link instead, which only works account-wide.
  local loaded = type(ForeverBankDB) == 'table'
  FOREVERBANK_LOADED_FROM_DISK = loaded and 'yes' or 'no'
  if not loaded then ForeverBankDB = {} end
  db = ForeverBankDB
  for k, v in pairs(defaults) do
    if db[k] == nil then db[k] = (type(v) == 'table') and {} or v end
  end
  charKey = (UnitName('player') or '?') .. '-' .. (GetRealmName and GetRealmName() or '?')
  snap = type(db.chars[charKey]) == 'table' and db.chars[charKey] or nil
end

local ev = CreateFrame('Frame')
local function reg(name) pcall(ev.RegisterEvent, ev, name) end
reg('PLAYER_LOGIN')
reg('BANKFRAME_OPENED')
reg('BANKFRAME_CLOSED')
reg('BAG_UPDATE')
reg('BAG_UPDATE_DELAYED')
reg('PLAYERBANKSLOTS_CHANGED')
reg('PLAYERBANKBAGSLOTS_CHANGED')
reg('PLAYER_MONEY')
reg('PLAYER_INTERACTION_MANAGER_FRAME_SHOW')
reg('PLAYER_INTERACTION_MANAGER_FRAME_HIDE')

local function isBankInteraction(kind)
  local T = Enum and Enum.PlayerInteractionType
  return T and kind ~= nil and (kind == T.Banker or kind == T.CharacterBanker)
end

ev:SetScript('OnEvent', function(_, event, arg1)
  if event == 'PLAYER_LOGIN' then
    adoptSaved()
    buildMinimapButton()
    buildBagButton()
    SLASH_FOREVERBANK1 = '/fbank'
    SLASH_FOREVERBANK2 = '/foreverbank'
    SlashCmdList.FOREVERBANK = slash
    return
  end
  if not db then return end
  if not bagButton then buildBagButton() end
  if event == 'BANKFRAME_OPENED' or (event == 'PLAYER_INTERACTION_MANAGER_FRAME_SHOW' and isBankInteraction(arg1)) then
    bankOpen = true
    queueScan()
  elseif event == 'BANKFRAME_CLOSED' or (event == 'PLAYER_INTERACTION_MANAGER_FRAME_HIDE' and isBankInteraction(arg1)) then
    -- no scan here: once the bank closes its slots read as empty
    bankOpen = false
    if frame and frame:IsShown() then refresh() end
  elseif event == 'PLAYER_MONEY' then
    if frame and frame:IsShown() then refresh() end
  elseif bankOpen then
    queueScan()
  end
end)
