--[[
  Reading an item.

  GetItemStats does not report the green "Equip:" lines on Classic, and those
  lines are most of what a caster cares about, so the numbers come off a hidden
  tooltip instead. That means the patterns below are English only: on another
  locale the stats come back empty and the website says so rather than lying.

  Anything the patterns do not recognise is kept as text in `effects`, so a
  trinket with a use effect still arrives whole even though nothing simulates it
  yet.
]]

local _, ns = ...

local scan = {}
ns.scan = scan

--- Every API call goes through this, so a missing one is a blank field.
local function safe(fn, ...)
  if type(fn) ~= 'function' then return nil end
  local ok, a, b, c, d, e, f, g, h, i, j = pcall(fn, ...)
  if not ok then return nil end
  return a, b, c, d, e, f, g, h, i, j
end
scan.safe = safe

local tooltip

local function scanTooltip()
  if not tooltip then
    tooltip = CreateFrame('GameTooltip', 'WFSyncScanTooltip', nil, 'GameTooltipTemplate')
    tooltip:SetOwner(UIParent, 'ANCHOR_NONE')
  end
  return tooltip
end

local PRIMARY = {
  Strength = 'strength',
  Agility = 'agility',
  Stamina = 'stamina',
  Intellect = 'intellect',
  Spirit = 'spirit',
}

local SCHOOL_POWER = {
  Arcane = 'arcanePower',
  Fire = 'firePower',
  Frost = 'frostPower',
  Holy = 'holyPower',
  Nature = 'naturePower',
  Shadow = 'shadowPower',
}

local RESISTANCES = {
  Arcane = 'arcane',
  Fire = 'fire',
  Frost = 'frost',
  Holy = 'holy',
  Nature = 'nature',
  Shadow = 'shadow',
}

local function add(stats, key, value)
  if not key or not value then return end
  stats[key] = (stats[key] or 0) + value
end

--- Reads one tooltip line into the stat table. Returns true when it understood it.
local function readLine(line, rightText, item)
  local stats = item.stats
  local number, word

  -- "+10 Intellect" and "+10 Arcane Resistance" share a shape, so resistance
  -- has to be tried first or the plain rule would swallow it.
  number, word = string.match(line, '^%+?(%-?%d+) (%a+) Resistance$')
  if number and RESISTANCES[word] then
    item.resistances = item.resistances or {}
    item.resistances[RESISTANCES[word]] = (item.resistances[RESISTANCES[word]] or 0) + tonumber(number)
    return true
  end

  number, word = string.match(line, '^%+?(%-?%d+) (%a+)$')
  if number and PRIMARY[word] then
    add(stats, PRIMARY[word], tonumber(number))
    return true
  end

  number = string.match(line, '^(%d+) Armor$')
  if number then
    add(stats, 'armor', tonumber(number))
    return true
  end

  -- The green lines. Matched without anchors so a leading "Equip: " and a
  -- trailing full stop do not matter.
  number = string.match(line, 'chance to get a critical strike with spells by (%d+)')
  if number then
    add(stats, 'spellCrit', tonumber(number))
    return true
  end

  number = string.match(line, 'chance to get a critical strike by (%d+)')
  if number then
    add(stats, 'crit', tonumber(number))
    return true
  end

  number = string.match(line, 'chance to hit with spells by (%d+)')
  if number then
    add(stats, 'spellHit', tonumber(number))
    return true
  end

  number = string.match(line, 'chance to hit by (%d+)')
  if number then
    add(stats, 'hit', tonumber(number))
    return true
  end

  number = string.match(line, 'damage and healing done by magical spells and effects by up to (%d+)')
  if number then
    add(stats, 'spellPower', tonumber(number))
    return true
  end

  word, number = string.match(line, 'damage done by (%a+) spells and effects by up to (%d+)')
  if number and SCHOOL_POWER[word] then
    add(stats, SCHOOL_POWER[word], tonumber(number))
    return true
  end

  number = string.match(line, 'healing done by spells and effects by up to (%d+)')
  if number then
    add(stats, 'healing', tonumber(number))
    return true
  end

  number = string.match(line, 'Increases ranged attack power by (%d+)')
    or string.match(line, '^%+?(%-?%d+) ranged Attack Power')
  if number then
    add(stats, 'rangedAttackPower', tonumber(number))
    return true
  end

  number = string.match(line, 'Increases attack power by (%d+)')
    or string.match(line, '^%+?(%-?%d+) Attack Power')
  if number then
    -- A druid item says "in Cat, Bear, Dire Bear and Moonkin forms" after it.
    if string.find(line, 'Cat, Bear') then
      add(stats, 'feralAttackPower', tonumber(number))
    else
      add(stats, 'attackPower', tonumber(number))
    end
    return true
  end

  number = string.match(line, 'Restores (%d+) mana per 5 sec')
    or string.match(line, '(%d+) mana every 5 sec')
  if number then
    add(stats, 'mp5', tonumber(number))
    return true
  end

  word, number = string.match(line, 'Increased ([%a ]+) %+(%d+)')
  if number and word then
    item.weaponSkill = item.weaponSkill or {}
    item.weaponSkill[word] = (item.weaponSkill[word] or 0) + tonumber(number)
    return true
  end

  -- The weapon damage line carries its speed on the right hand side.
  local low, high = string.match(line, '^(%d+) %- (%d+) Damage$')
  if low and high then
    item.weapon = item.weapon or {}
    item.weapon.min = tonumber(low)
    item.weapon.max = tonumber(high)
    if rightText then
      local speed = string.match(rightText, 'Speed (%d+%.?%d*)')
      if speed then item.weapon.speed = tonumber(speed) end
    end
    return true
  end

  if string.match(line, '^Unique') then
    item.unique = true
    return true
  end

  local setName, have, total = string.match(line, '^(.-) %((%d+)/(%d+)%)$')
  if setName and have and total then
    item.setName = setName
    return true
  end

  return false
