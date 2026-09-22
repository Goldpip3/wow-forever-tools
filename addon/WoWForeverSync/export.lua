--[[
  Building the payload.

  Order of business: who you are, what you are wearing, what is in your bags and
  your bank, what the character sheet says, and which talents you took. Every
  read is wrapped, so a client that is missing an API loses that one field and
  marks the export partial rather than throwing an error at you.
]]

local ADDON, ns = ...

local export = {}
ns.export = export

export.VERSION = 2
export.PREFIX = 'WFSYNC1'
export.ADDON_VERSION = '1.2.1'

local safe = ns.scan.safe
local json = ns.json

--- Trade skills, in the keys the website uses.
--
-- Matched by name rather than by walking to the "Professions" header, because the
-- header is a different string in every locale while these twelve are the names the
-- site already knows. A skill line that is not in here is a weapon skill or a
-- language and goes to `skills` as before.
local PROFESSIONS = {
  ['Alchemy'] = 'alchemy',
  ['Blacksmithing'] = 'blacksmithing',
  ['Enchanting'] = 'enchanting',
  ['Engineering'] = 'engineering',
  ['Herbalism'] = 'herbalism',
  ['Leatherworking'] = 'leatherworking',
  ['Mining'] = 'mining',
  ['Skinning'] = 'skinning',
  ['Tailoring'] = 'tailoring',
  ['Cooking'] = 'cooking',
  ['First Aid'] = 'first-aid',
  ['Fishing'] = 'fishing',
}

--- Inventory slots worth reading, in the names the website uses.
local SLOTS = {
  { id = 1, key = 'head' },
  { id = 2, key = 'neck' },
  { id = 3, key = 'shoulder' },
  { id = 15, key = 'back' },
  { id = 5, key = 'chest' },
  { id = 9, key = 'wrist' },
  { id = 10, key = 'hands' },
  { id = 6, key = 'waist' },
  { id = 7, key = 'legs' },
  { id = 8, key = 'feet' },
  { id = 11, key = 'finger1' },
  { id = 12, key = 'finger2' },
  { id = 13, key = 'trinket1' },
  { id = 14, key = 'trinket2' },
  { id = 16, key = 'mainhand' },
  { id = 17, key = 'offhand' },
  { id = 18, key = 'ranged' },
}

local SCHOOLS = { [2] = 'holy', [3] = 'fire', [4] = 'nature', [5] = 'frost', [6] = 'shadow', [7] = 'arcane' }

--- Shirts, tabards and anything that is not gear never leave the bags.
local SKIP_EQUIP_LOC = {
  [''] = true,
  INVTYPE_BAG = true,
  INVTYPE_BODY = true,
  INVTYPE_TABARD = true,
  INVTYPE_AMMO = true,
  INVTYPE_QUIVER = true,
  INVTYPE_NON_EQUIP = true,
}

local partial = false

-- --------------------------------------------------------- container helpers

local function containerSlots(bag)
  if C_Container and C_Container.GetContainerNumSlots then
    return safe(C_Container.GetContainerNumSlots, bag) or 0
  end
  return safe(GetContainerNumSlots, bag) or 0
end

local function containerLink(bag, slot)
  if C_Container and C_Container.GetContainerItemLink then
    return safe(C_Container.GetContainerItemLink, bag, slot)
  end
  return safe(GetContainerItemLink, bag, slot)
end

