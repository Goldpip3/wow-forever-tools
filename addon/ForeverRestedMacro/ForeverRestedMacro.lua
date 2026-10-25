-- Forever Rested Macro: companion to RestedXP Guides. Nothing here acts on its own; it only rewrites
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
local function say(msg, ...) print("|cff33ff99Forever Rested Macro|r: " .. fmt(msg, ...)) end

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

-- Plain and fast: one /target line per quest mob, then the action.
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

-- Current order of names in the macro, lowest priority first (the last /target line that
-- finds a mob wins). Targeting one of them moves it to the front, so the next press picks
-- a different mob: repeated presses cycle through the step's mobs.
local order = {}

local function sameSet(a, b)
    if #a ~= #b then return false end
    local set = {}
    for _, v in ipairs(a) do set[v:lower()] = true end
    for _, v in ipairs(b) do if not set[v:lower()] then return false end end
    return true
end

-- Which mob names belong only to objectives that are already checked off on the active steps.
-- RXP keeps a step's .mob names until the whole step completes; this drops them as soon as the
-- objective they serve is done. A .mob line belongs to:
--   1. its explicit parent (".mob +Name" in the guide), else
--   2. the objective above it whose text names the mob ("Vale Moth slain: 3/8"), else
--   3. every objective in the block directly above it (removed only when all are done).
-- A name still needed by any unfinished objective stays.
local function finishedNames(rxp)
    local done, needed = {}, {}
    local steps = rxp.RXPFrame and rxp.RXPFrame.activeSteps
    if type(steps) ~= "table" then return done end
    local function norm(n)
        n = tostring(n or "")
        if rxp.GetCreatureName then n = rxp.GetCreatureName(n) or n end
        return (n:gsub("^%*", "")):lower()
    end
    local function isDone(o) return o.completed or o.skip end
    for _, step in ipairs(steps) do
        local group, afterMob = {}, false
        for _, el in ipairs(step.elements or {}) do
            if (el.tag == "mob" or el.tag == "unitscan") and type(el.unitlist) == "table" then
                afterMob = true
                for _, raw in ipairs(el.unitlist) do
                    local n = norm(raw)
                    local owners
                    if type(el.parent) == "table" then
                        owners = {el.parent}
                    else
                        owners = {}
                        for _, o in ipairs(group) do
                            if type(o.text) == "string" and o.text:lower():find(n, 1, true) then
                                tinsert(owners, o)
                            end
                        end
                        if #owners == 0 then owners = group end
                    end
                    local finished = #owners > 0
                    for _, o in ipairs(owners) do
                        if not isDone(o) then finished = false break end
                    end
                    if finished then done[n] = true else needed[n] = true end
                end
            elseif not el.textOnly then
                if afterMob then group, afterMob = {}, false end
                tinsert(group, el)
            end
        end
    end
    for n in pairs(needed) do done[n] = nil end
    return done
end

local pending
local function update()
    if not db or db.enabled == false then return end
    if InCombatLockdown() then pending = true return end
    local rxp = _G.RXP
    if not (rxp and rxp.targeting and rxp.targeting.GetCurrentTargets) then return end

    -- hostile lists only (.mob and .unitscan), not friendly .target NPCs
    local _, mobs, scans = rxp.targeting.GetCurrentTargets()
    local finished = finishedNames(rxp)
    local names, seen, fromRXP = {}, {}, false
    for _, list in ipairs({scans or {}, mobs or {}}) do
        for _, t in ipairs(list) do
            if t and not seen[t] then
                seen[t] = true; fromRXP = true
                -- drop mobs whose quest objective is already checked off
                if not finished[t:lower()] then tinsert(names, t) end
            end
        end
    end
    -- a step with no hostile names at all keeps whatever the macro already targets
    -- (but if every mob on the step is done, the macro empties out)
    if not fromRXP then
        local old = GetMacroBody(MELEE) or GetMacroBody(TAG)
        if old then
            for line in old:gmatch("/target ([^\n]+)") do
                tinsert(names, line)
            end
        end
    end

    -- RXPTag rotates: same mobs as before keeps the rotated order, a new step takes RXP's order.
    -- RXPMelee always uses RXP's order so it doesn't pull you off the mob you just tagged.
    if not sameSet(names, order) then
        order = {}
        for i, v in ipairs(names) do order[i] = v end
    end

    local spell = tagSpell()
    local melee = body("/startattack", names)
    local bodies = {
        [MELEE] = melee,
        [TAG] = body(spell and ("/cast " .. spell) or "/startattack", order),
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

local function rotate()
    if #order < 2 or not UnitExists("target") then return end
    local name = UnitName("target")
    if not name then return end
    name = name:lower()
    for i, v in ipairs(order) do
        if v:lower() == name then
            if i > 1 then
                table.remove(order, i)
                tinsert(order, 1, v)
                update() -- deferred to after combat if needed
            end
            return
        end
    end
end

local queued
local function scheduleUpdate(delay)
    pending = true
    if queued then return end
    queued = true
    C_Timer.After(delay or 2, function()
        queued = false
        if pending then update() end
    end)
end

local f = CreateFrame("Frame")
f:RegisterEvent("PLAYER_LOGIN")
f:RegisterEvent("PLAYER_ENTERING_WORLD")
f:RegisterEvent("SPELLS_CHANGED")
f:RegisterEvent("PLAYER_REGEN_ENABLED")
f:RegisterEvent("PLAYER_TARGET_CHANGED")
f:SetScript("OnEvent", function(_, event)
    if event == "PLAYER_LOGIN" then
        ForeverRestedMacroDB = type(ForeverRestedMacroDB) == "table" and ForeverRestedMacroDB or {}
        db = ForeverRestedMacroDB
        if db.enabled == nil then db.enabled = true end
        local rxp = _G.RXP
        if rxp and rxp.targeting and rxp.targeting.UpdateMacro then
            -- run right after RestedXP rebuilds its own RXPTargeting macro on each step change
            hooksecurefunc(rxp.targeting, "UpdateMacro", function() update() end)
            -- RXP re-checks its checkboxes here whenever an objective is completed, skipped or
            -- unticked; rebuild shortly after so finished mobs leave the macro
            if rxp.UpdateStepCompletion then
                hooksecurefunc(rxp, "UpdateStepCompletion", function() scheduleUpdate(0.3) end)
            end
        else
            say("RestedXP Guides not found; nothing to do.")
        end
    elseif event == "PLAYER_TARGET_CHANGED" then
        if db and db.enabled ~= false then rotate() end
        return
    elseif event == "PLAYER_REGEN_ENABLED" then
        if pending then update() end
        return
    end
    scheduleUpdate()
end)

SLASH_FOREVERRESTEDMACRO1 = "/frm"
SLASH_FOREVERRESTEDMACRO2 = "/rxptag"
SlashCmdList.FOREVERRESTEDMACRO = function(msg)
    if not db then return end
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
        say("/frm on|off, /frm spell <name> (blank = automatic), /frm update. Currently %s, spell %s.",
            db.enabled and "on" or "off", tagSpell() or "none known (melee)")
    end
end
