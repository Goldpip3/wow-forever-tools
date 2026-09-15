--[[
  A stand-in for the game, so the addon can be tested without one.

  Stubs every WoW function the addon calls, hands it a small character with two
  items worn and one in a bag, then builds an export. The tooltip lines below
  are copied from how Classic actually words them, which is the part that
  matters: those strings are what the scanner has to match.

  It cannot prove the real client words things this way. It can prove the Lua
  parses, the code paths run, and the JSON that comes out is something the
  website can read.
]]
-- ------------------------------------------------------------- API stubs

local frames = {}

local function newFontString()
  local fs = {}
  function fs:SetPoint() end
  function fs:SetJustifyH() end
  function fs:SetText(t) self.text = t end
  function fs:GetText() return self.text end
  return fs
end

local tooltipLines = {}

function CreateFrame(kind, name, parent, template)
  local f = {}
  f.name = name
  f.kind = kind
  f.scripts = {}
  function f:SetSize() end
  function f:SetPoint() end
  function f:SetFrameStrata() end
  function f:SetMovable() end
  function f:EnableMouse() end
  function f:RegisterForDrag() end
  function f:SetScript(k, v) self.scripts[k] = v end
  function f:GetScript(k) return self.scripts[k] end
  function f:Hide() self.shown = false end
  function f:Show() self.shown = true end
  function f:IsShown() return self.shown end
  function f:SetBackdrop() end
  function f:CreateFontString() return newFontString() end
  function f:RegisterEvent() end
  function f:SetMultiLine() end
  function f:SetMaxLetters() end
  function f:SetAutoFocus() end
  function f:SetFontObject() end
  function f:SetWidth() end
  function f:SetText(t) self.text = t end
  function f:GetText() return self.text end
  function f:HighlightText() end
  function f:SetFocus() end
  function f:ClearFocus() end
  function f:SetScrollChild() end
  function f:StartMoving() end
  function f:StopMovingOrSizing() end
  -- tooltip side
  function f:SetOwner() end
  function f:ClearLines() tooltipLines = {} end
  function f:NumLines() return #tooltipLines end
  function f:SetInventoryItem(unit, slot) tooltipLines = TOOLTIPS['slot' .. slot] or {} ; SyncGlobals() end
  function f:SetBagItem(bag, slot) tooltipLines = TOOLTIPS['bag' .. bag .. '_' .. slot] or {} ; SyncGlobals() end
  if name then _G[name] = f end
  frames[#frames + 1] = f
  return f
end

function SyncGlobals()
  for i = 1, 40 do
    _G['WFSyncScanTooltipTextLeft' .. i] = nil
    _G['WFSyncScanTooltipTextRight' .. i] = nil
  end
  for i, pair in ipairs(tooltipLines) do
    local left = newFontString(); left:SetText(pair[1])
    _G['WFSyncScanTooltipTextLeft' .. i] = left
    if pair[2] then
      local right = newFontString(); right:SetText(pair[2])
      _G['WFSyncScanTooltipTextRight' .. i] = right
    end
  end
end

UIParent = {}
BackdropTemplateMixin = {}
ChatFontNormal = {}
DEFAULT_CHAT_FRAME = { AddMessage = function() end }
SlashCmdList = {}
NUM_BAG_SLOTS = 4
NUM_BANKBAGSLOTS = 6
function time() return 1789000000 end

-- The character: a frost mage in two pieces of gear, one ring in a bag.
local ITEMS = {
  [900101] = { name = 'Icecrown Circlet', quality = 4, ilvl = 76, subType = 'Cloth',
               equipLoc = 'INVTYPE_HEAD', texture = 'Interface\\Icons\\INV_Crown_02' },
  [900115] = { name = 'Rime-Etched Blade', quality = 4, ilvl = 76, subType = 'One-Handed Swords',
               equipLoc = 'INVTYPE_WEAPONMAINHAND', texture = 'Interface\\Icons\\INV_Sword_39' },
  [900201] = { name = 'Crown of the Frozen Wastes', quality = 4, ilvl = 81, subType = 'Cloth',
               equipLoc = 'INVTYPE_HEAD', texture = 'Interface\\Icons\\INV_Crown_01' },
}

local LINKS = {
  slot1 = '|cffa335ee|Hitem:900101:2504:0:0:0:0:0:0:60|h[Icecrown Circlet]|h|r',
  slot16 = '|cffa335ee|Hitem:900115:1903:0:0:0:0:0:0:60|h[Rime-Etched Blade]|h|r',
  bag0_3 = '|cffa335ee|Hitem:900201:0:0:0:0:0:0:0:60|h[Crown of the Frozen Wastes]|h|r',
}

TOOLTIPS = {
  slot1 = {
    { 'Icecrown Circlet' }, { 'Binds when picked up' }, { 'Head', 'Cloth' },
    { '65 Armor' }, { '+24 Intellect' }, { '+17 Stamina' }, { '+9 Spirit' },
    { '+10 Arcane Resistance' },
    { 'Equip: Increases damage and healing done by magical spells and effects by up to 30.' },
    { 'Equip: Improves your chance to get a critical strike with spells by 1%.' },
    { 'Equip: Restores 6 mana per 5 sec.' },
  },
  slot16 = {
    { 'Rime-Etched Blade' }, { 'Binds when picked up' },
    { 'Main Hand', 'Sword' }, { '44 - 82 Damage', 'Speed 2.20' }, { '(28.6 damage per second)' },
    { '+9 Intellect' },
    { 'Equip: Increases damage and healing done by magical spells and effects by up to 30.' },
    { 'Equip: Improves your chance to get a critical strike with spells by 1%.' },
    { 'Increased Swords +4' },
  },
  bag0_3 = {
    { 'Crown of the Frozen Wastes' }, { 'Unique' }, { 'Head', 'Cloth' },
    { '70 Armor' }, { '+28 Intellect' }, { '+20 Stamina' },
    { 'Equip: Increases damage done by Frost spells and effects by up to 40.' },
    { 'Equip: Improves your chance to hit with spells by 1%.' },
    { 'Use: Restores 500 mana.' },
    { 'Frostweave Regalia (2/8)' },
  },
}

function GetItemInfo(link)
  local id = tonumber(string.match(link, 'item:(%d+)'))
  local item = ITEMS[id]
  if not item then return nil end
  return item.name, link, item.quality, item.ilvl, 60, 'Armor', item.subType, 1, item.equipLoc, item.texture, 100
end

function GetInventoryItemLink(unit, slot) return LINKS['slot' .. slot] end

C_Container = {
  GetContainerNumSlots = function(bag) return bag == 0 and 16 or 0 end,
  GetContainerItemLink = function(bag, slot)
    if bag == 0 and slot == 3 then return LINKS.bag0_3 end
    return nil
  end,
}

function UnitStat(unit, i)
  local totals = { 34, 38, 168, 382, 84 }
  return totals[i], totals[i], 0, 0
end
function UnitAttackPower() return 24, 0, 0 end
function UnitRangedAttackPower() return 28, 0, 0 end
function GetCritChance() return 3.4 end
function GetRangedCritChance() return 3.4 end
function GetSpellBonusHealing() return 394 end
function UnitPowerMax() return 6643 end
function UnitHealthMax() return 2963 end
function UnitArmor() return 485, 561, 0, 0, 0 end
function GetSpellBonusDamage(school) return school == 5 and 394 or 394 end
function GetSpellCritChance() return 12.62 end
function GetHitModifier() return 0 end
function GetSpellHitModifier() return 3 end
function UnitDamage() return 44, 82, 0, 0, 0, 0, 100 end
function UnitAttackSpeed() return 2.2, 0 end
function UnitRangedDamage() return 1.5, 96, 179, 0, 0, 100 end
function UnitName() return 'Frostweaver' end
function GetRealmName() return 'Example' end
function UnitClass() return 'Mage', 'MAGE' end
function UnitRace() return 'Human', 'Human' end
function UnitFactionGroup() return 'Alliance' end
function UnitLevel() return 60 end
function UnitBuff(unit, i) return nil end

local TALENTS = {
  { tab = 'Arcane', list = { { 'Arcane Focus', 1, 2, 5, 5 }, { 'Arcane Concentration', 2, 3, 5, 5 } } },
  { tab = 'Fire', list = { { 'Ignite', 2, 1, 0, 5 } } },
  { tab = 'Frost', list = { { 'Improved Frostbolt', 1, 2, 5, 5 }, { "Winter's Chill", 6, 3, 5, 5 } } },
}

function GetNumTalentTabs() return #TALENTS end
function GetTalentTabInfo(tab)
  local entry = TALENTS[tab]
  local spent = 0
  for _, t in ipairs(entry.list) do spent = spent + t[4] end
  return entry.tab, 'texture', spent, 'background'
end
function GetNumTalents(tab) return #TALENTS[tab].list end
function GetTalentInfo(tab, index)
  local t = TALENTS[tab].list[index]
  return t[1], 'icon', t[2], t[3], t[4], t[5]
end

local SKILLS = {
  { 'Weapon Skills', true, 0, 0 },
  { 'Swords', false, 300, 0 },
  { 'Staves', false, 300, 0 },
}
function GetNumSkillLines() return #SKILLS end
function GetSkillLineInfo(i)
  local s = SKILLS[i]
  return s[1], s[2], false, s[3], 0, s[4], 300
end

-- ------------------------------------------------------------- load it up

local ns = {}
local loaded = {}
for _, file in ipairs({ 'json', 'scan', 'export', 'ui' }) do
  local path = ADDON_DIR .. '/' .. file .. '.lua'
  local chunk, err = loadfile(path)
  if not chunk then error('could not load ' .. file .. ': ' .. tostring(err)) end
  chunk('WoWForeverSync', ns)
  loaded[#loaded + 1] = file
end

-- The window builds its frame lazily, so open it the way a player would.
SlashCmdList.WFSYNC('')

local text = ns.export.build()
RESULT = text
CHECKS = table.concat(loaded, ',')