local function readContainer(bag, out)
  local slots = containerSlots(bag)
  for slot = 1, slots do
    local link = containerLink(bag, slot)
    if link then
      local item, uncached = ns.scan.item(link,
        function(tip) tip:SetBagItem(bag, slot) end,
        function() return C_TooltipInfo and C_TooltipInfo.GetBagItem(bag, slot) end)
      if uncached then partial = true end
      if item and not SKIP_EQUIP_LOC[item.equipLoc] then
        item.bag = bag
        item.index = slot
        out[#out + 1] = item
      end
    end
  end
end

-- ------------------------------------------------------- the character sheet

local function statTotal(index)
  local _, total = safe(UnitStat, 'player', index)
  return total or 0
end

local function attackPower(fn)
  local base, positive, negative = safe(fn, 'player')
  if not base then return 0 end
  return base + (positive or 0) + (negative or 0)
end

local function readSheet()
  local sheet = {
    strength = statTotal(1),
    agility = statTotal(2),
    stamina = statTotal(3),
    intellect = statTotal(4),
    spirit = statTotal(5),
    attackPower = attackPower(UnitAttackPower),
    rangedAttackPower = attackPower(UnitRangedAttackPower),
    meleeCrit = safe(GetCritChance) or 0,
    rangedCrit = safe(GetRangedCritChance) or 0,
    healing = safe(GetSpellBonusHealing) or 0,
    mana = safe(UnitPowerMax, 'player', 0) or 0,
    health = safe(UnitHealthMax, 'player') or 0,
    armor = select(2, safe(UnitArmor, 'player')) or 0,
    spellCrit = {},
    spellPower = {},
  }

  for index, school in pairs(SCHOOLS) do
    sheet.spellPower[school] = safe(GetSpellBonusDamage, index) or 0
    sheet.spellCrit[school] = safe(GetSpellCritChance, index) or 0
  end

  -- These two are absent on some builds, and absent is not the same as zero.
  local hit = safe(GetHitModifier)
  if hit then sheet.hit = hit end
  local spellHit = safe(GetSpellHitModifier)
  if spellHit then sheet.spellHit = spellHit end

  local low, high, offLow, offHigh = safe(UnitDamage, 'player')
  local mainSpeed, offSpeed = safe(UnitAttackSpeed, 'player')
  if low and mainSpeed then
    sheet.mainhand = { min = low, max = high or low, speed = mainSpeed }
  end
  if offLow and offSpeed and offSpeed > 0 then
    sheet.offhand = { min = offLow, max = offHigh or offLow, speed = offSpeed }
  end

  local rangedSpeed, rangedLow, rangedHigh = safe(UnitRangedDamage, 'player')
  if rangedSpeed and rangedSpeed > 0 and rangedLow then
    sheet.ranged = { min = rangedLow, max = rangedHigh or rangedLow, speed = rangedSpeed }
  end

  return sheet
end

-- -------------------------------------------------------- talents and skills

local function readTalents()
  local tabs = json.array()
  local count = safe(GetNumTalentTabs) or 0

  for tab = 1, count do
    -- The return order differs between builds, so take the first string as the
    -- name and the first number after it as the points spent.
    local a, b, c = safe(GetTalentTabInfo, tab)
    local name = type(a) == 'string' and a or (type(b) == 'string' and b or ('Tab ' .. tab))
    local points = type(c) == 'number' and c or 0

    local list = json.array()
    local talents = safe(GetNumTalents, tab) or 0
    local spent = 0

    for index = 1, talents do
      local talentName, _, tier, column, rank, maxRank = safe(GetTalentInfo, tab, index)
      if talentName then
        rank = rank or 0
        spent = spent + rank
        list[#list + 1] = {
          name = talentName,
          tier = tier or 0,
          column = column or 0,
          rank = rank,
          max = maxRank or 1,
        }
      end
    end

    tabs[#tabs + 1] = { tab = name, points = points > 0 and points or spent, list = list }
  end

  return tabs
end

local function readSkills()
  local skills = {}
  local lines = safe(GetNumSkillLines) or 0
  for i = 1, lines do
    local name, isHeader, _, rank, _, modifier = safe(GetSkillLineInfo, i)
    if name and not isHeader and rank and not PROFESSIONS[name] then
      skills[name] = rank + (modifier or 0)
    end
  end
  return skills
end

--- Professions off the skill list, which is how Classic Era holds them.
--
-- The rank alone, without the modifier gloves and goggles add: 300 is the number the
-- trade window shows and the number somebody means when they say they can make a
-- thing. A profession that is not learned has no skill line, so it is simply absent.
local function professionsFromSkillLines()
  local found = json.array()
  local lines = safe(GetNumSkillLines) or 0
  for i = 1, lines do
    local name, isHeader, _, rank = safe(GetSkillLineInfo, i)
    local key = name and not isHeader and PROFESSIONS[name]
    if key and rank and rank > 0 then
      found[#found + 1] = { key = key, skill = rank }
    end
  end
  return found
end

--- The same thing on the engine that has no skill list.
--
-- Forever reports interface 16001 but is the retail client underneath, where
-- GetNumSkillLines and GetSkillLineInfo simply do not exist. Every profession came
-- back empty there until this was added.
--
-- GetProfessions hands back a fixed set of slots with gaps in them — an empty slot
-- is nil, not a shorter list — so this walks positions. ipairs would stop at the
-- first gap and lose everything after it, which for somebody with one profession
-- and Cooking is most of the answer. The count is generous because the slot layout
-- differs between engines and an extra empty position costs nothing.
local function professionsFromSlots()
  local found = json.array()
  local slots = { safe(GetProfessions) }
  for i = 1, 10 do
    local index = slots[i]
    if index then
      -- name, icon, rank: the rank is the same number the skill line gave.
      local name, _, rank = safe(GetProfessionInfo, index)
      local key = name and PROFESSIONS[name]
      if key and rank and rank > 0 then
        found[#found + 1] = { key = key, skill = rank }
      end
    end
  end
  return found
end

--- What this character can make, for the guild page.
--
-- Classic Era first, because its skill list carries every profession including the
-- secondary ones. Only when that API is missing does this fall to the slots, which
-- is the Forever path.
local function readProfessions()
  if type(GetNumSkillLines) == 'function' then return professionsFromSkillLines() end
  if type(GetProfessions) == 'function' then return professionsFromSlots() end
  return json.array()
end

local function buffName(i)
  if type(UnitBuff) == 'function' then return safe(UnitBuff, 'player', i) end
  -- UnitBuff is gone on the newer engine, which hands back a table instead.
  if C_UnitAuras and C_UnitAuras.GetBuffDataByIndex then
    local aura = safe(C_UnitAuras.GetBuffDataByIndex, 'player', i)
    if type(aura) == 'table' then return safe(function() return aura.name end) end
  end
  return nil
end

local function readBuffs()
  local names = json.array()
  for i = 1, 40 do
    local name = buffName(i)
    if type(name) ~= 'string' then break end
    names[#names + 1] = name
  end
  return names
end

-- ------------------------- the bank, which is only readable while it is open

local bankOpen = false

function export.setBankOpen(open)
  bankOpen = open
end

function export.isBankOpen()
  return bankOpen
end

--- Reads the bank into saved variables, so a later export still has it.
function export.scanBank()
  if not bankOpen then return false end
  local out = {}
  local index = Enum and Enum.BagIndex
  if index and index.CharacterBankTab_1 then
    -- The newer engine's bank is tabs, and the old -1 container is gone.
    for tab = 1, 6 do
      local bag = index['CharacterBankTab_' .. tab]
      if bag then readContainer(bag, out) end
    end
  else
    readContainer(-1, out)
    local firstBankBag = (NUM_BAG_SLOTS or 4) + 1
    local lastBankBag = firstBankBag + (NUM_BANKBAGSLOTS or 6) - 1
    for bag = firstBankBag, lastBankBag do
      readContainer(bag, out)
    end
  end

  WoWForeverSyncDB = WoWForeverSyncDB or {}
  WoWForeverSyncDB.bank = out
  WoWForeverSyncDB.bankScannedAt = time()
  return true, #out
end

-- ----------------------------------------------------------- the whole thing

function export.build()
  -- In combat the engine hides numbers from addons, so the sheet would be holes.
  if safe(InCombatLockdown) then return nil end

  partial = false

  local equipped = {}
  for _, slot in ipairs(SLOTS) do
    local link = safe(GetInventoryItemLink, 'player', slot.id)
    if link then
      local item, uncached = ns.scan.item(link,
        function(tip) tip:SetInventoryItem('player', slot.id) end,
        function() return C_TooltipInfo and C_TooltipInfo.GetInventoryItem('player', slot.id) end)
      if uncached then partial = true end
      if item then equipped[slot.key] = item end
    end
  end

  local bags = json.array()
  for bag = 0, (NUM_BAG_SLOTS or 4) do
    readContainer(bag, bags)
  end

  local bank
  local bankStale = false
  if bankOpen then
    export.scanBank()
  end
  WoWForeverSyncDB = WoWForeverSyncDB or {}
  if WoWForeverSyncDB.bank then
    bank = WoWForeverSyncDB.bank
    bankStale = not bankOpen
  else
    bank = json.array()
  end
  if #bank == 0 then bank = json.array(bank) end

  local _, classToken = safe(UnitClass, 'player')
  local _, raceToken = safe(UnitRace, 'player')
  local faction = safe(UnitFactionGroup, 'player')

  local payload = {
    v = export.VERSION,
    addonVersion = export.ADDON_VERSION,
    generatedAt = time(),
    name = safe(UnitName, 'player') or 'Unknown',
    realm = safe(GetRealmName) or '',
    classId = string.lower(classToken or ''),
    level = safe(UnitLevel, 'player') or 0,
    race = raceToken or '',
    faction = faction,
    talents = readTalents(),
    stats = readSheet(),
    skills = readSkills(),
    professions = readProfessions(),
    activeBuffs = readBuffs(),
    equipped = equipped,
    bags = bags,
    bank = bank,
  }

  local gameVersion, _, _, interface = safe(GetBuildInfo)
  if interface then payload.client = { interface = interface, version = gameVersion } end

  if bankStale then payload.bankStale = true end
  if partial then payload.partial = true end

  local text = export.PREFIX .. json.encode(payload)

  WoWForeverSyncDB.lastExport = text
  WoWForeverSyncDB.exportedAt = payload.generatedAt

  local counts = { equipped = 0, bags = #bags, bank = #bank }
  for _ in pairs(equipped) do counts.equipped = counts.equipped + 1 end

  return text, counts, partial, bankStale
end

--[[
  /wfsync diag. Says which parts of the game this client has, and which tooltip
  lines the scanner did not understand, so a field that arrives empty on the
  site can be traced to the function or the wording behind it.
]]
local PROBES = {
  'GetItemInfo', 'C_Item.GetItemInfo', 'C_TooltipInfo.GetInventoryItem',
  'C_Container.GetContainerItemLink', 'GetContainerItemLink',
  'UnitStat', 'UnitAttackPower', 'UnitRangedAttackPower', 'UnitDamage', 'UnitAttackSpeed',
  'UnitRangedDamage', 'UnitArmor', 'GetCritChance', 'GetRangedCritChance',
  'GetSpellBonusDamage', 'GetSpellBonusHealing', 'GetSpellCritChance',
  'GetHitModifier', 'GetSpellHitModifier',
  'GetNumTalentTabs', 'GetTalentTabInfo', 'GetNumTalents', 'GetTalentInfo',
  'C_ClassTalents.GetActiveConfigID', 'C_SpecializationInfo.GetTalentInfo',
  'GetNumSkillLines', 'GetSkillLineInfo',
  'GetProfessions', 'GetProfessionInfo',
  'UnitBuff', 'C_UnitAuras.GetBuffDataByIndex',
  'Enum.BagIndex.CharacterBankTab_1', 'issecretvalue',
}

local function lookup(path)
  local at = _G
  for part in string.gmatch(path, '[^%.]+') do
    if type(at) ~= 'table' then return nil end
    at = at[part]
  end
  return at
end

function export.diag()
  local lines = {}
  local function put(text) lines[#lines + 1] = text end

  local gameVersion, build, _, interface = safe(GetBuildInfo)
  put('WoW Forever Sync ' .. export.ADDON_VERSION .. ' diagnostics')
  put('client ' .. tostring(gameVersion) .. ' build ' .. tostring(build) .. ' interface ' .. tostring(interface))
  put('locale ' .. tostring(safe(GetLocale)))

  local missing = {}
  for _, path in ipairs(PROBES) do
    if lookup(path) == nil then missing[#missing + 1] = path end
  end
  put('missing: ' .. (#missing > 0 and table.concat(missing, ', ') or 'nothing'))

  ns.scan.keepUnread = true
  local ok, text, counts = pcall(export.build)
  ns.scan.keepUnread = false
  if not ok then
    put('build threw: ' .. tostring(text))
  elseif not text then
    put('build refused: in combat')
  else
    put('export ' .. #text .. ' characters, ' .. counts.equipped .. ' worn, ' .. counts.bags .. ' in bags')
  end

  put('talent tabs ' .. tostring(safe(GetNumTalentTabs)) .. ', skill lines ' .. tostring(safe(GetNumSkillLines)))

  -- Which way the professions were read, and what came back. A client with
  -- neither API is why they arrived empty on the website, and this is the line
  -- that says so instead of leaving it to be guessed.
  local route = 'neither API'
  if type(GetNumSkillLines) == 'function' then
    route = 'skill lines'
  elseif type(GetProfessions) == 'function' then
    route = 'profession slots'
  end
  local professions = readProfessions()
  local names = {}
  for _, p in ipairs(professions) do
    names[#names + 1] = p.key .. ' ' .. tostring(p.skill)
  end
  put('professions via ' .. route .. ': ' .. (#names > 0 and table.concat(names, ', ') or 'none found'))

  for _, slot in ipairs(SLOTS) do
    local link = safe(GetInventoryItemLink, 'player', slot.id)
    if link then
      ns.scan.keepUnread = true
      local okItem, item = pcall(ns.scan.item, link,
        function(tip) tip:SetInventoryItem('player', slot.id) end,
        function() return C_TooltipInfo and C_TooltipInfo.GetInventoryItem('player', slot.id) end)
      ns.scan.keepUnread = false
      if not okItem then
        put(slot.key .. ': threw ' .. tostring(item))
      elseif not item then
        put(slot.key .. ': item not loaded yet')
      else
        local found = 0
        for _ in pairs(item.stats) do found = found + 1 end
        put(slot.key .. ': ' .. item.name .. ', ' .. (item.__lines or 0) .. ' lines, ' .. found .. ' stats')
        for _, unread in ipairs(item.__unread or {}) do put('   ? ' .. unread) end
      end
    end
  end

  return table.concat(lines, '\n')
end

_G[ADDON .. 'Export'] = export
