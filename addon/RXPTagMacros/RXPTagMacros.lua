-- RXP Tag Macros: companion to RestedXP Guides. Nothing here acts on its own; it only rewrites
-- two macros (out of combat) that you press yourself.
local ADDON = ...
local TAG, MELEE = "RXPTag", "RXPMelee"
local fmt, tinsert = string.format, table.insert

-- One spell per class, no fallbacks: a tag needs instant direct damage. Rank 1 ids, cast by name.
local tagSpells = {
    DRUID = 8921,   -- Moonfire
    MAGE = 2136,    -- Fire Blast
    SHAMAN = 8042,  -- Earth Shock
    HUNTER = 3044,  -- Arcane Shot
    PALADIN = 20271,-- Judgement (needs a Seal up)
    PRIEST = 589,   -- Shadow Word: Pain (DoT; no instant direct spell at low level)
    WARLOCK = 980,  -- Curse of Agony (same)
    -- WARRIOR, ROGUE: melee only
}

local db
local function say(msg, ...) print("|cff33ff99RXP Tag Macros|r: " .. fmt(msg, ...)) end

local function spellName(id)
    if C_Spell and C_Spell.GetSpellInfo then
        local t = C_Spell.GetSpellInfo(id)
        return t and t.name
    end
    return GetSpellInfo(id)
end

local function known(id)
    return IsPlayerSpell(id) or IsSpellKnown(id) or IsSpellKnown(id, true)
end

local function tagSpell()
    local override = db.spell
    if type(override) == "string" and override:match("%S") then return override:match("^%s*(.-)%s*$") end
    local _, class = UnitClass("player")
    local id = tagSpells[class]
    if id and known(id) then return spellName(id) end
end

-- Plain and fast, as Andres wanted: one /target line per quest mob, then the action.
local function body(action, names)
    local room = 255 - #action - 1
    local lines = ""
    for i = #names, 1, -1 do -- later entries are RXP's higher priority; keep those first
        local line = fmt("/target %s\n", names[i])
        if #lines + #line > room then break end
        lines = line .. lines
    end
    return lines .. action
end

local pending
local function update()
    if not db or db.enabled == false then return end
    if InCombatLockdown() then pending = true return end
    local rxp = _G.RXP
    if not (rxp and rxp.targeting and rxp.targeting.GetCurrentTargets) then return end

    -- hostile lists only (.mob and .unitscan), not friendly .target NPCs
    local _, mobs, scans = rxp.targeting.GetCurrentTargets()
    local names, seen = {}, {}
    for _, list in ipairs({scans or {}, mobs or {}}) do
        for _, t in ipairs(list) do
            if t and not seen[t] then seen[t] = true; tinsert(names, t) end
        end
    end
    -- a step with no hostile names keeps whatever the macro already targets
    if #names == 0 then
        local old = GetMacroBody(MELEE) or GetMacroBody(TAG)
        if old then
            for line in old:gmatch("/target ([^\n]+)") do
                tinsert(names, line)
            end
        end
    end

    local spell = tagSpell()
    local melee = body("/startattack", names)
    local bodies = {
        [MELEE] = melee,
        [TAG] = spell and body("/cast " .. spell, names) or melee,
    }
    local icons = {[TAG] = "INV_MISC_QUESTIONMARK", [MELEE] = "Ability_MeleeDamage"}
    for name, text in pairs(bodies) do
        local exists = GetMacroInfo(name)
        if not exists and GetNumMacros() < 119 then
            CreateMacro(name, icons[name], "")
            say("macro %s created. Drag it from your general macros to a bar.", name)
            exists = true
        end
        if exists and GetMacroBody(name) ~= text then EditMacro(name, name, nil, text) end
    end
    pending = false
end

local function scheduleUpdate()
    pending = true
    C_Timer.After(2, function() if pending then update() end end)
end

local f = CreateFrame("Frame")
f:RegisterEvent("PLAYER_LOGIN")
f:RegisterEvent("PLAYER_ENTERING_WORLD")
f:RegisterEvent("SPELLS_CHANGED")
f:RegisterEvent("PLAYER_REGEN_ENABLED")
f:SetScript("OnEvent", function(_, event)
    if event == "PLAYER_LOGIN" then
        RXPTagMacrosDB = type(RXPTagMacrosDB) == "table" and RXPTagMacrosDB or {}
        db = RXPTagMacrosDB
        if db.enabled == nil then db.enabled = true end
        local rxp = _G.RXP
        if rxp and rxp.targeting and rxp.targeting.UpdateMacro then
            -- run right after RestedXP rebuilds its own RXPTargeting macro on each step change
            hooksecurefunc(rxp.targeting, "UpdateMacro", function() update() end)
        else
            say("RestedXP Guides not found; nothing to do.")
        end
    elseif event == "PLAYER_REGEN_ENABLED" then
        if pending then update() end
        return
    end
    scheduleUpdate()
end)

SLASH_RXPTAGMACROS1 = "/rxptag"
SlashCmdList.RXPTAGMACROS = function(msg)
    msg = (msg or ""):match("^%s*(.-)%s*$")
    local cmd, rest = msg:match("^(%S+)%s*(.*)$")
    if cmd == "on" or cmd == "off" then
        db.enabled = cmd == "on"
        say("%s", db.enabled and "on" or "off")
        if db.enabled then update() end
    elseif cmd == "spell" then
        db.spell = rest ~= "" and rest or nil
        say("tag spell: %s", db.spell or "automatic for your class")
        update()
    elseif cmd == "update" then
        update(); say("macros rebuilt")
    else
        say("/rxptag on|off, /rxptag spell <name> (blank = automatic), /rxptag update. Currently %s, spell %s.",
            db.enabled and "on" or "off", tagSpell() or "none known (melee)")
    end
end
