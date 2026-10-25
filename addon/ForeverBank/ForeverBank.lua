-- Forever Bank
-- Remembers what is in your bank each time you open it, and shows that
-- snapshot anywhere in a window built like the game's own bag frame. Display only: it never moves,
-- uses, buys or sells anything.

local ADDON = ...
local VERSION = '1.3.1'

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
  valueTier = 1,
  showValue = true,      -- vendor value line at the top of the backpack
  showBagButton = true,  -- bank button left of the backpack's search box
}

local db, snap, charKey
local bankOpen = false
local frame, minimapButton
local openSettings, applyBagLayout -- defined further down
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

-- Money in the game's own format: 2 silver 60 copper with the coin icons.
-- Forever has GetMoneyString (Blizzard_SharedXML); GetCoinTextureString is
-- not in this client, which is why 1.1 printed "260c".
local function coins(copper)
  copper = math.floor(tonumber(copper) or 0)
  if GetMoneyString then
    local ok, text = pcall(GetMoneyString, copper, true)
    if ok and type(text) == 'string' then return text end
  end
  local fn = (C_CurrencyInfo and C_CurrencyInfo.GetCoinTextureString) or GetCoinTextureString
  if fn then
    local ok, text = pcall(fn, copper)
    if ok and type(text) == 'string' then return text end
  end
  local g, sv, c = math.floor(copper / 10000), math.floor(copper / 100) % 100, copper % 100
  local icon = '|TInterface\\MoneyFrame\\UI-%sIcon:0:0:2:0|t'
  local parts = {}
  if g > 0 then parts[#parts + 1] = g .. icon:format('Gold') end
  if sv > 0 then parts[#parts + 1] = sv .. icon:format('Silver') end
  if c > 0 or #parts == 0 then parts[#parts + 1] = c .. icon:format('Copper') end
  return table.concat(parts, ' ')
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
  if GetMoney then
    frame.money:SetText(coins(GetMoney()))
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

  b:SetScript('OnClick', function(_, button)
    if button == 'RightButton' then openSettings() else toggle() end
  end)
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
    GameTooltip:AddLine('Right-click for settings.', 1, 1, 1)
    GameTooltip:AddLine('Drag to move this button.', 1, 1, 1)
    GameTooltip:Show()
  end)
  b:SetScript('OnLeave', function() GameTooltip:Hide() end)

  minimapButton = b
  placeMinimapButton()
  b:SetShown(db.showMinimap ~= false)
end

---------------------------------------------------------------------------
-- Backpack additions: a row under the search box with the bank button and
-- the vendor value of the bags
---------------------------------------------------------------------------

-- Layout on the backpack and the combined bag (Blizzard numbers from
-- ContainerFrame.lua): the search box normally sits at TOPLEFT 42,-37
-- (combined bag 62,-37), squeezed between the portrait and the sort button,
-- and the first row of items starts at -75.
-- Here the bag is made ROW taller. The value line takes the search box's old
-- spot beside the portrait; the search box and sort button move down one row,
-- below the portrait, where the whole width is free, with the bank button on
-- the left.
-- The bank button is the same size as the sort button (28x26, art about
-- 24px wide inside it) so the row is symmetric: equal margins at both ends,
-- equal gaps either side of the search box, and the box centred in the bag.
local BTN_W, BTN_H = 28, 26
local ICON_W, ICON_H = 16, 15   -- + 1px frame = 18x17, the sort art's size
local EDGE = 9            -- sort button sits 9px in from the bag's right edge
local SORT_ART_OFFSET = 3 -- sort art is this far right of its frame's centre
local BOX_LEFT = 45       -- search box frame, from the bag's left edge
local BOX_RIGHT = 42      -- and from its right edge
local ROW = 22            -- extra height added to the bag
local ROW_Y = -59         -- top of the new search row

-- Bags that carry the search box. Blizzard sizes the bag before it places
-- the search box, so this cannot wait for BagItemSearchBox.anchorBag.
local function isSearchBag(bag)
  if not bag or not BagItemSearchBox then return false end
  if InputUtil and InputUtil.IsGamepadUIEnabled then
    local ok, pad = pcall(InputUtil.IsGamepadUIEnabled)
    if ok and pad then return false end -- gamepad mode hides the search box
  end
  if bag == ContainerFrameCombinedBags then return true end
  if bag == ContainerFrame1 then
    if bag.IsBackpack then
      local ok, isPack = pcall(bag.IsBackpack, bag)
      return ok and isPack and true or false
    end
    return true
  end
  return false
end

local bagButton, valueLine
local queueValue -- defined below
local valueQueued = false

-- Click cycles upward through these, right-click goes back. Each tier counts
-- every item of that quality and below: "Uncommon" is grey + white + green.
local TIERS = {
  { q = 0, label = 'Junk' },
  { q = 1, label = 'Normal' },
  { q = 2, label = 'Uncommon' },
  { q = 3, label = 'Rare' },
  { q = 4, label = 'Epic' },
}

local function tierColor(q)
  local c = ITEM_QUALITY_COLORS and ITEM_QUALITY_COLORS[q]
  if c and c.hex then return c.hex end
  local fallback = { [0] = '|cff9d9d9d', '|cffffffff', '|cff1eff00', '|cff0070dd', '|cffa335ee' }
  return fallback[q] or '|cffffffff'
end

local function currentTier()
  local i = (db and db.valueTier) or 1
  if i < 1 or i > #TIERS then i = 1 end
  return i, TIERS[i]
end

-- Either backpack addition switched on means the taller layout; both off
-- gives the bag back exactly as Blizzard laid it out.
local function extrasOn()
  return db and (db.showValue ~= false or db.showBagButton ~= false)
end

local function layout()
  local box = BagItemSearchBox
  local bag = box and box.anchorBag
  if not (bag and bagButton and valueLine) then return end
  local sort = BagItemAutoSortButton
  local sortShown = sort and sort:IsShown() and sort:GetParent() == bag

  bagButton:SetShown(db.showBagButton ~= false)
  valueLine:SetShown(db.showValue ~= false)

  if not extrasOn() then
    -- Blizzard's own spots (ContainerFrame.lua SetSearchBoxPoint / UpdateSearchBox)
    local combined = bag == ContainerFrameCombinedBags
    box:ClearAllPoints()
    box:SetPoint('TOPLEFT', bag, 'TOPLEFT', combined and 62 or 42, -37)
    box:SetWidth(combined and 330 or 96)
    if sortShown then
      sort:ClearAllPoints()
      sort:SetPoint('TOPRIGHT', bag, 'TOPRIGHT', -9, -34)
    end
    return
  end

  -- search row: [bank] [search box] [sort], mirrored around the centre.
  -- Measured in game (screenshot, 2026-09-28): the sort button's art sits
  -- about 3px right of its frame's centre, and the search box's border art
  -- reaches 5px past the box on the left but only 2px on the right. The
  -- offsets below cancel both, so the gaps either side of the box match
  -- and the box's art is centred in the bag.
  bagButton:ClearAllPoints()
  bagButton:SetPoint('TOPLEFT', bag, 'TOPLEFT', EDGE - SORT_ART_OFFSET, ROW_Y + 3)
  box:ClearAllPoints()
  box:SetPoint('TOPLEFT', bag, 'TOPLEFT', BOX_LEFT, ROW_Y)
  box:SetPoint('TOPRIGHT', bag, 'TOPRIGHT', -BOX_RIGHT, ROW_Y)
  if sortShown then
    sort:ClearAllPoints()
    sort:SetPoint('TOPRIGHT', bag, 'TOPRIGHT', -EDGE, ROW_Y + 3)
  end

  -- value line in the old search row, centred on the whole bag. It is only
  -- as wide as its text, so it never covers the portrait's bag menu.
  valueLine:ClearAllPoints()
  valueLine:SetPoint('CENTER', bag, 'TOP', 0, -39)

  -- above the portrait ring, which sits 400 levels over the bag
  local lvl = bag:GetFrameLevel() + 520
  bagButton:SetFrameLevel(lvl)
  valueLine:SetFrameLevel(lvl)
end

-- Runs after Blizzard sizes the bag: add the extra row. Items are anchored
-- to the bottom, so the space opens up between the search row and them.
local grown = {} -- how much each bag has been made taller since Blizzard last sized it

local function grow(bag)
  grown[bag] = 0
  if extrasOn() and isSearchBag(bag) then
    bag:SetHeight(bag:GetHeight() + ROW)
    grown[bag] = ROW
  end
end

-- After a setting changes: fix the height and layout of open bags now,
-- without waiting for the next time Blizzard redraws them.
applyBagLayout = function()
  for _, bag in ipairs({ ContainerFrame1, ContainerFrameCombinedBags }) do
    if bag and bag:IsShown() and grown[bag] ~= nil then
      local want = (extrasOn() and isSearchBag(bag)) and ROW or 0
      local diff = want - grown[bag]
      if diff ~= 0 then
        bag:SetHeight(bag:GetHeight() + diff)
        grown[bag] = want
      end
    end
  end
  layout()
  if queueValue then queueValue() end
end

---- vendor value ----

local function sellPrice(itemID, link)
  local getInfo = (C_Item and C_Item.GetItemInfo) or GetItemInfo
  if not getInfo then return nil end
  local ok, _, _, _, _, _, _, _, _, _, _, price = pcall(getInfo, link or itemID)
  if ok and type(price) == 'number' then return price end
  if itemID and C_Item and C_Item.RequestLoadItemDataByID then
    pcall(C_Item.RequestLoadItemDataByID, itemID)
  end
  return nil
end

local function playerBags()
  local list = {}
  local E = Enum and Enum.BagIndex
  if E and E.Backpack then
    list[1] = E.Backpack
    for i = 1, 4 do if E['Bag_' .. i] then list[#list + 1] = E['Bag_' .. i] end end
    if E.ReagentBag then list[#list + 1] = E.ReagentBag end
  else
    for i = 0, NUM_BAG_SLOTS or 4 do list[#list + 1] = i end
  end
  return list
end

-- What a vendor pays for every item in the bags at quality maxQ or below.
local function bagValue(maxQ)
  local total, pending = 0, false
  local items = {}
  for _, bag in ipairs(playerBags()) do
    for slot = 1, numSlots(bag) do
      local info
      if C_Container and C_Container.GetContainerItemInfo then
        local ok, t = pcall(C_Container.GetContainerItemInfo, bag, slot)
        if ok and type(t) == 'table' then info = t end
      elseif GetContainerItemInfo then
        local ok, icon, count, _, quality, _, _, link, _, noValue, itemID = pcall(GetContainerItemInfo, bag, slot)
        if ok and icon then
          info = { stackCount = count, quality = quality, hyperlink = link, hasNoValue = noValue, itemID = itemID }
        end
      end
      local q = info and info.quality
      if type(q) == 'number' and q <= maxQ and not info.hasNoValue then
        local price = sellPrice(info.itemID, info.hyperlink)
        if price == nil then
          pending = true
        elseif price > 0 then
          local value = price * (info.stackCount or 1)
          total = total + value
          items[#items + 1] = { link = info.hyperlink, count = info.stackCount or 1, value = value }
        end
      end
    end
  end
  return total, items, pending
end


local function updateValue()
  valueQueued = false
  if not valueLine or not valueLine:IsVisible() then return end
  local _, tier = currentTier()
  local total, items, pending = bagValue(tier.q)
  valueLine.items, valueLine.total = items, total
  local label = tierColor(tier.q) .. tier.label .. ':|r '
  if #items == 0 then
    valueLine.text:SetText(label .. '|cff808080none|r')
  else
    valueLine.text:SetText(label .. coins(total))
  end
  valueLine:SetWidth(math.max(20, (valueLine.text:GetStringWidth() or 0) + 4))
  if pending and C_Timer and C_Timer.After then
    -- a price was not cached yet; the item data request fills it in
    valueQueued = true
    C_Timer.After(1, updateValue)
  end
end

queueValue = function()
  if valueQueued then return end
  valueQueued = true
  if C_Timer and C_Timer.After then C_Timer.After(0.2, updateValue) else updateValue() end
end

local function showValueTooltip(self)
  local _, tier = currentTier()
  GameTooltip:SetOwner(self, 'ANCHOR_RIGHT')
  local what = tier.q == 0 and 'Grey items' or (tierColor(tier.q) .. tier.label .. '|r and lower')
  GameTooltip:AddDoubleLine(what, coins(self.total or 0), 1, 0.82, 0, 1, 1, 1)
  GameTooltip:AddLine('What a vendor pays for these. Click: higher quality. Right-click: lower. Turn this line off in /fbank settings.', 0.6, 0.6, 0.6, true)
  GameTooltip:Show()
end

local function buildValueLine(anchor)
  local f = CreateFrame('Button', 'ForeverBankJunkLine', BagItemSearchBox)
  f:SetSize(80, 14)
  f.text = f:CreateFontString(nil, 'OVERLAY', 'GameFontHighlightSmall')
  f.text:SetPoint('CENTER')
  f.text:SetJustifyH('CENTER')
  f:RegisterForClicks('LeftButtonUp', 'RightButtonUp')
  f:SetScript('OnShow', queueValue)
  f:SetScript('OnClick', function(self, button)
    local i = currentTier()
    -- Junk and Epic are the ends; no wrapping around
    if button == 'RightButton' then i = math.max(1, i - 1) else i = math.min(#TIERS, i + 1) end
    db.valueTier = i
    if PlaySound and SOUNDKIT and SOUNDKIT.U_CHAT_SCROLL_BUTTON then PlaySound(SOUNDKIT.U_CHAT_SCROLL_BUTTON) end
    updateValue()
    if GameTooltip:IsOwned(self) then showValueTooltip(self) end
  end)
  f:SetScript('OnEnter', showValueTooltip)
  f:SetScript('OnLeave', function() GameTooltip:Hide() end)
  valueLine = f
end

---- bank button ----

local function buildBagButton()
  if bagButton or not BagItemSearchBox then return end
  -- Child of the search box, so it follows it between the backpack and the
  -- combined bag and shows and hides with it. Sits left of the box.
  local b = CreateFrame('Button', 'ForeverBankBagButton', BagItemSearchBox)
  b:SetSize(BTN_W, BTN_H)

  -- Drawn to the same size as the sort button's art, measured from a
  -- screenshot of the backpack: an 18x17 framed square with a soft shadow
  -- about 2px around it, centred in the 28x26 button.
  local shadow = b:CreateTexture(nil, 'BACKGROUND')
  shadow:SetSize(ICON_W + 6, ICON_H + 6)
  shadow:SetPoint('CENTER')
  shadow:SetColorTexture(0, 0, 0, 0.45)

  local border = b:CreateTexture(nil, 'BORDER')
  border:SetSize(ICON_W + 2, ICON_H + 2)
  border:SetPoint('CENTER')
  border:SetColorTexture(0.42, 0.42, 0.42, 1)

  local icon = b:CreateTexture(nil, 'ARTWORK')
  icon:SetSize(ICON_W, ICON_H)
  icon:SetPoint('CENTER')
  icon:SetTexture(ICON)
  -- trim the icon's own border, and a little more top/bottom to keep the
  -- picture's proportions in a box that is 1px wider than tall
  local v = 0.07 + 0.86 * (1 - ICON_H / ICON_W) / 2
  icon:SetTexCoord(0.07, 0.93, v, 1 - v)

  b:SetHighlightTexture('Interface\\Buttons\\ButtonHilight-Square', 'ADD')
  local hl = b:GetHighlightTexture()
  if hl then hl:ClearAllPoints() hl:SetAllPoints(icon) end
  b:SetScript('OnMouseDown', function() icon:ClearAllPoints() icon:SetPoint('CENTER', 1, -1) end)
  b:SetScript('OnMouseUp', function() icon:ClearAllPoints() icon:SetPoint('CENTER') end)
  b:SetScript('OnEnter', function(self)
    GameTooltip:SetOwner(self, 'ANCHOR_RIGHT')
    GameTooltip:AddLine('Bank')
    GameTooltip:AddLine('Show what was in your bank the last time you visited it.', 1, 1, 1, true)
    GameTooltip:AddLine('Right-click for settings.', 0.6, 0.6, 0.6)
    GameTooltip:Show()
  end)
  b:RegisterForClicks('LeftButtonUp', 'RightButtonUp')
  b:SetScript('OnClick', function(_, button)
    if button == 'RightButton' then openSettings() else toggle() end
  end)
  b:SetScript('OnLeave', function() GameTooltip:Hide() end)
  bagButton = b

  buildValueLine(b)

  for _, name in ipairs({ 'ContainerFrame1', 'ContainerFrameCombinedBags' }) do
    local bag = _G[name]
    if bag and bag.UpdateSearchBox and hooksecurefunc then
      pcall(hooksecurefunc, bag, 'UpdateSearchBox', layout)
      if bag.UpdateFrameSize then pcall(hooksecurefunc, bag, 'UpdateFrameSize', grow) end
    end
  end
  BagItemSearchBox:HookScript('OnShow', function() layout() queueValue() end)
  layout()
end

---------------------------------------------------------------------------
-- Settings: one page, shown as its own window (/fbank settings, right-click
-- the minimap or backpack button) and under Options > AddOns > Forever Bank.
-- Built from plain widgets, same as Forever XP's page.
---------------------------------------------------------------------------

local FLAT = 'Interface\\Buttons\\WHITE8X8'
local GOLD = { 1, 0.82, 0 }
local syncers = {}

local function syncAll()
  for _, f in ipairs(syncers) do pcall(f) end
end

local function resetWindow()
  db.left, db.top = nil, nil
  if frame then
    frame:ClearAllPoints()
    frame:SetPoint('CENTER', -250, 50)
  end
  say('bank window moved back to the middle of the screen.')
end

local function buildSettingsContent(parent, width)
  local y = -6
  local syncs = {}

  local function heading(text)
    y = y - 10
    local fs = parent:CreateFontString(nil, 'OVERLAY', 'GameFontNormal')
    fs:SetPoint('TOPLEFT', 16, y)
    fs:SetText(text)
    local line = parent:CreateTexture(nil, 'ARTWORK')
    line:SetColorTexture(GOLD[1], GOLD[2], GOLD[3], 0.25)
    line:SetHeight(1)
    line:SetPoint('TOPLEFT', 16, y - 17)
    line:SetPoint('TOPRIGHT', -16, y - 17)
    y = y - 26
  end

  local function tip(owner, text)
    if not text then return end
    owner:HookScript('OnEnter', function(self)
      GameTooltip:SetOwner(self, 'ANCHOR_RIGHT')
      GameTooltip:AddLine(text, 1, 1, 1, true)
      GameTooltip:Show()
    end)
    owner:HookScript('OnLeave', function() GameTooltip:Hide() end)
  end

  local function checkbox(label, help, get, set, enabled)
    local cb = CreateFrame('CheckButton', nil, parent, 'UICheckButtonTemplate')
    cb:SetSize(24, 24)
    cb:SetPoint('TOPLEFT', 14, y)
    local fs = cb:CreateFontString(nil, 'OVERLAY', 'GameFontHighlight')
    fs:SetPoint('LEFT', cb, 'RIGHT', 4, 1)
    fs:SetText(label)
    cb:SetHitRectInsets(0, -(fs:GetStringWidth() + 10), 0, 0)
    cb:SetScript('OnClick', function(self) set(self:GetChecked() and true or false) syncAll() end)
    tip(cb, help)
    syncs[#syncs + 1] = function()
      cb:SetChecked(get() and true or false)
      local on = not enabled or enabled()
      cb:SetEnabled(on)
      if on then fs:SetTextColor(1, 1, 1) else fs:SetTextColor(0.5, 0.5, 0.5) end
    end
    y = y - 28
  end

  -- A row of buttons where exactly one is lit, like a segmented switch.
  local function segmented(label, options, get, set, enabled, help)
    local fs = parent:CreateFontString(nil, 'OVERLAY', 'GameFontHighlight')
    fs:SetPoint('TOPLEFT', 20, y - 4)
    fs:SetText(label)
    local left, gap = 110, 3
    local each = math.floor((width - left - 16 - gap * (#options - 1)) / #options)
    local buttons = {}
    for i, option in ipairs(options) do
      local b = CreateFrame('Button', nil, parent)
      b:SetSize(each, 22)
      b:SetPoint('TOPLEFT', left + (i - 1) * (each + gap), y)
      b.bg = b:CreateTexture(nil, 'BACKGROUND')
      b.bg:SetAllPoints()
      b.bg:SetTexture(FLAT)
      b.text = b:CreateFontString(nil, 'OVERLAY', 'GameFontHighlightSmall')
      b.text:SetPoint('CENTER')
      b.text:SetText(option.text)
      local hl = b:CreateTexture(nil, 'HIGHLIGHT')
      hl:SetAllPoints()
      hl:SetTexture(FLAT)
      hl:SetVertexColor(1, 1, 1, 0.08)
      b:SetScript('OnClick', function() set(option.value) syncAll() end)
      tip(b, option.help or help)
      buttons[i] = b
    end
    syncs[#syncs + 1] = function()
      local on = not enabled or enabled()
      local current = get()
      for i, b in ipairs(buttons) do
        local lit = options[i].value == current
        b:SetEnabled(on)
        b:SetAlpha(on and 1 or 0.4)
        if lit then
          b.bg:SetVertexColor(0.85, 0.62, 0.08, 0.9)
          b.text:SetTextColor(0.08, 0.06, 0.02)
        else
          b.bg:SetVertexColor(0.18, 0.18, 0.2, 0.9)
          b.text:SetTextColor(0.85, 0.85, 0.85)
        end
      end
      fs:SetTextColor(on and 1 or 0.5, on and 1 or 0.5, on and 1 or 0.5)
    end
    y = y - 30
  end

  local function slider(label, min, max, step, format, get, set)
    local fs = parent:CreateFontString(nil, 'OVERLAY', 'GameFontHighlight')
    fs:SetPoint('TOPLEFT', 20, y)
    fs:SetText(label)
    local value = parent:CreateFontString(nil, 'OVERLAY', 'GameFontNormal')
    value:SetPoint('TOPRIGHT', -18, y)
    y = y - 18
    local sl = CreateFrame('Slider', nil, parent)
    sl:SetOrientation('HORIZONTAL')
    sl:SetHeight(16)
    sl:SetPoint('TOPLEFT', 20, y)
    sl:SetPoint('TOPRIGHT', -18, y)
    sl:SetMinMaxValues(min, max)
    sl:SetValueStep(step)
    if sl.SetObeyStepOnDrag then sl:SetObeyStepOnDrag(true) end
    sl:EnableMouseWheel(true)
    local track = sl:CreateTexture(nil, 'BACKGROUND')
    track:SetTexture(FLAT)
    track:SetVertexColor(0.22, 0.22, 0.24, 1)
    track:SetHeight(4)
    track:SetPoint('LEFT')
    track:SetPoint('RIGHT')
    local fill = sl:CreateTexture(nil, 'BORDER')
    fill:SetTexture(FLAT)
    fill:SetVertexColor(0.85, 0.62, 0.08, 0.8)
    fill:SetHeight(4)
    fill:SetPoint('LEFT')
    local thumb = sl:CreateTexture(nil, 'OVERLAY')
    thumb:SetTexture(FLAT)
    thumb:SetVertexColor(GOLD[1], GOLD[2], GOLD[3], 1)
    thumb:SetSize(8, 16)
    sl:SetThumbTexture(thumb)
    local syncing = false
    local function show(v)
      value:SetText(format(v))
      local w = sl:GetWidth() or 0
      fill:SetWidth(math.max(1, (v - min) / (max - min) * w))
    end
    sl:SetScript('OnValueChanged', function(_, v)
      v = math.floor(v / step + 0.5) * step
      show(v)
      if not syncing then set(v) end
    end)
    sl:SetScript('OnMouseWheel', function(self, delta)
      self:SetValue(math.max(min, math.min(max, self:GetValue() + delta * step)))
    end)
    sl:SetScript('OnSizeChanged', function(self) show(self:GetValue()) end)
    syncs[#syncs + 1] = function()
      syncing = true
      sl:SetValue(get())
      show(get())
      syncing = false
    end
    y = y - 26
  end

  local function buttons(list)
    local gap = 6
    local each = math.floor((width - 36 - gap * (#list - 1)) / #list)
    for i, item in ipairs(list) do
      local b = CreateFrame('Button', nil, parent, 'UIPanelButtonTemplate')
      b:SetSize(each, 22)
      b:SetPoint('TOPLEFT', 18 + (i - 1) * (each + gap), y)
      b:SetText(item[1])
      b:SetScript('OnClick', function() item[3]() syncAll() end)
      tip(b, item[2])
    end
    y = y - 30
  end

  heading('Backpack')
  checkbox('Show vendor value', 'The line at the top of your backpack with what your bags sell for at a vendor.',
    function() return db.showValue ~= false end,
    function(v) db.showValue = v applyBagLayout() end)
  segmented('Counts', {
      { text = 'Junk', value = 1, help = 'Grey items only.' },
      { text = 'Normal', value = 2, help = 'Grey and white items.' },
      { text = 'Green', value = 3, help = 'Uncommon and lower.' },
      { text = 'Blue', value = 4, help = 'Rare and lower.' },
      { text = 'Epic', value = 5, help = 'Epic and lower.' },
    }, function() return db.valueTier or 1 end,
    function(v) db.valueTier = v applyBagLayout() end,
    function() return db.showValue ~= false end,
    'Which items the vendor value adds up. You can also click the line itself.')
  checkbox('Show bank button', 'The bag icon left of the backpack\'s search box. Click it to open your bank.',
    function() return db.showBagButton ~= false end,
    function(v) db.showBagButton = v applyBagLayout() end)
  local note = parent:CreateFontString(nil, 'OVERLAY', 'GameFontDisableSmall')
  note:SetPoint('TOPLEFT', 20, y + 2)
  note:SetPoint('RIGHT', -18, 0)
  note:SetJustifyH('LEFT')
  note:SetText('With both off, the backpack goes back to the game\'s normal layout.')
  y = y - 18

  heading('Bank window')
  slider('Columns', 4, 24, 1, function(v) return string.format('%d', v) end,
    function() return db.columns or 10 end,
    function(v) db.columns = v if frame then refresh() end end)
  slider('Scale', 0.5, 2, 0.05, function(v) return string.format('%d%%', v * 100 + 0.5) end,
    function() return db.scale or 1 end,
    function(v) db.scale = v if frame then frame:SetScale(v) end end)
  checkbox('Minimap button', 'Click it to open your bank, right-click for these settings.',
    function() return db.showMinimap ~= false end,
    function(v) db.showMinimap = v if minimapButton then minimapButton:SetShown(v) end end)
  buttons({
    { 'Open bank', 'Show what was in your bank the last time you visited it.', toggle },
    { 'Reset position', 'Move the bank window back to the middle of the screen.', resetWindow },
  })

  heading('Saved bank')
  buttons({ { 'Forget this character\'s bank', 'Clears the saved copy for the character you are on. Visit a banker to save it again.', function()
      db.chars[charKey] = nil
      snap = nil
      if frame and frame:IsShown() then refresh() end
      say('saved bank for ' .. charKey .. ' cleared.')
    end } })

  local function sync() for _, f in ipairs(syncs) do pcall(f) end end
  syncers[#syncers + 1] = sync
  return -y + 6, sync
end

local settingsWin
openSettings = function()
  if not db then return end
  if not settingsWin then
    local w = CreateFrame('Frame', 'ForeverBankSettings', UIParent, BackdropTemplateMixin and 'BackdropTemplate' or nil)
    settingsWin = w
    w:SetWidth(340)
    w:SetPoint('CENTER', UIParent, 'CENTER', 0, 60)
    w:SetFrameStrata('DIALOG')
    w:SetClampedToScreen(true)
    w:SetMovable(true)
    w:EnableMouse(true)
    w:SetScript('OnMouseDown', function(self, b) if b == 'LeftButton' then self:StartMoving() end end)
    w:SetScript('OnMouseUp', function(self) self:StopMovingOrSizing() end)
    if w.SetBackdrop then
      w:SetBackdrop({ edgeFile = 'Interface\\Tooltips\\UI-Tooltip-Border', edgeSize = 12,
        insets = { left = 3, right = 3, top = 3, bottom = 3 } })
      w:SetBackdropBorderColor(0.35, 0.35, 0.4, 1)
    end
    local bg = w:CreateTexture(nil, 'BACKGROUND')
    bg:SetPoint('TOPLEFT', 3, -3)
    bg:SetPoint('BOTTOMRIGHT', -3, 3)
    bg:SetTexture(FLAT)
    bg:SetVertexColor(0.05, 0.05, 0.06, 0.96)

    local HEAD = 28
    local head = w:CreateTexture(nil, 'ARTWORK')
    head:SetPoint('TOPLEFT', 3, -3)
    head:SetPoint('TOPRIGHT', -3, -3)
    head:SetHeight(HEAD)
    head:SetTexture(FLAT)
    head:SetVertexColor(0.12, 0.12, 0.14, 1)
    local icon = w:CreateTexture(nil, 'OVERLAY')
    icon:SetSize(18, 18)
    icon:SetPoint('LEFT', head, 'LEFT', 8, 0)
    icon:SetTexture(ICON)
    icon:SetTexCoord(0.07, 0.93, 0.07, 0.93)
    local title = w:CreateFontString(nil, 'OVERLAY', 'GameFontNormal')
    title:SetPoint('LEFT', icon, 'RIGHT', 6, 0)
    title:SetText('Forever Bank  |cff888888' .. VERSION .. '|r')
    local close = CreateFrame('Button', nil, w, 'UIPanelCloseButton')
    close:SetPoint('RIGHT', head, 'RIGHT', 0, 0)
    close:SetScript('OnClick', function() w:Hide() end)
    if UISpecialFrames then table.insert(UISpecialFrames, 'ForeverBankSettings') end

    local body = CreateFrame('Frame', nil, w)
    body:SetPoint('TOPLEFT', 3, -3 - HEAD)
    body:SetPoint('TOPRIGHT', -3, -3 - HEAD)
    local height, sync = buildSettingsContent(body, 334)
    body:SetHeight(height)
    w:SetHeight(height + HEAD + 10)
    w:SetScript('OnShow', sync)
    w:Hide()
  end
  settingsWin:SetShown(not settingsWin:IsShown())
end

-- The same page under the game's Options > AddOns.
local function registerOptions()
  local canvas = CreateFrame('Frame')
  canvas.name = 'Forever Bank'
  local title = canvas:CreateFontString(nil, 'OVERLAY', 'GameFontNormalLarge')
  title:SetPoint('TOPLEFT', 16, -12)
  title:SetText('Forever Bank')
  local inner = CreateFrame('Frame', nil, canvas)
  inner:SetPoint('TOPLEFT', 0, -40)
  inner:SetSize(460, 10)
  local height, sync = buildSettingsContent(inner, 460)
  inner:SetHeight(height)
  canvas:SetScript('OnShow', sync)
  if Settings and Settings.RegisterCanvasLayoutCategory and Settings.RegisterAddOnCategory then
    local category = Settings.RegisterCanvasLayoutCategory(canvas, 'Forever Bank')
    Settings.RegisterAddOnCategory(category)
  elseif InterfaceOptions_AddCategory then
    InterfaceOptions_AddCategory(canvas)
  end
end

---------------------------------------------------------------------------
-- Slash command
---------------------------------------------------------------------------

local function slash(msg)
  msg = (msg or ''):lower()
  local cmd, arg = msg:match('^(%S*)%s*(.-)$')
  if cmd == '' then
    toggle()
  elseif cmd == 'settings' or cmd == 'config' or cmd == 'options' then
    openSettings()
  elseif cmd == 'value' then
    db.showValue = db.showValue == false
    applyBagLayout() syncAll()
    say('vendor value ' .. (db.showValue and 'shown' or 'hidden') .. ' on the backpack')
  elseif cmd == 'button' then
    db.showBagButton = db.showBagButton == false
    applyBagLayout() syncAll()
    say('bank button ' .. (db.showBagButton and 'shown' or 'hidden') .. ' on the backpack')
  elseif cmd == 'cols' or cmd == 'columns' then
    local n = tonumber(arg)
    if n then
      db.columns = math.max(4, math.min(24, math.floor(n)))
      buildFrame() refresh() syncAll()
      say('columns set to ' .. db.columns)
    else
      say('usage: /fbank cols 4-24')
    end
  elseif cmd == 'scale' then
    local n = tonumber(arg)
    if n then
      db.scale = math.max(0.5, math.min(2, n))
      buildFrame() frame:SetScale(db.scale) syncAll()
      say('scale set to ' .. db.scale)
    else
      say('usage: /fbank scale 0.5-2')
    end
  elseif cmd == 'minimap' then
    db.showMinimap = not (db.showMinimap ~= false)
    if minimapButton then minimapButton:SetShown(db.showMinimap) end
    syncAll()
    say('minimap button ' .. (db.showMinimap and 'shown' or 'hidden'))
  elseif cmd == 'debug' then
    local ids = {}
    for _, bag in ipairs(bankBags()) do ids[#ids + 1] = bag .. '=' .. numSlots(bag) end
    say('v' .. VERSION .. '  bank open: ' .. tostring(bankOpen))
    say('containers (id=slots): ' .. table.concat(ids, ' '))
    say('last scan: ' .. lastScanInfo)
    say('backpack button: ' .. (bagButton and 'made' or 'NOT made') .. '  search box: ' .. tostring(BagItemSearchBox and BagItemSearchBox:GetName()) .. '  junk: ' .. coins((bagValue(0))))
    say('saved snapshot: ' .. (snap and (snap.filled .. ' items, ' .. ago(snap.time)) or 'none')
      .. '  loaded from disk: ' .. tostring(FOREVERBANK_LOADED_FROM_DISK))
  else
    say('/fbank  show or hide the bank')
    say('/fbank settings  open the settings (also right-click the minimap or backpack button)')
    say('/fbank value  vendor value on or off   |   /fbank button  bank button on or off')
    say('/fbank cols N  |  scale N  |  minimap  |  debug')
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
reg('GET_ITEM_INFO_RECEIVED')
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
    pcall(registerOptions)
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
  elseif event == 'GET_ITEM_INFO_RECEIVED' then
    if not valueQueued and valueLine and valueLine:IsVisible() then queueValue() end
  else
    if event == 'BAG_UPDATE_DELAYED' or event == 'BAG_UPDATE' then queueValue() end
    if bankOpen then queueScan() end
  end
end)