end

--- Splits a link into the pieces the website wants to keep.
function scan.parseLink(link)
  if type(link) ~= 'string' then return nil end
  local payload = string.match(link, '|Hitem:([%-%d:]+)|h') or string.match(link, '^item:([%-%d:]+)')
  if not payload then return nil end

  local parts = {}
  for field in string.gmatch(payload .. ':', '([^:]*):') do
    parts[#parts + 1] = field
  end

  return tonumber(parts[1]), tonumber(parts[2]) or 0, tonumber(parts[8]) or 0
end

local function iconName(texture)
  if type(texture) ~= 'string' then return nil end
  local base = string.match(texture, '([^\\/]+)$')
  return base and string.lower(base) or nil
end

--[[
  Reads one item.

  `setter` is a function that points the hidden tooltip at the item: which slot
  it is in, or which bag. That matters because a tooltip built from the item in
  place includes its enchant and its random suffix, while one built from the
  plain item id would not.
]]
function scan.item(link, setter)
  local id, enchant, suffix = scan.parseLink(link)
  if not id then return nil end

  local name, _, quality, ilvl, _, _, subType, _, equipLoc, texture = safe(GetItemInfo, link)
  if not name then return nil, true end -- not cached yet; the caller retries

  local item = {
    id = id,
    name = name,
    link = link,
    equipLoc = equipLoc or '',
    subType = subType,
    quality = quality or 0,
    stats = {},
  }
  if ilvl and ilvl > 0 then item.ilvl = ilvl end
  local icon = iconName(texture)
  if icon then item.icon = icon end
  if enchant and enchant ~= 0 then item.enchant = enchant end
  if suffix and suffix ~= 0 then item.suffix = suffix end

  local tip = scanTooltip()
  tip:ClearLines()
  local ok = pcall(setter, tip)
  if not ok then return item end

  local lines = tip:NumLines() or 0
  for i = 2, lines do
    local left = _G['WFSyncScanTooltipTextLeft' .. i]
    local right = _G['WFSyncScanTooltipTextRight' .. i]
    local text = left and left:GetText()
    local rightText = right and right:GetText()
    if text and text ~= '' then
      if not readLine(text, rightText, item) then
        -- Keep anything that reads like an effect, so nothing is silently lost.
        if string.find(text, '^Equip:') or string.find(text, '^Use:') or string.find(text, '^Chance on hit:') then
          item.effects = item.effects or ns.json.array()
          item.effects[#item.effects + 1] = text
        end
      end
    end
  end

  -- Hands and type come off the item information rather than the tooltip.
  if item.weapon then
    item.weapon.type = subType or ''
    item.weapon.speed = item.weapon.speed or 0
    local loc = equipLoc or ''
    if loc == 'INVTYPE_2HWEAPON' then
      item.weapon.hands = 'two'
    elseif loc == 'INVTYPE_WEAPONOFFHAND' then
      item.weapon.hands = 'off'
    elseif loc == 'INVTYPE_WEAPONMAINHAND' then
      item.weapon.hands = 'main'
    elseif loc == 'INVTYPE_RANGED' or loc == 'INVTYPE_RANGEDRIGHT' or loc == 'INVTYPE_THROWN' then
      item.weapon.hands = 'ranged'
    else
      item.weapon.hands = 'one'
    end
  end

  return item
end
