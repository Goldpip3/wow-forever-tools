--[[
  The window, and /wfsync.

  One movable frame with a scrolling box you cannot type into, because the only
  thing to do with it is select all and copy. The text is put in and highlighted
  on open, so the usual answer is to press the copy key straight away.
]]

local ADDON, ns = ...

local ui = {}
ns.ui = ui

local frame
local editBox
local status

local function say(message)
  DEFAULT_CHAT_FRAME:AddMessage('|cff33ff99WoW Forever Sync|r: ' .. message)
end

local function buildFrame()
  frame = CreateFrame('Frame', 'WoWForeverSyncFrame', UIParent, 'BackdropTemplate')
  frame:SetSize(560, 340)
  frame:SetPoint('CENTER')
  frame:SetFrameStrata('DIALOG')
  frame:SetMovable(true)
  frame:EnableMouse(true)
  frame:RegisterForDrag('LeftButton')
  frame:SetScript('OnDragStart', frame.StartMoving)
  frame:SetScript('OnDragStop', frame.StopMovingOrSizing)
  frame:Hide()

  if frame.SetBackdrop then
    frame:SetBackdrop({
      bgFile = 'Interface\\DialogFrame\\UI-DialogBox-Background',
      edgeFile = 'Interface\\DialogFrame\\UI-DialogBox-Border',
      tile = true, tileSize = 32, edgeSize = 32,
      insets = { left = 11, right = 12, top = 12, bottom = 11 },
    })
  end

  local title = frame:CreateFontString(nil, 'OVERLAY', 'GameFontNormalLarge')
  title:SetPoint('TOP', 0, -16)
  title:SetText('WoW Forever Sync')

  local hint = frame:CreateFontString(nil, 'OVERLAY', 'GameFontHighlightSmall')
  hint:SetPoint('TOPLEFT', 20, -40)
  hint:SetPoint('TOPRIGHT', -20, -40)
  hint:SetJustifyH('LEFT')
  hint:SetText('Select all and copy, then paste it into the gear page. Stand unbuffed for the cleanest numbers.')

  local scroll = CreateFrame('ScrollFrame', 'WoWForeverSyncScroll', frame, 'UIPanelScrollFrameTemplate')
  scroll:SetPoint('TOPLEFT', 20, -64)
  scroll:SetPoint('BOTTOMRIGHT', -36, 60)

  editBox = CreateFrame('EditBox', nil, scroll)
  editBox:SetMultiLine(true)
  editBox:SetMaxLetters(0)
  editBox:SetAutoFocus(false)
  editBox:SetFontObject(ChatFontNormal)
  editBox:SetWidth(480)
  editBox:SetScript('OnEscapePressed', function(self)
    self:ClearFocus()
    frame:Hide()
  end)
  scroll:SetScrollChild(editBox)

  status = frame:CreateFontString(nil, 'OVERLAY', 'GameFontDisableSmall')
  status:SetPoint('BOTTOMLEFT', 20, 22)

  local refresh = CreateFrame('Button', nil, frame, 'UIPanelButtonTemplate')
  refresh:SetSize(90, 22)
  refresh:SetPoint('BOTTOMRIGHT', -110, 18)
  refresh:SetText('Refresh')
  refresh:SetScript('OnClick', function() ui.refresh() end)

  local close = CreateFrame('Button', nil, frame, 'UIPanelButtonTemplate')
  close:SetSize(90, 22)
  close:SetPoint('BOTTOMRIGHT', -16, 18)
  close:SetText('Close')
  close:SetScript('OnClick', function() frame:Hide() end)
end

--- Rebuilds the export and puts it in the box, ready to copy.
function ui.refresh()
  if not frame then buildFrame() end

  local text, counts, partial, bankStale = ns.export.build()
  if not text then
    editBox:SetText('')
    status:SetText('You are in combat. Press Refresh once the fight is over.')
    return
  end
  editBox:SetText(text)
  editBox:HighlightText()
  editBox:SetFocus()

  local bank = 'bank never read'
  if counts.bank > 0 then
    bank = bankStale and ('bank ' .. counts.bank .. ', from an earlier visit') or ('bank ' .. counts.bank)
  elseif ns.export.isBankOpen() then
    bank = 'bank empty'
  end

  local line = counts.equipped .. ' worn, ' .. counts.bags .. ' in bags, ' .. bank
  if partial then
    line = line .. ' — some items had not loaded, press Refresh again'
  end
  status:SetText(line)
end

--- Puts the diagnostics in the same box, since that is where copying works.
function ui.diag()
  if not frame then buildFrame() end
  frame:Show()
  editBox:SetText(ns.export.diag())
  editBox:HighlightText()
  editBox:SetFocus()
  status:SetText('Diagnostics. Copy this if the site is missing something.')
end

function ui.toggle()
  if not frame then buildFrame() end
  if frame:IsShown() then
    frame:Hide()
  else
    frame:Show()
    ui.refresh()
  end
end

-- ------------------------------------------------------------------- events

local events = CreateFrame('Frame')
-- The newer engine throws on an event name it does not know.
for _, name in ipairs({ 'ADDON_LOADED', 'BANKFRAME_OPENED', 'BANKFRAME_CLOSED' }) do
  pcall(events.RegisterEvent, events, name)
end

events:SetScript('OnEvent', function(_, event, name)
  if event == 'ADDON_LOADED' and name == ADDON then
    WoWForeverSyncDB = WoWForeverSyncDB or {}
    say('loaded. Type /wfsync to export your character.')
  elseif event == 'BANKFRAME_OPENED' then
    ns.export.setBankOpen(true)
    -- Reading it now means a later export away from the bank still has it.
    local ok, found = ns.export.scanBank()
    if ok then say('bank read, ' .. (found or 0) .. ' items.') end
  elseif event == 'BANKFRAME_CLOSED' then
    ns.export.setBankOpen(false)
  end
end)

SLASH_WFSYNC1 = '/wfsync'
SLASH_WFSYNC2 = '/wowforeversync'
SlashCmdList.WFSYNC = function(msg)
  local word = string.lower(string.match(msg or '', '^%s*(.-)%s*$'))
  if word == 'diag' then
    ui.diag()
    return
  end
  if word == 'bank' then
    local ok, found = ns.export.scanBank()
    say(ok and ('bank read, ' .. (found or 0) .. ' items.') or 'open your bank first.')
    return
  end
  ui.toggle()
end
